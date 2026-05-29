use sea_orm::*;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::db::entities::music_albums;
use tokio_util::sync::CancellationToken;
use crate::bus_clients::app_events;
use crate::services::scrape::music::MusicScrapeService;

pub async fn handle(
    db: &DatabaseConnection,
    state: &Arc<AppCtx>,
    _job_id: Uuid,
    params: &JsonValue,
    user_id: Option<Uuid>,
    cancel: &CancellationToken,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error + Send + Sync>> {
    if cancel.is_cancelled() { return Ok(Some(json!({ "cancelled": true }))); }
    let album_id = params
        .get("albumId")
        .and_then(|v| v.as_str())
        .ok_or("Missing albumId in params")?;
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

    let music_id = params.get("musicId").and_then(|v| v.as_str()).unwrap_or("");

    if cancel.is_cancelled() { return Ok(Some(json!({ "cancelled": true }))); }
    let result = MusicScrapeService::auto_scrape_album(db, &state.storage, album_id).await;

    // Notify frontend to refresh
    if let (Some(uid), Some(client)) = (user_id, state.client.get()) {
        let _ = app_events::emit_entity(
            client,
            uid,
            "music_track",
            Some(format!("library:{music_id}")),
            json!({ "id": album_id.to_string(), "operation": "updated", "libraryId": music_id }),
        )
        .await;
    }

    Ok(Some(json!({
        "albumId": album_id,
        "status": result.status,
        "title": result.title,
        "coverDownloaded": result.cover_downloaded,
        "year": result.year,
    })))
}
