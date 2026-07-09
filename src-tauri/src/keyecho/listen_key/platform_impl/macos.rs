#![allow(improper_ctypes_definitions)]
use core_graphics::event::{CGEvent, CGEventTapLocation, CGEventType, CGKeyCode, EventField};
use std::{collections::HashSet, convert::TryInto, os::raw::c_void, ptr::null_mut};

use super::{Key, KeyEvent, ListenError};

fn key_from_code(code: CGKeyCode) -> Key {
    match code {
        58 => Key::Alt,
        61 => Key::AltGr,
        51 => Key::Backspace,
        57 => Key::CapsLock,
        59 => Key::ControlLeft,
        62 => Key::ControlRight,
        125 => Key::DownArrow,
        53 => Key::Escape,
        122 => Key::F1,
        109 => Key::F10,
        103 => Key::F11,
        111 => Key::F12,
        120 => Key::F2,
        99 => Key::F3,
        118 => Key::F4,
        96 => Key::F5,
        97 => Key::F6,
        98 => Key::F7,
        100 => Key::F8,
        101 => Key::F9,
        63 => Key::Function,
        123 => Key::LeftArrow,
        55 => Key::MetaLeft,
        54 => Key::MetaRight,
        36 => Key::Return,
        124 => Key::RightArrow,
        56 => Key::ShiftLeft,
        60 => Key::ShiftRight,
        49 => Key::Space,
        48 => Key::Tab,
        126 => Key::UpArrow,
        50 => Key::BackQuote,
        18 => Key::Num1,
        19 => Key::Num2,
        20 => Key::Num3,
        21 => Key::Num4,
        23 => Key::Num5,
        22 => Key::Num6,
        26 => Key::Num7,
        28 => Key::Num8,
        25 => Key::Num9,
        29 => Key::Num0,
        27 => Key::Minus,
        24 => Key::Equal,
        12 => Key::KeyQ,
        13 => Key::KeyW,
        14 => Key::KeyE,
        15 => Key::KeyR,
        17 => Key::KeyT,
        16 => Key::KeyY,
        32 => Key::KeyU,
        34 => Key::KeyI,
        31 => Key::KeyO,
        35 => Key::KeyP,
        33 => Key::LeftBracket,
        30 => Key::RightBracket,
        0 => Key::KeyA,
        1 => Key::KeyS,
        2 => Key::KeyD,
        3 => Key::KeyF,
        5 => Key::KeyG,
        4 => Key::KeyH,
        38 => Key::KeyJ,
        40 => Key::KeyK,
        37 => Key::KeyL,
        41 => Key::SemiColon,
        39 => Key::Quote,
        42 => Key::BackSlash,
        6 => Key::KeyZ,
        7 => Key::KeyX,
        8 => Key::KeyC,
        9 => Key::KeyV,
        11 => Key::KeyB,
        45 => Key::KeyN,
        46 => Key::KeyM,
        43 => Key::Comma,
        47 => Key::Dot,
        44 => Key::Slash,
        _ => Key::Unknown(code.into()),
    }
}

type CFMachPortRef = *const c_void;
type CFIndex = u64;
type CFAllocatorRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFRunLoopRef = *mut c_void;
type CFRunLoopMode = *mut c_void;
type CGEventTapProxy = *mut c_void;
type CGEventRef = CGEvent;

type CGEventMask = u64;
type CGEventTapPlacement = u32;

type CGEventTapCallback = unsafe extern "C" fn(
    proxy: CGEventTapProxy,
    _type: CGEventType,
    cg_event: CGEventRef,
    user_info: *mut c_void,
) -> CGEventRef;

#[link(name = "Cocoa", kind = "framework")]
extern "C" {
    #[allow(improper_ctypes)]
    fn CGEventTapCreate(
        tap: CGEventTapLocation,
        place: CGEventTapPlacement,
        options: CGEventTapOption,
        eventsOfInterest: CGEventMask,
        callback: CGEventTapCallback,
        user_info: *mut c_void,
    ) -> CFMachPortRef;

    fn CFMachPortCreateRunLoopSource(
        allocator: CFAllocatorRef,
        tap: CFMachPortRef,
        order: CFIndex,
    ) -> CFRunLoopSourceRef;

    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFRunLoopMode);
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CFRunLoopRun();

    static kCFRunLoopCommonModes: CFRunLoopMode;
}

#[allow(non_upper_case_globals)]
const kCGHeadInsertEventTap: CGEventTapPlacement = 0;

