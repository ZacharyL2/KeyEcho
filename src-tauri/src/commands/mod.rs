use std::{
    fs::create_dir_all,
    io::Cursor,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use tauri::AppHandle;

use crate::{
    global_state::KeySoundpackState,
    keyecho::{KeySoundpack, SoundOption},
};

mod error;
use error::GeneralError;

pub type CmdResult<T = ()> = std::result::Result<T, GeneralError>;

fn with_soundpack<F, R, E>(soundpack: KeySoundpackState, f: F) -> CmdResult<R>
where
    F: FnOnce(&mut KeySoundpack) -> Result<R, E>,
    E: Into<GeneralError>,
{
    f(soundpack
        .lock()
        .ok()
        .as_mut()
        .context("error when get soundpack")?)
    .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn update_volume(soundpack: KeySoundpackState, volume: f32) -> CmdResult<()> {
    with_soundpack(soundpack, |s| s.update_volume(volume))
}

#[tauri::command]
#[specta::specta]
pub fn select_sound(soundpack: KeySoundpackState, sound: String) -> CmdResult<()> {
    with_soundpack(soundpack, |s| s.select_sound(sound))
}

#[tauri::command]
#[specta::specta]
pub fn get_selected_sound(soundpack: KeySoundpackState) -> CmdResult<Option<String>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.selected_sound()))
}

#[tauri::command]
#[specta::specta]
pub fn get_sounds(soundpack: KeySoundpackState) -> CmdResult<Vec<SoundOption>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.sounds.clone()))
}

async fn download_sound_impl(dir: &PathBuf, url: &String) -> Result<()> {
    if !dir.exists() {
        create_dir_all(dir)?;
    }

    let content = reqwest::get(url).await.unwrap().bytes().await.unwrap();
    let mut archive = tar::Archive::new(Cursor::new(content));
    archive.unpack(dir).unwrap();

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn download_sound(
    app: AppHandle,
    soundpack: KeySoundpackState<'_>,

    url: String,
) -> CmdResult<()> {
    if let Some(data_dir) = app.path_resolver().app_data_dir() {
        let sounds_dir = data_dir.join("sounds");

        download_sound_impl(&sounds_dir, &url).await?;

        let name = Path::new(&url)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let dir = sounds_dir.join(&name).display().to_string();
        with_soundpack(soundpack, |s| {
            s.insert_sound(SoundOption { name, value: dir })
        })?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn exit_app(app_handle: AppHandle) {
    // tauri::api::process::kill_children();
    app_handle.exit(0);
    std::process::exit(0);
}
