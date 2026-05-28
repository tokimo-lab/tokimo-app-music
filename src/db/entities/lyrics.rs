use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "lyrics")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub track_id: Uuid,
    pub text: String,
    pub synced_lyrics: Option<Json>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::tracks::Entity",
        from = "Column::TrackId",
        to = "super::tracks::Column::Id"
    )]
    Track,
}

impl Related<super::tracks::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Track.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
