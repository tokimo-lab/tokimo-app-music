use std::{path::Path, sync::Arc};

use serde::{Deserialize, Serialize};
use tokimo_package_ffmpeg::{DirectInput, MediaInfo, StreamInfo};
use tokimo_package_hls::types::AudioStreamInfo;

use crate::{ctx::AppCtx, db::repos::MusicRepo, error::AppError};

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum QualityProfile {
    #[default]
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "aac-128")]
    Aac128,
    #[serde(rename = "aac-192")]
    Aac192,
    #[serde(rename = "aac-320")]
    Aac320,
}

impl QualityProfile {
    pub fn bitrate(self) -> Option<u64> {
        match self {
            Self::Original => None,
            Self::Aac128 => Some(128_000),
            Self::Aac192 => Some(192_000),
            Self::Aac320 => Some(320_000),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSourceInfo {
    pub codec: String,
    pub bitrate: Option<u64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub lossless: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub id: QualityProfile,
    pub label: String,
    pub bitrate: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileQualities {
    pub source: AudioSourceInfo,
    pub options: Vec<QualityOption>,
}

pub struct ProbedAudio {
    pub qualities: FileQualities,
    pub duration: f64,
    pub streams: Vec<AudioStreamInfo>,
    pub direct_input: Arc<DirectInput>,
}

pub async fn probe_file(ctx: &AppCtx, file_id: &str) -> Result<ProbedAudio, AppError> {
    let target = MusicRepo::load_stream_target(&ctx.db, file_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Music file not found".into()))?;
    let source_id = target
        .source_id
        .as_deref()
        .ok_or_else(|| AppError::NotFound("Music file has no source".into()))?;
    let vfs = ctx
        .sources
        .ensure_vfs(source_id)
        .await
        .map_err(|e| AppError::NotFound(e.to_string()))?;
    let path = Path::new(&target.path);
    let stat = vfs
        .stat(path)
        .await
        .map_err(|e| AppError::NotFound(e.to_string()))?;
    let direct_input = DirectInput::from_read_at(
        vfs.to_read_at(path).await,
        stat.size,
        path.file_name().and_then(|p| p.to_str()).map(str::to_owned),
        Some(256 * 1024),
    );
    let input = Arc::clone(&direct_input);
    let probe = tokio::task::spawn_blocking(move || tokimo_package_ffmpeg::probe_direct(input))
        .await
        .map_err(|error| format!("Audio probe worker: {error}"))
        .and_then(|result| result.map_err(|error| error.to_string()))
        .and_then(|probe| audio_metadata(&probe).map_err(|error| error.to_string()));
    let (source, duration, streams) = match probe {
        Ok(metadata) => metadata,
        Err(error) => {
            tracing::warn!(%file_id, %error, "Audio probe failed; offering original only");
            (
                AudioSourceInfo {
                    codec: "unknown".into(),
                    bitrate: None,
                    sample_rate: None,
                    channels: None,
                    lossless: false,
                },
                target.duration.unwrap_or(0.0),
                Vec::new(),
            )
        }
    };
    let mut options = vec![QualityOption {
        id: QualityProfile::Original,
        label: if source.codec == "unknown" {
            "原音".into()
        } else if source.codec == "flac" {
            "原音 · FLAC 无损".into()
        } else {
            format!(
                "原音 · {}{}",
                source.codec.to_uppercase(),
                if source.lossless { " 无损" } else { "" }
            )
        },
        bitrate: source.bitrate,
    }];
    for id in [
        QualityProfile::Aac128,
        QualityProfile::Aac192,
        QualityProfile::Aac320,
    ] {
        let target = id.bitrate().expect("AAC profiles have a bitrate");
        if source.lossless || source.bitrate.is_some_and(|original| target < original) {
            options.push(QualityOption {
                id,
                label: format!("AAC {} kbps", target / 1000),
                bitrate: Some(target),
            });
        }
    }
    Ok(ProbedAudio {
        qualities: FileQualities { source, options },
        duration,
        streams,
        direct_input,
    })
}

fn audio_metadata(
    probe: &MediaInfo,
) -> Result<(AudioSourceInfo, f64, Vec<AudioStreamInfo>), AppError> {
    let streams: Vec<AudioStreamInfo> = probe
        .streams
        .iter()
        .filter(|s| s.codec_type == "audio")
        .map(|s| AudioStreamInfo {
            index: s.index as u32,
            codec: s.codec_name.clone(),
            channels: s
                .audio
                .as_ref()
                .and_then(|a| u32::try_from(a.channels).ok()),
            sample_rate: s.audio.as_ref().and_then(|a| a.sample_rate.parse().ok()),
            bitrate: stream_audio_bitrate(s).and_then(|rate| u32::try_from(rate).ok()),
            language: None,
            title: None,
            is_default: None,
        })
        .collect();
    let audio = streams
        .first()
        .ok_or_else(|| AppError::BadRequest("File has no audio stream".into()))?;
    let codec = audio.codec.clone();
    let lossless = codec == "flac"
        || codec == "alac"
        || codec.starts_with("pcm_")
        || matches!(codec.as_str(), "ape" | "tta");
    Ok((
        AudioSourceInfo {
            codec,
            bitrate: audio.bitrate.map(u64::from),
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            lossless,
        },
        probe.format.duration_secs(),
        streams,
    ))
}

/// Use the audio stream rate, never the container rate (which includes artwork/tags).
/// Uncompressed PCM has an exact rate even when FFmpeg omits codecpar.bit_rate.
pub fn stream_audio_bitrate(stream: &StreamInfo) -> Option<u64> {
    let reported = stream
        .bit_rate
        .as_deref()
        .and_then(|rate| rate.parse().ok())
        .filter(|rate| *rate > 0);
    reported.or_else(|| {
        if !stream.codec_name.starts_with("pcm_") {
            return None;
        }
        let audio = stream.audio.as_ref()?;
        let sample_rate: u64 = audio.sample_rate.parse().ok()?;
        let channels = u64::try_from(audio.channels).ok()?;
        let bits = u64::try_from(audio.bits_per_sample).ok()?;
        sample_rate
            .checked_mul(channels)?
            .checked_mul(bits)
            .filter(|rate| *rate > 0)
    })
}
