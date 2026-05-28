use sea_orm::{ConnectionTrait, EntityTrait};
use uuid::Uuid;

use crate::db::entities::lyrics::{self, Entity as Lyrics};
use crate::error::AppError;

pub struct LyricsRepo;

impl LyricsRepo {
    pub async fn find_by_track_id<C: ConnectionTrait>(
        db: &C,
        track_id: Uuid,
    ) -> Result<Option<lyrics::Model>, AppError> {
        Ok(Lyrics::find_by_id(track_id).one(db).await?)
    }
}
