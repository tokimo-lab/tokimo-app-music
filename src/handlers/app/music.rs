use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::db::repos::media::MediaContentRepo;
use crate::error::AppError;
use crate::handlers::{ok, ApiResponse};
use crate::services::media::music_scrape::MusicScrapeService;
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

// ── Music Scrape Handlers ─────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchScrapeQuery {
    /// Set to "1" to re-scrape already-scraped albums.
    pub force: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeAlbumInput {
    pub mb_release_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMusicInput {
    pub keyword: String,
}

/// POST /api/apps/{id}/scrape-music
/// Batch auto-scrape all unscraped albums in a music app.
pub async fn batch_scrape_music(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<BatchScrapeQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let app_id = parse_uuid(&id)?;
    let force = q.force.as_deref() == Some("1");
    let result = MusicScrapeService::batch_scrape_app(&state.db, &state, app_id, force).await?;
    Ok(ok(serde_json::to_value(result).unwrap_or_default()))
}

/// POST /api/apps/album/{id}/scrape
/// Scrape a specific album using a provided MusicBrainz release ID.
pub async fn scrape_album(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<ScrapeAlbumInput>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    use sea_orm::EntityTrait;
    let album_id = parse_uuid(&id)?;
    let artist = MusicScrapeService::get_album_artist_pub(&state.db, album_id).await;
    let album = crate::db::entities::music_albums::Entity::find_by_id(album_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("album {id} not found")))?;
    let clean_title = MusicScrapeService::extract_clean_title(&album.title);
    let result = MusicScrapeService::scrape_album_by_mb_id(
        &state.db,
        &state,
        album_id,
        &input.mb_release_id,
        &artist,
        &clean_title,
    )
    .await;
    Ok(ok(serde_json::to_value(result).unwrap_or_default()))
}

/// POST /api/apps/album/{id}/search-music
/// Search MusicBrainz for candidates for a specific album.
pub async fn search_music_for_album(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<SearchMusicInput>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let album_id = parse_uuid(&id)?;
    let mb = rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient::new();
    let results = mb
        .search_release_by_keyword(&input.keyword, 20)
        .await
        .map_err(|e| AppError::BadRequest(format!("MusicBrainz search failed: {e}")))?;
    let _ = album_id; // future: save candidates to session
    let _ = &state;
    Ok(ok(serde_json::to_value(results).unwrap_or_default()))
}
