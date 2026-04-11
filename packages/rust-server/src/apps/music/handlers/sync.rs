use axum::{
    extract::{Path, State},
    response::Json,
};
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

use crate::db::ApiDateTimeExt;
use crate::db::models::music::{MusicSyncProgressOutput, MusicSyncStatusOutput, MusicTaskProgress};
use crate::db::repos::job_repo::JobRepo;
use crate::db::repos::media::MusicRepo;
use crate::error::AppError;
use crate::error::OptionExt;
use crate::handlers::{ok, ApiResponse};
use crate::services::media::app_sync::AppSyncService;
use crate::AppState;

use super::{parse_uuid, MusicSyncInput};

/// POST /api/apps/music/{id}/sync
pub async fn sync_music(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Option<Json<MusicSyncInput>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid: Uuid = id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid music id".into()))?;

    let music = MusicRepo::get_by_id(&state.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;

    let clear_data = body.and_then(|b| b.clear_data).unwrap_or(false);

    if music.sync_status == "syncing" && !clear_data {
        return Err(AppError::Conflict("Music library is already syncing".into()));
    }

    // Clear data synchronously so frontend sees empty state immediately
    if clear_data {
        AppSyncService::clear_library_data(&state.db, uid, &music.r#type).await?;
    }

    MusicRepo::update_sync_status(&state.db, uid, "syncing", None).await?;

    let db = state.db.clone();
    let sources = state.sources.clone();
    let storage = state.storage.clone();

    tokio::spawn(async move {
        match AppSyncService::execute_music_sync(&db, &sources, &storage, uid, false).await {
            Ok(result) => {
                info!(
                    "music sync completed, {} jobs dispatched",
                    result.total_jobs
                );
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
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MusicSyncStatusOutput>>, AppError> {
    let uid = parse_uuid(&id)?;
    let (status, last_sync_at) = MusicRepo::get_sync_status(&state.db, uid)
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
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<MusicSyncStatusOutput>>>, AppError> {
    let rows = MusicRepo::list_all(&state.db).await?;
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

/// GET /api/apps/music/{id}/sync-progress
pub async fn get_music_sync_progress(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MusicSyncProgressOutput>>, AppError> {
    let uid = parse_uuid(&id)?;
    let music = MusicRepo::get_by_id(&state.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;

    let job_types = &["music_scrape"];
    let (total, completed, running, pending, failed) =
        JobRepo::count_jobs_by_app(&state.db, uid, job_types).await?;

    let rows = JobRepo::get_task_progress_by_app(&state.db, uid, job_types).await?;
    let tasks: Vec<MusicTaskProgress> = rows
        .into_iter()
        .map(|row| {
            let status = if row.running > 0 {
                "running"
            } else if row.pending > 0 {
                "pending"
            } else if row.failed > 0 && row.completed == 0 {
                "failed"
            } else {
                "completed"
            };

            let (total_items, processed_items) = {
                let t = row.completed + row.running + row.pending + row.failed;
                (t, row.completed)
            };

            MusicTaskProgress {
                task_type: row.job_type,
                status: status.to_string(),
                total_items,
                processed_items,
            }
        })
        .collect();

    Ok(ok(MusicSyncProgressOutput {
        music_id: uid.to_string(),
        status: music.sync_status,
        total,
        completed,
        running,
        pending,
        failed,
        tasks,
    }))
}
