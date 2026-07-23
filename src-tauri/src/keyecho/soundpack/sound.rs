use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result};
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};
use serde::Deserialize;

use super::SoundDecoder;
use crate::keyecho::{AudioSource, Key, KeyEvent};

type KeySoundDefines = HashMap<Key, [u64; 2]>;
type KeyFrameDefines = HashMap<Key, Vec<FrameSlice>>;
// Experimental archive packs intentionally expose hundreds of variants while
// the sound library is being evaluated. Revisit this before a public release.
const SOUND_MEMORY_BUDGET_BYTES: u64 = 48 * 1024 * 1024;
const DECODED_BANK_BUDGET_BYTES: u64 = 64 * 1024 * 1024;
#[cfg(test)]
const SOUND_MEMORY_BUDGET_SAMPLE_RATE: u64 = 48_000;
#[cfg(test)]
const SOUND_MEMORY_BUDGET_CHANNELS: u64 = 2;

#[derive(Debug, Deserialize)]
struct SoundFileConfig {
    defines: KeySoundDefines,
    #[serde(default)]
    releases: KeySoundDefines,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundFileConfigV2 {
    schema_version: u32,
    audio: SoundAudioConfig,
    defines: KeyFrameDefines,
    #[serde(default)]
    releases: KeyFrameDefines,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundAudioConfig {
    file: String,
    sample_rate: Option<u32>,
    channels: Option<u16>,
    frame_count: Option<u64>,
}

#[derive(Debug, Clone, Copy, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FrameSlice {
    start_frame: u64,
    frame_count: u64,
}

#[derive(Clone, Copy)]
struct AudioFormat {
    sample_rate: u32,
    channels: u16,
}

struct AudioConverter {
    input: AudioFormat,
    output: AudioFormat,
    resampler: Option<Fft<f32>>,
}

impl AudioConverter {
    fn new(input: AudioFormat, output: AudioFormat) -> Result<Self> {
        anyhow::ensure!(
            input.sample_rate > 0
                && output.sample_rate > 0
                && input.channels > 0
                && output.channels > 0,
            "audio has an invalid format"
        );
        let resampler = (input.sample_rate != output.sample_rate)
            .then(|| {
                Fft::<f32>::new(
                    input.sample_rate as usize,
                    output.sample_rate as usize,
                    1_024,
                    usize::from(input.channels),
                    FixedSync::Both,
                )
            })
            .transpose()?;

        Ok(Self {
            input,
            output,
            resampler,
        })
    }

    fn convert(&mut self, samples: Vec<f32>) -> Result<Vec<f32>> {
        anyhow::ensure!(
            samples
                .chunks_exact(usize::from(self.input.channels))
                .remainder()
                .is_empty(),
            "audio samples are not frame aligned"
        );

        let samples = if let Some(resampler) = self.resampler.as_mut() {
            let frames = samples.len() / usize::from(self.input.channels);
            let input_buffer =
                InterleavedSlice::new(&samples, usize::from(self.input.channels), frames)?;
            let mut resampled = resampler
                .process_all(&input_buffer, frames, None)?
                .take_data();
            let output_frames = frames
                .saturating_mul(self.output.sample_rate as usize)
                .saturating_add(self.input.sample_rate as usize / 2)
                / self.input.sample_rate as usize;
            resampled.resize(output_frames * usize::from(self.input.channels), 0.0);
            resampled
        } else {
            samples
        };

        convert_channels(samples, self.input.channels, self.output.channels)
    }
}

pub struct KeySound {
    pub(super) name: String,
    event_sources: HashMap<KeyEvent, AudioSource>,
}

impl KeySound {
    pub fn new(sound_dir: &str) -> Result<Self> {
        let dir = PathBuf::from(sound_dir);
        let config = std::fs::read(dir.join("config.json"))?;
        let value: serde_json::Value = serde_json::from_slice(&config)?;

        if value.get("schemaVersion").is_some() {
            let config: SoundFileConfigV2 = serde_json::from_value(value)?;
            Self::from_v2(sound_dir.to_string(), &dir, config)
        } else {
            let config: SoundFileConfig = serde_json::from_value(value)?;
            Self::from_v1(sound_dir.to_string(), &dir, config)
        }
    }

