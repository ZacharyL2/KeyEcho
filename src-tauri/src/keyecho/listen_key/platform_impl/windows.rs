use std::{
    os::raw::c_int,
    ptr::{addr_of_mut, null_mut},
};

use winapi::{
    shared::{
        minwindef::{DWORD, LPARAM, LRESULT, WPARAM},
        windef::HHOOK,
    },
    um::{
        errhandlingapi::GetLastError,
        winuser::{
            CallNextHookEx, GetMessageA, SetWindowsHookExA, HC_ACTION, KBDLLHOOKSTRUCT,
            WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
        },
    },
};

use super::{Key, KeyEvent, ListenError};

// https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
fn key_from_code(code: u32) -> Key {
    match code {
        164 => Key::Alt,
        165 => Key::AltGr,
        0x08 => Key::Backspace,
        20 => Key::CapsLock,
        162 => Key::ControlLeft,
        163 => Key::ControlRight,
        46 => Key::Delete,
        40 => Key::DownArrow,
        35 => Key::End,
        27 => Key::Escape,
        112 => Key::F1,
        121 => Key::F10,
        122 => Key::F11,
        123 => Key::F12,
        113 => Key::F2,
        114 => Key::F3,
        115 => Key::F4,
        116 => Key::F5,
        117 => Key::F6,
        118 => Key::F7,
        119 => Key::F8,
        120 => Key::F9,
        36 => Key::Home,
        37 => Key::LeftArrow,
        91 => Key::MetaLeft,
        34 => Key::PageDown,
        33 => Key::PageUp,
        0x0D => Key::Return,
        39 => Key::RightArrow,
        160 => Key::ShiftLeft,
        161 => Key::ShiftRight,
        32 => Key::Space,
        0x09 => Key::Tab,
        38 => Key::UpArrow,
        44 => Key::PrintScreen,
        145 => Key::ScrollLock,
        19 => Key::Pause,
        144 => Key::NumLock,
        192 => Key::BackQuote,
        49 => Key::Num1,
        50 => Key::Num2,
        51 => Key::Num3,
        52 => Key::Num4,
        53 => Key::Num5,
        54 => Key::Num6,
        55 => Key::Num7,
        56 => Key::Num8,
        57 => Key::Num9,
        48 => Key::Num0,
        189 => Key::Minus,
        187 => Key::Equal,
        81 => Key::KeyQ,
        87 => Key::KeyW,
        69 => Key::KeyE,
        82 => Key::KeyR,
        84 => Key::KeyT,
        89 => Key::KeyY,
        85 => Key::KeyU,
        73 => Key::KeyI,
        79 => Key::KeyO,
        80 => Key::KeyP,
        219 => Key::LeftBracket,
        221 => Key::RightBracket,
        65 => Key::KeyA,
        83 => Key::KeyS,
        68 => Key::KeyD,
        70 => Key::KeyF,
        71 => Key::KeyG,
        72 => Key::KeyH,
        74 => Key::KeyJ,
        75 => Key::KeyK,
        76 => Key::KeyL,
        186 => Key::SemiColon,
        222 => Key::Quote,
        220 => Key::BackSlash,
        226 => Key::IntlBackslash,
        90 => Key::KeyZ,
        88 => Key::KeyX,
        67 => Key::KeyC,
        86 => Key::KeyV,
        66 => Key::KeyB,
        78 => Key::KeyN,
        77 => Key::KeyM,
        188 => Key::Comma,
        190 => Key::Dot,
        191 => Key::Slash,
        45 => Key::Insert,
        // 13 => Key::KpReturn,
        109 => Key::KpMinus,
        107 => Key::KpPlus,
        106 => Key::KpMultiply,
        111 => Key::KpDivide,
        96 => Key::Kp0,
        97 => Key::Kp1,
        98 => Key::Kp2,
        99 => Key::Kp3,
        100 => Key::Kp4,
        101 => Key::Kp5,
        102 => Key::Kp6,
        103 => Key::Kp7,
        104 => Key::Kp8,
        105 => Key::Kp9,
        110 => Key::KpDelete,
        _ => Key::Unknown(code),
    }
}

static mut HOOK: HHOOK = null_mut();
static mut GLOBAL_CALLBACK: Option<Box<dyn FnMut(KeyEvent)>> = None;

pub fn listen<T>(callback: T) -> Result<(), ListenError>
where
    T: FnMut(KeyEvent) + 'static,
{
    unsafe {
        GLOBAL_CALLBACK = Some(Box::new(callback));

        let hook = SetWindowsHookExA(WH_KEYBOARD_LL, Some(raw_callback), null_mut(), 0);
        if hook.is_null() {
            return Err(ListenError::KeyHook(GetLastError()));
        }

        HOOK = hook;

        GetMessageA(null_mut(), null_mut(), 0, 0);
    }
    Ok(())
}

unsafe extern "system" fn raw_callback(code: c_int, param: WPARAM, lpdata: LPARAM) -> LRESULT {
    if code == HC_ACTION {
        if let Some(event) = convert_event(param, lpdata) {
            if let Some(callback) = addr_of_mut!(GLOBAL_CALLBACK)
                .as_mut()
                .and_then(|c| c.as_mut())
            {
                callback(event);
            }
        }
    }

    CallNextHookEx(HOOK, code, param, lpdata)
}

fn convert_event(param: WPARAM, lpdata: LPARAM) -> Option<KeyEvent> {
    let code = unsafe {
        let kb = *(lpdata as *const KBDLLHOOKSTRUCT);
        kb.vkCode
    };

    let key = key_from_code(code);

    let event = match param as DWORD {
        WM_KEYDOWN | WM_SYSKEYDOWN => KeyEvent::KeyPress(key),
        WM_KEYUP | WM_SYSKEYUP => KeyEvent::KeyRelease(key),
        _ => return None,
    };

    Some(event)
}
