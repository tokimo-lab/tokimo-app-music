//! Real handlers for Stage 3b: full CRUD + sync stubs + albums/artists/genres/lyrics.

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
        albums_repo::AlbumsRepo, artists_repo::ArtistsRepo, genres_repo::GenresRepo,
        libraries_repo::LibrariesRepo, lyrics_repo::LyricsRepo, sync_status_repo::SyncStatusRepo,
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
    album_id: Option<String>,
    artist_id: Option<String>,
    genre_id: Option<String>,
    lyrics_text: Option<String>,
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
            album_id: m.album_id.map(|u| u.to_string()),
            artist_id: m.artist_id.map(|u| u.to_string()),
            genre_id: m.genre_id.map(|u| u.to_string()),
            lyrics_text: m.lyrics_text,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlbumDto {
    id: String,
    library_id: Option<String>,
    name: String,
    artist: Option<String>,
    year: Option<i32>,
    cover_url: Option<String>,
    is_favorite: bool,
    track_count: i32,
    created_at: String,
    updated_at: String,
}

impl From<crate::db::entities::albums::Model> for AlbumDto {
    fn from(m: crate::db::entities::albums::Model) -> Self {
        Self {
            id: m.id.to_string(),
            library_id: m.library_id.map(|u| u.to_string()),
            name: m.name,
            artist: m.artist,
            year: m.year,
            cover_url: m.cover_url,
            is_favorite: m.is_favorite,
            track_count: m.track_count,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtistDto {
    id: String,
    library_id: Option<String>,
    name: String,
    bio: Option<String>,
    photo_url: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<crate::db::entities::artists::Model> for ArtistDto {
    fn from(m: crate::db::entities::artists::Model) -> Self {
        Self {
            id: m.id.to_string(),
            library_id: m.library_id.map(|u| u.to_string()),
            name: m.name,
            bio: m.bio,
            photo_url: m.photo_url,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenreDto {
    id: String,
    library_id: Option<String>,
    name: String,
    track_count: i32,
    created_at: String,
    updated_at: String,
}

impl From<crate::db::entities::genres::Model> for GenreDto {
    fn from(m: crate::db::entities::genres::Model) -> Self {
        Self {
            id: m.id.to_string(),
            library_id: m.library_id.map(|u| u.to_string()),
            name: m.name,
            track_count: m.track_count,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatusDto {
    library_id: String,
    status: String,
    last_sync_at: Option<String>,
    last_error: Option<String>,
    progress: Option<serde_json::Value>,
    updated_at: String,
}

impl From<crate::db::entities::library_sync_status::Model> for SyncStatusDto {
    fn from(m: crate::db::entities::library_sync_status::Model) -> Self {
        Self {
            library_id: m.library_id.to_string(),
            status: m.status,
            last_sync_at: m.last_sync_at.map(|t| t.to_rfc3339()),
            last_error: m.last_error,
            progress: m.progress,
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

impl SyncStatusDto {
    fn default_idle(library_id: Uuid) -> Self {
        Self {
            library_id: library_id.to_string(),
            status: "idle".to_string(),
            last_sync_at: None,
            last_error: None,
            progress: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryBody {
    pub name: String,
    pub root_path: String,
    pub user_id: Option<String>,
    pub source_id: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLibraryBody {
    pub name: Option<String>,
    pub root_path: Option<String>,
    pub user_id: Option<String>,
    pub source_id: Option<String>,
    pub source_type: Option<String>,
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

/// POST /
/// Create a new library.
pub async fn create_library(
    State(ctx): State<Arc<AppCtx>>,
    Json(body): Json<CreateLibraryBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = body.user_id.and_then(|s| s.parse::<Uuid>().ok());
    let source_id = body.source_id.and_then(|s| s.parse::<Uuid>().ok());
    let lib = LibrariesRepo::create(
        &ctx.db,
        body.name,
        body.root_path,
        user_id,
        source_id,
        body.source_type,
    )
    .await?;
    Ok(ok(LibraryDto::from(lib)))
}

/// GET /{id}
/// Get a single library.
pub async fn get_library(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let lib = LibrariesRepo::find_by_id(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("library {id} not found")))?;
    Ok(ok(LibraryDto::from(lib)))
}

/// PATCH /{id}
/// Update a library.
pub async fn update_library(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLibraryBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id_opt = body.user_id.map(|s| s.parse::<Uuid>().ok());
    let source_id_opt = body.source_id.map(|s| s.parse::<Uuid>().ok());
    let source_type_opt = body.source_type.map(Some);
    let lib = LibrariesRepo::update(
        &ctx.db,
        id,
        body.name,
        body.root_path,
        user_id_opt,
        source_id_opt,
        source_type_opt,
    )
    .await?
    .ok_or_else(|| AppError::NotFound(format!("library {id} not found")))?;
    Ok(ok(LibraryDto::from(lib)))
}

/// DELETE /{id}
/// Delete a library.
pub async fn delete_library(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let deleted = LibrariesRepo::delete(&ctx.db, id).await?;
    if !deleted {
        return Err(AppError::NotFound(format!("library {id} not found")));
    }
    Ok(ok(serde_json::json!({"deleted": true})))
}

/// POST /reorder
/// Stub for reordering libraries.
pub async fn reorder_libraries() -> Result<Json<serde_json::Value>, AppError> {
    Ok(ok(serde_json::json!({"message": "reorder stub"})))
}

/// GET /sync-statuses
/// List one sync status per library; libraries with no status row get a default idle entry.
pub async fn list_sync_statuses(
    State(ctx): State<Arc<AppCtx>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let libraries = LibrariesRepo::list_all(&ctx.db).await?;
    let statuses = SyncStatusRepo::list_all(&ctx.db).await?;
    let mut status_map: std::collections::HashMap<Uuid, _> =
        statuses.into_iter().map(|s| (s.library_id, s)).collect();
    let dtos: Vec<SyncStatusDto> = libraries
        .into_iter()
        .map(|lib| {
            status_map
                .remove(&lib.id)
                .map(SyncStatusDto::from)
                .unwrap_or_else(|| SyncStatusDto::default_idle(lib.id))
        })
        .collect();
    Ok(ok(dtos))
}

/// POST /{id}/sync
/// Trigger library sync (MVP: upsert completed immediately).
pub async fn start_library_sync(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    LibrariesRepo::find_by_id(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("library {id} not found")))?;
    let status = SyncStatusRepo::upsert_completed(&ctx.db, id).await?;
    Ok(ok(SyncStatusDto::from(status)))
}

/// GET /{id}/sync-status
/// Get sync status for a library; returns default idle if no status row exists yet.
pub async fn get_library_sync_status(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    LibrariesRepo::find_by_id(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("library {id} not found")))?;
    let dto = SyncStatusRepo::find_by_library_id(&ctx.db, id)
        .await?
        .map(SyncStatusDto::from)
        .unwrap_or_else(|| SyncStatusDto::default_idle(id));
    Ok(ok(dto))
}

/// GET /{id}/albums
/// List albums for a library.
pub async fn list_library_albums(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 200);
    let (items, total) = AlbumsRepo::list_for_library(&ctx.db, id, page, page_size).await?;
    let dtos: Vec<AlbumDto> = items.into_iter().map(AlbumDto::from).collect();
    Ok(ok(PageDto {
        items: dtos,
        total,
        page,
        page_size,
    }))
}

/// GET /{id}/artists
/// List artists for a library.
pub async fn list_library_artists(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 200);
    let (items, total) = ArtistsRepo::list_for_library(&ctx.db, id, page, page_size).await?;
    let dtos: Vec<ArtistDto> = items.into_iter().map(ArtistDto::from).collect();
    Ok(ok(PageDto {
        items: dtos,
        total,
        page,
        page_size,
    }))
}

/// GET /{id}/genres
/// List genres for a library.
pub async fn list_library_genres(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 200);
    let (items, total) = GenresRepo::list_for_library(&ctx.db, id, page, page_size).await?;
    let dtos: Vec<GenreDto> = items.into_iter().map(GenreDto::from).collect();
    Ok(ok(PageDto {
        items: dtos,
        total,
        page,
        page_size,
    }))
}

/// GET /{id}/tracks
/// List tracks for a library with pagination.
pub async fn list_tracks(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).clamp(1, 200);
    let (items, total) = TracksRepo::list_for_library(&ctx.db, id, page, page_size).await?;
    let dtos: Vec<TrackDto> = items.into_iter().map(TrackDto::from).collect();
    Ok(ok(PageDto {
        items: dtos,
        total,
        page,
        page_size,
    }))
}

/// GET /album/{id}
/// Get album detail with tracks.
pub async fn get_album_detail(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let album = AlbumsRepo::find_by_id(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("album {id} not found")))?;
    let tracks = AlbumsRepo::list_tracks_for_album(&ctx.db, id).await?;
    let album_dto = AlbumDto::from(album);
    let track_dtos: Vec<TrackDto> = tracks.into_iter().map(TrackDto::from).collect();
    Ok(ok(serde_json::json!({
        "album": album_dto,
        "tracks": track_dtos,
    })))
}

/// GET /artist/{person_id}
/// Get artist detail with albums.
pub async fn get_artist_detail(
    State(ctx): State<Arc<AppCtx>>,
    Path(person_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let artist = ArtistsRepo::find_by_id(&ctx.db, person_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("artist {person_id} not found")))?;
    let albums = ArtistsRepo::list_albums_for_artist(&ctx.db, &artist).await?;
    let artist_dto = ArtistDto::from(artist);
    let album_dtos: Vec<AlbumDto> = albums.into_iter().map(AlbumDto::from).collect();
    Ok(ok(serde_json::json!({
        "artist": artist_dto,
        "albums": album_dtos,
    })))
}

/// POST /album/{id}/toggle-favorite
/// Toggle album favorite status.
pub async fn toggle_album_favorite(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let album = AlbumsRepo::toggle_favorite(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("album {id} not found")))?;
    let is_favorite = album.is_favorite;
    let dto = AlbumDto::from(album);
    Ok(ok(
        serde_json::json!({ "album": dto, "isFavorite": is_favorite }),
    ))
}

/// GET /track/{id}/lyrics
/// Get lyrics for a track.
/// - lyrics row found → return it (text + syncedLyrics).
/// - no lyrics row but track.lyrics_text present → return that as text/plainLyrics.
/// - track exists but no lyrics at all → return empty object (not 404).
pub async fn get_track_lyrics(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let track = TracksRepo::find_by_id(&ctx.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("track {id} not found")))?;
    let lyrics_row = LyricsRepo::find_by_track_id(&ctx.db, id).await?;
    let (text, synced_lyrics) = match lyrics_row {
        Some(row) => (Some(row.text), row.synced_lyrics),
        None => (track.lyrics_text, None),
    };
    let plain_lyrics = text.clone();
    Ok(ok(serde_json::json!({
        "trackId": id.to_string(),
        "text": text,
        "syncedLyrics": synced_lyrics,
        "plainLyrics": plain_lyrics,
    })))
}

/// GET /files/{file_id}/stream
/// Stream an audio file by track id.
pub async fn stream_file(
    State(ctx): State<Arc<AppCtx>>,
    Path(file_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let track = TracksRepo::find_by_id(&ctx.db, file_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("track {file_id} not found")))?;

    let file = tokio::fs::File::open(&track.file_path)
        .await
        .map_err(|e| AppError::NotFound(format!("file not found: {e}")))?;

    let mime = track.mime.unwrap_or_else(|| "audio/mpeg".to_string());

    let stream = ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        mime.parse()
            .unwrap_or_else(|_| "audio/mpeg".parse().unwrap()),
    );
    headers.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());

    Ok((StatusCode::OK, headers, body).into_response())
}
