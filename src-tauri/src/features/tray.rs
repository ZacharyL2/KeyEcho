use std::str::FromStr;

use anyhow::{Context, Result};
use strum::{AsRefStr, Display, EnumString};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
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

#[cfg(target_os = "macos")]
fn tray_icon(_: &AppHandle) -> Result<Image<'static>> {
    Image::from_bytes(include_bytes!("../../icons/tray-template.png"))
        .context("error when loading macOS tray template icon")
}

#[cfg(not(target_os = "macos"))]
fn tray_icon(app_handle: &AppHandle) -> Result<Image<'_>> {
    app_handle
        .default_window_icon()
        .context("error when loading default tray icon")
        .cloned()
}

pub fn init_tray(app_handle: &AppHandle) -> Result<()> {
    let package_info = app_handle.package_info();

    let display_dashboard = MenuItem::with_id(
        app_handle,
        MenuItemId::DisplayDashboard.as_ref(),
        WindowLabel::Dashboard.as_ref(),
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app_handle)?;
    let app_version = MenuItem::with_id(
        app_handle,
        MenuItemId::AppVersion.as_ref(),
        format!("Version {}", package_info.version),
        false,
        None::<&str>,
    )?;
    let restart = MenuItem::with_id(
        app_handle,
        MenuItemId::Restart.as_ref(),
        "Restart",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app_handle,
        MenuItemId::Quit.as_ref(),
        "Quit",
        true,
        None::<&str>,
    )?;

    let menu = Menu::with_items(
        app_handle,
        &[
            &display_dashboard,
            &separator,
            &app_version,
            &restart,
            &quit,
        ],
    )?;

    let icon = tray_icon(app_handle)?;

    let tray_builder = TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip(&package_info.name)
        .menu(&menu)
        .show_menu_on_left_click(false);

    #[cfg(target_os = "macos")]
    let tray_builder = tray_builder.icon_as_template(true);

    tray_builder
        .on_menu_event(|app_handle, event| {
            if let Ok(menu_item) = MenuItemId::from_str(event.id().as_ref()) {
                match menu_item {
                    MenuItemId::DisplayDashboard => {
                        let _ = show_dashboard(app_handle);
                    }
                    MenuItemId::Restart => app_handle.restart(),
                    MenuItemId::Quit => exit_app(app_handle.clone()),
                    MenuItemId::AppVersion => {}
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_dashboard(tray.app_handle());
            }
        })
        .build(app_handle)?;

    Ok(())
}
