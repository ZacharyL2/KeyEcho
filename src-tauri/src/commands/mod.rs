use std::{
    fs::create_dir_all,
    io::Cursor,
    path::{Component, Path},
};

use anyhow::{anyhow, bail, ensure, Context, Result};
use reqwest::Url;
use tar::EntryType;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    global_state::KeySoundpackState,
    keyecho::{
        import_legacy_packs, legacy_pack_count, pack_has_release, KeySoundpack, SoundOption,
        SoundPlayer,
    },
};

mod error;
use error::GeneralError;

pub type CmdResult<T = ()> = std::result::Result<T, GeneralError>;

const MAX_SOUND_ARCHIVE_BYTES: usize = 10 * 1024 * 1024;
const SOUND_DOWNLOAD_HOST: &str = "raw.githubusercontent.com";
const SOUND_DOWNLOAD_OWNER: &str = "ZacharyL2";
const SOUND_DOWNLOAD_REPO: &str = "KeyEcho";
const SOUND_DOWNLOAD_PACKS_PATH: &str = "packs";
const KEYECHO_APP_HOST: &str = "keyecho.app";
const KEYECHO_APP_WWW_HOST: &str = "www.keyecho.app";
// v1.1: free packs download straight from the R2 CDN.
const KEYECHO_CDN_HOST: &str = "cdn.keyecho.app";
const GITHUB_HOST: &str = "github.com";

fn with_soundpack<F, R, E>(soundpack: KeySoundpackState, f: F) -> CmdResult<R>
where
    F: FnOnce(&mut KeySoundpack) -> Result<R, E>,
    E: Into<GeneralError>,
{
    f(soundpack
        .lock()
        .ok()
        .as_mut()
        .context("error when get soundpack")?)
    .map_err(Into::into)
}

#[tauri::command]
pub fn update_volume(soundpack: KeySoundpackState, volume: f32) -> CmdResult<()> {
    with_soundpack(soundpack, |s| s.update_volume(volume))
}

#[tauri::command]
pub fn get_volume(soundpack: KeySoundpackState) -> CmdResult<f32> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.volume))
}

#[tauri::command]
pub async fn select_sound(soundpack: KeySoundpackState<'_>, sound: String) -> CmdResult<()> {
    let soundpack = soundpack.inner().clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || KeySoundpack::prepare_sound(sound))
        .await
        .map_err(|error| anyhow!("soundpack loading task failed: {error}"))??;

    let result = soundpack
        .lock()
        .map_err(|_| anyhow!("error when get soundpack"))?
        .select_prepared_sound(prepared)
        .map_err(Into::into);
    result
}

#[tauri::command]
pub fn get_selected_sound(soundpack: KeySoundpackState) -> CmdResult<Option<String>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.selected_sound()))
}

#[tauri::command]
pub fn get_sounds(soundpack: KeySoundpackState) -> CmdResult<Vec<SoundOption>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.sounds.clone()))
}

// Installed packs with no key-up samples — i.e. imported v1 packs. Computed
// fresh from each pack's config rather than persisted, so it can't go stale.
#[tauri::command]
pub fn press_only_packs(soundpack: KeySoundpackState) -> CmdResult<Vec<String>> {
    let values = with_soundpack(soundpack, |s| {
        anyhow::Ok(s.sounds.iter().map(|o| o.value.clone()).collect::<Vec<_>>())
    })?;
    Ok(values
        .into_iter()
        .filter(|value| !pack_has_release(value))
        .collect())
}

// v1 packs available to import. 0 = nothing to recover, so the UI can stay quiet.
#[tauri::command]
pub fn legacy_packs_available(app: AppHandle) -> usize {
    legacy_pack_count(&app)
}

// Dev-only escape hatch so VITE_KEYECHO_ORIGIN=http://localhost:3999 can be
// exercised end to end. Compiled out of release builds, which keep the strict
// allowlist that stops a compromised webview opening or fetching anything.
#[cfg(debug_assertions)]
fn is_local_dev_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
}

