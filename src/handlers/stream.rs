use axum::{
    extract::{Path, Request, State},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::{
    ctx::AppCtx,
    db::repos::MusicRepo,
    error::AppError,
    handlers::user::AuthUser,
};

fn mime_from_path(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" | "oga" => "audio/ogg",
        "m4a" | "aac" => "audio/aac",
        "wav" => "audio/wav",
        "opus" => "audio/opus",
        "weba" | "webm" => "audio/webm",
        _ => "audio/mpeg",
    }
}

/// Stream a music file over HTTP with range request support.
///
/// `GET /api/apps/music/files/{file_id}/stream`
pub async fn stream_music_file(
    State(ctx): State<Arc<AppCtx>>,
    Path(file_id): Path<String>,
    AuthUser(_auth): AuthUser,
    request: Request,
) -> Response {
    let target = match MusicRepo::load_stream_target(&ctx.db, &file_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return AppError::NotFound("Music file not found".into()).into_response(),
        Err(e) => return AppError::Internal(format!("music file lookup failed: {e}")).into_response(),
    };

    let Some(source_id) = target.source_id.as_deref() else {
        return AppError::Internal("Music file has no source_id".into()).into_response();
    };

    let vfs = match ctx.sources.ensure_vfs(source_id).await {
        Ok(v) => v,
        Err(e) => return AppError::NotFound(e.to_string()).into_response(),
    };

    let mime = mime_from_path(&target.path);
    match crate::services::stream::stream_vfs_file(&vfs, &target.path, mime, request.headers()).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    }
}
