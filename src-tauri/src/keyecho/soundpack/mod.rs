use std::{
    fs,
    path::{Path, PathBuf},
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
pub(crate) use sound::KeySound;

const LEGACY_APP_DATA_IDENTIFIER: &str = "xyz.waveapps.keyecho";

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

    fn rebase_paths(&mut self, old_root: &Path, new_root: &Path) {
        for sound in &mut self.sounds {
            rebase_path(&mut sound.value, old_root, new_root);
        }
        if let Some(current_sound) = self.current_sound.as_mut() {
            rebase_path(current_sound, old_root, new_root);
        }
    }
}

fn rebase_path(value: &mut String, old_root: &Path, new_root: &Path) {
    let Ok(relative) = Path::new(value).strip_prefix(old_root) else {
        return;
    };
    *value = new_root.join(relative).display().to_string();
}

fn copy_missing_dir(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_missing_dir(&source_path, &destination_path)?;
        } else if file_type.is_file() && !destination_path.exists() {
            fs::copy(source_path, destination_path)?;
        }
    }
    Ok(())
}

fn migrate_legacy_app_data(handle: &AppHandle, app_data_dir: &Path) -> Result<()> {
    let config_path = app_data_dir.join("soundpack.config.json");
    if config_path.exists() {
        return Ok(());
    }

    let legacy_dir = handle.path().data_dir()?.join(LEGACY_APP_DATA_IDENTIFIER);
    let legacy_config_path = legacy_dir.join("soundpack.config.json");
    if !legacy_config_path.exists() {
        return Ok(());
    }

    let legacy_sounds_dir = legacy_dir.join("sounds");
    if legacy_sounds_dir.exists() {
        copy_missing_dir(&legacy_sounds_dir, &app_data_dir.join("sounds"))?;
    }

    let content = fs::read_to_string(&legacy_config_path)?;
    let mut config: SoundpackConfig = serde_json::from_str(&content)?;
    config.rebase_paths(&legacy_dir, app_data_dir);
    config.save(&config_path)
}

fn default_volume() -> f32 {
    1.0
}

fn meter_step(volume: f32) -> u8 {
    match volume {
        v if v.is_nan() || v <= 0.0 => 0,
        v if v < 0.34 => 1,
        v if v < 0.67 => 2,
        _ => 3,
    }
}

// Up to 150%: quiet packs gain headroom; beyond that the loudest pack clips.
const MAX_VOLUME: f32 = 1.5;

fn normalize_volume(volume: f32) -> Result<f32> {
    ensure!(volume.is_finite(), "volume must be finite");
    Ok(volume.clamp(0.0, MAX_VOLUME))
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

    /// Status-bar meter step, 0-3. Zero means nothing will be heard: no pack
    /// loaded, or the volume is down.
    pub(super) fn meter_level(&self) -> u8 {
        if self.current_sound.load().is_none() {
            return 0;
        }
        meter_step(f32::from_bits(self.volume_bits.load(Ordering::Relaxed)))
    }

    pub(super) fn volume(&self) -> f32 {
        f32::from_bits(self.volume_bits.load(Ordering::Relaxed))
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
        let app_data_dir = handle.path().app_data_dir()?;
        if let Err(error) = migrate_legacy_app_data(handle, &app_data_dir) {
            eprintln!("failed to migrate legacy KeyEcho data: {error:#}");
        }
        let config_path = app_data_dir.join("soundpack.config.json");
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
    use std::fs;

    use tempfile::tempdir;

    use super::{copy_missing_dir, meter_step, normalize_volume, SoundOption, SoundpackConfig};

    #[test]
    fn meter_step_reports_silence_as_zero_and_full_volume_as_three() {
        assert_eq!(meter_step(0.0), 0);
        assert_eq!(meter_step(f32::NAN), 0);
        assert_eq!(meter_step(0.2), 1);
        assert_eq!(meter_step(0.5), 2);
        assert_eq!(meter_step(1.0), 3);
    }

    #[test]
    fn normalize_volume_clamps_to_supported_range() {
        assert_eq!(normalize_volume(-0.5).expect("valid volume"), 0.0);
        assert_eq!(normalize_volume(0.4).expect("valid volume"), 0.4);
        assert_eq!(normalize_volume(1.5).expect("valid volume"), 1.5);
        assert_eq!(normalize_volume(2.0).expect("valid volume"), 1.5);
    }

    #[test]
    fn normalize_volume_rejects_non_finite_values() {
        assert!(normalize_volume(f32::NAN).is_err());
        assert!(normalize_volume(f32::INFINITY).is_err());
        assert!(normalize_volume(f32::NEG_INFINITY).is_err());
    }

    #[test]
    fn legacy_data_copy_preserves_new_files_and_rebases_config_paths() {
        let temp = tempdir().expect("temporary directory");
        let old_root = temp.path().join("xyz.waveapps.keyecho");
        let new_root = temp.path().join("app.keyecho.keyecho");
        let old_pack = old_root.join("sounds/blue");
        let new_pack = new_root.join("sounds/blue");
        fs::create_dir_all(&old_pack).expect("legacy pack directory");
        fs::create_dir_all(&new_pack).expect("new pack directory");
        fs::write(old_pack.join("config.json"), "legacy").expect("legacy config");
        fs::write(old_pack.join("sound.ogg"), "audio").expect("legacy audio");
        fs::write(new_pack.join("config.json"), "new").expect("new config");

        copy_missing_dir(&old_root.join("sounds"), &new_root.join("sounds"))
            .expect("copy legacy sounds");

        assert_eq!(
            fs::read_to_string(new_pack.join("config.json")).expect("new config remains"),
            "new"
        );
        assert_eq!(
            fs::read_to_string(new_pack.join("sound.ogg")).expect("legacy audio copied"),
            "audio"
        );

        let old_pack = old_pack.display().to_string();
        let mut config = SoundpackConfig {
            volume: 1.0,
            sounds: vec![SoundOption {
                name: "blue".into(),
                value: old_pack.clone(),
            }],
            current_sound: Some(old_pack),
        };
        config.rebase_paths(&old_root, &new_root);
        let new_pack = new_pack.display().to_string();
        assert_eq!(config.sounds[0].value, new_pack);
        assert_eq!(config.current_sound.as_deref(), Some(new_pack.as_str()));
    }
}
