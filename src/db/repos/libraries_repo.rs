use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait, EntityTrait, QueryOrder};
use uuid::Uuid;

use crate::db::entities::libraries::{self, Entity as Libraries};
use crate::error::AppError;

pub struct LibrariesRepo;

impl LibrariesRepo {
    pub async fn list_all<C: ConnectionTrait>(db: &C) -> Result<Vec<libraries::Model>, AppError> {
        Ok(Libraries::find()
            .order_by_asc(libraries::Column::CreatedAt)
            .all(db)
            .await?)
    }

    pub async fn find_by_id<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
    ) -> Result<Option<libraries::Model>, AppError> {
        Ok(Libraries::find_by_id(id).one(db).await?)
    }

    pub async fn create<C: ConnectionTrait>(
        db: &C,
        name: String,
        root_path: String,
        user_id: Option<Uuid>,
        source_id: Option<Uuid>,
        source_type: Option<String>,
    ) -> Result<libraries::Model, AppError> {
        let now = Utc::now().fixed_offset();
        let am = libraries::ActiveModel {
            name: Set(name),
            root_path: Set(root_path),
            user_id: Set(user_id),
            source_id: Set(source_id),
            source_type: Set(source_type),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };
        Ok(Libraries::insert(am).exec_with_returning(db).await?)
    }

    pub async fn update<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
        name: Option<String>,
        root_path: Option<String>,
        user_id: Option<Option<Uuid>>,
        source_id: Option<Option<Uuid>>,
        source_type: Option<Option<String>>,
    ) -> Result<Option<libraries::Model>, AppError> {
        let model = Libraries::find_by_id(id).one(db).await?;
        let Some(model) = model else { return Ok(None) };
        let mut am: libraries::ActiveModel = model.into();
        if let Some(v) = name {
            am.name = Set(v);
        }
        if let Some(v) = root_path {
            am.root_path = Set(v);
        }
        if let Some(v) = user_id {
            am.user_id = Set(v);
        }
        if let Some(v) = source_id {
            am.source_id = Set(v);
        }
        if let Some(v) = source_type {
            am.source_type = Set(v);
        }
        am.updated_at = Set(Utc::now().fixed_offset());
        Ok(Some(am.update(db).await?))
    }

    pub async fn delete<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<bool, AppError> {
        use sea_orm::ModelTrait;
        let model = Libraries::find_by_id(id).one(db).await?;
        let Some(model) = model else { return Ok(false) };
        model.delete(db).await?;
        Ok(true)
    }
}
