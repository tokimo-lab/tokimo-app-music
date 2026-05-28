use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "album_genres")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub album_id: Uuid,
    pub genre: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::music_albums::Entity",
        from = "Column::AlbumId",
        to = "super::music_albums::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    MusicAlbums,
}

impl Related<super::music_albums::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MusicAlbums.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
