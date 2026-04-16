use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use std::sync::Arc;

use crate::AppState;
use crate::db::pagination::Page;
use crate::db::repos::media::MediaContentRepo;
use crate::db::repos::media::media_content_repo::{ListAlbumsInput, ListTracksInput};
use crate::error::{AppError, OptionExt};
use crate::handlers::{ApiResponse, ok};

use super::{ArtistDetailQuery, MusicListQuery, parse_uuid};

/// GET /api/apps/music/{id}/albums
pub async fn list_albums(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let artist_id = q.artist_id.as_deref().map(parse_uuid).transpose()?;
    let (items, total) = MediaContentRepo::list_albums(
        &state.db,
        ListAlbumsInput {
            music_id: uid,
            page,
            page_size,
            sort_by: q.sort_by.unwrap_or_else(|| "title".to_string()),
            sort_dir: q.sort_dir.unwrap_or_else(|| "asc".to_string()),
            genre: q.genre,
            search: q.search,
            artist_id,
            favorite: q.favorite,
        },
    )
    .await?;
    Ok(ok(Page::from_parts(items, total, page as u64, page_size as u64)))
}

/// GET /api/apps/music/{id}/tracks
pub async fn list_tracks(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let (items, total) = MediaContentRepo::list_tracks(
        &state.db,
        ListTracksInput {
            music_id: uid,
            page,
            page_size,
            sort_by: q.sort_by.unwrap_or_else(|| "title".to_string()),
            sort_dir: q.sort_dir.unwrap_or_else(|| "asc".to_string()),
            genre: q.genre,
            search: q.search,
        },
    )
    .await?;
    Ok(ok(Page::from_parts(items, total, page as u64, page_size as u64)))
}

/// GET /api/apps/music/{id}/artists
pub async fn list_artists(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
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
    Ok(ok(Page::from_parts(items, total, page as u64, page_size as u64)))
}

/// GET /api/apps/music/album/{id}
pub async fn get_album_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let detail = MediaContentRepo::get_album_detail(&state.db, uid)
        .await?
        .not_found(format!("album {id} not found"))?;
    Ok(ok(detail))
}

/// GET /api/apps/music/artist/{person_id}
pub async fn get_artist_detail(
    State(state): State<Arc<AppState>>,
    Path(person_id): Path<String>,
    Query(q): Query<ArtistDetailQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let pid = parse_uuid(&person_id)?;
    let lid = parse_uuid(&q.music_id)?;
    let detail = MediaContentRepo::get_artist_detail(&state.db, pid, lid)
        .await?
        .not_found(format!("artist {person_id} not found"))?;
    Ok(ok(detail))
}

/// POST /api/apps/music/album/{id}/toggle-favorite
pub async fn toggle_album_favorite(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let is_fav = MediaContentRepo::toggle_album_favorite(&state.db, uid).await?;
    Ok(ok(serde_json::json!({ "isFavorite": is_fav })))
}

/// GET /api/apps/music/track/{id}/lyrics
pub async fn get_track_lyrics(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let lyrics_path = MediaContentRepo::get_track_lyrics(&state.db, uid).await?;

    let raw_lyrics = if let Some(ref path) = lyrics_path {
        let storage_key = path.strip_prefix("/storage/").unwrap_or(path.as_str());
        match state.storage.download(storage_key).await {
            Ok(bytes) => String::from_utf8(bytes.to_vec()).ok(),
            Err(_) => tokio::fs::read_to_string(path).await.ok(),
        }
    } else {
        None
    };

    let (synced, plain) = match raw_lyrics {
        Some(content) if content.contains('[') && content.contains(']') => (Some(content), None),
        Some(content) => (None, Some(content)),
        None => (None, None),
    };

    Ok(ok(serde_json::json!({
        "syncedLyrics": synced,
        "plainLyrics": plain,
    })))
}

/// GET /api/apps/music/{id}/genres
pub async fn list_music_genres(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Vec<String>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "SELECT DISTINCT t.genre FROM music_tracks t \
         JOIN music_albums a ON a.id = t.album_id \
         WHERE a.music_id = $1 AND t.genre IS NOT NULL AND t.genre <> '' \
         ORDER BY t.genre",
        [uid.into()],
    );
    let rows = state.db.query_all_raw(stmt).await?;
    let genres: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String>("", "genre").ok())
        .collect();
    Ok(ok(genres))
}
