use chrono::Utc;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveValue::Set, ConnectionTrait, EntityTrait};
use uuid::Uuid;

use crate::db::entities::library_sync_status::{self, Entity as SyncStatus};
use crate::error::AppError;

pub struct SyncStatusRepo;

impl SyncStatusRepo {
    pub async fn find_by_library_id<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
    ) -> Result<Option<library_sync_status::Model>, AppError> {
        Ok(SyncStatus::find_by_id(library_id).one(db).await?)
    }

    pub async fn list_all<C: ConnectionTrait>(
        db: &C,
    ) -> Result<Vec<library_sync_status::Model>, AppError> {
        Ok(SyncStatus::find().all(db).await?)
    }

    /// Upsert sync status and persist progress/error details.
    pub async fn upsert_status<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
        status: &str,
        last_error: Option<String>,
        progress: Option<serde_json::Value>,
    ) -> Result<library_sync_status::Model, AppError> {
        let now = Utc::now().fixed_offset();
        let last_sync_at = (status == "completed").then_some(now);
        let am = library_sync_status::ActiveModel {
            library_id: Set(library_id),
            status: Set(status.to_string()),
            last_sync_at: Set(last_sync_at),
            last_error: Set(last_error),
            progress: Set(progress),
            updated_at: Set(now),
        };
        Ok(SyncStatus::insert(am)
            .on_conflict(
                OnConflict::column(library_sync_status::Column::LibraryId)
                    .update_columns([
                        library_sync_status::Column::Status,
                        library_sync_status::Column::LastSyncAt,
                        library_sync_status::Column::LastError,
                        library_sync_status::Column::Progress,
                        library_sync_status::Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec_with_returning(db)
            .await?)
    }
}
