use std::{
    num::NonZero,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use anyhow::Result;
use crossbeam_channel::{bounded, Receiver, Sender};
use rodio::{
    cpal::ErrorKind, ChannelCount, DeviceSinkBuilder, MixerDeviceSink, SampleRate, Source,
};

use super::{listen_key::Key, PlaybackSoundpack};

const AUDIO_EVENT_QUEUE_CAPACITY: usize = 256;

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

struct AudioOutput {
    sink: MixerDeviceSink,
    stream_failed: Arc<AtomicBool>,
}

impl AudioOutput {
    fn open_default() -> Option<Self> {
        let stream_failed = Arc::new(AtomicBool::new(false));
        let stream_failed_callback = Arc::clone(&stream_failed);

        let mut sink = DeviceSinkBuilder::from_default_device()
            .ok()?
            .with_error_callback(move |err| {
                if matches!(
                    err.kind(),
                    ErrorKind::DeviceNotAvailable | ErrorKind::StreamInvalidated
                ) {
                    stream_failed_callback.store(true, Ordering::Release);
                    eprintln!("audio stream requires reopen: {err}");
                }
            })
            .open_sink_or_fallback()
            .ok()?;
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

pub struct SoundPlayer {
    sender: Sender<Key>,
}

impl SoundPlayer {
    pub fn new(playback: PlaybackSoundpack) -> Self {
        let (sender, receiver) = bounded(AUDIO_EVENT_QUEUE_CAPACITY);

        thread::spawn(move || Self::handle_audio_thread(receiver, playback).ok());

        Self { sender }
    }

    fn handle_audio_thread(receiver: Receiver<Key>, playback: PlaybackSoundpack) -> Result<()> {
        let mut output = AudioOutput::open_default();

        while let Ok(key) = receiver.recv() {
            let Some((source, volume)) = playback.source_for_key(key) else {
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

    pub fn try_play(&self, key: Key) {
        let _ = self.sender.try_send(key);
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use rodio::Source;

    use super::AudioSource;

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
}