    fn from_v1(name: String, dir: &Path, config: SoundFileConfig) -> Result<Self> {
        let decoded = SoundDecoder::new(dir.join("sound.ogg"))?.decode_all()?;
        let defines = legacy_defines_to_frames(config.defines, decoded.sample_rate);
        let releases = legacy_defines_to_frames(config.releases, decoded.sample_rate);
        Self::from_frame_defines(name, defines, releases, decoded)
    }

    fn from_v2(name: String, dir: &Path, config: SoundFileConfigV2) -> Result<Self> {
        anyhow::ensure!(
            config.schema_version == 2,
            "unsupported soundpack schema version"
        );
        ensure_audio_filename(&config.audio.file)?;
        let decoded = SoundDecoder::new(dir.join(&config.audio.file))?.decode_all()?;
        let decoded_frames = decoded.samples.len() as u64 / u64::from(decoded.channels);

        if let Some(sample_rate) = config.audio.sample_rate {
            anyhow::ensure!(
                sample_rate == decoded.sample_rate,
                "audio sample rate mismatch"
            );
        }
        if let Some(channels) = config.audio.channels {
            anyhow::ensure!(channels == decoded.channels, "audio channel count mismatch");
        }
        if let Some(frame_count) = config.audio.frame_count {
            anyhow::ensure!(frame_count == decoded_frames, "audio frame count mismatch");
        }

        Self::from_frame_defines(name, config.defines, config.releases, decoded)
    }

    fn from_frame_defines(
        name: String,
        defines: KeyFrameDefines,
        releases: KeyFrameDefines,
        decoded: super::decoder::DecodedAudio,
    ) -> Result<Self> {
        let decoded_bytes = (decoded.samples.len() as u64).saturating_mul(size_of::<f32>() as u64);
        anyhow::ensure!(
            decoded_bytes <= DECODED_BANK_BUDGET_BYTES,
            "decoded audio bank exceeds {:.2} MiB",
            bytes_to_mib(DECODED_BANK_BUDGET_BYTES)
        );
        let output_format = default_output_format().unwrap_or(AudioFormat {
            sample_rate: decoded.sample_rate,
            channels: decoded.channels,
        });
        let mut converter = AudioConverter::new(
            AudioFormat {
                sample_rate: decoded.sample_rate,
                channels: decoded.channels,
            },
            output_format,
        )?;

        let mut event_sources = HashMap::with_capacity(defines.len() + releases.len());
        let mut slice_sources = HashMap::<FrameSlice, AudioSource>::new();
        let mut cached_sample_count = 0u64;
        let events = defines
            .into_iter()
            .map(|(key, slices)| (KeyEvent::KeyPress(key), slices))
            .chain(
                releases
                    .into_iter()
                    .map(|(key, slices)| (KeyEvent::KeyRelease(key), slices)),
            );

        for (event, slices) in events {
            let slice = slices
                .into_iter()
                .next()
                .with_context(|| format!("sound event has no source for {event:?}"))?;
            let source = if let Some(source) = slice_sources.get(&slice) {
                source.clone()
            } else {
                let mut samples = slice_interleaved(&decoded.samples, decoded.channels, slice)
                    .with_context(|| format!("invalid audio slice for {event:?}"))?;
                apply_edge_fades(&mut samples, decoded.channels, decoded.sample_rate);
                let samples = converter.convert(samples)?;
                cached_sample_count = cached_sample_count.saturating_add(samples.len() as u64);
                ensure_cached_sample_budget(cached_sample_count)?;
                let source = AudioSource::new(
                    Arc::from(samples),
                    output_format.channels,
                    output_format.sample_rate,
                )
                .context("error when caching audio source")?;
                slice_sources.insert(slice, source.clone());
                source
            };
            event_sources.insert(event, source);
        }

        Ok(Self {
            name,
            event_sources,
        })
    }

