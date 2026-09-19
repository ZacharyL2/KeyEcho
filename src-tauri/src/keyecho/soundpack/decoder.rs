use std::{fs::File, io::Cursor, path::Path};

use anyhow::{Context, Result};
use symphonia::{
    core::{
        audio::GenericAudioBufferRef,
        codecs::audio::AudioDecoder,
        formats::{probe::Hint, FormatReader, TrackType},
        io::{MediaSource, MediaSourceStream},
    },
    default::{get_codecs, get_probe},
};

pub(super) struct DecodedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

pub struct SoundDecoder {
    decoder: Box<dyn AudioDecoder>,
    format: Box<dyn FormatReader>,
    track_id: u32,
    sample_rate: u32,
    channels: u16,
}

impl SoundDecoder {
    pub fn new<P>(path: P) -> Result<Self>
    where
        P: AsRef<Path>,
    {
        let file = File::open(&path)?;
        let ext = path.as_ref().extension().and_then(|p| p.to_str());
        Self::from_media(Box::new(file), ext)
    }

    pub fn from_bytes(bytes: Vec<u8>, ext: &str) -> Result<Self> {
        Self::from_media(Box::new(Cursor::new(bytes)), Some(ext))
    }

    fn from_media(media: Box<dyn MediaSource>, ext: Option<&str>) -> Result<Self> {
        let mss = MediaSourceStream::new(media, Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = ext {
            hint.with_extension(ext);
        }

        let format = get_probe().probe(&hint, mss, Default::default(), Default::default())?;
        let track = format
            .default_track(TrackType::Audio)
            .context("no default audio track")?;
        let track_id = track.id;
        let codec_params = track
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
            .context("no audio codec params")?;
        let decoder = get_codecs().make_audio_decoder(codec_params, &Default::default())?;
        let codec_params = decoder.codec_params();
        let sample_rate = codec_params.sample_rate.context("no sample rate")?;
        let channels = codec_params
            .channels
            .as_ref()
            .map(|channels| channels.count() as u16)
            .context("no channels")?;

        Ok(Self {
            decoder,
            format,
            track_id,
            sample_rate,
            channels,
        })
    }

    pub fn decode_all(mut self) -> Result<DecodedAudio> {
        let mut samples = Vec::new();

        while let Some(packet) = self.format.next_packet()? {
            if packet.track_id != self.track_id {
                continue;
            }

            let decoded = self.decoder.decode(&packet)?;
            append_interleaved_samples(decoded, &mut samples);
        }

        Ok(DecodedAudio {
            samples,
            sample_rate: self.sample_rate,
            channels: self.channels,
        })
    }
}

fn append_interleaved_samples(decoded: GenericAudioBufferRef<'_>, samples: &mut Vec<f32>) {
    let start = samples.len();
    samples.resize(start + decoded.samples_interleaved(), 0.0);
    decoded.copy_to_slice_interleaved(&mut samples[start..]);
}
