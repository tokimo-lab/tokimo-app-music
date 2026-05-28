use sea_orm::{DatabaseBackend, DatabaseConnection, QueryResult, Statement, Value};
use serde_json::{Value as JsonValue, json};
use uuid::Uuid;

use crate::db::{ApiDateTimeExt, OptionalApiDateTimeExt};
use crate::error::AppError;

#[async_trait::async_trait]
pub trait RawStatementQueryExt {
    async fn query_all(&self, stmt: Statement) -> Result<Vec<QueryResult>, sea_orm::DbErr>;
    async fn query_one(&self, stmt: Statement) -> Result<Option<QueryResult>, sea_orm::DbErr>;
}

#[async_trait::async_trait]
impl RawStatementQueryExt for DatabaseConnection {
    async fn query_all(&self, stmt: Statement) -> Result<Vec<QueryResult>, sea_orm::DbErr> {
        sea_orm::ConnectionTrait::query_all_raw(self, stmt).await
    }

    async fn query_one(&self, stmt: Statement) -> Result<Option<QueryResult>, sea_orm::DbErr> {
        sea_orm::ConnectionTrait::query_one_raw(self, stmt).await
    }
}


#[derive(Debug)]
pub struct ListAlbumsInput {
    pub music_id: Uuid,
    pub page: i64,
    pub page_size: i64,
    pub sort_by: String,
    pub sort_dir: String,
    pub genre: Option<String>,
    pub search: Option<String>,
    pub artist_id: Option<Uuid>,
    pub favorite: Option<bool>,
}

#[derive(Debug)]
pub struct ListTracksInput {
    pub music_id: Uuid,
    pub page: i64,
    pub page_size: i64,
    pub sort_by: String,
    pub sort_dir: String,
    pub genre: Option<String>,
    pub search: Option<String>,
}

pub struct MediaContentRepo;