    #[cfg(test)]
    fn from_defines<F>(
        name: String,
        defines: KeySoundDefines,
        releases: KeySoundDefines,
        mut decode: F,
        channels: u16,
        sample_rate: u32,
    ) -> Result<Self>
    where
        F: FnMut(u64, u64) -> Result<Vec<f32>>,
    {
        let mut event_sources = HashMap::with_capacity(defines.len() + releases.len());
        let mut slice_sources = HashMap::<[u64; 2], AudioSource>::new();
        let events = defines
            .into_iter()
            .map(|(key, slice)| (KeyEvent::KeyPress(key), slice))
            .chain(
                releases
                    .into_iter()
                    .map(|(key, slice)| (KeyEvent::KeyRelease(key), slice)),
            );

        for (evt, slice) in events {
            let source = if let Some(source) = slice_sources.get(&slice) {
                source.clone()
            } else {
                let [start_ms, duration_ms] = slice;
                let samples = decode(start_ms, duration_ms)
                    .with_context(|| format!("error when decoding sound for {evt:?}"))?;
                let source = AudioSource::new(Arc::from(samples), channels, sample_rate)
                    .context("error when caching audio source")?;
                slice_sources.insert(slice, source.clone());
                source
            };

            event_sources.insert(evt, source);
        }

        Ok(KeySound {
            name,
            event_sources,
        })
    }

