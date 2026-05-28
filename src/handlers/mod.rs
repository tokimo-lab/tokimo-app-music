//! Real handlers for the three Stage 3a MVP endpoints.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    ctx::AppCtx,
    db::repos::{
        libraries_repo::LibrariesRepo,
        tracks_repo::TracksRepo,
    },
    error::AppError,
};

// ── Response helpers ──

fn ok<T: Serialize>(data: T) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "success": true, "data": data }))
}

// ── DTOs ──

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryDto {
    id: String,
    user_id: Option<String>,
    name: String,
    root_path: String,
    source_id: Option<String>,
    source_type: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<crate::db::entities::libraries::Model> for LibraryDto {
    fn from(m: crate::db::entities::libraries::Model) -> Self {
        Self {
            id: m.id.to_string(),
            user_id: m.user_id.map(|u| u.to_string()),
            name: m.name,
            root_path: m.root_path,
            source_id: m.source_id.map(|u| u.to_string()),
            source_type: m.source_type,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackDto {
    id: String,
    library_id: Option<String>,
    file_path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_secs: Option<f64>,
    size_bytes: Option<i64>,
    mime: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<crate::db::entities::tracks::Model> for TrackDto {
    fn from(m: crate::db::entities::tracks::Model) -> Self {
        Self {
            id: m.id.to_string(),
            library_id: m.library_id.map(|u| u.to_string()),
            file_path: m.file_path,
            title: m.title,
            artist: m.artist,
            album: m.album,
            duration_secs: m.duration_secs,
            size_bytes: m.size_bytes,
            mime: m.mime,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
struct PageDto<T> {
    items: Vec<T>,
    total: u64,
    page: u64,
    page_size: u64,
}

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

// ── Handlers ──

/// GET /
/// List all libraries (no user_id filtering for MVP).
pub async fn list_libraries(
    State(ctx): State<Arc<AppCtx>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows = LibrariesRepo::list_all(&ctx.db).await?;
    let dtos: Vec<LibraryDto> = rows.into_iter().map(LibraryDto::from).collect();
    Ok(ok(dtos))
}

/// GET /{id}/tracks
/// List tracks for a library with pagination.
pub async fn list_tracks(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let library_id: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest(format!("invalid uuid: {id}")))?;

    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 200);

    let (items, total) = TracksRepo::list_for_library(&ctx.db, library_id, page, page_size).await?;
    let dtos: Vec<TrackDto> = items.into_iter().map(TrackDto::from).collect();

    Ok(ok(PageDto { items: dtos, total, page, page_size }))
}

/// GET /files/{file_id}/stream
/// Stream an audio file by track id.
pub async fn stream_file(
    State(ctx): State<Arc<AppCtx>>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    let track_id: Uuid = file_id
        .parse()
        .map_err(|_| AppError::BadRequest(format!("invalid uuid: {file_id}")))?;

    let track = TracksRepo::find_by_id(&ctx.db, track_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("track {file_id} not found")))?;

    let file = tokio::fs::File::open(&track.file_path)
        .await
        .map_err(|e| AppError::NotFound(format!("file not found: {e}")))?;

    let mime = track
        .mime
        .unwrap_or_else(|| "audio/mpeg".to_string());

    let stream = ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        mime.parse().unwrap_or_else(|_| "audio/mpeg".parse().unwrap()),
    );
    headers.insert(
        header::CACHE_CONTROL,
        "no-cache".parse().unwrap(),
    );

    Ok((StatusCode::OK, headers, body).into_response())
}
