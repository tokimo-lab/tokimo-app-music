use axum::{
    extract::{Path, State},
    response::Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::handlers::MusicOutput;
use crate::bus_clients::jobs::{cancel_by_filter, service_caller, JobFilter};
use crate::db::repos::MusicRepo;
use crate::db::repos::music_repo::UpdateMusicFields;
use crate::error::AppError;
use crate::error::OptionExt;
use crate::handlers::{ApiResponse, ok, ok_empty};
use crate::services::source::normalize_source_path;

use super::{
    CreateMusicInput, MusicReorderInput, UpdateMusicInput, parse_uuid, sources_to_json, to_music_output,
    to_music_outputs,
};

/// GET /api/apps/music
pub async fn list_musics(State(ctx): State<Arc<AppCtx>>) -> Result<Json<ApiResponse<Vec<MusicOutput>>>, AppError> {
    let rows = MusicRepo::list_all(&ctx.db).await?;
    let outputs = to_music_outputs(&ctx.db, rows).await?;
    Ok(ok(outputs))
}

/// GET /api/apps/music/{id}
pub async fn get_music(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MusicOutput>>, AppError> {
    let uid = parse_uuid(&id)?;
    let model = MusicRepo::get_by_id(&ctx.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;
    let output = to_music_output(&ctx.db, model).await?;
    Ok(ok(output))
}

/// POST /api/apps/music
pub async fn create_music(
    State(ctx): State<Arc<AppCtx>>,
    Json(body): Json<CreateMusicInput>,
) -> Result<Json<ApiResponse<MusicOutput>>, AppError> {
    let model = MusicRepo::create(&ctx.db, body.name, body.r#type, body.settings).await?;
    let music_id = model.id;

    let mut needs_update = false;
    let mut update_fields = UpdateMusicFields {
        name: None,
        description: body.description,
        avatar: body.avatar,
        poster_path: None,
        scrape_enabled: body.scrape_enabled,
        settings: None,
        sources: None,
    };

    if update_fields.avatar.is_some() || update_fields.description.is_some() || update_fields.scrape_enabled.is_some() {
        needs_update = true;
    }

    if let Some(sources) = body.sources {
        for s in &sources {
            let _: Uuid = s
                .source_id
                .parse()
                .map_err(|_| AppError::BadRequest("invalid source_id".into()))?;
            normalize_source_path(&s.root_path).map_err(AppError::BadRequest)?;
        }
        update_fields.sources = Some(sources_to_json(&sources));
        needs_update = true;
    }

    if needs_update {
        MusicRepo::update(&ctx.db, music_id, update_fields).await?;
    }

    let model = MusicRepo::get_by_id(&ctx.db, music_id)
        .await?
        .internal("failed to fetch created music library")?;
    let output = to_music_output(&ctx.db, model).await?;
    Ok(ok(output))
}

/// PATCH /api/apps/music/{id}
pub async fn update_music(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
    Json(body): Json<UpdateMusicInput>,
) -> Result<Json<ApiResponse<MusicOutput>>, AppError> {
    let uid = parse_uuid(&id)?;

    let _existing = MusicRepo::get_by_id(&ctx.db, uid)
        .await?
        .not_found(format!("music library {id} not found"))?;

    let mut update_fields = UpdateMusicFields {
        name: body.name,
        description: body.description,
        avatar: body.avatar,
        poster_path: None,
        scrape_enabled: body.scrape_enabled,
        settings: body.settings,
        sources: None,
    };

    if let Some(ref sources) = body.sources {
        for s in sources {
            let _: Uuid = s
                .source_id
                .parse()
                .map_err(|_| AppError::BadRequest("invalid source_id".into()))?;
            normalize_source_path(&s.root_path).map_err(AppError::BadRequest)?;
        }
        update_fields.sources = Some(sources_to_json(sources));
    }

    MusicRepo::update(&ctx.db, uid, update_fields).await?;

    let model = MusicRepo::get_by_id(&ctx.db, uid)
        .await?
        .internal("failed to fetch updated music library")?;
    let output = to_music_output(&ctx.db, model).await?;
    Ok(ok(output))
}

/// DELETE /api/apps/music/{id}
pub async fn delete_music(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let uid = parse_uuid(&id)?;
    if let Some(client) = ctx.client.get() {
        let filter = JobFilter {
            params_match: Some(std::collections::HashMap::from([
                ("appId".to_string(), uid.to_string()),
            ])),
            ..Default::default()
        };
        let cancelled = cancel_by_filter(client, service_caller(), filter).await.unwrap_or(0);
        if cancelled > 0 {
            tracing::info!("Cancelled {cancelled} jobs for deleted music library {uid}");
        }
    }
    MusicRepo::delete(&ctx.db, uid).await?;
    Ok(ok_empty())
}

/// POST /api/apps/music/reorder
pub async fn reorder_musics(
    State(ctx): State<Arc<AppCtx>>,
    Json(body): Json<MusicReorderInput>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let orders: Vec<(Uuid, i32)> = body
        .orders
        .into_iter()
        .filter_map(|item| item.id.parse::<Uuid>().ok().map(|uid| (uid, item.sort_order)))
        .collect();
    MusicRepo::reorder(&ctx.db, orders).await?;
    Ok(ok_empty())
}
