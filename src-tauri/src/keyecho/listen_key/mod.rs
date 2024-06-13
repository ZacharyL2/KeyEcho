use serde::Deserialize;
use strum::{AsRefStr, Display};

#[allow(dead_code)]
#[derive(Debug, AsRefStr, Clone, Copy, Hash, Eq, PartialEq, Deserialize)]
pub enum Key {
    Alt,
    AltGr,
    Backspace,
    CapsLock,
    ControlLeft,
    ControlRight,
    Delete,
    DownArrow,
    End,
    Escape,
    F1,
    F10,
    F11,
    F12,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    Home,
    LeftArrow,
    MetaLeft,
    MetaRight,
    PageDown,
    PageUp,
    Return,
    RightArrow,
    ShiftLeft,
    ShiftRight,
    Space,
    Tab,
    UpArrow,
    PrintScreen,
    ScrollLock,
    Pause,
    NumLock,
    BackQuote,
    Num1,
    Num2,
    Num3,
    Num4,
    Num5,
    Num6,
    Num7,
    Num8,
    Num9,
    Num0,
    Minus,
    Equal,
    KeyQ,
    KeyW,
    KeyE,
    KeyR,
    KeyT,
    KeyY,
    KeyU,
    KeyI,
    KeyO,
    KeyP,
    LeftBracket,
    RightBracket,
    KeyA,
    KeyS,
    KeyD,
    KeyF,
    KeyG,
    KeyH,
    KeyJ,
    KeyK,
    KeyL,
    SemiColon,
    Quote,
    BackSlash,
    IntlBackslash,
    KeyZ,
    KeyX,
    KeyC,
    KeyV,
    KeyB,
    KeyN,
    KeyM,
    Comma,
    Dot,
    Slash,
    Insert,
    KpReturn,
    KpMinus,
    KpPlus,
    KpMultiply,
    KpDivide,
    Kp0,
    Kp1,
    Kp2,
    Kp3,
    Kp4,
    Kp5,
    Kp6,
    Kp7,
    Kp8,
    Kp9,
    KpDelete,
    Function,
    Unknown(u32),
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum KeyEvent {
    KeyPress(Key),
    KeyRelease(Key),
}

#[allow(dead_code)]
#[derive(Debug, Display)]
pub enum ListenError {
    EventTap,
    LoopSource,

    MissingDisplay,
    RecordContextEnabling,
    RecordContext,
    XRecordExtension,

    KeyHook(u32),
}

#[cfg(target_os = "windows")]
#[path = "platform_impl/windows.rs"]
mod platform_impl;

#[cfg(target_os = "linux")]
#[path = "platform_impl/linux.rs"]
mod platform_impl;

#[cfg(target_os = "macos")]
#[path = "platform_impl/macos.rs"]
mod platform_impl;

pub use platform_impl::listen;
