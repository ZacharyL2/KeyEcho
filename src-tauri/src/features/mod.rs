pub mod autostart;
pub mod tray;
// No self-updater in the Mac App Store build; the Store manages updates.
#[cfg(not(feature = "app-store"))]
pub mod updater;
pub mod window;
