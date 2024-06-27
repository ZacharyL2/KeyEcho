#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use features::tray::on_system_tray_event;
use tauri::{RunEvent, SystemTray};

mod commands;
mod features;
mod global_state;
mod keyecho;
mod setup;

use commands::{
    download_sound, get_selected_sound, get_sounds, get_volume, select_sound, update_volume,
};

fn main() {
    let invoke_handler = {
        let builder = tauri_specta::ts::builder()
            .commands(tauri_specta::collect_commands![
                download_sound,
                get_sounds,
                get_selected_sound,
                select_sound,
                get_volume,
                update_volume,
            ])
            .config(
                specta::ts::ExportConfig::default()
                    .bigint(specta::ts::BigIntExportBehavior::String),
            );

        #[cfg(debug_assertions)]
        let builder = builder.path("../src/services/bindings.ts");
        builder.into_plugin()
    };

    let context = tauri::generate_context!();

    let app = tauri::Builder::default()
        .plugin(invoke_handler)
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .system_tray(SystemTray::new())
        .on_system_tray_event(on_system_tray_event)
        .setup(|app| Ok(setup::resolve_setup(app)?))
        .build(context)
        .expect("error while building tauri application");

    app.run(|_app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            api.prevent_exit();
        }
        _ => {}
    })
}
