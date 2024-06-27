use anyhow::Result;
use serde::{Deserialize, Serialize};
use strum::{AsRefStr, Display, EnumString};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

mod decoder;
mod sound;

pub(self) use decoder::SoundDecoder;

use super::{listen_key::KeyEvent, AudioSource};
use sound::KeySound;

#[derive(EnumString, Serialize, AsRefStr, Display, PartialEq, Debug)]
#[strum(serialize_all = "camelCase")]
enum ConfigKey {
    Volume,
    Sounds,
    CurrentSound,
}

#[derive(Debug, specta::Type, Clone, Serialize, Deserialize)]
pub struct SoundOption {
    pub name: String,
    pub value: String, // the sound dir
}

pub struct KeySoundpack {
    pub volume: f32,
    pub sounds: Vec<SoundOption>,
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
            .unwrap_or_default();

        let volume = persistence
            .get(ConfigKey::Volume)
            .and_then(|val| val.as_u64().map(|v| v as f32))
            .unwrap_or(1.0);

        let current_sound = persistence
            .get(ConfigKey::CurrentSound)
            .and_then(|val| val.as_str())
            .and_then(|sound| KeySound::new(sound).ok());

        Ok(KeySoundpack {
            volume,
            sounds,
            current_sound,
            persistence,
        })
    }

    pub fn selected_sound(&self) -> Option<String> {
        self.current_sound.as_ref().map(|s| s.name.clone())
    }

    pub fn key_source(&mut self, key_evt: KeyEvent) -> Option<AudioSource> {
        self.current_sound
            .as_mut()
            .and_then(|s| s.key_source(key_evt))
    }

    pub fn update_volume(&mut self, volume: f32) -> Result<()> {
        self.volume = volume;
        self.persistence
            .insert(ConfigKey::Volume.to_string(), volume.into())?;
        self.persistence.save()?;

        Ok(())
    }

    pub fn select_sound(&mut self, sound: String) -> Result<()> {
        self.current_sound.replace(KeySound::new(&sound)?);

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
