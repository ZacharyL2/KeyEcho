use std::{collections::HashMap, fs::File, num::NonZeroUsize, path::PathBuf};

use anyhow::{Context, Result};
use lru::LruCache;
use rodio::buffer::SamplesBuffer;
use serde::{Deserialize, Serialize};
use specta::Type;
use strum::{AsRefStr, Display, EnumString};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

use super::decoder::SoundDecoder;
use super::listen_key::Key;

#[derive(EnumString, Serialize, AsRefStr, Display, PartialEq, Debug)]
#[strum(serialize_all = "camelCase")]
pub enum ConfigKey {
    Volume,
    Sounds,
    CurrentSound,
}

#[derive(Debug, Type, Clone, Serialize, Deserialize)]
pub struct SoundOption {
    pub name: String,
    pub value: String, // the sound dir
}

type KeySoundDefines = HashMap<Key, [u64; 2]>;

#[derive(Debug, Deserialize)]
struct SoundFileConfig {
    defines: KeySoundDefines,
}

fn build_sound_components(sound_dir: &str) -> Result<(SoundFileConfig, SoundDecoder)> {
    let dir = PathBuf::from(sound_dir);

    let decoder = SoundDecoder::new(dir.join("sound.wav"))?;
    let config =
        serde_json::from_reader::<File, SoundFileConfig>(File::open(dir.join("config.json"))?)?;

    Ok((config, decoder))
}

struct KeySound {
    name: String,
    decoder: SoundDecoder,
    key_defines: KeySoundDefines,
    key_cache: LruCache<Key, Vec<i16>>,
}

impl KeySound {
    pub fn new(sound_dir: &str) -> Result<Self> {
        let (file_config, decoder) = build_sound_components(sound_dir)?;
        let key_cache = LruCache::<Key, Vec<i16>>::new(
            NonZeroUsize::new(50).context("error when init lru cap")?,
        );

        Ok(KeySound {
            decoder,
            key_cache,
            name: sound_dir.to_string(),
            key_defines: file_config.defines,
        })
    }

    pub fn name(&self) -> String {
        self.name.clone()
    }

    pub fn key_source(&mut self, key: Key) -> Option<SamplesBuffer<i16>> {
        self.key_cache
            .get(&key)
            .cloned()
            .or_else(|| {
                self.key_defines
                    .get(&key)
                    .or_else(|| self.key_defines.get(&Key::KeyA))
                    .and_then(|&[start_ms, duration_ms]| {
                        self.decoder
                            .get_samples_buf(start_ms, duration_ms)
                            .ok()
                            .map(|buf| {
                                self.key_cache.put(key, buf.clone());
                                buf
                            })
                    })
            })
            .map(|buf| self.decoder.get_sound_source(buf))
    }
}

pub struct KeySoundpack {
    volume: f32,
    sounds: Vec<SoundOption>,
    current_sound: Option<KeySound>,
    // todo replace store plugin with custom store
    persistence: Store<Wry>,
}

impl KeySoundpack {
    pub fn try_load(handle: AppHandle) -> Result<Self> {
        let mut persistence = StoreBuilder::new(handle, "soundpack.config.json".parse()?).build();
        let _ = persistence.load();

        let sounds = persistence
            .get(ConfigKey::Sounds)
            .and_then(|val| serde_json::from_value::<Vec<SoundOption>>(val.clone()).ok())
            .unwrap_or(vec![]);

        let volume = persistence
            .get(ConfigKey::Volume)
            .and_then(|val| val.as_u64().map(|v| v as f32))
            .unwrap_or(100.0);

        let current_sound = persistence
            .get(ConfigKey::CurrentSound)
            .and_then(|val| val.as_str())
            .and_then(|sound| KeySound::new(sound).ok());

        Ok(KeySoundpack {
            volume,
            sounds,
            persistence,
            current_sound,
        })
    }

    pub fn volume(&self) -> f32 {
        self.volume / 100.0
    }

    pub fn current_sound(&self) -> Option<String> {
        self.current_sound.as_ref().map(|s| s.name())
    }

    pub fn list_sounds(&self) -> Vec<SoundOption> {
        self.sounds.clone()
    }

    pub fn update_volume(&mut self, volume: f32) -> Result<()> {
        self.volume = volume;
        self.persistence
            .insert(ConfigKey::Volume.to_string(), volume.into())?;
        self.persistence.save()?;

        Ok(())
    }

    pub fn key_source(&mut self, key: Key) -> Option<SamplesBuffer<i16>> {
        self.current_sound.as_mut().and_then(|s| s.key_source(key))
    }

    pub fn select_sound(&mut self, sound: String) -> Result<()> {
        let _ = self.current_sound.insert(KeySound::new(&sound)?);

        self.persistence.insert(
            ConfigKey::CurrentSound.to_string(),
            serde_json::to_value(&sound)?,
        )?;
        self.persistence.save()?;

        Ok(())
    }

    pub fn insert_sound(&mut self, sound: SoundOption) -> Result<()> {
        if !self.sounds.iter().any(|i| i.name == sound.name) {
            self.sounds.push(sound);

            self.persistence.insert(
                ConfigKey::Sounds.to_string(),
                serde_json::to_value(&self.sounds)?,
            )?;
            self.persistence.save()?;
        };

        Ok(())
    }
}