#[cfg(not(debug_assertions))]
fn is_local_dev_url(_url: &Url) -> bool {
    false
}

fn validate_sound_download_url(url: &Url) -> Result<()> {
    if is_local_dev_url(url) {
        return Ok(());
    }

    ensure!(
        url.scheme() == "https",
        "sound downloads must use HTTPS URLs"
    );

    match url.host_str() {
        Some(host) if host.eq_ignore_ascii_case(SOUND_DOWNLOAD_HOST) => {
            validate_github_sound_download_url(url)?
        }
        Some(host)
            if host.eq_ignore_ascii_case(KEYECHO_APP_HOST)
                || host.eq_ignore_ascii_case(KEYECHO_APP_WWW_HOST)
                || host.eq_ignore_ascii_case(KEYECHO_CDN_HOST) =>
        {
            validate_keyecho_sound_download_url(url)?
        }
        _ => bail!("sound downloads must come from an official KeyEcho source"),
    }

    ensure!(
        keyecho_gated_pack_id(url).is_some()
            || sound_archive_filename(url).is_some_and(|filename| filename.ends_with(".tar")),
        "sound downloads must be .tar archives"
    );

    Ok(())
}

fn validate_github_sound_download_url(url: &Url) -> Result<()> {
    let mut segments = url
        .path_segments()
        .ok_or_else(|| anyhow!("sound download URL is missing a path"))?;
    ensure!(
        segments
            .next()
            .is_some_and(|owner| owner.eq_ignore_ascii_case(SOUND_DOWNLOAD_OWNER)),
        "sound downloads must come from the official repository"
    );
    ensure!(
        segments
            .next()
            .is_some_and(|repo| repo.eq_ignore_ascii_case(SOUND_DOWNLOAD_REPO)),
        "sound downloads must come from the official repository"
    );

    Ok(())
}

fn validate_keyecho_sound_download_url(url: &Url) -> Result<()> {
    let mut segments = url
        .path_segments()
        .ok_or_else(|| anyhow!("sound download URL is missing a path"))?;
    ensure!(
        segments.next() == Some(SOUND_DOWNLOAD_PACKS_PATH),
        "sound downloads must come from the official pack path"
    );

    Ok(())
}

// Entitlement-gated endpoint: /packs/download?key=<key>&pack=<packId> streams a
// tar without a .tar filename, so it's named by the (sanitized) pack param.
fn keyecho_gated_pack_id(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    if !(host.eq_ignore_ascii_case(KEYECHO_APP_HOST)
        || host.eq_ignore_ascii_case(KEYECHO_APP_WWW_HOST)
        || is_local_dev_url(url))
    {
        return None;
    }
    if url.path() != "/packs/download" {
        return None;
    }
    let pack = url
        .query_pairs()
        .find(|(key, _)| key == "pack")
        .map(|(_, value)| value.into_owned())?;
    let safe = !pack.is_empty()
        && pack
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    safe.then_some(pack)
}

fn sound_archive_filename(url: &Url) -> Option<&str> {
    url.path_segments()?
        .next_back()
        .filter(|name| !name.is_empty())
}

fn sound_name_from_url(url: &Url) -> String {
    if let Some(pack) = keyecho_gated_pack_id(url) {
        return pack;
    }

    sound_archive_filename(url)
        .and_then(|filename| filename.strip_suffix(".tar"))
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown")
        .to_string()
}

