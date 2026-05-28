pub mod browse;
pub mod crud;
pub mod stream;
pub mod sync;
pub mod user;

use axum::{http::StatusCode, response::Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::entities::vfs;
use crate::db::repos::MusicRepo;
use crate::db::ApiDateTimeExt;
use crate::error::AppError;

pub use browse::*;
pub use crud::*;
pub use stream::stream_music_file;
pub use sync::*;

// ── Response helpers ──

#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse {
        success: true,
        data: Some(data),
        error: None,
    })
}

pub fn ok_empty() -> Json<ApiResponse<()>> {
    Json(ApiResponse {
        success: true,
        data: None,
        error: None,
    })
}

#[allow(dead_code)] // kept from presplit — wired up later
pub fn err_resp<T: Serialize>(status: StatusCode, msg: String) -> (StatusCode, Json<ApiResponse<T>>) {
    (
        status,
        Json(ApiResponse {
            success: false,
            data: None,
            error: Some(msg),
        }),
    )
}

#[allow(dead_code)] // kept from presplit — wired up later
pub fn err500<T: Serialize>(msg: String) -> (StatusCode, Json<ApiResponse<T>>) {
    err_resp(StatusCode::INTERNAL_SERVER_ERROR, msg)
}

#[allow(dead_code)] // kept from presplit — wired up later
pub fn err404<T: Serialize>(msg: String) -> (StatusCode, Json<ApiResponse<T>>) {
    err_resp(StatusCode::NOT_FOUND, msg)
}

// ── Output DTOs ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicOutput {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub avatar: Option<serde_json::Value>,
    pub description: Option<String>,
    pub poster_path: Option<String>,
    pub scrape_enabled: bool,
    pub sort_order: i32,
    pub settings: Option<serde_json::Value>,
    pub sync_status: String,
    pub last_sync_at: Option<String>,
    pub item_count: i64,
    pub sources: Vec<MusicSourceOutput>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicSourceOutput {
    pub source_id: String,
    pub root_path: String,
    pub sort_order: i32,
    pub is_default_download: bool,
    pub source_name: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicSyncStatusOutput {
    pub music_id: String,
    pub status: String,
    pub last_sync_at: Option<String>,
}

// ── Input DTOs ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMusicInput {
    pub name: String,
    pub r#type: String,
    pub avatar: Option<serde_json::Value>,
    pub description: Option<String>,
    pub scrape_enabled: Option<bool>,
    pub settings: Option<serde_json::Value>,
    pub sources: Option<Vec<MusicSourceInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMusicInput {
    pub name: Option<String>,
    #[allow(dead_code)] // kept from presplit — wired up later
    pub r#type: Option<String>,
    pub avatar: Option<serde_json::Value>,
    pub description: Option<String>,
    pub scrape_enabled: Option<bool>,
    pub settings: Option<serde_json::Value>,
    pub sources: Option<Vec<MusicSourceInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicSourceInput {
    pub source_id: String,
    pub root_path: String,
    pub sort_order: i32,
    pub is_default_download: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicSyncInput {
    pub clear_data: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicReorderInput {
    pub orders: Vec<MusicReorderItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicReorderItem {
    pub id: String,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicListQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_dir: Option<String>,
    pub genre: Option<String>,
    pub search: Option<String>,
    pub artist_id: Option<String>,
    pub favorite: Option<bool>,
}

#[allow(dead_code)] // kept from presplit — wired up later
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicRecentlyAddedQuery {
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDetailQuery {
    pub music_id: String,
}

// ── Shared helpers ──

pub(crate) fn parse_uuid(s: &str) -> Result<Uuid, AppError> {
    s.parse::<Uuid>()
        .map_err(|_| AppError::BadRequest(format!("invalid uuid: {s}")))
}

/// Build sources JSON from input.
pub(crate) fn sources_to_json(sources: &[MusicSourceInput]) -> serde_json::Value {
    serde_json::json!(
        sources
            .iter()
            .enumerate()
            .map(|(i, s)| {
                serde_json::json!({
                    "sourceId": s.source_id,
                    "rootPath": s.root_path,
                    "sortOrder": s.sort_order.max(i as i32),
                    "isDefaultDownload": s.is_default_download.unwrap_or(false),
                })
            })
            .collect::<Vec<_>>()
    )
}

/// Convert a `musics::Model` into a `MusicOutput` DTO.
pub(crate) async fn to_music_output(
    db: &sea_orm::DatabaseConnection,
    model: crate::db::entities::musics::Model,
) -> Result<MusicOutput, AppError> {
    use crate::db::entities::music_albums;
    use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};

    let music_id = model.id;

    let source_tuples = MusicRepo::parse_sources(&model.sources);
    let mut sources = Vec::with_capacity(source_tuples.len());
    for (source_id, root_path, is_default_download) in &source_tuples {
        let fs = vfs::Entity::find_by_id(*source_id).one(db).await?;
        sources.push(MusicSourceOutput {
            source_id: source_id.to_string(),
            root_path: root_path.clone(),
            sort_order: sources.len() as i32,
            is_default_download: *is_default_download,
            source_name: fs.as_ref().map(|f| f.name.clone()),
            source_type: fs.as_ref().map(|f| f.r#type.clone()),
        });
    }

    let album_count = music_albums::Entity::find()
        .filter(music_albums::Column::MusicId.eq(music_id))
        .count(db)
        .await? as i64;

    Ok(MusicOutput {
        id: model.id.to_string(),
        name: model.name,
        r#type: model.r#type,
        avatar: model.avatar,
        description: model.description,
        poster_path: model.poster_path,
        scrape_enabled: model.scrape_enabled,
        sort_order: model.sort_order,
        settings: model.settings,
        sync_status: model.sync_status,
        last_sync_at: model.last_sync_at.to_api_datetime(),
        item_count: album_count,
        sources,
        created_at: model.created_at.to_api_datetime_or_default(),
        updated_at: model.updated_at.to_api_datetime_or_default(),
    })
}

/// Build `MusicOutput` for a list of models.
pub(crate) async fn to_music_outputs(
    db: &sea_orm::DatabaseConnection,
    models: Vec<crate::db::entities::musics::Model>,
) -> Result<Vec<MusicOutput>, AppError> {
    let mut outputs = Vec::with_capacity(models.len());
    for model in models {
        outputs.push(to_music_output(db, model).await?);
    }
    Ok(outputs)
}
