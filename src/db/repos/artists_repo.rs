use sea_orm::{
    ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect,
};
use uuid::Uuid;

use crate::db::entities::{
    albums::{self, Entity as Albums},
    artists::{self, Entity as Artists},
};
use crate::error::AppError;

pub struct ArtistsRepo;

impl ArtistsRepo {
    pub async fn find_by_id<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<artists::Model>, AppError> {
        Ok(Artists::find_by_id(id).one(db).await?)
    }

    pub async fn list_for_library<C: ConnectionTrait>(
        db: &C,
        library_id: Uuid,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<artists::Model>, u64), AppError> {
        let total = Artists::find()
            .filter(artists::Column::LibraryId.eq(library_id))
            .count(db)
            .await?;
        let items = Artists::find()
            .filter(artists::Column::LibraryId.eq(library_id))
            .order_by_asc(artists::Column::Name)
            .limit(page_size)
            .offset(page.saturating_sub(1) * page_size)
            .all(db)
            .await?;
        Ok((items, total))
    }

    /// Returns albums where the album.artist text matches the artist's name (MVP approach).
    pub async fn list_albums_for_artist<C: ConnectionTrait>(
        db: &C,
        artist: &artists::Model,
    ) -> Result<Vec<albums::Model>, AppError> {
        let mut q = Albums::find().filter(albums::Column::Artist.eq(artist.name.clone()));
        if let Some(lib_id) = artist.library_id {
            q = q.filter(albums::Column::LibraryId.eq(lib_id));
        }
        Ok(q.order_by_asc(albums::Column::Year).all(db).await?)
    }
}