fn validate_external_url(url: &Url) -> Result<()> {
    if is_local_dev_url(url) {
        return Ok(());
    }

    ensure!(url.scheme() == "https", "external links must use HTTPS");

    match url.host_str() {
        Some(host)
            if host.eq_ignore_ascii_case(KEYECHO_APP_HOST)
                || host.eq_ignore_ascii_case(KEYECHO_APP_WWW_HOST) => {}
        Some(GITHUB_HOST) => {
            let mut segments = url
                .path_segments()
                .ok_or_else(|| anyhow!("GitHub URL is missing a path"))?;
            ensure!(
                segments
                    .next()
                    .is_some_and(|owner| owner.eq_ignore_ascii_case(SOUND_DOWNLOAD_OWNER)),
                "GitHub links must point to the official repository"
            );
            ensure!(
                segments
                    .next()
                    .is_some_and(|repo| repo.eq_ignore_ascii_case(SOUND_DOWNLOAD_REPO)),
                "GitHub links must point to the official repository"
            );
        }
        _ => bail!("external link host is not allowed"),
    }

    Ok(())
}

fn open_url_with_system(app: &AppHandle, url: &str) -> Result<()> {
    app.opener()
        .open_url(url, None::<&str>)
        .context("failed to open external link")?;
    Ok(())
}

async fn fetch_sound_archive(url: &Url) -> Result<Vec<u8>> {
    validate_sound_download_url(url)?;

    let client = reqwest::Client::new();
    let mut response = client
        .get(url.clone())
        .send()
        .await?
        .error_for_status()
        .context("sound archive download failed")?;
    validate_sound_download_url(response.url())?;

    if let Some(content_length) = response.content_length() {
        ensure!(
            content_length <= MAX_SOUND_ARCHIVE_BYTES as u64,
            "sound archive is larger than 10 MiB"
        );
    }

    let mut content = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        let next_len = content
            .len()
            .checked_add(chunk.len())
            .context("sound archive is too large")?;
        ensure!(
            next_len <= MAX_SOUND_ARCHIVE_BYTES,
            "sound archive is larger than 10 MiB"
        );
        content.extend_from_slice(&chunk);
    }

    Ok(content)
}

fn validate_tar_entry_path(path: &Path) -> Result<()> {
    let mut has_normal_component = false;

    for component in path.components() {
        match component {
            Component::Normal(_) => has_normal_component = true,
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                bail!("sound archive contains an unsafe path")
            }
        }
    }

    ensure!(
        has_normal_component,
        "sound archive contains an empty entry path"
    );
    Ok(())
}

fn validate_tar_entry_type(entry_type: EntryType) -> Result<()> {
    ensure!(
        entry_type.is_file() || entry_type.is_dir(),
        "sound archive contains unsupported entry types"
    );
    Ok(())
}

fn unpack_sound_archive(dir: &Path, content: &[u8]) -> Result<()> {
    let mut archive = tar::Archive::new(Cursor::new(content));

    for entry in archive.entries()? {
        let mut entry = entry?;
        validate_tar_entry_type(entry.header().entry_type())?;
        validate_tar_entry_path(entry.path()?.as_ref())?;
        entry.unpack_in(dir)?;
    }

    Ok(())
}

async fn download_sound_impl(dir: &Path, url: &str) -> Result<String> {
    create_dir_all(dir)?;

    let url = Url::parse(url).context("invalid sound download URL")?;
    let name = sound_name_from_url(&url);
    let content = fetch_sound_archive(&url).await?;
    unpack_sound_archive(dir, &content)?;

    Ok(name)
}

#[tauri::command]
pub async fn download_sound(
    app: AppHandle,
    soundpack: KeySoundpackState<'_>,

    url: String,
) -> CmdResult<()> {
    let sounds_dir = app
        .path()
        .app_data_dir()
        .context("error when resolving app data dir")?
        .join("sounds");

    let name = download_sound_impl(&sounds_dir, &url).await?;

    let value = sounds_dir.join(&name).display().to_string();
    with_soundpack(soundpack, |s| s.insert_sound(SoundOption { name, value }))?;

    Ok(())
}

// Import the user's own v1 packs from the fixed legacy path (no picker — it's
// deterministic). Content-neutral: the audio is the user's local v1 data,
// nothing is fetched or hosted.
#[tauri::command]
pub fn import_sound_pack(
    app: AppHandle,
    soundpack: KeySoundpackState<'_>,
) -> CmdResult<Vec<SoundOption>> {
    let imported = import_legacy_packs(&app)?;
    let options = imported.clone();
    with_soundpack(soundpack, |s| {
        for option in options {
            s.insert_sound(option)?;
        }
        anyhow::Ok(())
    })?;
    Ok(imported)
}

