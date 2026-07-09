use std::{
    sync::{Arc, Mutex},
    thread,
};

use anyhow::{Context, Result};
use tauri::{App, Manager};

use crate::{
    features::{tray::init_tray, updater::start_update_check, window::show_dashboard},
    keyecho::{run_keyecho, KeySoundpack},
};

pub fn resolve_setup(app: &mut App) -> Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let app_handle = app.handle().clone();

    init_tray(&app_handle)?;
    start_update_check(app_handle.clone());

    let soundpack = KeySoundpack::try_load(&app_handle)?;
    if soundpack.selected_sound().is_none() {
        show_dashboard(&app_handle)?;
    }

    let playback = soundpack.playback();
    let soundpack = Arc::new(Mutex::new(soundpack));
    app.manage(soundpack.clone());

    thread::spawn(move || {
        if let Err(error) = run_keyecho(playback).context("error while running keyecho") {
            eprintln!("{error:#}");
        }
    });

    Ok(())
}
