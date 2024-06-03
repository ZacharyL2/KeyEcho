use anyhow::Result;
use strum::{AsRefStr, Display, EnumString};
use tauri::{AppHandle, Manager};

#[derive(EnumString, AsRefStr, Display, PartialEq, Debug)]
#[strum(serialize_all = "PascalCase")]
pub enum WindowLabel {
    Dashboard,
}

pub fn show_window(app_handle: &AppHandle, win_label: WindowLabel) -> Result<()> {
    if let Some(window) = app_handle.get_window(win_label.as_ref()) {
        window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())?;
    }

    Ok(())
}