    pub fn event_source(&self, evt: KeyEvent) -> Option<AudioSource> {
        self.event_sources.get(&evt).cloned()
    }
}

fn ensure_audio_filename(filename: &str) -> Result<()> {
    let mut components = Path::new(filename).components();
    anyhow::ensure!(
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none(),
        "audio file must be a filename inside the soundpack"
    );
    Ok(())
}

fn default_output_format() -> Option<AudioFormat> {
    let device = rodio::cpal::default_host().default_output_device()?;
    let config = device.default_output_config().ok()?;
    Some(AudioFormat {
        sample_rate: config.sample_rate(),
        channels: config.channels(),
    })
}

#[cfg(test)]
fn convert_audio_format(
    samples: Vec<f32>,
    input: AudioFormat,
    output: AudioFormat,
) -> Result<Vec<f32>> {
    AudioConverter::new(input, output)?.convert(samples)
}

fn convert_channels(
    samples: Vec<f32>,
    input_channels: u16,
    output_channels: u16,
) -> Result<Vec<f32>> {
    if input_channels == output_channels {
        return Ok(samples);
    }

    let input_channels = usize::from(input_channels);
    let output_channels = usize::from(output_channels);
    anyhow::ensure!(
        input_channels > 0 && samples.chunks_exact(input_channels).remainder().is_empty(),
        "audio samples are not frame aligned"
    );
    let mut converted = Vec::with_capacity(samples.len() / input_channels * output_channels);

    for frame in samples.chunks_exact(input_channels) {
        if output_channels == 1 {
            converted.push(frame.iter().sum::<f32>() / input_channels as f32);
        } else if input_channels == 1 {
            converted.extend(std::iter::repeat_n(frame[0], output_channels));
        } else {
            converted.extend((0..output_channels).map(|channel| frame[channel % input_channels]));
        }
    }

    Ok(converted)
}

fn legacy_defines_to_frames(defines: KeySoundDefines, sample_rate: u32) -> KeyFrameDefines {
    defines
        .into_iter()
        .map(|(key, [start_ms, duration_ms])| {
            let start_frame = millis_to_frame(start_ms, sample_rate);
            let end_frame = millis_to_frame(start_ms.saturating_add(duration_ms), sample_rate);
            (
                key,
                vec![FrameSlice {
                    start_frame,
                    frame_count: end_frame.saturating_sub(start_frame),
                }],
            )
        })
        .collect()
}

fn millis_to_frame(milliseconds: u64, sample_rate: u32) -> u64 {
    milliseconds
        .saturating_mul(u64::from(sample_rate))
        .saturating_add(500)
        / 1_000
}

fn slice_interleaved(samples: &[f32], channels: u16, slice: FrameSlice) -> Result<Vec<f32>> {
    anyhow::ensure!(channels > 0, "audio has no channels");
    anyhow::ensure!(slice.frame_count > 0, "audio slice is empty");
    let channels = u64::from(channels);
    let start = slice
        .start_frame
        .checked_mul(channels)
        .context("audio slice start overflow")?;
    let end = slice
        .start_frame
        .checked_add(slice.frame_count)
        .and_then(|frame| frame.checked_mul(channels))
        .context("audio slice end overflow")?;
    let start = usize::try_from(start).context("audio slice start is too large")?;
    let end = usize::try_from(end).context("audio slice end is too large")?;
    anyhow::ensure!(end <= samples.len(), "audio slice exceeds decoded audio");
    Ok(samples[start..end].to_vec())
}

fn apply_edge_fades(samples: &mut [f32], channels: u16, sample_rate: u32) {
    let channels = usize::from(channels);
    if channels == 0 || samples.len() < channels * 2 {
        return;
    }
    let frames = samples.len() / channels;
    let fade_in_frames = ((sample_rate as usize / 2_000).max(2)).min(frames / 2);
    let fade_out_frames = ((sample_rate as usize * 3 / 1_000).max(2)).min(frames / 2);

    if samples[..channels].iter().any(|sample| sample.abs() > 0.02) {
        for frame in 0..fade_in_frames {
            let gain = frame as f32 / (fade_in_frames - 1) as f32;
            for sample in &mut samples[frame * channels..(frame + 1) * channels] {
                *sample *= gain;
            }
        }
    }

    let tail = &samples[(frames - 1) * channels..frames * channels];
    if tail.iter().any(|sample| sample.abs() > 0.02) {
        for offset in 0..fade_out_frames {
            let gain = offset as f32 / (fade_out_frames - 1) as f32;
            let frame = frames - 1 - offset;
            for sample in &mut samples[frame * channels..(frame + 1) * channels] {
                *sample *= gain;
            }
        }
    }
}

fn ensure_cached_sample_budget(sample_count: u64) -> Result<()> {
    let bytes = sample_count.saturating_mul(size_of::<f32>() as u64);
    anyhow::ensure!(
        bytes <= SOUND_MEMORY_BUDGET_BYTES,
        "soundpack decoded sample budget exceeded: actual {:.2} MiB, limit {:.2} MiB",
        bytes_to_mib(bytes),
        bytes_to_mib(SOUND_MEMORY_BUDGET_BYTES),
    );
    Ok(())
}

#[cfg(test)]
fn ensure_sound_memory_budget(defines: &KeySoundDefines, releases: &KeySoundDefines) -> Result<()> {
    let estimated_bytes = estimate_decoded_sample_bytes(
        unique_slice_duration_ms(defines, releases),
        SOUND_MEMORY_BUDGET_SAMPLE_RATE,
        SOUND_MEMORY_BUDGET_CHANNELS,
    );

    anyhow::ensure!(
        estimated_bytes <= SOUND_MEMORY_BUDGET_BYTES,
        "soundpack decoded sample budget exceeded: estimated {:.2} MiB, limit {:.2} MiB",
        bytes_to_mib(estimated_bytes),
        bytes_to_mib(SOUND_MEMORY_BUDGET_BYTES),
    );

    Ok(())
}

#[cfg(test)]
fn unique_slice_duration_ms(defines: &KeySoundDefines, releases: &KeySoundDefines) -> u64 {
    let mut unique_slices = HashMap::<[u64; 2], u64>::with_capacity(defines.len() + releases.len());
    for &slice @ [_start_ms, duration_ms] in defines.values().chain(releases.values()) {
        unique_slices.entry(slice).or_insert(duration_ms);
    }

    unique_slices.values().sum()
}

#[cfg(test)]
fn estimate_decoded_sample_bytes(duration_ms: u64, sample_rate: u64, channels: u64) -> u64 {
    duration_ms
        .saturating_mul(sample_rate)
        .saturating_mul(channels)
        .saturating_mul(size_of::<f32>() as u64)
        .div_ceil(1_000)
}

fn bytes_to_mib(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        hint::black_box,
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };

