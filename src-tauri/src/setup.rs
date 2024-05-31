use std::{
    path::PathBuf,
    sync::{mpsc, Arc},
    thread,
};

use anyhow::{Context, Result};
use tauri::{ActivationPolicy, App, Manager};
use tauri_plugin_store::StoreBuilder;

use crate::keyecho;

pub struct KeyEchoConfig {
    pub volume: f32,
    pub soundpack_dir: PathBuf,
}

pub fn resolve_setup(app: &mut App) -> Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(ActivationPolicy::Accessory);

    let path_resolver = app.path_resolver();
    let app_data_dir = path_resolver.app_data_dir().context("no data dir")?;
    let _store = StoreBuilder::new(app.handle(), app_data_dir.join("config.json")).build();

    let resource_dir = path_resolver.resource_dir().context("no resource dir")?;
    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(tx);

    app.manage(tx);
    thread::spawn(move || {
        if let Err(err) = keyecho::run(
            rx,
            KeyEchoConfig {
                volume: 100.0,
                soundpack_dir: resource_dir.join("resources/cherrymx-black-abs"),
            },
        ) {
            println!("error while starting keyecho: {:?}", err)
        };
    });

    Ok(())
}
