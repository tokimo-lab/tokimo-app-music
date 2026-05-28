use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "library_sync_status")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub library_id: Uuid,
    pub status: String,
    pub last_sync_at: Option<DateTimeWithTimeZone>,
    pub last_error: Option<String>,
    pub progress: Option<Json>,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::libraries::Entity",
        from = "Column::LibraryId",
        to = "super::libraries::Column::Id"
    )]
    Library,
}

impl Related<super::libraries::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Library.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
