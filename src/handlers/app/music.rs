use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use std::sync::Arc;

use crate::db::repos::media::MediaContentRepo;
use crate::error::AppError;
use crate::handlers::{ok, ApiResponse};
use crate::AppState;

use super::{parse_uuid, ArtistDetailQuery, ListMusicQuery};

/// GET /api/apps/{id}/albums
pub async fn list_albums(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<ListMusicQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let artist_id = q.artist_id.as_deref().map(parse_uuid).transpose()?;
    let (items, total) = MediaContentRepo::list_albums(
        &state.db,
        uid,
        page,
        page_size,
        q.sort_by.as_deref().unwrap_or("title"),
        q.sort_dir.as_deref().unwrap_or("asc"),
        q.genre.as_deref(),
        q.search.as_deref(),
        artist_id,
    )
    .await?;
    Ok(ok(
        serde_json::json!({ "items": items, "total": total, "page": page, "pageSize": page_size }),
    ))
}

/// GET /api/apps/{id}/tracks
pub async fn list_tracks(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<ListMusicQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let (items, total) = MediaContentRepo::list_tracks(
        &state.db,
        uid,
        page,
        page_size,
        q.sort_by.as_deref().unwrap_or("title"),
        q.sort_dir.as_deref().unwrap_or("asc"),
        q.genre.as_deref(),
        q.search.as_deref(),
    )
    .await?;
    Ok(ok(
        serde_json::json!({ "items": items, "total": total, "page": page, "pageSize": page_size }),
    ))
}

/// GET /api/apps/{id}/artists
pub async fn list_artists(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<ListMusicQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let (items, total) = MediaContentRepo::list_artists(
        &state.db,
        uid,
        page,
        page_size,
        q.sort_by.as_deref().unwrap_or("name"),
        q.sort_dir.as_deref().unwrap_or("asc"),
        q.search.as_deref(),
    )
    .await?;
    Ok(ok(
        serde_json::json!({ "items": items, "total": total, "page": page, "pageSize": page_size }),
    ))
}

/// GET /api/apps/album/{id}
pub async fn get_album_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let detail = MediaContentRepo::get_album_detail(&state.db, uid)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("album {id} not found")))?;
    Ok(ok(detail))
}

/// GET /api/apps/artist/{person_id}
pub async fn get_artist_detail(
    State(state): State<Arc<AppState>>,
    Path(person_id): Path<String>,
    Query(q): Query<ArtistDetailQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let pid = parse_uuid(&person_id)?;
    let lid = parse_uuid(&q.app_id)?;
    let detail = MediaContentRepo::get_artist_detail(&state.db, pid, lid)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("artist {person_id} not found")))?;
    Ok(ok(detail))
}

/// POST /api/media-libraries/album/{id}/toggle-favorite
pub async fn toggle_album_favorite(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let is_fav = MediaContentRepo::toggle_album_favorite(&state.db, uid).await?;
    Ok(ok(serde_json::json!({ "isFavorite": is_fav })))
}

/// GET /api/apps/track/{id}/lyrics
pub async fn get_track_lyrics(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let result = MediaContentRepo::get_track_lyrics(&state.db, uid).await?;
    Ok(ok(result))
}
