#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{RunEvent, WindowEvent};

mod commands;
mod features;
mod global_state;
mod keyecho;
mod setup;

use commands::{
    download_sound, exit_app, get_selected_sound, get_sounds, get_volume, open_external_url,
    select_sound, update_volume,
};

fn main() {
    let context = tauri::generate_context!();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            download_sound,
            get_sounds,
            get_selected_sound,
            select_sound,
            get_volume,
            update_volume,
            open_external_url,
            exit_app,
        ])
        .setup(|app| Ok(setup::resolve_setup(app)?))
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
