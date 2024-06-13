use std::{
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::Duration,
};

use anyhow::Result;
use rodio::{OutputStream, PlayError, Sink, Source};

use super::listen_key::KeyEvent;
use crate::global_state::ArcKeySoundpack;

#[derive(Debug, Clone)]
pub struct AudioSource {
    samples: Vec<i16>,
    channels: u16,
    sample_rate: u32,
    pos: usize,
}

impl AudioSource {
    pub fn new(samples: Vec<i16>, channels: u16, sample_rate: u32) -> Self {
        AudioSource {
            samples,
            channels,
            sample_rate,
            pos: 0,
        }
    }
}

impl Iterator for AudioSource {
    type Item = i16;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.samples.get(self.pos)?;
        self.pos += 1;
        Some(*sample)
    }
}

impl Source for AudioSource {
    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

pub struct SoundPlayer {
    sender: Sender<KeyEvent>,
}

impl SoundPlayer {
    pub fn new(soundpack: ArcKeySoundpack) -> Self {
        let (sender, receiver) = mpsc::channel();

        thread::spawn(move || Self::handle_audio_thread(receiver, soundpack).ok());

        Self { sender }
    }

    fn handle_audio_thread(receiver: Receiver<KeyEvent>, soundpack: ArcKeySoundpack) -> Result<()> {
        let mut stream_handler = OutputStream::try_default()?;

        while let Ok(key_evt) = receiver.recv() {
            soundpack.lock().ok().as_mut().and_then(|pack| {
                pack.key_source(key_evt).map(|source| {
                    if let Some(sink) = match Sink::try_new(&stream_handler.1) {
                        Ok(sink) => Some(sink),
                        Err(PlayError::NoDevice) => {
                            OutputStream::try_default()
                                .ok()
                                .and_then(|new_stream_handler| {
                                    stream_handler = new_stream_handler;
                                    Sink::try_new(&stream_handler.1).ok()
                                })
                        }
                        _ => None,
                    } {
                        sink.append(source);
                        sink.set_volume(pack.volume);
                        sink.detach();
                    }
                })
            });
        }

        Ok(())
    }

    pub fn try_play(&self, key_evt: KeyEvent) {
        let _ = self.sender.send(key_evt);
    }
}
