#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{RunEvent, WindowEvent};

mod commands;
mod features;
mod global_state;
mod keyecho;
mod setup;

use commands::{
    download_sound, exit_app, get_selected_sound, get_sounds, get_volume, import_sound_pack,
    legacy_packs_available, open_external_url, press_only_packs, preview_pack_sound, select_sound,
    update_volume,
};
use features::autostart::{is_auto_launch_enabled, set_auto_launch};

fn main() {
    let context = tauri::generate_context!();

    let builder = tauri::Builder::default()
        // Must stay first so a deep link launching a second instance is caught here.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let _ = features::window::show_dashboard(app);
            let _ = &argv; // consumed only on Windows/Linux below
                           // Windows/Linux deliver deep links as an argv to the second instance;
                           // forward it so the running app's deep-link handler activates.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            if let Some(url) = argv.iter().find(|arg| arg.starts_with("keyecho://")) {
                use tauri::Emitter;
                let _ = app.emit("deep-link://new-url", vec![url.clone()]);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    // The Mac App Store forbids self-updating apps; the Store handles updates.
    // Every other target keeps the in-app updater.
    #[cfg(not(feature = "app-store"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .invoke_handler(tauri::generate_handler![
            download_sound,
            import_sound_pack,
            preview_pack_sound,
            press_only_packs,
            legacy_packs_available,
            get_sounds,
            get_selected_sound,
            select_sound,
            get_volume,
            update_volume,
            open_external_url,
            exit_app,
            is_auto_launch_enabled,
            set_auto_launch,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Err(error) = features::autostart::ensure_attribution(app.handle()) {
                eprintln!("failed to attribute KeyEcho's launch agent: {error}");
            }

            Ok(setup::resolve_setup(app)?)
        })
        .build(context)
        .expect("error while building tauri application");

    let mut dashboard_close_requested = false;
    app.run(move |_app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { .. },
            ..
        } if label == features::window::WindowLabel::Dashboard.as_ref() => {
            dashboard_close_requested = true;
        }
        RunEvent::ExitRequested { code, api, .. }
            if code.is_none() && dashboard_close_requested =>
        {
            dashboard_close_requested = false;
            api.prevent_exit();
        }
        _ => {}
    })
}
