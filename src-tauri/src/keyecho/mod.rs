use std::{collections::HashSet, sync::Mutex};

use anyhow::{anyhow, Result};

mod echo;
mod listen_key;
mod soundpack;

pub(super) use echo::AudioSource;
pub(super) use listen_key::{Key, KeyEvent};
pub(crate) use soundpack::{KeySoundpack, SoundOption};

pub fn run_keyecho(soundpack: crate::global_state::ArcKeySoundpack) -> Result<()> {
    let player = echo::SoundPlayer::new(soundpack);

    let key_depressed = Mutex::new(HashSet::<Key>::new());
    let handle_key_event = move |evt: KeyEvent, key_action: &dyn Fn(&mut HashSet<Key>) -> bool| {
        if key_depressed
            .lock()
            .ok()
            .and_then(|mut depressed| key_action(&mut depressed).then_some(()))
            .is_some()
        {
            player.try_play(evt);
        }
    };

    listen_key::listen(move |evt| match evt {
        KeyEvent::KeyPress(k) => handle_key_event(evt, &|depressed| depressed.insert(k)),
        KeyEvent::KeyRelease(k) => handle_key_event(evt, &|depressed| depressed.remove(&k)),
    })
    .map_err(|err| anyhow!(err))
}