impl MediaContentRepo {
    pub async fn list_albums(
        db: &DatabaseConnection,
        input: ListAlbumsInput,
    ) -> Result<(Vec<JsonValue>, i64), AppError> {
        let sort_col = allow_album_sort(&input.sort_by);
        let sort_dir = allow_sort_dir(&input.sort_dir);
        let mut params = vec![input.music_id.into()];
        let mut where_parts = vec!["a.music_id = $1".to_string()];

        if let Some(search) = input.search.filter(|s| !s.trim().is_empty()) {
            let p = push_param(&mut params, format!("%{}%", search.trim()));
            where_parts.push(format!("a.title ILIKE {p}"));
        }
        if let Some(genre) = input.genre.filter(|s| !s.trim().is_empty()) {
            let p = push_param(&mut params, genre);
            where_parts.push(format!(
                "EXISTS (SELECT 1 FROM music_tracks gt WHERE gt.album_id = a.id AND gt.genre = {p})"
            ));
        }
        if let Some(artist_id) = input.artist_id {
            let p = push_param(&mut params, artist_id);
            where_parts.push(format!(
                "EXISTS (SELECT 1 FROM music_album_artists fa WHERE fa.album_id = a.id AND fa.artist_id = {p})"
            ));
        }
        if let Some(favorite) = input.favorite {
            let p = push_param(&mut params, favorite);
            where_parts.push(format!("a.is_favorite = {p}"));
        }

        let limit = input.page_size.clamp(1, 200);
        let offset = (input.page.max(1) - 1) * limit;
        let limit_p = push_param(&mut params, limit);
        let offset_p = push_param(&mut params, offset);
        let where_sql = where_parts.join(" AND ");
        let sql = format!(
            "SELECT a.id, a.title, a.year, a.release_date, a.album_type, a.cover_path, a.overview, \
                    a.total_tracks, a.total_discs, a.is_favorite, a.created_at, a.updated_at, \
                    COUNT(*) OVER()::bigint AS total, \
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', ar.id, 'name', ar.name)) \
                        FILTER (WHERE ar.id IS NOT NULL), '[]'::jsonb) AS artists \
             FROM music_albums a \
             LEFT JOIN music_album_artists aa ON aa.album_id = a.id \
             LEFT JOIN music_artists ar ON ar.id = aa.artist_id \
             WHERE {where_sql} \
             GROUP BY a.id \
             ORDER BY {sort_col} {sort_dir}, a.created_at DESC \
             LIMIT {limit_p} OFFSET {offset_p}"
        );
        let rows = db.query_all(Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, params)).await?;
        let total = rows.first().map(row_total).transpose()?.unwrap_or(0);
        let items = rows.iter().map(album_row).collect::<Result<Vec<_>, _>>()?;
        Ok((items, total))
    }

    pub async fn list_tracks(
        db: &DatabaseConnection,
        input: ListTracksInput,
    ) -> Result<(Vec<JsonValue>, i64), AppError> {
        let sort_col = allow_track_sort(&input.sort_by);
        let sort_dir = allow_sort_dir(&input.sort_dir);
        let mut params = vec![input.music_id.into()];
        let mut where_parts = vec!["a.music_id = $1".to_string()];
        if let Some(search) = input.search.filter(|s| !s.trim().is_empty()) {
            let p = push_param(&mut params, format!("%{}%", search.trim()));
            where_parts.push(format!("(t.title ILIKE {p} OR a.title ILIKE {p})"));
        }
        if let Some(genre) = input.genre.filter(|s| !s.trim().is_empty()) {
            let p = push_param(&mut params, genre);
            where_parts.push(format!("t.genre = {p}"));
        }
        let limit = input.page_size.clamp(1, 200);
        let offset = (input.page.max(1) - 1) * limit;
        let limit_p = push_param(&mut params, limit);
        let offset_p = push_param(&mut params, offset);
        let where_sql = where_parts.join(" AND ");
        let sql = format!(
            "SELECT t.id, t.album_id, t.title, t.track_number, t.disc_number, t.duration, t.genre, \
                    t.bitrate, t.sample_rate, t.codec, t.lyrics_path, \
                    a.title AS album_title, f.id AS file_id, f.path AS file_path, f.mime_type, f.size, \
                    COUNT(*) OVER()::bigint AS total, \
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', ar.id, 'name', ar.name)) \
                        FILTER (WHERE ar.id IS NOT NULL), '[]'::jsonb) AS artists \
             FROM music_tracks t \
             JOIN music_albums a ON a.id = t.album_id \
             LEFT JOIN music_files f ON f.track_id = t.id \
             LEFT JOIN music_album_artists aa ON aa.album_id = a.id \
             LEFT JOIN music_artists ar ON ar.id = aa.artist_id \
             WHERE {where_sql} \
             GROUP BY t.id, a.id, f.id \
             ORDER BY {sort_col} {sort_dir}, t.track_number ASC NULLS LAST \
             LIMIT {limit_p} OFFSET {offset_p}"
        );
        let rows = db.query_all(Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, params)).await?;
        let total = rows.first().map(row_total).transpose()?.unwrap_or(0);
        let items = rows.iter().map(track_row).collect::<Result<Vec<_>, _>>()?;
        Ok((items, total))
    }

    pub async fn list_artists(
        db: &DatabaseConnection,
        music_id: Uuid,
        page: i64,
        page_size: i64,
        sort_by: &str,
        sort_dir: &str,
        search: Option<&str>,
    ) -> Result<(Vec<JsonValue>, i64), AppError> {
        let sort_col = match sort_by { "createdAt" => "ar.created_at", _ => "ar.name" };
        let sort_dir = allow_sort_dir(sort_dir);
        let mut params = vec![music_id.into()];
        let mut where_parts = vec!["a.music_id = $1".to_string()];
        if let Some(search) = search.filter(|s| !s.trim().is_empty()) {
            let p = push_param(&mut params, format!("%{}%", search.trim()));
            where_parts.push(format!("ar.name ILIKE {p}"));
        }
        let limit = page_size.clamp(1, 200);
        let offset = (page.max(1) - 1) * limit;
        let limit_p = push_param(&mut params, limit);
        let offset_p = push_param(&mut params, offset);
        let where_sql = where_parts.join(" AND ");
        let sql = format!(
            "SELECT ar.id, ar.name, ar.original_name, ar.biography, ar.profile_path, ar.profile_key, \
                    ar.popularity, ar.followers, ar.genres, ar.created_at, ar.updated_at, \
                    COUNT(DISTINCT a.id)::bigint AS album_count, COUNT(DISTINCT t.id)::bigint AS track_count, \
                    COUNT(*) OVER()::bigint AS total \
             FROM music_artists ar \
             JOIN music_album_artists aa ON aa.artist_id = ar.id \
             JOIN music_albums a ON a.id = aa.album_id \
             LEFT JOIN music_tracks t ON t.album_id = a.id \
             WHERE {where_sql} \
             GROUP BY ar.id \
             ORDER BY {sort_col} {sort_dir} \
             LIMIT {limit_p} OFFSET {offset_p}"
        );
        let rows = db.query_all(Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, params)).await?;
        let total = rows.first().map(row_total).transpose()?.unwrap_or(0);
        let items = rows.iter().map(artist_row).collect::<Result<Vec<_>, _>>()?;
        Ok((items, total))
    }

    pub async fn get_album_detail(db: &DatabaseConnection, album_id: Uuid) -> Result<Option<JsonValue>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT a.id, a.music_id, a.title, a.year, a.release_date, a.album_type, a.cover_path, a.overview, \
                    a.total_tracks, a.total_discs, a.is_favorite, a.metadata, a.created_at, a.updated_at, \
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', ar.id, 'name', ar.name)) \
                        FILTER (WHERE ar.id IS NOT NULL), '[]'::jsonb) AS artists \
             FROM music_albums a \
             LEFT JOIN music_album_artists aa ON aa.album_id = a.id \
             LEFT JOIN music_artists ar ON ar.id = aa.artist_id \
             WHERE a.id = $1 \
             GROUP BY a.id",
            [album_id.into()],
        );
        let Some(row) = db.query_one(stmt).await? else { return Ok(None); };
        let mut album = album_row(&row)?;
        let tracks = Self::tracks_for_album(db, album_id).await?;
        if let Some(obj) = album.as_object_mut() {
            obj.insert("tracks".to_string(), JsonValue::Array(tracks));
        }
        Ok(Some(album))
    }

    pub async fn get_artist_detail(
        db: &DatabaseConnection,
        person_id: Uuid,
        music_id: Uuid,
    ) -> Result<Option<JsonValue>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT ar.id, ar.name, ar.original_name, ar.biography, ar.profile_path, ar.profile_key, \
                    ar.popularity, ar.followers, ar.genres, ar.created_at, ar.updated_at, \
                    COUNT(DISTINCT a.id)::bigint AS album_count, COUNT(DISTINCT t.id)::bigint AS track_count, 1::bigint AS total \
             FROM music_artists ar \
             JOIN music_album_artists aa ON aa.artist_id = ar.id \
             JOIN music_albums a ON a.id = aa.album_id \
             LEFT JOIN music_tracks t ON t.album_id = a.id \
             WHERE ar.id = $1 AND a.music_id = $2 \
             GROUP BY ar.id",
            [person_id.into(), music_id.into()],
        );
        let Some(row) = db.query_one(stmt).await? else { return Ok(None); };
        let mut artist = artist_row(&row)?;
        let albums = Self::albums_for_artist(db, person_id, music_id).await?;
        if let Some(obj) = artist.as_object_mut() {
            obj.insert("albums".to_string(), JsonValue::Array(albums));
        }
        Ok(Some(artist))
    }

    pub async fn toggle_album_favorite(db: &DatabaseConnection, album_id: Uuid) -> Result<bool, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "UPDATE music_albums SET is_favorite = NOT is_favorite, updated_at = NOW() WHERE id = $1 RETURNING is_favorite",
            [album_id.into()],
        );
        let row = db.query_one(stmt).await?.ok_or_else(|| AppError::NotFound(format!("album {album_id} not found")))?;
        get::<bool>(&row, "is_favorite")
    }

    pub async fn get_track_lyrics(db: &DatabaseConnection, track_id: Uuid) -> Result<Option<String>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT lyrics_path FROM music_tracks WHERE id = $1",
            [track_id.into()],
        );
        let row = db.query_one(stmt).await?.ok_or_else(|| AppError::NotFound(format!("track {track_id} not found")))?;
        get_opt::<String>(&row, "lyrics_path")
    }

    async fn tracks_for_album(db: &DatabaseConnection, album_id: Uuid) -> Result<Vec<JsonValue>, AppError> {
        let rows = db.query_all(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT t.id, t.album_id, t.title, t.track_number, t.disc_number, t.duration, t.genre, \
                    t.bitrate, t.sample_rate, t.codec, t.lyrics_path, a.title AS album_title, \
                    f.id AS file_id, f.path AS file_path, f.mime_type, f.size, 0::bigint AS total, '[]'::jsonb AS artists \
             FROM music_tracks t \
             JOIN music_albums a ON a.id = t.album_id \
             LEFT JOIN music_files f ON f.track_id = t.id \
             WHERE t.album_id = $1 \
             ORDER BY t.disc_number ASC NULLS LAST, t.track_number ASC NULLS LAST, t.title ASC",
            [album_id.into()],
        )).await?;
        rows.iter().map(track_row).collect()
    }

    async fn albums_for_artist(db: &DatabaseConnection, artist_id: Uuid, music_id: Uuid) -> Result<Vec<JsonValue>, AppError> {
        let rows = db.query_all(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT a.id, a.title, a.year, a.release_date, a.album_type, a.cover_path, a.overview, \
                    a.total_tracks, a.total_discs, a.is_favorite, a.created_at, a.updated_at, 0::bigint AS total, \
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', ar.id, 'name', ar.name)) \
                        FILTER (WHERE ar.id IS NOT NULL), '[]'::jsonb) AS artists \
             FROM music_albums a \
             JOIN music_album_artists aa_filter ON aa_filter.album_id = a.id AND aa_filter.artist_id = $1 \
             LEFT JOIN music_album_artists aa ON aa.album_id = a.id \
             LEFT JOIN music_artists ar ON ar.id = aa.artist_id \
             WHERE a.music_id = $2 \
             GROUP BY a.id \
             ORDER BY a.year DESC NULLS LAST, a.title ASC",
            [artist_id.into(), music_id.into()],
        )).await?;
        rows.iter().map(album_row).collect()
    }
}

