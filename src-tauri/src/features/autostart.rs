use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
fn launch_agent_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    Ok(home
        .join("Library/LaunchAgents")
        .join(format!("{}.plist", app.package_info().name)))
}

#[cfg(target_os = "macos")]
fn set_attribution(launch_agent: &mut plist::Value, bundle_id: &str) -> Result<bool, String> {
    let dictionary = launch_agent
        .as_dictionary_mut()
        .ok_or("autostart launch agent is not a plist dictionary")?;
    let association = plist::Value::Array(vec![plist::Value::String(bundle_id.into())]);
    if dictionary.get("AssociatedBundleIdentifiers") == Some(&association) {
        return Ok(false);
    }

    dictionary.insert("AssociatedBundleIdentifiers".into(), association);
    Ok(true)
}

#[cfg(target_os = "macos")]
pub fn ensure_attribution(app: &AppHandle) -> Result<(), String> {
    let path = launch_agent_path(app)?;
    let mut launch_agent = match plist::Value::from_file(&path) {
        Ok(launch_agent) => launch_agent,
        Err(error)
            if error
                .as_io()
                .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound) =>
        {
            return Ok(())
        }
        Err(error) => return Err(error.to_string()),
    };
    if !set_attribution(&mut launch_agent, &app.config().identifier)? {
        return Ok(());
    }

    let parent = path
        .parent()
        .ok_or("autostart launch agent has no parent directory")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    launch_agent
        .to_writer_xml(temporary.as_file_mut())
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn system_reports_launch_agent_enabled(app: &AppHandle) -> Result<Option<bool>, String> {
    use objc2_foundation::{NSProcessInfo, NSString, NSURL};
    use objc2_service_management::{SMAppService, SMAppServiceStatus};

    if NSProcessInfo::processInfo()
        .operatingSystemVersion()
        .majorVersion
        < 13
    {
        return Ok(None);
    }

    let path = launch_agent_path(app)?;
    if !path.exists() {
        return Ok(Some(false));
    }
    let path = NSString::from_str(&path.to_string_lossy());
    let url = NSURL::fileURLWithPath(&path);
    let status = unsafe { SMAppService::statusForLegacyURL(&url) };
    match status {
        SMAppServiceStatus::Enabled => Ok(Some(true)),
        SMAppServiceStatus::RequiresApproval => Ok(Some(false)),
        SMAppServiceStatus::NotRegistered | SMAppServiceStatus::NotFound => Ok(None),
        _ => Ok(None),
    }
}

#[tauri::command]
pub fn is_auto_launch_enabled(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    if let Some(enabled) = system_reports_launch_agent_enabled(&app)? {
        return Ok(enabled);
    }

    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_auto_launch(app: AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|error| error.to_string())?;
        #[cfg(target_os = "macos")]
        if let Err(error) = ensure_attribution(&app) {
            let _ = app.autolaunch().disable();
            return Err(error);
        }
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::set_attribution;

    #[test]
    fn attribution_uses_the_configured_bundle_id_and_is_idempotent() {
        let mut launch_agent = plist::Value::Dictionary(plist::Dictionary::new());

        assert_eq!(
            set_attribution(&mut launch_agent, "app.keyecho.test"),
            Ok(true)
        );
        assert_eq!(
            set_attribution(&mut launch_agent, "app.keyecho.test"),
            Ok(false)
        );
        assert_eq!(
            launch_agent
                .as_dictionary()
                .and_then(|dictionary| dictionary.get("AssociatedBundleIdentifiers")),
            Some(&plist::Value::Array(vec![plist::Value::String(
                "app.keyecho.test".into(),
            )]))
        );
    }
}
