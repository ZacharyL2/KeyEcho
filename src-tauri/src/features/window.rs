use anyhow::Result;
use strum::{AsRefStr, Display, EnumString};
use tauri::{AppHandle, Manager, WindowBuilder, WindowUrl};

#[derive(EnumString, AsRefStr, Display, PartialEq, Debug)]
#[strum(serialize_all = "PascalCase")]
pub enum WindowLabel {
    Dashboard,
}

pub fn show_dashboard(app_handle: &AppHandle) -> Result<()> {
    let window_label = WindowLabel::Dashboard.as_ref();

    if let Some(window) = app_handle.get_window(window_label) {
        window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())?
    }

    let window = WindowBuilder::new(
        app_handle,
        window_label,
        WindowUrl::App("index.html".into()),
    )
    .title(window_label)
    .min_inner_size(600.0, 520.0)
    .build()?;

    Ok(window.set_focus()?)
}