#[allow(non_upper_case_globals)]
const kCGEventMaskForAllEvents: CGEventMask = (1 << CGEventType::KeyDown as u64)
    + (1 << CGEventType::KeyUp as u64)
    + (1 << CGEventType::FlagsChanged as u64);

#[repr(u32)]
enum CGEventTapOption {
    ListenOnly = 1,
}

struct EventTapState {
    callback: Box<dyn FnMut(KeyEvent)>,
    pressed_modifiers: HashSet<CGKeyCode>,
}

pub fn listen<T>(callback: T) -> Result<(), ListenError>
where
    T: FnMut(KeyEvent) + 'static,
{
    unsafe {
        let state = Box::new(EventTapState {
            callback: Box::new(callback),
            pressed_modifiers: HashSet::new(),
        });
        let state_ptr = Box::into_raw(state);

        let tap = CGEventTapCreate(
            CGEventTapLocation::HID,
            kCGHeadInsertEventTap,
            CGEventTapOption::ListenOnly,
            kCGEventMaskForAllEvents,
            raw_callback,
            state_ptr.cast(),
        );
        if tap.is_null() {
            drop(Box::from_raw(state_ptr));
            return Err(ListenError::EventTap);
        }

        let run_loop_source = CFMachPortCreateRunLoopSource(null_mut(), tap, 0);
        if run_loop_source.is_null() {
            drop(Box::from_raw(state_ptr));
            return Err(ListenError::LoopSource);
        }

        let current_loop = CFRunLoopGetCurrent();
        CFRunLoopAddSource(current_loop, run_loop_source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
        CFRunLoopRun();

        drop(Box::from_raw(state_ptr));
    }

    Ok(())
}

unsafe extern "C" fn raw_callback(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    cg_event: CGEventRef,
    user_info: *mut c_void,
) -> CGEventRef {
    let Some(state) = (user_info as *mut EventTapState).as_mut() else {
        return cg_event;
    };

    if let Some(event) = convert_event(event_type, &cg_event, &mut state.pressed_modifiers) {
        (state.callback)(event);
    }
    cg_event
}

unsafe fn convert_event(
    cg_event_type: CGEventType,
    cg_event: &CGEvent,
    pressed_modifiers: &mut HashSet<CGKeyCode>,
) -> Option<KeyEvent> {
    let code = cg_event
        .get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)
        .try_into()
        .ok()?;

    let event = match cg_event_type {
        CGEventType::KeyDown => KeyEvent::KeyPress(key_from_code(code)),
        CGEventType::KeyUp => KeyEvent::KeyRelease(key_from_code(code)),
        CGEventType::FlagsChanged => convert_modifier_event(code, pressed_modifiers)?,
        _ => return None,
    };

    Some(event)
}

fn convert_modifier_event(
    code: CGKeyCode,
    pressed_modifiers: &mut HashSet<CGKeyCode>,
) -> Option<KeyEvent> {
    let key = modifier_key_from_code(code)?;

    if pressed_modifiers.remove(&code) {
        Some(KeyEvent::KeyRelease(key))
    } else {
        pressed_modifiers.insert(code);
        Some(KeyEvent::KeyPress(key))
    }
}

fn modifier_key_from_code(code: CGKeyCode) -> Option<Key> {
    match code {
        54..=63 => Some(key_from_code(code)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{convert_modifier_event, Key, KeyEvent};

    #[test]
    fn modifier_events_track_left_and_right_keys_independently() {
        let mut pressed_modifiers = HashSet::new();

        assert_eq!(
            convert_modifier_event(56, &mut pressed_modifiers),
            Some(KeyEvent::KeyPress(Key::ShiftLeft))
        );
        assert_eq!(
            convert_modifier_event(60, &mut pressed_modifiers),
            Some(KeyEvent::KeyPress(Key::ShiftRight))
        );
        assert_eq!(
            convert_modifier_event(56, &mut pressed_modifiers),
            Some(KeyEvent::KeyRelease(Key::ShiftLeft))
        );
        assert_eq!(
            convert_modifier_event(60, &mut pressed_modifiers),
            Some(KeyEvent::KeyRelease(Key::ShiftRight))
        );
        assert!(pressed_modifiers.is_empty());
    }

    #[test]
    fn modifier_events_ignore_non_modifier_keycodes() {
        let mut pressed_modifiers = HashSet::new();

        assert_eq!(convert_modifier_event(0, &mut pressed_modifiers), None);
        assert!(pressed_modifiers.is_empty());
    }
}
