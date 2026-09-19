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

// The native dialog can't scroll, so long notes would push its buttons off screen.
const PROMPT_NOTE_LINES: usize = 4;
const PROMPT_NOTE_CHARS: usize = 100;
const UPDATES_URL: &str = "https://keyecho.app/updates";

fn update_prompt_message(version: &str, current_version: &str, release_notes: &str) -> String {
    let mut message = format!(
        "KeyEcho {version} is now available. You have {current_version}.\n\nWould you like to install it now?"
    );

    let highlights = release_highlights(release_notes);
    if !highlights.is_empty() {
        message.push_str("\n\nWhat's new:\n");
        message.push_str(&highlights.join("\n"));
        message.push_str(&format!("\n\nSee all changes at {UPDATES_URL}"));
    }

    message
}

fn release_highlights(release_notes: &str) -> Vec<String> {
    let lines: Vec<&str> = release_notes
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();
    let bullets: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| line.starts_with("- ") || line.starts_with("* "))
        .collect();
    let picked = if bullets.is_empty() { lines } else { bullets };

    picked
        .into_iter()
        .take(PROMPT_NOTE_LINES)
        .map(|line| {
            let text = line.trim_start_matches(['-', '*']).trim();
            if text.chars().count() > PROMPT_NOTE_CHARS {
                let cut: String = text.chars().take(PROMPT_NOTE_CHARS - 1).collect();
                format!("• {}…", cut.trim_end())
            } else {
                format!("• {text}")
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::update_prompt_message;

    #[test]
    fn prompt_keeps_four_short_bullets_and_links_the_rest() {
        let notes = "## v9\n\n### Features\n\n- one\n- two\n- three\n- four\n- five\n\n### Security\n\n- six";
        let message = update_prompt_message("9.0.0", "8.0.0", notes);
        assert!(message.contains("Would you like to install it now?"));
        assert!(message.contains("• four"));
        assert!(!message.contains("five"));
        assert!(message.ends_with("See all changes at https://keyecho.app/updates"));
    }

    #[test]
    fn prompt_shortens_long_bullets() {
        let notes = format!("- {}", "a".repeat(300));
        let message = update_prompt_message("9.0.0", "8.0.0", &notes);
        assert!(message.contains(&format!("• {}…", "a".repeat(99))));
    }

    #[test]
    fn prompt_without_notes_is_just_the_question() {
        let message = update_prompt_message("9.0.0", "8.0.0", "");
        assert!(message.ends_with("Would you like to install it now?"));
    }
}
