use std::str::FromStr;

use strum::{AsRefStr, Display, EnumString};
use tauri::{
    api, AppHandle, CustomMenuItem, Manager, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

use crate::commands::exit_app;

use super::window::{show_window, WindowLabel};

#[derive(EnumString, AsRefStr, Display, PartialEq, Debug)]
enum MenuItemId {
    OpenDashboard,
    Restart,
    Quit,
    AppVersion,
}

pub fn create_tray_menu(app_handle: &AppHandle) -> SystemTrayMenu {
    let version = app_handle.package_info().version.to_string();

    SystemTrayMenu::new()
        .add_item(CustomMenuItem::new(
            MenuItemId::OpenDashboard.as_ref(),
            WindowLabel::Dashboard.as_ref(),
        ))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(
            CustomMenuItem::new(
                MenuItemId::AppVersion.as_ref(),
                format!("Version {version}"),
            )
            .disabled(),
        )
        .add_item(CustomMenuItem::new(MenuItemId::Restart.as_ref(), "Restart"))
        .add_item(CustomMenuItem::new(MenuItemId::Quit.as_ref(), "Quit"))
}

pub fn on_system_tray_event(app_handle: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => match MenuItemId::from_str(id.as_str()) {
            Ok(MenuItemId::OpenDashboard) => {
                let _ = show_window(app_handle, WindowLabel::Dashboard);
            }
            Ok(MenuItemId::Restart) => api::process::restart(&app_handle.env()),
            Ok(MenuItemId::Quit) => exit_app(app_handle.clone()),

            _ => {}
        },
        _ => {}
    }
}
