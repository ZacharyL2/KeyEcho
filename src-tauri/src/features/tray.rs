use std::str::FromStr;

use anyhow::Result;
use strum::{AsRefStr, Display, EnumString};
use tauri::{
    api, AppHandle, CustomMenuItem, Manager, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

use crate::commands::exit_app;

use super::window::{show_dashboard, WindowLabel};

#[derive(EnumString, AsRefStr, Display, PartialEq, Debug)]
enum MenuItemId {
    DisplayDashboard,
    Restart,
    Quit,
    AppVersion,
}

pub fn init_tray(app_handle: &AppHandle) -> Result<()> {
    let package_info = app_handle.package_info();

    let tray = app_handle.tray_handle();

    tray.set_menu(
        SystemTrayMenu::new()
            .add_item(CustomMenuItem::new(
                MenuItemId::DisplayDashboard.as_ref(),
                WindowLabel::Dashboard.as_ref(),
            ))
            .add_native_item(SystemTrayMenuItem::Separator)
            .add_item(
                CustomMenuItem::new(
                    MenuItemId::AppVersion.as_ref(),
                    format!("Version {}", package_info.version.to_string()),
                )
                .disabled(),
            )
            .add_item(CustomMenuItem::new(MenuItemId::Restart.as_ref(), "Restart"))
            .add_item(CustomMenuItem::new(MenuItemId::Quit.as_ref(), "Quit")),
    )?;

    tray.set_tooltip(&package_info.name)?;

    Ok(())
}

pub fn on_system_tray_event(app_handle: &AppHandle, event: SystemTrayEvent) {
    let display_dashboard = || {
        let _ = show_dashboard(app_handle);
    };

    match event {
        #[cfg(not(target_os = "macos"))]
        SystemTrayEvent::LeftClick { .. } => display_dashboard(),
        SystemTrayEvent::MenuItemClick { id, .. } => {
            if let Ok(menu_item) = MenuItemId::from_str(id.as_str()) {
                match menu_item {
                    MenuItemId::DisplayDashboard => display_dashboard(),
                    MenuItemId::Restart => api::process::restart(&app_handle.env()),
                    MenuItemId::Quit => exit_app(app_handle.clone()),
                    _ => {}
                }
            }
        }
        _ => {}
    }
}
