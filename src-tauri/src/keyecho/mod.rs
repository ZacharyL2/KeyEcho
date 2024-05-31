use std::{
    collections::{HashMap, HashSet},
    fs::File,
    num::NonZeroUsize,
    sync::Mutex,
};

use anyhow::{Context, Result};
use lru::LruCache;
use serde::Deserialize;

use crate::{global_state::SoundThreadReceiver, setup::KeyEchoConfig};

mod listen_key;
mod sound_decoder;

use listen_key::{listen, Key, ListenEventType};
use sound_decoder::SymphoniaDecoder;

#[derive(Debug)]
pub enum SoundThreadMsg {
    UpdateVolume(u16),
    UpdateSoundpackDir(String),
}

#[derive(Debug, Deserialize)]
struct SoundConfig {
    defines: HashMap<Key, [u64; 2]>,
}

pub fn run(sound_thread_rx: SoundThreadReceiver, config: KeyEchoConfig) -> Result<()> {
    let sound_config = serde_json::from_reader::<File, SoundConfig>(File::open(
        config.soundpack_dir.join("config.json"),
    )?)?;

    let mut sound = SymphoniaDecoder::new(config.soundpack_dir.join("sound.wav"))?;

    let (_stream, stream_handle) = rodio::OutputStream::try_default()?;

    let sink_vol = config.volume / 100.0;

    let cache = Mutex::new(LruCache::<Key, Vec<i16>>::new(
        NonZeroUsize::new(50).context("error when init lru cap")?,
    ));

    let key_depressed = Mutex::new(HashSet::<Key>::new());
    if let Err(error) = listen(move |evt| match evt.event_type {
        ListenEventType::KeyPress(k) => {
            if let Ok(mut depressed) = key_depressed.lock() {
                if depressed.insert(k) {
                    if let Some(source) =
                        cache.lock().ok().and_then(|mut cache| match cache.get(&k) {
                            Some(buf) => Some(buf.clone()),
                            None => {
                                let [start_ms, duration_ms] = match k {
                                    Key::Unknown(_) => sound_config.defines[&Key::KeyA],
                                    _ => sound_config.defines[&k],
                                };

                                match sound.get_samples_buf(start_ms, duration_ms) {
                                    Err(_) => None,
                                    Ok(buf) => {
                                        cache.put(k, buf.clone());
                                        Some(buf)
                                    }
                                }
                            }
                        })
                    {
                        let _ = rodio::Sink::try_new(&stream_handle).map(|sink| {
                            sink.append(sound.get_sound_source(source));
                            sink.set_volume(sink_vol);
                            sink.detach();
                        });
                    }
                }
            }
        }
        ListenEventType::KeyRelease(k) => {
            key_depressed
                .lock()
                .ok()
                .map(|mut depressed| depressed.remove(&k));
        }
    }) {
        println!("error when listen: {:?}", error)
    }

    while let Ok(message) = sound_thread_rx.recv() {
        match message {
            SoundThreadMsg::UpdateVolume(volume) => {
                println!("Volume updated to {}", volume);
            }
            SoundThreadMsg::UpdateSoundpackDir(dir) => {
                println!("File directory updated to {}", dir);
            }
        }
    }

    Ok(())
}
