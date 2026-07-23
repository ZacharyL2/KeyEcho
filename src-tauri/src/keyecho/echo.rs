use std::{
    num::NonZero,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::Result;
use crossbeam_channel::{bounded, Receiver, Sender};
use rodio::{
    cpal::{BufferSize, ErrorKind},
    ChannelCount, DeviceSinkBuilder, MixerDeviceSink, SampleRate, Source,
};

use super::{
    listen_key::{Key, KeyEvent},
    PlaybackSoundpack,
};

// A natural-sounding spread of keys for the pack audition burst (letters of
// "the quick brown" + space) — no external rng, no meaning beyond variety.
const SAMPLE_KEYS: [Key; 12] = [
    Key::KeyT,
    Key::KeyH,
    Key::KeyE,
    Key::Space,
    Key::KeyQ,
    Key::KeyU,
    Key::KeyI,
    Key::KeyC,
    Key::KeyK,
    Key::KeyB,
    Key::KeyR,
    Key::KeyN,
];

// xorshift64 — cheap variety for the audition, not security.
fn next_rand(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}

const AUDIO_EVENT_QUEUE_CAPACITY: usize = 256;
const LOW_LATENCY_BUFFER_CANDIDATES: [u32; 3] = [512, 1024, 2048];

#[derive(Debug, Clone)]
pub struct AudioSource {
    samples: Arc<[f32]>,
    channels: ChannelCount,
    sample_rate: SampleRate,
    pos: usize,
}

impl AudioSource {
    pub fn new(samples: Arc<[f32]>, channels: u16, sample_rate: u32) -> Option<Self> {
        Some(AudioSource {
            samples,
            channels: NonZero::new(channels)?,
            sample_rate: NonZero::new(sample_rate)?,
            pos: 0,
        })
    }

    #[cfg(test)]
    pub(crate) fn shares_samples_with(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.samples, &other.samples)
    }

    #[cfg(test)]
    pub(crate) fn sample_ref_count(&self) -> usize {
        Arc::strong_count(&self.samples)
    }
}

impl Iterator for AudioSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.samples.get(self.pos)?;
        self.pos += 1;
        Some(*sample)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.samples.len().saturating_sub(self.pos);
        (remaining, Some(remaining))
    }
}

impl ExactSizeIterator for AudioSource {}

impl Source for AudioSource {
    fn channels(&self) -> ChannelCount {
        self.channels
    }

    fn sample_rate(&self) -> SampleRate {
        self.sample_rate
    }

    fn current_span_len(&self) -> Option<usize> {
        Some(self.samples.len().saturating_sub(self.pos))
    }

    fn total_duration(&self) -> Option<Duration> {
        let frames = self.samples.len() as u128 / u128::from(self.channels.get());
        let nanos = frames.saturating_mul(1_000_000_000) / u128::from(self.sample_rate.get());
        Some(Duration::from_nanos(nanos.min(u128::from(u64::MAX)) as u64))
    }
}

/// Errors meaning the output stream is gone and the sink must be reopened on
/// the new default device. cpal reroutes to the new default itself; when it
/// can't, it reports one of these and we reopen. Named so the classification
/// is testable. See the rodio pin note in Cargo.toml.
fn is_stream_lost(kind: &ErrorKind) -> bool {
    matches!(
        kind,
        ErrorKind::DeviceNotAvailable | ErrorKind::StreamInvalidated
    )
}

struct AudioOutput {
    sink: MixerDeviceSink,
    stream_failed: Arc<AtomicBool>,
}

impl AudioOutput {
    fn open_default() -> Option<Self> {
        let stream_failed = Arc::new(AtomicBool::new(false));
        let stream_failed_callback = Arc::clone(&stream_failed);

        let error_callback = move |err: rodio::cpal::Error| {
            if is_stream_lost(&err.kind()) {
                stream_failed_callback.store(true, Ordering::Release);
                eprintln!("audio stream requires reopen: {err}");
            }
        };

        let mut sink = LOW_LATENCY_BUFFER_CANDIDATES
            .into_iter()
            .find_map(|frames| {
                DeviceSinkBuilder::from_default_device()
                    .ok()?
                    .with_buffer_size(BufferSize::Fixed(frames))
                    .with_error_callback(error_callback.clone())
                    .open_stream()
                    .inspect_err(|error| {
                        eprintln!("audio buffer {frames} frames unavailable: {error}")
                    })
                    .ok()
            })
            .or_else(|| {
                eprintln!("using the audio device default buffer size");
                DeviceSinkBuilder::from_default_device()
                    .ok()?
                    .with_buffer_size(BufferSize::Default)
                    .with_error_callback(error_callback)
                    .open_sink_or_fallback()
                    .ok()
            })?;
        eprintln!("audio output opened with {:?}", sink.config().buffer_size());
        sink.log_on_drop(false);

        Some(Self {
            sink,
            stream_failed,
        })
    }

    fn should_reopen(&self) -> bool {
        self.stream_failed.load(Ordering::Acquire)
    }

    fn play(&self, source: AudioSource, volume: f32) {
        self.sink.mixer().add(source.amplify(volume));
    }
}

#[derive(Clone)]
pub struct SoundPlayer {
    sender: Sender<KeyEvent>,
}

