use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect};
use uuid::Uuid;

use crate::db::entities::tracks::{self, Entity as Tracks};
use crate::error::AppError;

pub struct TracksRepo;

impl TracksRepo {
    /// List tracks for a library with page/page_size pagination.
    /// Returns (items, total).
    pub async fn list_for_library<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<tracks::Model>, u64), AppError> {
        let total = Tracks::find()
            .filter(tracks::Column::LibraryId.eq(library_id))
            .count(db)
            .await?;

        let items = Tracks::find()
            .filter(tracks::Column::LibraryId.eq(library_id))
            .order_by_asc(tracks::Column::Title)
            .limit(page_size)
            .offset((page.saturating_sub(1)) * page_size)
            .all(db)
            .await?;

        Ok((items, total))
    }

    /// Look up a single track by id.
    pub async fn find_by_id<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<tracks::Model>, AppError> {
        Ok(Tracks::find_by_id(id).one(db).await?)
    }
}
