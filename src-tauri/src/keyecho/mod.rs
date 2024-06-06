use std::{collections::HashSet, sync::Mutex};

use anyhow::{anyhow, Result};

pub(super) mod decoder;
pub(super) mod listen_key;
mod soundpack;

pub use soundpack::{KeySoundpack, SoundOption};

use crate::global_state::ArcKeySoundpack;
use listen_key::{listen, Key, ListenKeyEvent};

pub fn run_keyecho(soundpack: ArcKeySoundpack) -> Result<()> {
    let (_stream, stream_handle) = rodio::OutputStream::try_default()?;
    let key_depressed = Mutex::new(HashSet::<Key>::new());

    listen(move |evt| match evt {
        ListenKeyEvent::KeyRelease(k) => {
            key_depressed
                .lock()
                .ok()
                .map(|mut depressed| depressed.remove(&k));
        }
        ListenKeyEvent::KeyPress(k) => {
            if key_depressed
                .lock()
                .ok()
                .and_then(|mut depressed| depressed.insert(k).then_some(()))
                .is_some()
            {
                soundpack
                    .lock()
                    .ok()
                    .as_mut()
                    .and_then(|soundpack| {
                        soundpack
                            .key_source(k)
                            .map(|source| (soundpack.volume(), source))
                    })
                    .and_then(|(volume, source)| {
                        rodio::Sink::try_new(&stream_handle).ok().map(|sink| {
                            sink.append(source);
                            sink.set_volume(volume);
                            sink.detach();
                        })
                    });
            }
        }
    })
    .map_err(|err| anyhow!(err))
}