    use anyhow::{Context, Result};

    use super::super::PlaybackSoundpack;
    use super::{
        apply_edge_fades, convert_audio_format, convert_channels, ensure_audio_filename,
        ensure_sound_memory_budget, estimate_decoded_sample_bytes, legacy_defines_to_frames,
        slice_interleaved, unique_slice_duration_ms, AudioFormat, FrameSlice, KeySound,
        SoundFileConfig, SoundFileConfigV2, SOUND_MEMORY_BUDGET_BYTES,
        SOUND_MEMORY_BUDGET_CHANNELS, SOUND_MEMORY_BUDGET_SAMPLE_RATE,
    };
    use crate::keyecho::{Key, KeyEvent};

    const LOOKUP_BENCH_ITERATIONS: usize = 200_000;

    #[derive(Clone)]
    struct OldAudioSource {
        samples: Vec<f32>,
    }

    struct OldPlaybackSoundpack {
        volume: f32,
        source: OldAudioSource,
    }

    impl OldPlaybackSoundpack {
        fn source_for_key(&mut self, _key: Key) -> (OldAudioSource, f32) {
            (self.source.clone(), self.volume)
        }
    }

    #[test]
    fn sound_file_config_accepts_release_defines() -> Result<()> {
        let config: SoundFileConfig = serde_json::from_str(
            r#"{
                "defines": { "KeyA": [0, 24] },
                "releases": { "KeyA": [24, 24] }
            }"#,
        )?;

