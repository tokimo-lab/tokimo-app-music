use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use std::sync::Arc;

use crate::ctx::AppCtx;
use crate::db::pagination::Page;
use crate::db::repos::MediaContentRepo;
use crate::db::repos::media_content_repo::{ListAlbumsInput, ListTracksInput};
use crate::error::{AppError, OptionExt};
use crate::handlers::{ApiResponse, ok};

use super::{ArtistDetailQuery, MusicListQuery, parse_uuid};

/// GET /api/apps/music/{id}/albums
pub async fn list_albums(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let artist_id = q.artist_id.as_deref().map(parse_uuid).transpose()?;
    let (items, total) = MediaContentRepo::list_albums(
        &ctx.db,
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
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let (items, total) = MediaContentRepo::list_tracks(
        &ctx.db,
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
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Query(q): Query<MusicListQuery>,
) -> Result<Json<ApiResponse<Page<serde_json::Value>>>, AppError> {
    let uid = parse_uuid(&id)?;
    let page = q.page.unwrap_or(1);
    let page_size = q.page_size.unwrap_or(20);
    let (items, total) = MediaContentRepo::list_artists(
        &ctx.db,
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
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let detail = MediaContentRepo::get_album_detail(&ctx.db, uid)
        .await?
        .not_found(format!("album {id} not found"))?;
    Ok(ok(detail))
}

/// GET /api/apps/music/artist/{person_id}
pub async fn get_artist_detail(
    State(ctx): State<Arc<AppCtx>>,
    Path(person_id): Path<String>,
    Query(q): Query<ArtistDetailQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let pid = parse_uuid(&person_id)?;
    let lid = parse_uuid(&q.music_id)?;
    let detail = MediaContentRepo::get_artist_detail(&ctx.db, pid, lid)
        .await?
        .not_found(format!("artist {person_id} not found"))?;
    Ok(ok(detail))
}

/// POST /api/apps/music/album/{id}/toggle-favorite
pub async fn toggle_album_favorite(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let is_fav = MediaContentRepo::toggle_album_favorite(&ctx.db, uid).await?;
    Ok(ok(serde_json::json!({ "isFavorite": is_fav })))
}

/// GET /api/apps/music/track/{id}/lyrics
pub async fn get_track_lyrics(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = parse_uuid(&id)?;
    let lyrics_path = MediaContentRepo::get_track_lyrics(&ctx.db, uid).await?;

    let raw_lyrics = if let Some(ref path) = lyrics_path {
        let storage_key = path.strip_prefix("/storage/").unwrap_or(path.as_str());
        match ctx.storage.download(storage_key).await {
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
    State(ctx): State<Arc<AppCtx>>,
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
    let rows = ctx.db.query_all_raw(stmt).await?;
    let genres: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String>("", "genre").ok())
        .collect();
    Ok(ok(genres))
}

/// POST /api/apps/music/{id}/backfill-lyrics
///
/// Fetches lyrics for all tracks that don't have lyrics yet.
/// Runs in background, returns immediately with track count.
pub async fn backfill_lyrics(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let _uid = parse_uuid(&id)?;

    // Find tracks without lyrics
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "SELECT t.id, t.title, t.duration, a.id as album_id, a.title as album_title, \
         ar.name as artist_name \
         FROM music_tracks t \
         JOIN music_albums a ON t.album_id = a.id \
         LEFT JOIN music_album_artists aa ON aa.album_id = a.id AND aa.sort_order = 0 \
         LEFT JOIN music_artists ar ON ar.id = aa.artist_id \
         WHERE t.lyrics_path IS NULL \
         ORDER BY a.title, t.track_number",
        [],
    );
    let rows = ctx.db.query_all_raw(stmt).await?;
    let total = rows.len();

    // Spawn background task
    let storage = ctx.storage.clone();
    let db = ctx.db.clone();
    tokio::spawn(async move {
        let http = reqwest::Client::builder()
            .user_agent("tokimo/1.0")
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        let mut updated = 0i32;
        for row in &rows {
            let track_id: uuid::Uuid = row.try_get("", "id").unwrap_or_default();
            let title: String = row.try_get("", "title").unwrap_or_default();
            let album_id: uuid::Uuid = row.try_get("", "album_id").unwrap_or_default();
            let album_title: String = row.try_get("", "album_title").unwrap_or_default();
            let artist_name: String = row.try_get("", "artist_name").unwrap_or_default();
            let duration: Option<i32> = row.try_get("", "duration").ok();

            if let Some(path) = crate::services::scrape::music::MusicScrapeService::fetch_and_save_lyrics_static(
                &storage,
                &http,
                album_id,
                track_id,
                &title,
                &artist_name,
                &album_title,
                duration.map(|d| d as u32),
            )
            .await
            {
                // Update the track's lyrics_path
                let update_stmt = Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    "UPDATE music_tracks SET lyrics_path = $1 WHERE id = $2",
                    [path.into(), track_id.into()],
                );
                if db.execute_raw(update_stmt).await.is_ok() {
                    updated += 1;
                    tracing::info!("[lyrics_backfill] Lyrics saved for \"{}\"", title);
                }
            }
        }
        tracing::info!("[lyrics_backfill] Done: {}/{} tracks updated", updated, total);
    });

    Ok(ok(serde_json::json!({ "total": total, "status": "started" })))
}
