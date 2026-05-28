use sea_orm::{ConnectionTrait, EntityTrait, QueryOrder};

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
}
