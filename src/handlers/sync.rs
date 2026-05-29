use axum::{
    extract::{Path, State},
    response::Json,
};
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::db::ApiDateTimeExt;
use crate::handlers::MusicSyncStatusOutput;
use crate::bus_clients::jobs::{cancel_by_filter, service_caller, JobFilter};
use crate::db::repos::MusicRepo;
use crate::error::AppError;
use crate::error::OptionExt;
use crate::handlers::user::AuthUser;
use crate::handlers::{ApiResponse, ok};
use crate::services::app_sync::AppSyncService;

use super::{MusicSyncInput, parse_uuid};

/// POST /api/apps/music/{id}/sync
pub async fn sync_music(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    AuthUser(auth): AuthUser,
    body: Option<Json<MusicSyncInput>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let caller_user_id: Uuid = auth
        .user_id
        .parse()
        .map_err(|_| AppError::Unauthorized("invalid user_id in auth token".into()))?;

    let uid: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid music id".into()))?;

    let music = MusicRepo::get_by_id(&ctx.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;

    let clear_data = body.and_then(|b| b.clear_data).unwrap_or(false);

    if music.sync_status == "syncing" && !clear_data {
        return Err(AppError::Conflict("Music library is already syncing".into()));
    }

    // Clear data synchronously so frontend sees empty state immediately
    if clear_data {
        // Cancel any running jobs for this library first
        if let Some(client) = ctx.client.get() {
            let filter = JobFilter {
                params_match: Some(std::collections::HashMap::from([
                    ("musicId".to_string(), uid.to_string()),
                ])),
                ..Default::default()
            };
            let cancelled = cancel_by_filter(client, service_caller(), filter).await.unwrap_or(0);
            if cancelled > 0 {
                info!("Cancelled {cancelled} jobs before clearing music library {uid}");
            }
        }

        AppSyncService::clear_library_data(&ctx.db, uid, &music.r#type).await?;

        // Notify frontend that all tracks were deleted
        if let Some(client) = ctx.client.get() {
            let _ = crate::bus_clients::app_events::emit_entity(
                client,
                caller_user_id,
                "music_track",
                Some(format!("library:{uid}")),
                serde_json::json!({ "id": uid.to_string(), "operation": "deleted", "libraryId": uid.to_string() }),
            )
            .await;
        }
    }

    MusicRepo::update_sync_status(&ctx.db, uid, "syncing", None).await?;

    let db = ctx.db.clone();
    let sources = ctx.sources.clone();
    let bus_client = ctx.client.clone();

    tokio::spawn(async move {
        match AppSyncService::execute_music_sync(&db, &sources, bus_client, uid, caller_user_id).await {
            Ok(result) => {
                info!("music sync completed, {} jobs dispatched", result.total_jobs);
            }
            Err(e) => {
                error!("music sync failed: {e}");
            }
        }
    });

    Ok(ok(serde_json::json!({ "success": true })))
}

/// GET /api/apps/music/{id}/sync-status
pub async fn get_music_sync_status(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MusicSyncStatusOutput>>, AppError> {
    let uid = parse_uuid(&id)?;
    let (status, last_sync_at) = MusicRepo::get_sync_status(&ctx.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;
    Ok(ok(MusicSyncStatusOutput {
        music_id: uid.to_string(),
        status,
        last_sync_at: last_sync_at.to_api_datetime(),
    }))
}

/// GET /api/apps/music/sync-statuses
pub async fn get_all_music_sync_statuses(
    State(ctx): State<Arc<AppCtx>>,
) -> Result<Json<ApiResponse<Vec<MusicSyncStatusOutput>>>, AppError> {
    let rows = MusicRepo::list_all(&ctx.db).await?;
    let statuses: Vec<MusicSyncStatusOutput> = rows
        .into_iter()
        .map(|m| MusicSyncStatusOutput {
            music_id: m.id.to_string(),
            status: m.sync_status,
            last_sync_at: m.last_sync_at.to_api_datetime(),
        })
        .collect();
    Ok(ok(statuses))
}
