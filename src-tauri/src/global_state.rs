use std::sync::{
    mpsc::{Receiver, Sender},
    Arc,
};

use crate::keyecho::SoundThreadMsg;

pub type SoundThreadReceiver = Receiver<SoundThreadMsg>;
pub type SoundThreadSender = Arc<Sender<SoundThreadMsg>>;
