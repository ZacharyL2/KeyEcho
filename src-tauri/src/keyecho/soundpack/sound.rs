use std::{collections::HashMap, fs::File, num::NonZeroUsize, path::PathBuf};

use anyhow::{Context, Result};
use lru::LruCache;
use serde::Deserialize;

use super::SoundDecoder;
use crate::keyecho::{AudioSource, Key, KeyEvent};

type KeySoundDefines = HashMap<Key, [u64; 2]>;

#[derive(Debug, Deserialize)]
struct SoundFileConfig {
    defines: KeySoundDefines,
}

pub struct KeySound {
    pub(super) name: String,
    decoder: SoundDecoder,
    key_defines: KeySoundDefines,
    key_cache: LruCache<KeyEvent, AudioSource>,
}

impl KeySound {
    pub fn new(sound_dir: &str) -> Result<Self> {
        let dir = PathBuf::from(sound_dir);

        let decoder = SoundDecoder::new(dir.join("sound.ogg"))?;
        let file_config =
            serde_json::from_reader::<File, SoundFileConfig>(File::open(dir.join("config.json"))?)?;

        let key_cache = LruCache::new(NonZeroUsize::new(50).context("error when init lru cap")?);

        Ok(KeySound {
            decoder,
            key_cache,
            name: sound_dir.to_string(),
            key_defines: file_config.defines,
        })
    }

    pub fn key_source(&mut self, key_evt: KeyEvent) -> Option<AudioSource> {
        self.key_cache
            .get(&key_evt)
            .cloned()
            .or_else(|| match key_evt {
                KeyEvent::KeyRelease(_key) => None,
                KeyEvent::KeyPress(key) => self
                    .key_defines
                    .get(&key)
                    .or_else(|| self.key_defines.get(&Key::KeyA))
                    .and_then(|&[start_ms, duration_ms]| {
                        self.decoder
                            .get_samples_buf(start_ms, duration_ms)
                            .ok()
                            .map(|buf| {
                                let source = AudioSource::new(
                                    buf,
                                    self.decoder.channels as u16,
                                    self.decoder.rate,
                                );
                                self.key_cache.put(key_evt, source.clone());
                                source
                            })
                    }),
            })
    }
}
