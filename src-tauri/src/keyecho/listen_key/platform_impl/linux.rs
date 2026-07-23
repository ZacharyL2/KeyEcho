use std::{mem::MaybeUninit, os::raw::c_uint, ptr::null};

use x11::{xinput2, xlib};

use super::{Key, KeyEvent, ListenError};

fn key_from_code(code: c_uint) -> Key {
    match code {
        64 => Key::Alt,
        108 => Key::AltGr,
        22 => Key::Backspace,
        66 => Key::CapsLock,
        37 => Key::ControlLeft,
        105 => Key::ControlRight,
        119 => Key::Delete,
        116 => Key::DownArrow,
        115 => Key::End,
        9 => Key::Escape,
        67 => Key::F1,
        76 => Key::F10,
        95 => Key::F11,
        96 => Key::F12,
        68 => Key::F2,
        69 => Key::F3,
        70 => Key::F4,
        71 => Key::F5,
        72 => Key::F6,
        73 => Key::F7,
        74 => Key::F8,
        75 => Key::F9,
        110 => Key::Home,
        113 => Key::LeftArrow,
        133 => Key::MetaLeft,
        117 => Key::PageDown,
        112 => Key::PageUp,
        36 => Key::Return,
        114 => Key::RightArrow,
        50 => Key::ShiftLeft,
        62 => Key::ShiftRight,
        65 => Key::Space,
        23 => Key::Tab,
        111 => Key::UpArrow,
        107 => Key::PrintScreen,
        78 => Key::ScrollLock,
        127 => Key::Pause,
        77 => Key::NumLock,
        49 => Key::BackQuote,
        10 => Key::Num1,
        11 => Key::Num2,
        12 => Key::Num3,
        13 => Key::Num4,
        14 => Key::Num5,
        15 => Key::Num6,
        16 => Key::Num7,
        17 => Key::Num8,
        18 => Key::Num9,
        19 => Key::Num0,
        20 => Key::Minus,
        21 => Key::Equal,
        24 => Key::KeyQ,
        25 => Key::KeyW,
        26 => Key::KeyE,
        27 => Key::KeyR,
        28 => Key::KeyT,
        29 => Key::KeyY,
        30 => Key::KeyU,
        31 => Key::KeyI,
        32 => Key::KeyO,
        33 => Key::KeyP,
        34 => Key::LeftBracket,
        35 => Key::RightBracket,
        38 => Key::KeyA,
        39 => Key::KeyS,
        40 => Key::KeyD,
        41 => Key::KeyF,
        42 => Key::KeyG,
        43 => Key::KeyH,
        44 => Key::KeyJ,
        45 => Key::KeyK,
        46 => Key::KeyL,
        47 => Key::SemiColon,
        48 => Key::Quote,
        51 => Key::BackSlash,
        94 => Key::IntlBackslash,
        52 => Key::KeyZ,
        53 => Key::KeyX,
        54 => Key::KeyC,
        55 => Key::KeyV,
        56 => Key::KeyB,
        57 => Key::KeyN,
        58 => Key::KeyM,
        59 => Key::Comma,
        60 => Key::Dot,
        61 => Key::Slash,
        118 => Key::Insert,
        104 => Key::KpReturn,
        82 => Key::KpMinus,
        86 => Key::KpPlus,
        63 => Key::KpMultiply,
        106 => Key::KpDivide,
        90 => Key::Kp0,
        87 => Key::Kp1,
        88 => Key::Kp2,
        89 => Key::Kp3,
        83 => Key::Kp4,
        84 => Key::Kp5,
        85 => Key::Kp6,
        79 => Key::Kp7,
        80 => Key::Kp8,
        81 => Key::Kp9,
        91 => Key::KpDelete,
        _ => Key::Unknown(code),
    }
}

pub fn listen<T>(callback: T) -> Result<(), ListenError>
where
    T: FnMut(KeyEvent) + 'static,
{
    unsafe {
        let display = xlib::XOpenDisplay(null());
        if display.is_null() {
            return Err(ListenError::MissingDisplay);
        }

        let mut major = 2;
        let mut minor = 0;
        if xinput2::XIQueryVersion(display, &mut major, &mut minor) != i32::from(xlib::Success) {
            xlib::XCloseDisplay(display);
            return Err(ListenError::XInputExtension);
        }

        let mut mask = [0u8; ((xinput2::XI_LASTEVENT + 7) / 8) as usize];
        xinput2::XISetMask(&mut mask, xinput2::XI_RawKeyPress);
        xinput2::XISetMask(&mut mask, xinput2::XI_RawKeyRelease);
        let mut event_mask = xinput2::XIEventMask {
            deviceid: xinput2::XIAllMasterDevices,
            mask_len: mask.len() as i32,
            mask: mask.as_mut_ptr(),
        };
        let root = xlib::XDefaultRootWindow(display);
        if xinput2::XISelectEvents(display, root, &mut event_mask, 1) != i32::from(xlib::Success) {
            xlib::XCloseDisplay(display);
            return Err(ListenError::XInputExtension);
        }
        xlib::XFlush(display);

        let mut callback = callback;
        loop {
            let mut event = MaybeUninit::<xlib::XEvent>::uninit();
            xlib::XNextEvent(display, event.as_mut_ptr());
            let event = event.assume_init();
            if event.get_type() != xlib::GenericEvent {
                continue;
            }

            let mut cookie = xlib::XGenericEventCookie::from(event);
            if xlib::XGetEventData(display, &mut cookie) != xlib::True {
                continue;
            }

            if matches!(
                cookie.evtype,
                xinput2::XI_RawKeyPress | xinput2::XI_RawKeyRelease
            ) {
                let raw_event = &*(cookie.data as *const xinput2::XIRawEvent);
                if let Some(event) =
                    convert_event(cookie.evtype, raw_event.detail as c_uint, raw_event.flags)
                {
                    callback(event);
                }
            }
            xlib::XFreeEventData(display, &mut cookie);
        }
    }
}

fn convert_event(type_: i32, code: c_uint, flags: i32) -> Option<KeyEvent> {
    let key = key_from_code(code);

    let event = match type_ {
        xinput2::XI_RawKeyPress if flags & xinput2::XIKeyRepeat == 0 => KeyEvent::KeyPress(key),
        xinput2::XI_RawKeyPress => return None,
        xinput2::XI_RawKeyRelease => KeyEvent::KeyRelease(key),
        _ => return None,
    };

    Some(event)
}

#[cfg(test)]
mod tests {
    use super::{convert_event, Key, KeyEvent};
    use x11::xinput2;

    #[test]
    fn repeated_raw_key_presses_are_suppressed() {
        assert_eq!(
            convert_event(xinput2::XI_RawKeyPress, 38, 0),
            Some(KeyEvent::KeyPress(Key::KeyA))
        );
        assert_eq!(
            convert_event(xinput2::XI_RawKeyPress, 38, xinput2::XIKeyRepeat),
            None
        );
        assert_eq!(
            convert_event(xinput2::XI_RawKeyRelease, 38, 0),
            Some(KeyEvent::KeyRelease(Key::KeyA))
        );
    }
}
