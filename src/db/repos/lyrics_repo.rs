use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait, EntityTrait};
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

    pub async fn upsert<C: ConnectionTrait>(
        db: &C,
        track_id: Uuid,
        text: String,
        synced_lyrics: Option<serde_json::Value>,
    ) -> Result<lyrics::Model, AppError> {
        let now = Utc::now().fixed_offset();
        if let Some(existing) = Lyrics::find_by_id(track_id).one(db).await? {
            let mut am: lyrics::ActiveModel = existing.into();
            am.text = Set(text);
            am.synced_lyrics = Set(synced_lyrics);
            am.updated_at = Set(now);
            Ok(am.update(db).await?)
        } else {
            let am = lyrics::ActiveModel {
                track_id: Set(track_id),
                text: Set(text),
                synced_lyrics: Set(synced_lyrics),
                created_at: Set(now),
                updated_at: Set(now),
            };
            Ok(Lyrics::insert(am).exec_with_returning(db).await?)
        }
    }
}