fn push_param<T: Into<Value>>(params: &mut Vec<Value>, value: T) -> String {
    params.push(value.into());
    format!("${}", params.len())
}

fn allow_sort_dir(sort_dir: &str) -> &'static str {
    if sort_dir.eq_ignore_ascii_case("desc") { "DESC" } else { "ASC" }
}

fn allow_album_sort(sort_by: &str) -> &'static str {
    match sort_by {
        "year" => "a.year",
        "createdAt" => "a.created_at",
        "updatedAt" => "a.updated_at",
        "favorite" | "isFavorite" => "a.is_favorite",
        "trackCount" | "totalTracks" => "a.total_tracks",
        _ => "a.title",
    }
}

fn allow_track_sort(sort_by: &str) -> &'static str {
    match sort_by {
        "trackNumber" => "t.track_number",
        "discNumber" => "t.disc_number",
        "duration" => "t.duration",
        "genre" => "t.genre",
        _ => "t.title",
    }
}

fn row_total(row: &QueryResult) -> Result<i64, AppError> {
    get::<i64>(row, "total")
}

fn album_row(row: &QueryResult) -> Result<JsonValue, AppError> {
    let created_at = get_opt::<chrono::DateTime<chrono::FixedOffset>>(row, "created_at")?
        .and_then(|dt| dt.to_api_datetime());
    let updated_at = get_opt::<chrono::DateTime<chrono::FixedOffset>>(row, "updated_at")?;
    Ok(json!({
        "id": get::<Uuid>(row, "id")?.to_string(),
        "title": get::<String>(row, "title")?,
        "year": get_opt::<i32>(row, "year")?,
        "releaseDate": get_opt::<chrono::NaiveDate>(row, "release_date")?.map(|d| d.to_string()),
        "albumType": get_opt::<String>(row, "album_type")?,
        "coverPath": get_opt::<String>(row, "cover_path")?,
        "overview": get_opt::<String>(row, "overview")?,
        "totalTracks": get_opt::<i32>(row, "total_tracks")?,
        "totalDiscs": get_opt::<i32>(row, "total_discs")?,
        "isFavorite": get::<bool>(row, "is_favorite")?,
        "artists": get_opt::<JsonValue>(row, "artists")?.unwrap_or_else(|| json!([])),
        "createdAt": created_at,
        "updatedAt": updated_at.to_api_datetime(),
    }))
}

