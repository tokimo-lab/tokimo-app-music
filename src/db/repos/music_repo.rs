use chrono::Utc;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::{sea_query::Expr, *};
use uuid::Uuid;

use crate::db::entities::{music_files, musics, vfs};

use crate::error::AppError;
use crate::error::OptionExt;

#[derive(Debug)]
pub struct UpdateMusicFields {
    pub name: Option<String>,
    pub description: Option<String>,
    pub avatar: Option<serde_json::Value>,
    pub poster_path: Option<String>,
    pub scrape_enabled: Option<bool>,
    pub settings: Option<serde_json::Value>,
    pub sources: Option<serde_json::Value>,
}

#[allow(dead_code)] // kept from presplit — wired up later
pub struct MusicStreamTarget {
    pub path: String,
    pub source_id: Option<String>,
    pub source_type: Option<String>,
    pub source_config: Option<sea_orm::prelude::Json>,
    pub duration: Option<f64>,
    pub size: Option<i64>,
}

pub struct MusicRepo;

impl MusicRepo {
    pub async fn list_all<C: ConnectionTrait>(db: &C) -> Result<Vec<musics::Model>, AppError> {
        let rows = musics::Entity::find()
            .order_by_asc(musics::Column::SortOrder)
            .order_by_asc(musics::Column::CreatedAt)
            .all(db)
            .await?;
        Ok(rows)
    }

    pub async fn get_by_id<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<Option<musics::Model>, AppError> {
        Ok(musics::Entity::find_by_id(id).one(db).await?)
    }

    pub async fn create<C: ConnectionTrait>(
        db: &C,
        name: String,
        music_type: String,
        settings: Option<serde_json::Value>,
    ) -> Result<musics::Model, AppError> {
        let id = Uuid::new_v4();
        let now = Utc::now().fixed_offset();
        let max_sort = musics::Entity::find()
            .order_by_desc(musics::Column::SortOrder)
            .one(db)
            .await?
            .map_or(0, |m| m.sort_order);

        let active = musics::ActiveModel {
            id: Set(id),
            name: Set(name),
            r#type: Set(music_type),
            sort_order: Set(max_sort + 1),
            settings: Set(settings),
            sources: Set(serde_json::json!([])),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
            ..Default::default()
        };
        musics::Entity::insert(active).exec(db).await?;
        musics::Entity::find_by_id(id)
            .one(db)
            .await?
            .internal("failed to fetch created music library")
    }

    pub async fn update<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
        input: UpdateMusicFields,
    ) -> Result<musics::Model, AppError> {
        let now = Utc::now().fixed_offset();
        let mut q = musics::Entity::update_many()
            .filter(musics::Column::Id.eq(id))
            .col_expr(musics::Column::UpdatedAt, Expr::value(Some(now)));
        if let Some(name) = input.name {
            q = q.col_expr(musics::Column::Name, Expr::value(name));
        }
        if let Some(description) = input.description {
            q = q.col_expr(musics::Column::Description, Expr::value(Some(description)));
        }
        if let Some(avatar) = input.avatar {
            q = q.col_expr(musics::Column::Avatar, Expr::value(Some(avatar)));
        }
        if let Some(poster_path) = input.poster_path {
            q = q.col_expr(musics::Column::PosterPath, Expr::value(Some(poster_path)));
        }
        if let Some(scrape_enabled) = input.scrape_enabled {
            q = q.col_expr(musics::Column::ScrapeEnabled, Expr::value(scrape_enabled));
        }
        if let Some(settings) = input.settings {
            q = q.col_expr(musics::Column::Settings, Expr::value(Some(settings)));
        }
        if let Some(sources) = input.sources {
            q = q.col_expr(musics::Column::Sources, Expr::value(sources));
        }
        let results = q.exec_with_returning(db).await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| AppError::NotFound(format!("music library {id} not found")))
    }

    pub async fn delete<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<u64, AppError> {
        let result = musics::Entity::delete_by_id(id).exec(db).await?;
        Ok(result.rows_affected)
    }

    /// Reorder music libraries. Uses transaction for atomicity.
    pub async fn reorder(db: &DatabaseConnection, orders: Vec<(Uuid, i32)>) -> Result<(), AppError> {
        let txn = db.begin().await?;
        for (id, sort_order) in orders {
            musics::Entity::update_many()
                .filter(musics::Column::Id.eq(id))
                .col_expr(musics::Column::SortOrder, Expr::value(sort_order))
                .exec(&txn)
                .await?;
        }
        txn.commit().await?;
        Ok(())
    }

    pub async fn get_sync_status<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<(String, Option<DateTimeWithTimeZone>)>, AppError> {
        let model = musics::Entity::find_by_id(id).one(db).await?;
        Ok(model.map(|m| (m.sync_status, m.last_sync_at)))
    }

    pub async fn update_sync_status<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
        status: &str,
        last_sync_at: Option<DateTimeWithTimeZone>,
    ) -> Result<(), AppError> {
        let mut q = musics::Entity::update_many()
            .filter(musics::Column::Id.eq(id))
            .col_expr(musics::Column::SyncStatus, Expr::value(status.to_string()))
            .col_expr(musics::Column::UpdatedAt, Expr::value(Some(Utc::now().fixed_offset())));
        if let Some(ts) = last_sync_at {
            q = q.col_expr(musics::Column::LastSyncAt, Expr::value(Some(ts)));
        }
        let result = q.exec(db).await?;
        if result.rows_affected == 0 {
            return Err(AppError::NotFound(format!("music library {id} not found")));
        }
        Ok(())
    }

    /// Parse sources JSON. Returns `(source_id, root_path, is_default_download)` tuples.
    pub fn parse_sources(sources_json: &serde_json::Value) -> Vec<(Uuid, String, bool)> {
        sources_json
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let source_id = item
                            .get("sourceId")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<Uuid>().ok())?;
                        let root_path = item
                            .get("rootPath")
                            .and_then(|v| v.as_str())
                            .map(std::string::ToString::to_string)?;
                        let is_default = item
                            .get("isDefaultDownload")
                            .and_then(serde_json::Value::as_bool)
                            .unwrap_or(false);
                        Some((source_id, root_path, is_default))
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Load minimal stream info for a music file (path + source_id).
    pub async fn load_stream_target<C: ConnectionTrait>(
        db: &C,
        file_id: &str,
    ) -> Result<Option<MusicStreamTarget>, AppError> {
        let fid: Uuid = file_id
            .parse()
            .map_err(|_| AppError::BadRequest("invalid file id".into()))?;
        let row = music_files::Entity::find_by_id(fid)
            .find_also_related(vfs::Entity)
            .one(db)
            .await?;

        Ok(row.map(|(mf, fs)| {
            let (source_type, source_config) = match fs {
                Some(s) => (Some(s.r#type), s.config),
                None => (None, None),
            };
            MusicStreamTarget {
                path: mf.path,
                source_id: mf.source_id.map(|id| id.to_string()),
                source_type,
                source_config,
                duration: mf.duration.map(f64::from),
                size: mf.size,
            }
        }))
    }
}
