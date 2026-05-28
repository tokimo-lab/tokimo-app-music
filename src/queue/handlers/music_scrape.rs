use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use serde_json::{Value as JsonValue, json};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::entities::albums;
use crate::error::AppError;
use crate::services::scrape::music::MusicScrapeService;

pub async fn handle(
    db: &DatabaseConnection,
    _job_id: Uuid,
    params: &JsonValue,
    cancel: &CancellationToken,
    _user_id: Option<Uuid>,
) -> Result<Option<JsonValue>, AppError> {
    if cancel.is_cancelled() {
        return Ok(Some(json!({ "cancelled": true })));
    }

    let album_id = params
        .get("albumId")
        .or_else(|| params.get("album_id"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("missing albumId".to_string()))
        .and_then(|s| {
            Uuid::parse_str(s).map_err(|e| AppError::BadRequest(format!("albumId UUID: {e}")))
        })?;

    let Some(album) = albums::Entity::find_by_id(album_id).one(db).await? else {
        return Ok(Some(json!({ "skipped": true, "reason": "not_found" })));
    };

    if album.cover_url.is_some() && album.year.is_some() {
        return Ok(Some(
            json!({ "skipped": true, "reason": "already_enriched" }),
        ));
    }

    let updated = MusicScrapeService::auto_scrape_album(db, album_id).await?;
    Ok(Some(json!({
        "albumId": updated.id,
        "coverUrl": updated.cover_url,
        "year": updated.year,
    })))
}
