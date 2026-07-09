use std::{error::Error, fmt};

use anyhow::Error as AnyhowError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct GeneralError(String);

macro_rules! impl_from_error {
    ($($type:ty),*) => {
        $(
            impl From<$type> for GeneralError {
                fn from(err: $type) -> Self {
                    GeneralError(err.to_string())
                }
            }
        )*
    };
}

impl fmt::Display for GeneralError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Error for GeneralError {}

impl_from_error!(AnyhowError, tauri::Error);

// pub fn to_anyhow<E>(err: E) -> anyhow::Error
// where
//     E: Error + Send + Sync + 'static,
// {
//     anyhow::Error::from(err)
// }