        assert_eq!(config.defines.get(&Key::KeyA), Some(&[0, 24]));
        assert_eq!(config.releases.get(&Key::KeyA), Some(&[24, 24]));
        Ok(())
    }

    #[test]
    fn v2_manifest_accepts_fn_key_alias() -> Result<()> {
        let config: SoundFileConfigV2 = serde_json::from_str(
            r#"{
                "schemaVersion": 2,
                "audio": { "file": "sound.flac" },
                "defines": {
                    "Fn": [{ "startFrame": 0, "frameCount": 100 }]
                }
            }"#,
        )?;

        assert!(config.defines.contains_key(&Key::Function));
        Ok(())
    }

    fn mono_pcm16_wav(samples: &[i16], sample_rate: u32) -> Vec<u8> {
        let frame_count = samples.len() as u32;
        let data_bytes = frame_count * 2;
        let mut wav = Vec::with_capacity((44 + data_bytes) as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_bytes.to_le_bytes());
        for sample in samples {
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        wav
    }

    #[test]
    fn v2_pack_reuses_fixed_source_for_same_key_event() -> Result<()> {
        let pack = tempfile::tempdir()?;
        let mut samples = vec![1_000; 400];
        samples[100..200].fill(-1_000);
        fs::write(
            pack.path().join("sound.wav"),
            mono_pcm16_wav(&samples, 48_000),
        )?;
        fs::write(
            pack.path().join("config.json"),
            serde_json::to_vec(&serde_json::json!({
                "schemaVersion": 2,
                "audio": {
                    "file": "sound.wav",
                    "sampleRate": 48_000,
                    "channels": 1,
                    "frameCount": 400
                },
                "defines": {
                    "KeyA": [
                        { "startFrame": 0, "frameCount": 100 },
                        { "startFrame": 100, "frameCount": 100 }
                    ]
                },
                "releases": {
                    "KeyA": [{ "startFrame": 200, "frameCount": 80 }]
                }
            }))?,
        )?;

        let sound = KeySound::new(pack.path().to_str().context("invalid temporary path")?)?;

        let first = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .context("missing first key press")?
            .collect::<Vec<_>>();
        let second = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .context("missing second key press")?
            .collect::<Vec<_>>();

        assert_eq!(first, second);
        assert!(sound
            .event_source(KeyEvent::KeyRelease(Key::KeyA))
            .is_some());
        Ok(())
    }

    #[test]
    fn v2_manifest_accepts_frame_exact_variants() -> Result<()> {
        let config: SoundFileConfigV2 = serde_json::from_str(
            r#"{
                "schemaVersion": 2,
                "audio": {
                    "file": "sound.flac",
                    "sampleRate": 48000,
                    "channels": 1,
                    "frameCount": 4000
                },
                "defines": {
                    "KeyA": [
                        { "startFrame": 0, "frameCount": 100 },
                        { "startFrame": 100, "frameCount": 100 }
                    ]
                },
                "releases": {
                    "KeyA": [{ "startFrame": 200, "frameCount": 80 }]
                }
            }"#,
        )?;

        assert_eq!(config.schema_version, 2);
        assert_eq!(config.audio.file, "sound.flac");
        assert_eq!(config.defines[&Key::KeyA].len(), 2);
        assert_eq!(config.releases[&Key::KeyA][0].frame_count, 80);
        Ok(())
    }

    #[test]
    fn legacy_milliseconds_map_to_nearest_frame() {
        let defines = legacy_defines_to_frames(HashMap::from([(Key::KeyA, [1, 1])]), 44_100);

        assert_eq!(
            defines[&Key::KeyA],
            vec![FrameSlice {
                start_frame: 44,
                frame_count: 44,
            }]
        );
    }

    #[test]
    fn frame_slice_is_sample_exact_for_interleaved_audio() -> Result<()> {
        let samples = (0..12).map(|sample| sample as f32).collect::<Vec<_>>();

        let sliced = slice_interleaved(
            &samples,
            2,
            FrameSlice {
                start_frame: 1,
                frame_count: 2,
            },
        )?;

        assert_eq!(sliced, vec![2.0, 3.0, 4.0, 5.0]);
        Ok(())
    }

    #[test]
    fn discontinuous_slice_edges_are_faded_without_changing_length() {
        let mut samples = vec![1.0; 20];

        apply_edge_fades(&mut samples, 1, 1_000);

        assert_eq!(samples.len(), 20);
        assert_eq!(samples[0], 0.0);
        assert_eq!(samples[1], 1.0);
        assert_eq!(samples[19], 0.0);
    }

    #[test]
    fn v2_audio_file_cannot_escape_soundpack() {
        assert!(ensure_audio_filename("sound.flac").is_ok());
        assert!(ensure_audio_filename("../sound.flac").is_err());
        assert!(ensure_audio_filename("nested/sound.flac").is_err());
    }

    #[test]
    fn channel_conversion_duplicates_mono_and_averages_stereo() -> Result<()> {
        assert_eq!(
            convert_channels(vec![0.25, 0.5], 1, 2)?,
            vec![0.25, 0.25, 0.5, 0.5]
        );
        assert_eq!(
            convert_channels(vec![0.25, 0.75, -0.5, 0.5], 2, 1)?,
            vec![0.5, 0.0]
        );
        Ok(())
    }

    #[test]
    fn cold_path_resampling_produces_device_rate_frames() -> Result<()> {
        let samples = vec![0.0; 441];

        let converted = convert_audio_format(
            samples,
            AudioFormat {
                sample_rate: 44_100,
                channels: 1,
            },
            AudioFormat {
                sample_rate: 48_000,
                channels: 1,
            },
        )?;

        assert_eq!(converted.len(), 480);
        Ok(())
    }

    #[test]
    fn key_sound_returns_distinct_press_and_release_sources() -> Result<()> {
        let sound = KeySound::from_defines(
            "test".to_string(),
            HashMap::from([(Key::KeyA, [0, 24])]),
            HashMap::from([(Key::KeyA, [24, 24])]),
            |start_ms, _duration_ms| Ok(vec![start_ms as f32]),
            1,
            44_100,
        )?;

        let mut press = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .expect("press source");
        let mut release = sound
            .event_source(KeyEvent::KeyRelease(Key::KeyA))
            .expect("release source");

        assert_eq!(press.next(), Some(0.0));
        assert_eq!(release.next(), Some(24.0));
        Ok(())
    }

    #[test]
    fn key_sound_decodes_each_unique_slice_once() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);
        defines.insert(Key::KeyB, [0, 24]);
        defines.insert(Key::KeyC, [24, 24]);

        let mut calls = Vec::new();
        let sound = KeySound::from_defines(
            "test".to_string(),
            defines,
            HashMap::new(),
            |start_ms, duration_ms| {
                calls.push([start_ms, duration_ms]);
                Ok(vec![start_ms as f32, duration_ms as f32])
            },
            1,
            44_100,
        )?;

        calls.sort_unstable();
        assert_eq!(calls, vec![[0, 24], [24, 24]]);

        let a = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .expect("key A source");
        let b = sound
            .event_source(KeyEvent::KeyPress(Key::KeyB))
            .expect("key B source");
        let c = sound
            .event_source(KeyEvent::KeyPress(Key::KeyC))
            .expect("key C source");

        assert!(a.shares_samples_with(&b));
        assert!(!a.shares_samples_with(&c));

        Ok(())
    }

    #[test]
    fn event_source_returns_fresh_cursor_over_shared_samples() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);

        let sound = KeySound::from_defines(
            "test".to_string(),
            defines,
            HashMap::new(),
            |_start_ms, _duration_ms| Ok(vec![0.0, 1.0, 2.0]),
            1,
            44_100,
        )?;

        let mut first = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .expect("first source");
        let second = sound
            .event_source(KeyEvent::KeyPress(Key::KeyA))
            .expect("second source");

        assert_eq!(first.next(), Some(0.0));
        assert_eq!(first.len(), 2);
        assert_eq!(second.len(), 3);
        assert!(first.shares_samples_with(&second));

        Ok(())
    }

    #[test]
    fn playback_soundpack_reads_updates_without_global_state_lock() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);

        let sound = Arc::new(KeySound::from_defines(
            "test".to_string(),
            defines,
            HashMap::new(),
            |_start_ms, _duration_ms| Ok(vec![0.0]),
            1,
            44_100,
        )?);

        let playback = PlaybackSoundpack::new(Some(sound), 0.25);
        let (_source, volume) = playback
            .source_for_event(KeyEvent::KeyPress(Key::KeyA))
            .expect("playback source");
        assert_eq!(volume, 0.25);

        playback.set_volume(0.5);
        let (_source, volume) = playback
            .source_for_event(KeyEvent::KeyPress(Key::KeyA))
            .expect("playback source");
        assert_eq!(volume, 0.5);

        playback.set_current_sound(None);
        assert!(playback
            .source_for_event(KeyEvent::KeyPress(Key::KeyA))
            .is_none());

        Ok(())
    }

    #[test]
    fn playback_hot_path_reuses_predecoded_samples() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);

        let sound = Arc::new(KeySound::from_defines(
            "test".to_string(),
            defines,
            HashMap::new(),
            |_start_ms, _duration_ms| Ok(vec![0.0, 1.0, 2.0, 3.0]),
            1,
            44_100,
        )?);
        let playback = PlaybackSoundpack::new(Some(sound), 1.0);
        let first = playback
            .source_for_event(KeyEvent::KeyPress(Key::KeyA))
            .expect("first playback source")
            .0;

        for _ in 0..1_000 {
            let next = playback
                .source_for_event(KeyEvent::KeyPress(Key::KeyA))
                .expect("next playback source")
                .0;
            assert!(first.shares_samples_with(&next));
        }

        Ok(())
    }

    #[test]
    fn sound_memory_budget_allows_limit_boundary() -> Result<()> {
        let duration_ms = SOUND_MEMORY_BUDGET_BYTES * 1_000
            / SOUND_MEMORY_BUDGET_SAMPLE_RATE
            / SOUND_MEMORY_BUDGET_CHANNELS
            / size_of::<f32>() as u64;
        let defines = HashMap::from([(Key::KeyA, [0, duration_ms])]);

        ensure_sound_memory_budget(&defines, &HashMap::new())
    }

    #[test]
    fn sound_memory_budget_rejects_oversized_soundpack() {
        let limit_duration_ms = SOUND_MEMORY_BUDGET_BYTES * 1_000
            / SOUND_MEMORY_BUDGET_SAMPLE_RATE
            / SOUND_MEMORY_BUDGET_CHANNELS
            / size_of::<f32>() as u64;
        let defines = HashMap::from([(Key::KeyA, [0, limit_duration_ms + 1])]);

        let err = ensure_sound_memory_budget(&defines, &HashMap::new())
            .expect_err("budget should reject");
        assert!(err.to_string().contains("decoded sample budget exceeded"));
    }

    #[test]
    fn sound_memory_budget_dedupes_identical_slices() {
        let defines = HashMap::from([(Key::KeyA, [0, 100]), (Key::KeyB, [0, 100])]);

        assert_eq!(unique_slice_duration_ms(&defines, &HashMap::new()), 100);
        assert_eq!(estimate_decoded_sample_bytes(100, 48_000, 2), 38_400);
    }

    #[test]
    #[ignore = "reference timing benchmark; run with `pnpm bench:audio`"]
    fn audio_lookup_reference_timing() -> Result<()> {
        run_audio_lookup_reference_timing("avg_cherrymx_black_abs", 194)?;
        run_audio_lookup_reference_timing("max_cherrymx_black_abs", 287)?;
        Ok(())
    }

    fn run_audio_lookup_reference_timing(label: &str, duration_ms: u64) -> Result<()> {
        let sample_count = decoded_sample_count(duration_ms, 44_100, 2);
        let old_copy_bytes = sample_count * size_of::<f32>();
        let samples = vec![0.125; sample_count];

        let playback = PlaybackSoundpack::new(
            Some(Arc::new(KeySound::from_defines(
                "bench".to_string(),
                HashMap::from([(Key::KeyA, [0, duration_ms])]),
                HashMap::new(),
                |_start_ms, _duration_ms| Ok(samples.clone()),
                2,
                44_100,
            )?)),
            1.0,
        );

        let old_playback = Mutex::new(OldPlaybackSoundpack {
            volume: 1.0,
            source: OldAudioSource { samples },
        });

        let current = min_elapsed(|| {
            let mut consumed = 0usize;
            for _ in 0..LOOKUP_BENCH_ITERATIONS {
                let (source, volume) = playback
                    .source_for_event(KeyEvent::KeyPress(Key::KeyA))
                    .expect("source");
                consumed = consumed
                    .wrapping_add(source.len())
                    .wrapping_add((volume.to_bits() & 1) as usize);
                black_box(source);
            }
            black_box(consumed)
        });

        let old = min_elapsed(|| {
            let mut consumed = 0usize;
            for _ in 0..LOOKUP_BENCH_ITERATIONS {
                let (source, volume) = old_playback.lock().expect("lock").source_for_key(Key::KeyA);
                consumed = consumed
                    .wrapping_add(source.samples.len())
                    .wrapping_add((volume.to_bits() & 1) as usize);
                black_box(source);
            }
            black_box(consumed)
        });

        let current_ns = ns_per_op(current, LOOKUP_BENCH_ITERATIONS);
        let old_ns = ns_per_op(old, LOOKUP_BENCH_ITERATIONS);
        println!(
            "audio_lookup_reference_timing[{label}]: current={current_ns:.2}ns/op old_cached_model={old_ns:.2}ns/op speedup={:.2}x removed_copy={:.2}KiB/op",
            old_ns / current_ns,
            old_copy_bytes as f64 / 1024.0
        );

        Ok(())
    }

    fn decoded_sample_count(duration_ms: u64, sample_rate: u64, channels: u64) -> usize {
        duration_ms
            .saturating_mul(sample_rate)
            .saturating_mul(channels)
            .div_ceil(1_000) as usize
    }

    fn min_elapsed(mut run: impl FnMut() -> usize) -> Duration {
        (0..5)
            .map(|_| {
                let started = Instant::now();
                black_box(run());
                started.elapsed()
            })
            .min()
            .expect("at least one round")
    }

    fn ns_per_op(duration: Duration, operations: usize) -> f64 {
        duration.as_nanos() as f64 / operations as f64
    }
}
