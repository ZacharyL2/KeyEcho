use std::{
    sync::{Arc, Mutex},
    thread,
};

use anyhow::Result;
use tauri::{App, Manager};

use crate::{
    features::{tray::create_tray_menu, window::show_dashboard},
    keyecho::{run, KeySoundpack},
};

pub fn resolve_setup(app: &mut App) -> Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let app_handle = app.handle();

    app_handle
        .tray_handle()
        .set_menu(create_tray_menu(&app_handle))?;

    let soundpack = KeySoundpack::try_load(app_handle)?;

    if soundpack.current_sound().is_none() {
        show_dashboard(&app.app_handle())?;
    }

    let soundpack = Arc::new(Mutex::new(soundpack));
    app.manage(soundpack.clone());

    thread::spawn(move || {
        if let Err(err) = run(soundpack) {
            println!("error while starting keyecho: {:?}", err)
        };
    });

    Ok(())
}
