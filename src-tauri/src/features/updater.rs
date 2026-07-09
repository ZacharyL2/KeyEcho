use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};
use tauri_plugin_updater::{Update, UpdaterExt};

pub fn start_update_check(app_handle: AppHandle) {
    async_runtime::spawn(async move {
        if let Err(error) = check_and_install_update(app_handle).await {
            eprintln!("updater failed: {error:#}");
        }
    });
}

async fn check_and_install_update(app_handle: AppHandle) -> anyhow::Result<()> {
    let Some(update) = app_handle.updater()?.check().await? else {
        return Ok(());
    };

    let version = update.version.clone();
    let release_notes = update.body.as_deref().map(str::trim).unwrap_or("");
    let current_version = app_handle.package_info().version.to_string();
    let message = update_prompt_message(&version, &current_version, release_notes);

    let install_result = app_handle
        .dialog()
        .message(message)
        .title("KeyEcho Update")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show_with_result();
    eprintln!("updater install prompt result: {install_result:?}");

    if !matches!(install_result, MessageDialogResult::Yes) {
        return Ok(());
    }

    install_update(&update).await?;

    app_handle
        .dialog()
        .message(format!(
            "KeyEcho {version} has been installed.\n\nQuit KeyEcho and open it again to finish updating."
        ))
        .title("KeyEcho Update Installed")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::Ok)
        .blocking_show();

    Ok(())
}

async fn install_update(update: &Update) -> anyhow::Result<()> {
    update
        .download_and_install(
            |chunk_length, content_length| {
                if let Some(content_length) = content_length {
                    eprintln!(
                        "updater download progress: {chunk_length} bytes chunk, {content_length} bytes total"
                    );
                }
            },
            || eprintln!("updater download finished"),
        )
        .await?;

    Ok(())
}

fn update_prompt_message(version: &str, current_version: &str, release_notes: &str) -> String {
    let mut message = format!(
        "KeyEcho {version} is now available. You have {current_version}.\n\nWould you like to install it now?"
    );

    if !release_notes.is_empty() {
        message.push_str("\n\nRelease Notes:\n");
        message.push_str(release_notes);
    }

    message
}