fn track_row(row: &QueryResult) -> Result<JsonValue, AppError> {
    Ok(json!({
        "id": get::<Uuid>(row, "id")?.to_string(),
        "albumId": get::<Uuid>(row, "album_id")?.to_string(),
        "title": get::<String>(row, "title")?,
        "trackNumber": get_opt::<i32>(row, "track_number")?,
        "discNumber": get_opt::<i32>(row, "disc_number")?,
        "duration": get_opt::<i32>(row, "duration")?,
        "genre": get_opt::<String>(row, "genre")?,
        "bitrate": get_opt::<i32>(row, "bitrate")?,
        "sampleRate": get_opt::<i32>(row, "sample_rate")?,
        "codec": get_opt::<String>(row, "codec")?,
        "lyricsPath": get_opt::<String>(row, "lyrics_path")?,
        "albumTitle": get::<String>(row, "album_title")?,
        "fileId": get_opt::<Uuid>(row, "file_id")?.map(|id| id.to_string()),
        "filePath": get_opt::<String>(row, "file_path")?,
        "mimeType": get_opt::<String>(row, "mime_type")?,
        "size": get_opt::<i64>(row, "size")?,
        "artists": get_opt::<JsonValue>(row, "artists")?.unwrap_or_else(|| json!([])),
    }))
}

