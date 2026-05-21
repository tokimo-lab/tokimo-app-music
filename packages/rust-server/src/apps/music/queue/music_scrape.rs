use sea_orm::*;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

use crate::AppState;
use crate::db::entities::music_albums;
use crate::queue::cancellation::{JobCancel, check_cancel};
use crate::services::scrape::music::MusicScrapeService;

pub async fn handle(
    db: &DatabaseConnection,
    state: &Arc<AppState>,
    _job_id: Uuid,
    payload: &JsonValue,
    cancel: &JobCancel,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error + Send + Sync>> {
    check_cancel(cancel)?;
    let album_id = payload
        .get("albumId")
        .and_then(|v| v.as_str())
        .ok_or("Missing albumId in payload")?;
    let album_id = Uuid::parse_str(album_id)?;

    // Idempotency: skip if already scraped (handles duplicate jobs from re-sync).
    let album = music_albums::Entity::find_by_id(album_id).one(db).await?;
    let Some(album) = album else {
        info!("[music_scrape] Album {album_id} not found, skipping");
        return Ok(Some(json!({ "skipped": true, "reason": "not_found" })));
    };

    if album.scraped_at.is_some() {
        info!("[music_scrape] Album \"{}\" already scraped, skipping", album.title);
        return Ok(Some(json!({ "skipped": true, "reason": "already_scraped" })));
    }

    check_cancel(cancel)?;
    let result = MusicScrapeService::auto_scrape_album(db, &state.storage, album_id).await;

    Ok(Some(json!({
        "albumId": album_id,
        "status": result.status,
        "title": result.title,
        "coverDownloaded": result.cover_downloaded,
        "year": result.year,
    })))
}
