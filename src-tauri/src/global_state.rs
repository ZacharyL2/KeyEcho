use std::sync::{Arc, Mutex};

use tauri::State;

use crate::keyecho::KeySoundpack;

pub type ArcKeySoundpack = Arc<Mutex<KeySoundpack>>;

pub type KeySoundpackState<'r> = State<'r, ArcKeySoundpack>;
