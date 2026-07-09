use std::{fs::File, path::Path};

use anyhow::{Context, Result};
use symphonia::{
    core::{
        audio::GenericAudioBufferRef,
        codecs::audio::AudioDecoder,
        formats::{probe::Hint, FormatReader, SeekMode, SeekTo, TrackType},
        io::MediaSourceStream,
        units::{Duration as SymphoniaDuration, Time, TimeBase, Timestamp},
    },
    default::{get_codecs, get_probe},
};

pub struct SoundDecoder {
    decoder: Box<dyn AudioDecoder>,
    format: Box<dyn FormatReader>,
    track_id: u32,
    time_base: TimeBase,
    pub(super) rate: u32,
    pub(super) channels: u16,
}

impl SoundDecoder {
    pub fn new<P>(path: P) -> Result<Self>
    where
        P: AsRef<Path>,
    {
        let file = File::open(&path)?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.as_ref().extension().and_then(|p| p.to_str()) {
            hint.with_extension(ext);
        }

        let format = get_probe().probe(&hint, mss, Default::default(), Default::default())?;

        let track = format
            .default_track(TrackType::Audio)
            .context("no default audio track")?;
        let track_id = track.id;
        let codec_params = track
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
            .context("no audio codec params")?;
        let time_base = track.time_base.context("no time base")?;
        let decoder = get_codecs().make_audio_decoder(codec_params, &Default::default())?;

        let codec_params = decoder.codec_params();
        let rate = codec_params.sample_rate.context("no sample rate")?;
        let channels = codec_params
            .channels
            .as_ref()
            .map(|channels| channels.count() as u16)
            .context("no channels")?;

        Ok(SoundDecoder {
            decoder,
            format,
            track_id,

            rate,
            channels,
            time_base,
        })
    }

    pub fn get_samples_buf(&mut self, start_ms: u64, duration_ms: u64) -> Result<Vec<f32>> {
        self.format.seek(
            SeekMode::Accurate,
            SeekTo::Time {
                track_id: None,
                time: Time::from_millis_u64(start_ms),
            },
        )?;

        self.decoder.reset();

        let mut decoded_duration = 0u64;
        let mut samples_buffer = vec![];

        while decoded_duration < duration_ms {
            let Some(packet) = self.format.next_packet()? else {
                break;
            };

            if packet.track_id != self.track_id {
                continue;
            }

            decoded_duration += duration_to_millis(self.time_base, packet.dur);

            let decoded = self.decoder.decode(&packet)?;
            append_interleaved_samples(decoded, &mut samples_buffer);
        }

        Ok(samples_buffer)
    }
}

fn append_interleaved_samples(decoded: GenericAudioBufferRef<'_>, samples: &mut Vec<f32>) {
    let start = samples.len();
    samples.resize(start + decoded.samples_interleaved(), 0.0);
    decoded.copy_to_slice_interleaved(&mut samples[start..]);
}

fn duration_to_millis(time_base: TimeBase, duration: SymphoniaDuration) -> u64 {
    let Ok(ticks) = i64::try_from(duration.get()) else {
        return u64::MAX;
    };

    time_base
        .calc_time(Timestamp::new(ticks))
        .map(|time| time.as_millis().max(0) as u64)
        .unwrap_or(0)
}
