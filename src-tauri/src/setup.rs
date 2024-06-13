use std::{
    sync::{Arc, Mutex},
    thread,
};

use anyhow::{Context, Result};
use tauri::{App, Manager};

use crate::{
    features::{tray::init_tray, window::show_dashboard},
    keyecho::{run_keyecho, KeySoundpack},
};

pub fn resolve_setup(app: &mut App) -> Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let app_handle = app.handle();

    init_tray(&app_handle)?;

    let soundpack = KeySoundpack::try_load(app_handle)?;
    if soundpack.selected_sound().is_none() {
        show_dashboard(&app.app_handle())?;
    }

    let soundpack = Arc::new(Mutex::new(soundpack));
    app.manage(soundpack.clone());

    thread::spawn(move || run_keyecho(soundpack).context("error while running keyecho"));

    Ok(())
}
