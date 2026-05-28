use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect,
};
use uuid::Uuid;

use crate::db::entities::{
    albums::{self, Entity as Albums},
    tracks::{self, Entity as Tracks},
};
use crate::error::AppError;

pub struct AlbumsRepo;

impl AlbumsRepo {
    pub async fn find_by_id<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<albums::Model>, AppError> {
        Ok(Albums::find_by_id(id).one(db).await?)
    }

    pub async fn list_for_library<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<albums::Model>, u64), AppError> {
        let total = Albums::find()
            .filter(albums::Column::LibraryId.eq(library_id))
            .count(db)
            .await?;
        let items = Albums::find()
            .filter(albums::Column::LibraryId.eq(library_id))
            .order_by_asc(albums::Column::Name)
            .limit(page_size)
            .offset(page.saturating_sub(1) * page_size)
            .all(db)
            .await?;
        Ok((items, total))
    }

    pub async fn list_tracks_for_album<C: ConnectionTrait>(
        db: &C,
        album_id: Uuid,
    ) -> Result<Vec<tracks::Model>, AppError> {
        Ok(Tracks::find()
            .filter(tracks::Column::AlbumId.eq(album_id))
            .order_by_asc(tracks::Column::Title)
            .all(db)
            .await?)
    }

    pub async fn toggle_favorite<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<albums::Model>, AppError> {
        let model = Albums::find_by_id(id).one(db).await?;
        let Some(model) = model else { return Ok(None) };
        let current = model.is_favorite;
        let mut am: albums::ActiveModel = model.into();
        am.is_favorite = Set(!current);
        am.updated_at = Set(Utc::now().fixed_offset());
        Ok(Some(am.update(db).await?))
    }
}