fn artist_row(row: &QueryResult) -> Result<JsonValue, AppError> {
    let created_at = get_opt::<chrono::DateTime<chrono::FixedOffset>>(row, "created_at")?
        .and_then(|dt| dt.to_api_datetime());
    let updated_at = get_opt::<chrono::DateTime<chrono::FixedOffset>>(row, "updated_at")?;
    Ok(json!({
        "id": get::<Uuid>(row, "id")?.to_string(),
        "name": get::<String>(row, "name")?,
        "originalName": get_opt::<String>(row, "original_name")?,
        "biography": get_opt::<String>(row, "biography")?,
        "profilePath": get_opt::<String>(row, "profile_path")?,
        "profileKey": get_opt::<String>(row, "profile_key")?,
        "popularity": get_opt::<i32>(row, "popularity")?,
        "followers": get_opt::<i32>(row, "followers")?,
        "genres": get_opt::<Vec<String>>(row, "genres")?,
        "albumCount": get::<i64>(row, "album_count")?,
        "trackCount": get::<i64>(row, "track_count")?,
        "createdAt": created_at,
        "updatedAt": updated_at.to_api_datetime(),
    }))
}

fn get<T>(row: &QueryResult, col: &str) -> Result<T, AppError>
where
    T: sea_orm::TryGetable,
{
    row.try_get::<T>("", col)
        .map_err(|error| AppError::Internal(format!("read column {col}: {error}")))
}

fn get_opt<T>(row: &QueryResult, col: &str) -> Result<Option<T>, AppError>
where
    T: sea_orm::TryGetable,
{
    row.try_get::<Option<T>>("", col)
        .map_err(|error| AppError::Internal(format!("read column {col}: {error}")))
}