// Audition the current pack — a short burst of random keys through the real
// sink, so choosing a pack reminds you how it sounds.
#[tauri::command]
pub fn preview_pack_sound(player: State<SoundPlayer>) {
    // 3, not the browse preview's 4: this one fires on every pack switch, so it
    // stays shorter to avoid wearing out its welcome.
    player.play_sample(3);
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> CmdResult<()> {
    let parsed = Url::parse(&url).context("invalid external URL")?;
    validate_external_url(&parsed)?;
    open_url_with_system(&app, parsed.as_str())?;

    Ok(())
}

#[tauri::command]
pub fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use tar::{Builder, Header};

    use super::*;

    #[test]
    fn sound_download_url_allows_official_raw_archives() {
        let url = Url::parse(
            "https://raw.githubusercontent.com/ZacharyL2/KeyEcho/main/src-tauri/resources/cherrymx-blue-abs.tar",
        )
        .expect("valid url");

        validate_sound_download_url(&url).expect("official URL");
        assert_eq!(sound_name_from_url(&url), "cherrymx-blue-abs");
    }

    #[test]
    fn sound_download_url_allows_keyecho_pack_archives() {
        for raw_url in [
            "https://keyecho.app/packs/nk-cream.tar",
            "https://www.keyecho.app/packs/eg-oreo.tar",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            validate_sound_download_url(&url).expect("official KeyEcho pack URL");
        }
    }

    #[test]
    fn keyecho_gated_download_url_is_allowed_and_named_by_pack() {
        let url = Url::parse(
            "https://keyecho.app/packs/download?key=KE1.abc.def&pack=waveapp-lunalogs-taptune",
        )
        .expect("valid url");

        validate_sound_download_url(&url).expect("gated download URL");
        assert_eq!(sound_name_from_url(&url), "waveapp-lunalogs-taptune");
    }

    #[test]
    fn keyecho_gated_download_url_rejects_bad_requests() {
        for raw_url in [
            "https://keyecho.app/packs/download?key=k",
            "https://keyecho.app/packs/download?key=k&pack=../escape",
            "https://keyecho.app/packs/other?key=k&pack=nk-cream",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            assert!(validate_sound_download_url(&url).is_err(), "{raw_url}");
        }
    }

    #[test]
    fn sound_download_url_rejects_untrusted_sources() {
        for raw_url in [
            "http://raw.githubusercontent.com/ZacharyL2/KeyEcho/main/src-tauri/resources/a.tar",
            "https://example.com/ZacharyL2/KeyEcho/main/src-tauri/resources/a.tar",
            "https://raw.githubusercontent.com/other/KeyEcho/main/src-tauri/resources/a.tar",
            "https://raw.githubusercontent.com/ZacharyL2/KeyEcho/main/src-tauri/resources/a.zip",
            "https://keyecho.app/downloads/a.tar",
            "https://keyecho.app/packs/a.zip",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            assert!(validate_sound_download_url(&url).is_err());
        }
    }

    #[test]
    #[cfg(debug_assertions)]
    fn dev_builds_allow_a_localhost_store_but_release_builds_do_not() {
        // Guards the VITE_KEYECHO_ORIGIN local-testing path. The cfg gate is the
        // security boundary: this branch does not exist in release builds.
        for raw_url in [
            "http://localhost:3999/packs",
            "http://localhost:3999/packs/download?key=k&pack=thockify-deep",
            "http://127.0.0.1:3999/packs",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            validate_external_url(&url).expect("dev localhost allowed");
            validate_sound_download_url(&url).expect("dev localhost download allowed");
        }
        // Still not a free-for-all: other hosts stay blocked even in dev.
        let evil = Url::parse("http://evil.example/packs").expect("valid url");
        assert!(validate_external_url(&evil).is_err());
    }

    #[test]
    fn external_url_allows_keyecho_and_official_github_links() {
        for raw_url in [
            "https://keyecho.app/?source=keyecho_app#queue",
            "https://keyecho.app/?source=keyecho_app&intent=founding_bundle&version=1.0.0",
            "https://www.keyecho.app/?source=keyecho_app&intent=sound_pack_vote",
            "https://github.com/ZacharyL2/KeyEcho/blob/main/docs/custom-sounds.md",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            validate_external_url(&url).expect("allowed external URL");
        }
    }

    #[test]
    fn external_url_rejects_untrusted_links() {
        for raw_url in [
            "http://keyecho.app/",
            "https://upweb.dev/keyecho",
            "https://keyecho.app.evil.example/",
            "https://example.com/subscribe",
            "https://github.com/other/KeyEcho",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            assert!(validate_external_url(&url).is_err());
        }
    }

    #[test]
    fn safe_unpack_extracts_regular_files() {
        let target = temp_test_dir("keyecho-safe-unpack");
        let archive = archive_with_file("pack/config.json", br#"{"keys":[]}"#);

        unpack_sound_archive(&target, &archive).expect("safe archive");

        assert!(target.join("pack").join("config.json").exists());
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn safe_unpack_rejects_parent_paths() {
        let target = temp_test_dir("keyecho-parent-unpack");
        let archive = archive_with_raw_file("../escape.txt", b"bad");

        assert!(unpack_sound_archive(&target, &archive).is_err());
        assert!(!target.join("..").join("escape.txt").exists());
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn safe_unpack_rejects_links() {
        let target = temp_test_dir("keyecho-link-unpack");
        let mut bytes = Vec::new();
        {
            let mut builder = Builder::new(&mut bytes);
            let mut header = Header::new_gnu();
            header.set_entry_type(EntryType::Symlink);
            header.set_size(0);
            header.set_mode(0o777);
            header.set_link_name("../escape.txt").expect("link name");
            header.set_cksum();
            builder
                .append_data(&mut header, "pack/link", Cursor::new(Vec::<u8>::new()))
                .expect("append symlink");
            builder.finish().expect("finish archive");
        }

        assert!(unpack_sound_archive(&target, &bytes).is_err());
        let _ = fs::remove_dir_all(target);
    }

    fn archive_with_file(path: &str, content: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut builder = Builder::new(&mut bytes);
            let mut header = Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, path, Cursor::new(content))
                .expect("append file");
            builder.finish().expect("finish archive");
        }
        bytes
    }

    fn temp_test_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{unique}"));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn archive_with_raw_file(path: &str, content: &[u8]) -> Vec<u8> {
        let mut header = [0u8; 512];
        header[..path.len()].copy_from_slice(path.as_bytes());
        write_tar_octal(&mut header[100..108], 0o644);
        write_tar_octal(&mut header[108..116], 0);
        write_tar_octal(&mut header[116..124], 0);
        write_tar_octal(&mut header[124..136], content.len() as u64);
        write_tar_octal(&mut header[136..148], 0);
        header[148..156].fill(b' ');
        header[156] = b'0';
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");

        let checksum: u32 = header.iter().map(|byte| u32::from(*byte)).sum();
        let checksum = format!("{checksum:06o}\0 ");
        header[148..156].copy_from_slice(checksum.as_bytes());

        let mut archive = Vec::from(header);
        archive.extend_from_slice(content);
        let padding = (512 - (content.len() % 512)) % 512;
        archive.resize(archive.len() + padding, 0);
        archive.resize(archive.len() + 1024, 0);
        archive
    }

    fn write_tar_octal(field: &mut [u8], value: u64) {
        let text = format!("{value:0width$o}\0", width = field.len() - 1);
        field.copy_from_slice(text.as_bytes());
    }
}
