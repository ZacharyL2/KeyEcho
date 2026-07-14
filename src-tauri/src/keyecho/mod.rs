use std::collections::HashSet;

use anyhow::{anyhow, Result};

mod echo;
mod listen_key;
mod soundpack;

pub(super) use echo::AudioSource;
pub(super) use listen_key::{Key, KeyEvent};
pub(crate) use soundpack::{KeySoundpack, PlaybackSoundpack, SoundOption};

#[derive(Default)]
struct KeyPressGate {
    depressed: HashSet<Key>,
}

impl KeyPressGate {
    fn event_to_play(&mut self, evt: KeyEvent) -> Option<KeyEvent> {
        match evt {
            KeyEvent::KeyPress(key) if self.depressed.insert(key) => Some(evt),
            KeyEvent::KeyPress(_) => None,
            KeyEvent::KeyRelease(key) if self.depressed.remove(&key) => Some(evt),
            KeyEvent::KeyRelease(_) => None,
        }
    }
}

pub fn run_keyecho(playback: PlaybackSoundpack) -> Result<()> {
    let player = echo::SoundPlayer::new(playback);

    let mut gate = KeyPressGate::default();
    listen_key::listen(move |evt| {
        if let Some(evt) = gate.event_to_play(evt) {
            player.try_play(evt);
        }
    })
    .map_err(|err| anyhow!(err))
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashSet,
        hint::black_box,
        sync::Mutex,
        time::{Duration, Instant},
    };

    use super::{Key, KeyEvent, KeyPressGate};

    const GATE_BENCH_TAPS: usize = 1_000_000;

    #[test]
    fn key_press_gate_emits_one_press_and_its_release() {
        let mut gate = KeyPressGate::default();

        assert_eq!(
            gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)),
            Some(KeyEvent::KeyPress(Key::KeyA))
        );
        assert_eq!(gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)), None);
        assert_eq!(
            gate.event_to_play(KeyEvent::KeyRelease(Key::KeyA)),
            Some(KeyEvent::KeyRelease(Key::KeyA))
        );
        assert_eq!(gate.event_to_play(KeyEvent::KeyRelease(Key::KeyA)), None);
        assert_eq!(
            gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)),
            Some(KeyEvent::KeyPress(Key::KeyA))
        );
    }

    #[test]
    fn key_press_gate_tracks_keys_independently() {
        let mut gate = KeyPressGate::default();

        assert_eq!(
            gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)),
            Some(KeyEvent::KeyPress(Key::KeyA))
        );
        assert_eq!(
            gate.event_to_play(KeyEvent::KeyPress(Key::KeyB)),
            Some(KeyEvent::KeyPress(Key::KeyB))
        );
        assert_eq!(gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)), None);
        assert_eq!(gate.event_to_play(KeyEvent::KeyPress(Key::KeyB)), None);
    }

    #[test]
    #[ignore = "reference timing benchmark; run with `pnpm bench:audio`"]
    fn key_press_gate_reference_timing() {
        let current = min_elapsed(|| {
            let mut gate = KeyPressGate::default();
            let mut messages = 0usize;

            for _ in 0..GATE_BENCH_TAPS {
                messages += gate.event_to_play(KeyEvent::KeyPress(Key::KeyA)).is_some() as usize;
                messages += gate
                    .event_to_play(KeyEvent::KeyRelease(Key::KeyA))
                    .is_some() as usize;
            }

            black_box(messages)
        });

        let old = min_elapsed(|| {
            let depressed = Mutex::new(HashSet::<Key>::new());
            let mut messages = 0usize;

            for _ in 0..GATE_BENCH_TAPS {
                if depressed.lock().expect("lock").insert(Key::KeyA) {
                    messages += 1;
                }
                if depressed.lock().expect("lock").remove(&Key::KeyA) {
                    messages += 1;
                }
            }

            black_box(messages)
        });

        let current_ns = ns_per_op(current, GATE_BENCH_TAPS);
        let old_ns = ns_per_op(old, GATE_BENCH_TAPS);
        println!(
            "key_press_gate_reference_timing: current={current_ns:.2}ns/tap old_model={old_ns:.2}ns/tap speedup={:.2}x messages 2/tap",
            old_ns / current_ns
        );
    }

    fn min_elapsed(mut run: impl FnMut() -> usize) -> Duration {
        (0..5)
            .map(|_| {
                let started = Instant::now();
                black_box(run());
                started.elapsed()
            })
            .min()
            .expect("at least one round")
    }

    fn ns_per_op(duration: Duration, operations: usize) -> f64 {
        duration.as_nanos() as f64 / operations as f64
    }
}
