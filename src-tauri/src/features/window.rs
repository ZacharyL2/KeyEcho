use anyhow::Result;
use strum::{AsRefStr, Display, EnumString};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(EnumString, AsRefStr, Display, PartialEq, Debug)]
#[strum(serialize_all = "PascalCase")]
pub enum WindowLabel {
    Dashboard,
}

pub fn show_dashboard(app_handle: &AppHandle) -> Result<()> {
    let window_label = WindowLabel::Dashboard.as_ref();

    if let Some(window) = app_handle.get_webview_window(window_label) {
        window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())?;

        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app_handle,
        window_label,
        WebviewUrl::App("index.html".into()),
    )
    .title("KeyEcho")
    .resizable(true)
    .min_inner_size(620.0, 480.0)
    .inner_size(720.0, 640.0)
    .build()?;

    Ok(window.set_focus()?)
}
