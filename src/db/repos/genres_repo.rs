use sea_orm::{
    ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};
use uuid::Uuid;

use crate::db::entities::genres::{self, Entity as Genres};
use crate::error::AppError;

pub struct GenresRepo;

impl GenresRepo {
    pub async fn list_for_library<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<genres::Model>, u64), AppError> {
        let total = Genres::find()
            .filter(genres::Column::LibraryId.eq(library_id))
            .count(db)
            .await?;
        let items = Genres::find()
            .filter(genres::Column::LibraryId.eq(library_id))
            .order_by_asc(genres::Column::Name)
            .limit(page_size)
            .offset(page.saturating_sub(1) * page_size)
            .all(db)
            .await?;
        Ok((items, total))
    }
}
