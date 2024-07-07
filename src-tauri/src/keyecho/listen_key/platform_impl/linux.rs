use std::{
    ffi::CStr,
    os::raw::{c_char, c_int, c_uchar, c_uint},
    ptr::{addr_of_mut, null},
};

use x11::{xlib, xrecord};

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

static mut GLOBAL_CALLBACK: Option<Box<dyn FnMut(KeyEvent)>> = None;

pub fn listen<T>(callback: T) -> Result<(), ListenError>
where
    T: FnMut(KeyEvent) + 'static,
{
    unsafe {
        GLOBAL_CALLBACK = Some(Box::new(callback));
        let dpy_control = xlib::XOpenDisplay(null());
        if dpy_control.is_null() {
            return Err(ListenError::MissingDisplay);
        }

        let extension_name =
            CStr::from_bytes_with_nul(b"RECORD\0").map_err(|_| ListenError::XRecordExtension)?;
        if xlib::XInitExtension(dpy_control, extension_name.as_ptr()).is_null() {
            return Err(ListenError::XRecordExtension);
        }

        let mut record_range = *xrecord::XRecordAllocRange();
        record_range.device_events.first = xlib::KeyPress as c_uchar;
        record_range.device_events.last = xlib::KeyRelease as c_uchar;

        let context = xrecord::XRecordCreateContext(
            dpy_control,
            0,
            #[allow(const_item_mutation)]
            &mut xrecord::XRecordAllClients,
            1,
            &mut &mut record_range as *mut _ as *mut _,
            1,
        );
        if context == 0 {
            return Err(ListenError::RecordContext);
        }

        xlib::XSync(dpy_control, 0);

        if xrecord::XRecordEnableContext(dpy_control, context, Some(raw_callback), &mut 0) == 0 {
            return Err(ListenError::RecordContextEnabling);
        }
    }

    Ok(())
}

#[derive(Debug)]
#[repr(C)]
struct XRecordDatum {
    type_: u8,
    code: u8,
}

unsafe extern "C" fn raw_callback(
    _null: *mut c_char,
    raw_data: *mut xrecord::XRecordInterceptData,
) {
    if let Some(data) = raw_data.as_ref() {
        if data.category != xrecord::XRecordFromServer {
            return;
        }

        #[allow(clippy::cast_ptr_alignment)]
        if let Some(xdatum) = (data.data as *const XRecordDatum).as_ref() {
            if let Some(event) = convert_event(xdatum.type_.into(), xdatum.code.into()) {
                if let Some(callback) = addr_of_mut!(GLOBAL_CALLBACK)
                    .as_mut()
                    .and_then(|c| c.as_mut())
                {
                    callback(event);
                }
            }
        }

        xrecord::XRecordFreeData(raw_data);
    }
}

fn convert_event(type_: c_int, code: c_uchar) -> Option<KeyEvent> {
    let key = key_from_code(code.into());

    let event = match type_ {
        xlib::KeyPress => KeyEvent::KeyPress(key),
        xlib::KeyRelease => KeyEvent::KeyRelease(key),
        _ => return None,
    };

    Some(event)
}
