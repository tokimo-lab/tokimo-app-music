use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "tracks")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub library_id: Option<Uuid>,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_secs: Option<f64>,
    pub size_bytes: Option<i64>,
    pub mime: Option<String>,
    pub album_id: Option<Uuid>,
    pub artist_id: Option<Uuid>,
    pub genre_id: Option<Uuid>,
    pub lyrics_text: Option<String>,
    pub created_at: DateTimeWithTimeZone,
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
    #[sea_orm(
        belongs_to = "super::albums::Entity",
        from = "Column::AlbumId",
        to = "super::albums::Column::Id"
    )]
    Album,
    #[sea_orm(
        belongs_to = "super::artists::Entity",
        from = "Column::ArtistId",
        to = "super::artists::Column::Id"
    )]
    Artist,
    #[sea_orm(
        belongs_to = "super::genres::Entity",
        from = "Column::GenreId",
        to = "super::genres::Column::Id"
    )]
    Genre,
}

impl Related<super::libraries::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Library.def()
    }
}
impl Related<super::albums::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Album.def()
    }
}
impl Related<super::artists::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Artist.def()
    }
}
impl Related<super::genres::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Genre.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
