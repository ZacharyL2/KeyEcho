use std::sync::{Arc, Mutex};

use anyhow::Result;
use tauri::{App, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(not(feature = "app-store"))]
use crate::features::updater::start_update_check;
use crate::{
    features::{tray::init_tray, window::show_dashboard},
    keyecho::{run_keyecho, KeySoundpack},
};

pub fn resolve_setup(app: &mut App) -> Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let app_handle = app.handle().clone();

    // Runtime scheme registration is only for Linux/Windows dev builds; macOS
    // registers keyecho:// via the bundled Info.plist and returns an error here.
    #[cfg(any(target_os = "linux", all(debug_assertions, target_os = "windows")))]
    if let Err(error) = app.deep_link().register_all() {
        eprintln!("keyecho:// scheme registration skipped: {error}");
    }

    // Frontend's onOpenUrl runs the activation fetch; Rust just surfaces the window.
    let deep_link_handle = app_handle.clone();
    app.deep_link().on_open_url(move |_event| {
        if let Err(error) = show_dashboard(&deep_link_handle) {
            eprintln!("failed to surface dashboard for deep link: {error}");
        }
    });

    init_tray(&app_handle)?;
    #[cfg(not(feature = "app-store"))]
    start_update_check(app_handle.clone());

    let soundpack = KeySoundpack::try_load(&app_handle)?;
    if soundpack.selected_sound().is_none() {
        show_dashboard(&app_handle)?;
    }

    let playback = soundpack.playback();
    let soundpack = Arc::new(Mutex::new(soundpack));
    app.manage(soundpack.clone());

    // run_keyecho spawns its own listener thread and hands back a player the
    // preview command uses to audition the selected pack.
    app.manage(run_keyecho(playback));

    Ok(())
}
