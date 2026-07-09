use std::{
    fs::create_dir_all,
    io::Cursor,
    path::{Component, Path},
    process::Command,
};

use anyhow::{anyhow, bail, ensure, Context, Result};
use reqwest::Url;
use tar::EntryType;
use tauri::{AppHandle, Manager};

use crate::{
    global_state::KeySoundpackState,
    keyecho::{KeySoundpack, SoundOption},
};

mod error;
use error::GeneralError;

pub type CmdResult<T = ()> = std::result::Result<T, GeneralError>;

const MAX_SOUND_ARCHIVE_BYTES: usize = 10 * 1024 * 1024;
const SOUND_DOWNLOAD_HOST: &str = "raw.githubusercontent.com";
const SOUND_DOWNLOAD_OWNER: &str = "ZacharyL2";
const SOUND_DOWNLOAD_REPO: &str = "KeyEcho";
const KEYECHO_APP_HOST: &str = "keyecho.app";
const KEYECHO_APP_WWW_HOST: &str = "www.keyecho.app";
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
pub fn select_sound(soundpack: KeySoundpackState, sound: String) -> CmdResult<()> {
    with_soundpack(soundpack, |s| s.select_sound(sound))
}

#[tauri::command]
pub fn get_selected_sound(soundpack: KeySoundpackState) -> CmdResult<Option<String>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.selected_sound()))
}

#[tauri::command]
pub fn get_sounds(soundpack: KeySoundpackState) -> CmdResult<Vec<SoundOption>> {
    with_soundpack(soundpack, |s| anyhow::Ok(s.sounds.clone()))
}

fn validate_sound_download_url(url: &Url) -> Result<()> {
    ensure!(
        url.scheme() == "https",
        "sound downloads must use HTTPS URLs"
    );
    ensure!(
        url.host_str() == Some(SOUND_DOWNLOAD_HOST),
        "sound downloads must come from {SOUND_DOWNLOAD_HOST}"
    );

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
    ensure!(
        sound_archive_filename(url).is_some_and(|filename| filename.ends_with(".tar")),
        "sound downloads must be .tar archives"
    );

    Ok(())
}

fn sound_archive_filename(url: &Url) -> Option<&str> {
    url.path_segments()?
        .next_back()
        .filter(|name| !name.is_empty())
}

fn sound_name_from_url(url: &Url) -> String {
    sound_archive_filename(url)
        .and_then(|filename| filename.strip_suffix(".tar"))
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown")
        .to_string()
}

fn validate_external_url(url: &Url) -> Result<()> {
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

fn open_url_with_system(url: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", url]).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    let status = status.context("failed to open external link")?;
    ensure!(status.success(), "external link opener failed");

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

#[tauri::command]
pub fn open_external_url(url: String) -> CmdResult<()> {
    let parsed = Url::parse(&url).context("invalid external URL")?;
    validate_external_url(&parsed)?;
    open_url_with_system(parsed.as_str())?;

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
            "https://raw.githubusercontent.com/ZacharyL2/KeyEcho/master/src-tauri/resources/cherrymx-blue-abs.tar",
        )
        .expect("valid url");

        validate_sound_download_url(&url).expect("official URL");
        assert_eq!(sound_name_from_url(&url), "cherrymx-blue-abs");
    }

    #[test]
    fn sound_download_url_rejects_untrusted_sources() {
        for raw_url in [
            "http://raw.githubusercontent.com/ZacharyL2/KeyEcho/master/src-tauri/resources/a.tar",
            "https://example.com/ZacharyL2/KeyEcho/master/src-tauri/resources/a.tar",
            "https://raw.githubusercontent.com/other/KeyEcho/master/src-tauri/resources/a.tar",
            "https://raw.githubusercontent.com/ZacharyL2/KeyEcho/master/src-tauri/resources/a.zip",
        ] {
            let url = Url::parse(raw_url).expect("valid url");
            assert!(validate_sound_download_url(&url).is_err());
        }
    }

    #[test]
    fn external_url_allows_keyecho_and_official_github_links() {
        for raw_url in [
            "https://keyecho.app/?source=keyecho_app&intent=founding_bundle&version=1.0.0",
            "https://www.keyecho.app/?source=keyecho_app&intent=sound_pack_vote",
            "https://github.com/ZacharyL2/KeyEcho/blob/master/docs/custom-sounds.md",
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
