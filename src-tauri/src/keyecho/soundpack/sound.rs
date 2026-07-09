use std::{collections::HashMap, fs::File, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use serde::Deserialize;

use super::SoundDecoder;
use crate::keyecho::{AudioSource, Key};

type KeySoundDefines = HashMap<Key, [u64; 2]>;
const SOUND_MEMORY_BUDGET_BYTES: u64 = 10 * 1024 * 1024;
const SOUND_MEMORY_BUDGET_SAMPLE_RATE: u64 = 48_000;
const SOUND_MEMORY_BUDGET_CHANNELS: u64 = 2;

#[derive(Debug, Deserialize)]
struct SoundFileConfig {
    defines: KeySoundDefines,
}

pub struct KeySound {
    pub(super) name: String,
    key_sources: HashMap<Key, AudioSource>,
}

impl KeySound {
    pub fn new(sound_dir: &str) -> Result<Self> {
        let dir = PathBuf::from(sound_dir);

        let mut decoder = SoundDecoder::new(dir.join("sound.ogg"))?;
        let file_config =
            serde_json::from_reader::<File, SoundFileConfig>(File::open(dir.join("config.json"))?)?;
        ensure_sound_memory_budget(&file_config.defines)?;
        let channels = decoder.channels;
        let sample_rate = decoder.rate;

        Self::from_defines(
            sound_dir.to_string(),
            file_config.defines,
            |start_ms, duration_ms| decoder.get_samples_buf(start_ms, duration_ms),
            channels,
            sample_rate,
        )
    }

    fn from_defines<F>(
        name: String,
        defines: KeySoundDefines,
        mut decode: F,
        channels: u16,
        sample_rate: u32,
    ) -> Result<Self>
    where
        F: FnMut(u64, u64) -> Result<Vec<f32>>,
    {
        let mut key_sources = HashMap::with_capacity(defines.len());
        let mut slice_sources = HashMap::<[u64; 2], AudioSource>::new();
        for (key, slice) in defines {
            let source = if let Some(source) = slice_sources.get(&slice) {
                source.clone()
            } else {
                let [start_ms, duration_ms] = slice;
                let samples = decode(start_ms, duration_ms)
                    .with_context(|| format!("error when decoding sound for {key:?}"))?;
                let source = AudioSource::new(Arc::from(samples), channels, sample_rate)
                    .context("error when caching audio source")?;
                slice_sources.insert(slice, source.clone());
                source
            };

            key_sources.insert(key, source);
        }

        Ok(KeySound { name, key_sources })
    }

    pub fn key_source(&self, key: Key) -> Option<AudioSource> {
        self.key_sources.get(&key).cloned()
    }
}

fn ensure_sound_memory_budget(defines: &KeySoundDefines) -> Result<()> {
    let estimated_bytes = estimate_decoded_sample_bytes(
        unique_slice_duration_ms(defines),
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

fn unique_slice_duration_ms(defines: &KeySoundDefines) -> u64 {
    let mut unique_slices = HashMap::<[u64; 2], u64>::with_capacity(defines.len());
    for &slice @ [_start_ms, duration_ms] in defines.values() {
        unique_slices.entry(slice).or_insert(duration_ms);
    }

    unique_slices.values().sum()
}

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
        collections::{HashMap, HashSet},
        ffi::OsStr,
        fs::{self, File},
        hint::black_box,
        path::Path,
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };

    use anyhow::{Context, Result};

    use super::super::PlaybackSoundpack;
    use super::{
        ensure_sound_memory_budget, estimate_decoded_sample_bytes, unique_slice_duration_ms,
        KeySound, SoundFileConfig, SOUND_MEMORY_BUDGET_BYTES, SOUND_MEMORY_BUDGET_CHANNELS,
        SOUND_MEMORY_BUDGET_SAMPLE_RATE,
    };
    use crate::keyecho::Key;

    const MAX_RESOURCE_KEYS: usize = 104;
    const MAX_RESOURCE_UNIQUE_SLICES: usize = 104;
    const MAX_RESOURCE_UNIQUE_DURATION_MS: u64 = 18_500;
    const MAX_RESOURCE_DECODED_BYTES_48K_STEREO: u64 = 10 * 1024 * 1024;
    const MAX_SINGLE_KEY_DECODED_BYTES_48K_STEREO: u64 = 512 * 1024;
    const LOOKUP_BENCH_ITERATIONS: usize = 200_000;

    #[derive(Debug)]
    struct SoundpackBudget {
        name: String,
        key_count: usize,
        unique_slice_count: usize,
        total_duration_ms: u64,
        unique_duration_ms: u64,
        max_slice_duration_ms: u64,
    }

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

    impl SoundpackBudget {
        fn decoded_bytes_48k_stereo(&self) -> u64 {
            estimate_decoded_sample_bytes(self.unique_duration_ms, 48_000, 2)
        }

        fn max_slice_decoded_bytes_48k_stereo(&self) -> u64 {
            estimate_decoded_sample_bytes(self.max_slice_duration_ms, 48_000, 2)
        }
    }

    fn budget_from_config(name: String, config: SoundFileConfig) -> SoundpackBudget {
        let mut total_duration_ms = 0u64;
        let mut max_slice_duration_ms = 0u64;

        for &[_start_ms, duration_ms] in config.defines.values() {
            total_duration_ms = total_duration_ms.saturating_add(duration_ms);
            max_slice_duration_ms = max_slice_duration_ms.max(duration_ms);
        }

        let unique_slice_count = config
            .defines
            .values()
            .copied()
            .collect::<HashSet<_>>()
            .len();

        SoundpackBudget {
            name,
            key_count: config.defines.len(),
            unique_slice_count,
            total_duration_ms,
            unique_duration_ms: unique_slice_duration_ms(&config.defines),
            max_slice_duration_ms,
        }
    }

    fn resource_soundpack_configs() -> Result<Vec<(String, SoundFileConfig)>> {
        let resources_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let mut configs = Vec::new();

        for entry in fs::read_dir(resources_dir)? {
            let path = entry?.path();
            if path.extension() != Some(OsStr::new("tar")) {
                continue;
            }

            configs.push((resource_name(&path)?, config_from_tar(&path)?));
        }

        configs.sort_by(|(left, _), (right, _)| left.cmp(right));
        Ok(configs)
    }

    fn resource_name(path: &Path) -> Result<String> {
        path.file_stem()
            .and_then(OsStr::to_str)
            .map(ToOwned::to_owned)
            .context("resource tar has no valid file stem")
    }

    fn config_from_tar(path: &Path) -> Result<SoundFileConfig> {
        let file = File::open(path)?;
        let mut archive = tar::Archive::new(file);

        for entry in archive.entries()? {
            let entry = entry?;
            if entry.path()?.file_name() == Some(OsStr::new("config.json")) {
                return serde_json::from_reader(entry).context("invalid soundpack config");
            }
        }

        anyhow::bail!("missing config.json in {}", path.display())
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
            |start_ms, duration_ms| {
                calls.push([start_ms, duration_ms]);
                Ok(vec![start_ms as f32, duration_ms as f32])
            },
            1,
            44_100,
        )?;

        calls.sort_unstable();
        assert_eq!(calls, vec![[0, 24], [24, 24]]);

        let a = sound.key_source(Key::KeyA).expect("key A source");
        let b = sound.key_source(Key::KeyB).expect("key B source");
        let c = sound.key_source(Key::KeyC).expect("key C source");

        assert!(a.shares_samples_with(&b));
        assert!(!a.shares_samples_with(&c));

        Ok(())
    }

    #[test]
    fn key_source_returns_fresh_cursor_over_shared_samples() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);

        let sound = KeySound::from_defines(
            "test".to_string(),
            defines,
            |_start_ms, _duration_ms| Ok(vec![0.0, 1.0, 2.0]),
            1,
            44_100,
        )?;

        let mut first = sound.key_source(Key::KeyA).expect("first source");
        let second = sound.key_source(Key::KeyA).expect("second source");

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
            |_start_ms, _duration_ms| Ok(vec![0.0]),
            1,
            44_100,
        )?);

        let playback = PlaybackSoundpack::new(Some(sound), 0.25);
        let (_source, volume) = playback.source_for_key(Key::KeyA).expect("playback source");
        assert_eq!(volume, 0.25);

        playback.set_volume(0.5);
        let (_source, volume) = playback.source_for_key(Key::KeyA).expect("playback source");
        assert_eq!(volume, 0.5);

        playback.set_current_sound(None);
        assert!(playback.source_for_key(Key::KeyA).is_none());

        Ok(())
    }

    #[test]
    fn playback_hot_path_reuses_predecoded_samples() -> Result<()> {
        let mut defines = HashMap::new();
        defines.insert(Key::KeyA, [0, 24]);

        let sound = Arc::new(KeySound::from_defines(
            "test".to_string(),
            defines,
            |_start_ms, _duration_ms| Ok(vec![0.0, 1.0, 2.0, 3.0]),
            1,
            44_100,
        )?);
        let playback = PlaybackSoundpack::new(Some(sound), 1.0);
        let first = playback
            .source_for_key(Key::KeyA)
            .expect("first playback source")
            .0;

        for _ in 0..1_000 {
            let next = playback
                .source_for_key(Key::KeyA)
                .expect("next playback source")
                .0;
            assert!(first.shares_samples_with(&next));
        }

        Ok(())
    }

    #[test]
    fn bundled_soundpacks_stay_within_memory_budget() -> Result<()> {
        let configs = resource_soundpack_configs()?;
        assert!(!configs.is_empty());

        let budgets = configs
            .into_iter()
            .map(|(name, config)| budget_from_config(name, config))
            .collect::<Vec<_>>();

        for budget in budgets {
            assert!(!budget.name.is_empty(), "{budget:?} has no resource name");
            assert!(
                budget.key_count <= MAX_RESOURCE_KEYS,
                "{budget:?} exceeds key count budget"
            );
            assert!(
                budget.unique_slice_count <= MAX_RESOURCE_UNIQUE_SLICES,
                "{budget:?} exceeds unique slice count budget"
            );
            assert!(
                budget.unique_duration_ms <= budget.total_duration_ms,
                "{budget:?} has impossible dedupe duration"
            );
            assert!(
                budget.unique_duration_ms <= MAX_RESOURCE_UNIQUE_DURATION_MS,
                "{budget:?} exceeds unique duration budget"
            );
            assert!(
                budget.decoded_bytes_48k_stereo() <= MAX_RESOURCE_DECODED_BYTES_48K_STEREO,
                "{budget:?} exceeds decoded memory budget"
            );
            assert!(
                budget.max_slice_decoded_bytes_48k_stereo()
                    <= MAX_SINGLE_KEY_DECODED_BYTES_48K_STEREO,
                "{budget:?} exceeds single-key hot path copy budget"
            );
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

        ensure_sound_memory_budget(&defines)
    }

    #[test]
    fn sound_memory_budget_rejects_oversized_soundpack() {
        let limit_duration_ms = SOUND_MEMORY_BUDGET_BYTES * 1_000
            / SOUND_MEMORY_BUDGET_SAMPLE_RATE
            / SOUND_MEMORY_BUDGET_CHANNELS
            / size_of::<f32>() as u64;
        let defines = HashMap::from([(Key::KeyA, [0, limit_duration_ms + 1])]);

        let err = ensure_sound_memory_budget(&defines).expect_err("budget should reject");
        assert!(err.to_string().contains("decoded sample budget exceeded"));
    }

    #[test]
    fn sound_memory_budget_dedupes_identical_slices() {
        let defines = HashMap::from([(Key::KeyA, [0, 100]), (Key::KeyB, [0, 100])]);

        assert_eq!(unique_slice_duration_ms(&defines), 100);
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
                let (source, volume) = playback.source_for_key(Key::KeyA).expect("source");
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
