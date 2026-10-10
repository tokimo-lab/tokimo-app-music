use std::sync::Arc;

use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use tokimo_package_hls::CreateSessionRequest;
use tokio_util::io::ReaderStream;

use super::{ApiResponse, ok, ok_empty, user::AuthUser};
use crate::{
    ctx::AppCtx,
    error::AppError,
    services::quality::{
        AudioSourceInfo, FileQualities, QualityOption, QualityProfile, probe_file,
    },
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackInput {
    pub profile_id: QualityProfile,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackOutput {
    pub url: String,
    pub kind: &'static str,
    pub session_id: Option<String>,
    pub effective_profile: QualityProfile,
    pub source: AudioSourceInfo,
    pub options: Vec<QualityOption>,
}

pub async fn file_qualities(
    State(ctx): State<Arc<AppCtx>>,
    Path(file_id): Path<String>,
    AuthUser(_): AuthUser,
) -> Result<Json<ApiResponse<FileQualities>>, AppError> {
    Ok(ok(probe_file(&ctx, &file_id).await?.qualities))
}

pub async fn create_playback(
    State(ctx): State<Arc<AppCtx>>,
    Path(file_id): Path<String>,
    AuthUser(auth): AuthUser,
    Json(input): Json<PlaybackInput>,
) -> Result<Json<ApiResponse<PlaybackOutput>>, AppError> {
    let audio = probe_file(&ctx, &file_id).await?;
    let effective = if audio
        .qualities
        .options
        .iter()
        .any(|o| o.id == input.profile_id)
    {
        input.profile_id
    } else {
        QualityProfile::Original
    };
    let (url, kind, session_id) = if let Some(bitrate) = effective.bitrate() {
        if !audio.duration.is_finite() || audio.duration <= 0.0 {
            return Err(AppError::BadRequest("Audio duration unavailable".into()));
        }
        // Unique file key keeps independent users and overlapping replacement requests isolated.
        let mut request: CreateSessionRequest = serde_json::from_value(serde_json::json!({
            "fileId": format!("music:{file_id}:{}", uuid::Uuid::new_v4()),
            "durationSecs": audio.duration, "audioStreamIndex": 0,
            "audioStreams": audio.streams, "audioOnly": true,
            "transcodeVideo": false, "transcodeAudio": true,
            "targetAudioCodec": "aac", "targetAudioBitrate": bitrate,
            "userId": auth.user_id,
        }))
        .map_err(|e| AppError::Internal(format!("Audio session request: {e}")))?;
        request.direct_input = Some(audio.direct_input);
        let session = ctx
            .hls
            .create_session(request, "")
            .await
            .map_err(AppError::Internal)?;
        (
            format!("/api/apps/music/hls/{}/playlist.m3u8", session.session_id),
            "hls",
            Some(session.session_id),
        )
    } else {
        (
            format!("/api/apps/music/files/{file_id}/stream"),
            "direct",
            None,
        )
    };
    Ok(ok(PlaybackOutput {
        url,
        kind,
        session_id,
        effective_profile: effective,
        source: audio.qualities.source,
        options: audio.qualities.options,
    }))
}

async fn owned_session(
    ctx: &AppCtx,
    id: &str,
    user: &str,
) -> Result<Arc<tokio::sync::Mutex<tokimo_package_hls::HlsSession>>, AppError> {
    let session = ctx
        .hls
        .get_session(id)
        .await
        .ok_or_else(|| AppError::NotFound("Audio session not found".into()))?;
    if session.lock().await.playback_snapshot().user_id.as_deref() != Some(user) {
        return Err(AppError::Unauthorized(
            "Audio session belongs to another user".into(),
        ));
    }
    Ok(session)
}

pub async fn stop_playback(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    AuthUser(auth): AuthUser,
) -> Result<Json<ApiResponse<()>>, AppError> {
    // Already expired sessions are also successfully disposed.
    if ctx.hls.get_file_id(&id).await.is_some() {
        owned_session(&ctx, &id, &auth.user_id).await?;
        ctx.hls.stop_session(&id).await;
    }
    Ok(ok_empty())
}

pub async fn audio_segment(
    State(ctx): State<Arc<AppCtx>>,
    Path((id, segment)): Path<(String, String)>,
    AuthUser(auth): AuthUser,
) -> Result<Response, AppError> {
    if segment.contains("..") || segment.contains('/') || segment.contains('\\') {
        return Err(AppError::BadRequest("Invalid audio segment".into()));
    }
    let session = owned_session(&ctx, &id, &auth.user_id).await?;
    if segment == "playlist.m3u8" {
        let playlist = session.lock().await.vod_playlist.clone();
        return Ok((
            [
                (header::CONTENT_TYPE, "application/vnd.apple.mpegurl"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            playlist,
        )
            .into_response());
    }
    let wait = session
        .lock()
        .await
        .prepare_segment_wait(&segment)
        .await
        .ok_or_else(|| AppError::NotFound("Audio segment unavailable".into()))?;
    let path = wait
        .wait()
        .await
        .ok_or_else(|| AppError::NotFound("Audio segment unavailable".into()))?;
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mime = if segment.ends_with(".ts") {
        "video/mp2t"
    } else {
        "audio/mp4"
    };
    Ok((
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())
}