impl SoundPlayer {
    pub fn new(playback: PlaybackSoundpack) -> Self {
        let (sender, receiver) = bounded(AUDIO_EVENT_QUEUE_CAPACITY);

        thread::spawn(move || Self::handle_audio_thread(receiver, playback).ok());

        Self { sender }
    }

    fn handle_audio_thread(
        receiver: Receiver<KeyEvent>,
        playback: PlaybackSoundpack,
    ) -> Result<()> {
        let mut output = AudioOutput::open_default();

        while let Ok(evt) = receiver.recv() {
            let Some((source, volume)) = playback.source_for_event(evt) else {
                continue;
            };

            let should_reopen = output
                .as_ref()
                .map(AudioOutput::should_reopen)
                .unwrap_or(true);

            if should_reopen {
                output = AudioOutput::open_default();
            }

            if let Some(output) = output.as_ref() {
                output.play(source, volume);
            }
        }

        Ok(())
    }

    pub fn try_play(&self, evt: KeyEvent) {
        let _ = self.sender.try_send(evt);
    }

    // Audition the current pack: fire a short burst of random key presses through
    // the real sink so selecting a pack reminds you how it sounds (Klack-style).
    // Non-blocking — a worker paces the burst and exits.
    pub fn play_sample(&self, count: usize) {
        let sender = self.sender.clone();
        thread::spawn(move || {
            let mut seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0x9E37_79B9_7F4A_7C15)
                | 1; // never zero — xorshift would stick at 0
                     // Same cadence as the web preview (src/preview.ts): 70–110ms hold,
                     // 190–330ms press-to-press. Slower than real typing on purpose —
                     // the ear needs the strokes separated to judge timbre rather than
                     // hear one rattle.
            for _ in 0..count {
                let key = SAMPLE_KEYS[(next_rand(&mut seed) as usize) % SAMPLE_KEYS.len()];
                let _ = sender.try_send(KeyEvent::KeyPress(key));
                let hold = 70 + next_rand(&mut seed) % 41;
                thread::sleep(Duration::from_millis(hold));
                let _ = sender.try_send(KeyEvent::KeyRelease(key));
                // press-to-press = hold + this, so 190–330ms overall.
                thread::sleep(Duration::from_millis(120 + next_rand(&mut seed) % 101));
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use rodio::Source;

    use super::{next_rand, AudioSource, LOW_LATENCY_BUFFER_CANDIDATES, SAMPLE_KEYS};

    #[test]
    fn audition_picks_varied_keys() {
        // Guards the "stuck seed → same key every press" failure mode.
        let mut seed = 0x1234_5678_9abc_def0_u64;
        let picks: std::collections::HashSet<usize> = (0..20)
            .map(|_| (next_rand(&mut seed) as usize) % SAMPLE_KEYS.len())
            .collect();
        assert!(picks.len() > 1, "audition keys should vary");
    }

    #[test]
    fn audio_source_rejects_invalid_format() {
        let samples = Arc::from(vec![0.0].into_boxed_slice());

        assert!(AudioSource::new(Arc::clone(&samples), 0, 44_100).is_none());
        assert!(AudioSource::new(samples, 1, 0).is_none());
    }

    #[test]
    fn audio_source_reports_exact_remaining_samples() {
        let samples = Arc::from(vec![0.0, 0.25, 0.5, 0.75].into_boxed_slice());
        let mut source = AudioSource::new(samples, 2, 1_000).expect("valid source");

        assert_eq!(source.size_hint(), (4, Some(4)));
        assert_eq!(source.len(), 4);
        assert_eq!(source.current_span_len(), Some(4));
        assert_eq!(source.total_duration(), Some(Duration::from_millis(2)));

        assert_eq!(source.next(), Some(0.0));
        assert_eq!(source.size_hint(), (3, Some(3)));
        assert_eq!(source.len(), 3);
        assert_eq!(source.current_span_len(), Some(3));
    }

    #[test]
    fn audio_source_clone_reuses_sample_storage() {
        let samples = Arc::from(vec![0.0, 1.0].into_boxed_slice());
        let source = AudioSource::new(samples, 1, 44_100).expect("valid source");
        assert_eq!(source.sample_ref_count(), 1);

        let clone = source.clone();

        assert!(source.shares_samples_with(&clone));
        assert_eq!(source.sample_ref_count(), 2);
        assert_eq!(clone.sample_ref_count(), 2);
    }

    #[test]
    fn audio_source_metadata_stays_small() {
        assert!(std::mem::size_of::<AudioSource>() <= 48);
    }

    #[test]
    fn audio_event_queue_is_bounded() {
        assert_eq!(super::AUDIO_EVENT_QUEUE_CAPACITY, 256);
    }

    #[test]
    fn audio_buffer_candidates_favor_latency_then_stability() {
        assert_eq!(LOW_LATENCY_BUFFER_CANDIDATES, [512, 1024, 2048]);
    }

    // Pins the error classification the reopen decision depends on, so dropping
    // a variant fails here. cpal's own rerouting needs real hardware; not tested.
    #[test]
    fn lost_stream_errors_force_a_reopen() {
        use rodio::cpal::ErrorKind;

        assert!(super::is_stream_lost(&ErrorKind::DeviceNotAvailable));
        assert!(super::is_stream_lost(&ErrorKind::StreamInvalidated));
    }
}
