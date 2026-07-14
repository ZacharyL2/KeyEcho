use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
};

use anyhow::{ensure, Result};
use arc_swap::ArcSwapOption;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

mod decoder;
mod sound;

use decoder::SoundDecoder;

use super::{listen_key::KeyEvent, AudioSource};
use sound::KeySound;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundOption {
    pub name: String,
    pub value: String, // the sound dir
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundpackConfig {
    #[serde(default = "default_volume")]
    volume: f32,
    #[serde(default)]
    sounds: Vec<SoundOption>,
    #[serde(default)]
    current_sound: Option<String>,
}

impl Default for SoundpackConfig {
    fn default() -> Self {
        Self {
            volume: default_volume(),
            sounds: Vec::new(),
            current_sound: None,
        }
    }
}

impl SoundpackConfig {
    fn load(path: &PathBuf) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    fn save(&self, path: &PathBuf) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(path, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }
}

fn default_volume() -> f32 {
    1.0
}

fn normalize_volume(volume: f32) -> Result<f32> {
    ensure!(volume.is_finite(), "volume must be finite");
    Ok(volume.clamp(0.0, 1.0))
}

#[derive(Clone)]
pub(crate) struct PlaybackSoundpack {
    current_sound: Arc<ArcSwapOption<KeySound>>,
    volume_bits: Arc<AtomicU32>,
}

impl PlaybackSoundpack {
    fn new(current_sound: Option<Arc<KeySound>>, volume: f32) -> Self {
        Self {
            current_sound: Arc::new(ArcSwapOption::new(current_sound)),
            volume_bits: Arc::new(AtomicU32::new(volume.to_bits())),
        }
    }

    fn set_current_sound(&self, current_sound: Option<Arc<KeySound>>) {
        self.current_sound.store(current_sound);
    }

    fn set_volume(&self, volume: f32) {
        self.volume_bits.store(volume.to_bits(), Ordering::Relaxed);
    }

    pub(super) fn source_for_event(&self, evt: KeyEvent) -> Option<(AudioSource, f32)> {
        let current_sound = self.current_sound.load();
        let source = current_sound.as_ref()?.event_source(evt)?;
        let volume = f32::from_bits(self.volume_bits.load(Ordering::Relaxed));
        Some((source, volume))
    }
}

pub struct KeySoundpack {
    pub volume: f32,
    pub sounds: Vec<SoundOption>,
    current_sound: Option<Arc<KeySound>>,
    playback: PlaybackSoundpack,
    config_path: PathBuf,
}

pub(crate) struct PreparedSound(Arc<KeySound>);

impl KeySoundpack {
    pub fn try_load(handle: &AppHandle) -> Result<Self> {
        let config_path = handle.path().app_data_dir()?.join("soundpack.config.json");
        let config = SoundpackConfig::load(&config_path);
        let volume = normalize_volume(config.volume).unwrap_or_else(|_| default_volume());
        let current_sound = config
            .current_sound
            .as_deref()
            .and_then(|sound| KeySound::new(sound).ok())
            .map(Arc::new);
        let playback = PlaybackSoundpack::new(current_sound.clone(), volume);

        Ok(KeySoundpack {
            volume,
            sounds: config.sounds,
            current_sound,
            playback,
            config_path,
        })
    }

    pub fn playback(&self) -> PlaybackSoundpack {
        self.playback.clone()
    }

    pub fn selected_sound(&self) -> Option<String> {
        self.current_sound.as_ref().map(|s| s.name.clone())
    }

    pub fn update_volume(&mut self, volume: f32) -> Result<()> {
        let volume = normalize_volume(volume)?;
        self.volume = volume;
        self.playback.set_volume(volume);
        self.save_config()
    }

    pub(crate) fn prepare_sound(sound: String) -> Result<PreparedSound> {
        Ok(PreparedSound(Arc::new(KeySound::new(&sound)?)))
    }

    pub(crate) fn select_prepared_sound(&mut self, prepared: PreparedSound) -> Result<()> {
        let current_sound = prepared.0;
        self.playback
            .set_current_sound(Some(Arc::clone(&current_sound)));
        self.current_sound.replace(current_sound);
        self.save_config()
    }

    pub fn insert_sound(&mut self, sound: SoundOption) -> Result<()> {
        if !self.sounds.iter().any(|i| i.name == sound.name) {
            self.sounds.push(sound);
            self.save_config()?;
        };

        Ok(())
    }

    fn save_config(&self) -> Result<()> {
        SoundpackConfig {
            volume: self.volume,
            sounds: self.sounds.clone(),
            current_sound: self.selected_sound(),
        }
        .save(&self.config_path)
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_volume;

    #[test]
    fn normalize_volume_clamps_to_supported_range() {
        assert_eq!(normalize_volume(-0.5).expect("valid volume"), 0.0);
        assert_eq!(normalize_volume(0.4).expect("valid volume"), 0.4);
        assert_eq!(normalize_volume(1.5).expect("valid volume"), 1.0);
    }

    #[test]
    fn normalize_volume_rejects_non_finite_values() {
        assert!(normalize_volume(f32::NAN).is_err());
        assert!(normalize_volume(f32::INFINITY).is_err());
        assert!(normalize_volume(f32::NEG_INFINITY).is_err());
    }
}
