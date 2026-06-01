use sea_orm::{DatabaseBackend, DatabaseConnection, QueryResult, Statement, Value};
use serde_json::{Value as JsonValue, json};
use uuid::Uuid;

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
        let mut conds = vec!["a.music_id = $1".to_string()];
        let mut params: Vec<Value> = vec![input.music_id.into()];
        let mut n = 2usize;

        if let Some(s) = input.search.filter(|s| !s.trim().is_empty()) {
            conds.push(format!("a.title ILIKE ${n}"));
            params.push(format!("%{s}%").into());
            n += 1;
        }
        if let Some(g) = input.genre.filter(|s| !s.trim().is_empty()) {
            conds.push(format!(
                "EXISTS (SELECT 1 FROM music_tracks mt WHERE mt.album_id = a.id AND mt.genre ILIKE ${n})"
            ));
            params.push(format!("%{g}%").into());
            n += 1;
        }
        if let Some(aid) = input.artist_id {
            conds.push(format!(
                "EXISTS (SELECT 1 FROM music_album_artists maa2 WHERE maa2.album_id = a.id AND maa2.artist_id = ${n})"
            ));
            params.push(aid.into());
            n += 1;
        }
        if let Some(true) = input.favorite {
            conds.push("a.is_favorite = true".to_string());
        }

        let wh = conds.join(" AND ");
        let order = match input.sort_by.as_str() {
            "year" => "a.year",
            "addedAt" | "createdAt" => "a.created_at",
            _ => "a.title",
        };
        let d = dir(&input.sort_dir);

        let total = query_count(
            db,
            &format!("SELECT COUNT(*) as total FROM music_albums a WHERE {wh}"),
            params.clone(),
        )
        .await?;

        let lim = n;
        let off = n + 1;
        let isql = format!(
            "SELECT a.id, a.music_id, a.title, a.sort_title, a.year, \
             a.album_type, a.cover_path, a.is_favorite, a.mb_album_id, \
             a.scraped_at::text as scraped_at, \
             a.metadata->>'genres' as genres_json, \
             a.created_at::text as created_at, a.updated_at::text as updated_at, \
             (SELECT COUNT(*) FROM music_tracks mt WHERE mt.album_id = a.id) as track_count, \
             (SELECT COALESCE(SUM(mt.duration), 0) FROM music_tracks mt WHERE mt.album_id = a.id) as total_duration, \
             (SELECT ma.name FROM music_album_artists maa JOIN music_artists ma ON ma.id = maa.artist_id \
              WHERE maa.album_id = a.id LIMIT 1) as artist_name \
             FROM music_albums a WHERE {wh} ORDER BY {order} {d} NULLS LAST LIMIT ${lim} OFFSET ${off}"
        );
        let offset_val = (input.page - 1) * input.page_size;
        params.push(input.page_size.into());
        params.push(offset_val.into());

        let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, &isql, params);
        let rows = db.query_all(stmt).await?;
        let items = rows
            .iter()
            .map(|r| {
                let genres: Vec<String> = get_opt::<String>(r, "genres_json")?
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();
                Ok(json!({
                    "id": get::<Uuid>(r, "id")?.to_string(),
                    "musicId": get::<Uuid>(r, "music_id")?.to_string(),
                    "title": get::<String>(r, "title")?,
                    "sortTitle": get_opt::<String>(r, "sort_title")?,
                    "year": get_opt::<i32>(r, "year")?,
                    "albumType": get_opt::<String>(r, "album_type")?,
                    "coverPath": get_opt::<String>(r, "cover_path")?,
                    "isFavorite": get::<bool>(r, "is_favorite").unwrap_or(false),
                    "mbAlbumId": get_opt::<String>(r, "mb_album_id")?,
                    "scrapedAt": get_opt::<String>(r, "scraped_at")?,
                    "genres": genres,
                    "trackCount": get::<i64>(r, "track_count").unwrap_or(0),
                    "totalDuration": get::<i64>(r, "total_duration").unwrap_or(0),
                    "artistName": get_opt::<String>(r, "artist_name")?,
                    "createdAt": get_opt::<String>(r, "created_at")?,
                    "updatedAt": get_opt::<String>(r, "updated_at")?,
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        Ok((items, total))
    }

    // ── Music: Album Detail ──

    pub async fn get_album_detail(db: &DatabaseConnection, album_id: Uuid) -> Result<Option<JsonValue>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT a.id, a.music_id, a.title, a.sort_title, a.year, \
             a.release_date::text as release_date, a.album_type, a.cover_path, \
             a.overview, a.total_tracks, a.total_discs, a.is_favorite, \
             a.mb_album_id, a.metadata, \
             a.scraped_at::text as scraped_at, \
             a.created_at::text as created_at, a.updated_at::text as updated_at \
             FROM music_albums a WHERE a.id = $1",
            [album_id.into()],
        );
        let Some(a) = db.query_one(stmt).await? else {
            return Ok(None);
        };

        let album_cover: Option<String> = get_opt(&a, "cover_path")?;
        let album_id_str = get::<Uuid>(&a, "id")?.to_string();

        // Tracks
        let album_title: String = get(&a, "title")?;
        let track_stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT t.id, t.title, t.track_number, t.disc_number, t.duration, \
             t.bitrate, t.codec, t.genre, t.sample_rate, t.lyrics_path, \
             mf.id as file_id, mf.path as file_path, mf.filename as file_name, \
             mf.size as file_size, mf.mime_type as file_mime, \
             (SELECT ma.name FROM music_album_artists maa JOIN music_artists ma ON ma.id = maa.artist_id \
              WHERE maa.album_id = t.album_id LIMIT 1) as artist_name \
             FROM music_tracks t \
             LEFT JOIN music_files mf ON mf.track_id = t.id \
             WHERE t.album_id = $1 \
             ORDER BY t.disc_number ASC NULLS FIRST, t.track_number ASC NULLS LAST",
            [album_id.into()],
        );
        let track_rows = db.query_all(track_stmt).await?;
        let tracks: Vec<JsonValue> = track_rows
            .iter()
            .map(|r| -> Result<JsonValue, AppError> {
                let fid = get_opt::<Uuid>(r, "file_id")?;
                let file = fid.map(|id| json!({
                    "id": id.to_string(),
                    "path": get_opt::<String>(r, "file_path").unwrap_or_default(),
                    "filename": get_opt::<String>(r, "file_name").unwrap_or_default(),
                    "size": get_opt::<i64>(r, "file_size").unwrap_or_default(),
                    "mimeType": get_opt::<String>(r, "file_mime").unwrap_or_default(),
                }));
                Ok(json!({
                    "id": get::<Uuid>(r, "id").map(|v| v.to_string()).unwrap_or_default(),
                    "albumId": &album_id_str,
                    "albumTitle": &album_title,
                    "title": get::<String>(r, "title").unwrap_or_default(),
                    "artistName": get_opt::<String>(r, "artist_name")?,
                    "trackNumber": get_opt::<i32>(r, "track_number")?,
                    "discNumber": get_opt::<i32>(r, "disc_number")?,
                    "duration": get_opt::<i32>(r, "duration")?,
                    "bitrate": get_opt::<i32>(r, "bitrate")?,
                    "codec": get_opt::<String>(r, "codec")?,
                    "genre": get_opt::<String>(r, "genre")?,
                    "sampleRate": get_opt::<i32>(r, "sample_rate")?,
                    "lyricsPath": get_opt::<String>(r, "lyrics_path")?,
                    "coverPath": &album_cover,
                    "fileId": fid.map(|v| v.to_string()),
                    "file": file,
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;

        // Credits
        let credits = Self::query_album_credits(db, album_id).await?;

        // Parse genres from metadata
        let metadata: Option<JsonValue> = get_opt(&a, "metadata")?;
        let genres: Vec<String> = metadata
            .as_ref()
            .and_then(|m| m.get("genres"))
            .and_then(|g| g.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        Ok(Some(json!({
            "id": &album_id_str,
            "musicId": get::<Uuid>(&a, "music_id")?.to_string(),
            "title": get::<String>(&a, "title")?,
            "sortTitle": get_opt::<String>(&a, "sort_title")?,
            "year": get_opt::<i32>(&a, "year")?,
            "releaseDate": get_opt::<String>(&a, "release_date")?,
            "albumType": get_opt::<String>(&a, "album_type")?,
            "coverPath": &album_cover,
            "overview": get_opt::<String>(&a, "overview")?,
            "totalTracks": get_opt::<i32>(&a, "total_tracks")?,
            "totalDiscs": get_opt::<i32>(&a, "total_discs")?,
            "isFavorite": get::<bool>(&a, "is_favorite").unwrap_or(false),
            "mbAlbumId": get_opt::<String>(&a, "mb_album_id")?,
            "genres": genres,
            "scrapedAt": get_opt::<String>(&a, "scraped_at")?,
            "metadata": metadata,
            "createdAt": get_opt::<String>(&a, "created_at")?,
            "updatedAt": get_opt::<String>(&a, "updated_at")?,
            "tracks": tracks,
            "credits": credits,
        })))
    }

    // ── Music: Tracks ──

    pub async fn list_tracks(
        db: &DatabaseConnection,
        input: ListTracksInput,
    ) -> Result<(Vec<JsonValue>, i64), AppError> {
        let mut conds = vec!["a.music_id = $1".to_string()];
        let mut params: Vec<Value> = vec![input.music_id.into()];
        let mut n = 2usize;

        if let Some(s) = input.search.filter(|s| !s.trim().is_empty()) {
            conds.push(format!("t.title ILIKE ${n}"));
            params.push(format!("%{s}%").into());
            n += 1;
        }
        if let Some(g) = input.genre.filter(|s| !s.trim().is_empty()) {
            conds.push(format!("t.genre ILIKE ${n}"));
            params.push(format!("%{g}%").into());
            n += 1;
        }

        let wh = conds.join(" AND ");
        let order = match input.sort_by.as_str() {
            "duration" => "t.duration",
            "addedAt" | "createdAt" => "a.created_at",
            _ => "t.title",
        };
        let d = dir(&input.sort_dir);

        let total = query_count(
            db,
            &format!(
                "SELECT COUNT(*) as total FROM music_tracks t \
                 JOIN music_albums a ON a.id = t.album_id WHERE {wh}"
            ),
            params.clone(),
        )
        .await?;

        let lim = n;
        let off = n + 1;
        let isql = format!(
            "SELECT t.id, t.title, t.track_number, t.disc_number, t.duration, \
             t.bitrate, t.codec, t.genre, t.sample_rate, \
             a.title as album_title, a.cover_path as album_cover, \
             mf.id as file_id, mf.path as file_path, mf.filename as file_name, \
             mf.size as file_size, mf.mime_type as file_mime, \
             (SELECT ma.name FROM music_album_artists maa JOIN music_artists ma ON ma.id = maa.artist_id \
              WHERE maa.album_id = a.id LIMIT 1) as artist_name \
             FROM music_tracks t \
             JOIN music_albums a ON a.id = t.album_id \
             LEFT JOIN music_files mf ON mf.track_id = t.id \
             WHERE {wh} ORDER BY {order} {d} NULLS LAST LIMIT ${lim} OFFSET ${off}"
        );
        let offset_val = (input.page - 1) * input.page_size;
        params.push(input.page_size.into());
        params.push(offset_val.into());

        let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, &isql, params);
        let rows = db.query_all(stmt).await?;
        let items = rows
            .iter()
            .map(|r| -> Result<JsonValue, AppError> {
                let fid = get_opt::<Uuid>(r, "file_id")?;
                let file = fid.map(|id| json!({
                    "id": id.to_string(),
                    "path": get_opt::<String>(r, "file_path").unwrap_or_default(),
                    "filename": get_opt::<String>(r, "file_name").unwrap_or_default(),
                    "size": get_opt::<i64>(r, "file_size").unwrap_or_default(),
                    "mimeType": get_opt::<String>(r, "file_mime").unwrap_or_default(),
                }));
                Ok(json!({
                    "id": get::<Uuid>(r, "id")?.to_string(),
                    "title": get::<String>(r, "title")?,
                    "trackNumber": get_opt::<i32>(r, "track_number")?,
                    "discNumber": get_opt::<i32>(r, "disc_number")?,
                    "duration": get_opt::<i32>(r, "duration")?,
                    "bitrate": get_opt::<i32>(r, "bitrate")?,
                    "codec": get_opt::<String>(r, "codec")?,
                    "genre": get_opt::<String>(r, "genre")?,
                    "sampleRate": get_opt::<i32>(r, "sample_rate")?,
                    "albumTitle": get_opt::<String>(r, "album_title")?,
                    "albumCover": get_opt::<String>(r, "album_cover")?,
                    "coverPath": get_opt::<String>(r, "album_cover")?,
                    "artistName": get_opt::<String>(r, "artist_name")?,
                    "fileId": fid.map(|v| v.to_string()),
                    "file": file,
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        Ok((items, total))
    }

    // ── Music: Artists ──

    pub async fn list_artists(
        db: &DatabaseConnection,
        music_id: Uuid,
        page: i64,
        page_size: i64,
        sort_by: &str,
        sort_dir: &str,
        search: Option<&str>,
    ) -> Result<(Vec<JsonValue>, i64), AppError> {
        let mut conds = vec!["a.music_id = $1".to_string()];
        let mut params: Vec<Value> = vec![music_id.into()];
        let mut n = 2usize;

        if let Some(s) = search.filter(|s| !s.trim().is_empty()) {
            conds.push(format!("ma.name ILIKE ${n}"));
            params.push(format!("%{s}%").into());
            n += 1;
        }

        let wh = conds.join(" AND ");
        let order = match sort_by {
            "albumCount" => "album_count",
            "addedAt" | "createdAt" => "ma.created_at",
            _ => "ma.name",
        };
        let d = dir(sort_dir);

        let count_sql = format!(
            "SELECT COUNT(DISTINCT ma.id) as total FROM music_artists ma \
             JOIN music_album_artists maa ON maa.artist_id = ma.id \
             JOIN music_albums a ON a.id = maa.album_id WHERE {wh}"
        );
        let total = query_count(db, &count_sql, params.clone()).await?;

        let lim = n;
        let off = n + 1;
        let isql = format!(
            "SELECT ma.id, ma.name, ma.profile_path, \
             COUNT(DISTINCT maa.album_id) as album_count \
             FROM music_artists ma \
             JOIN music_album_artists maa ON maa.artist_id = ma.id \
             JOIN music_albums a ON a.id = maa.album_id \
             WHERE {wh} \
             GROUP BY ma.id \
             ORDER BY {order} {d} NULLS LAST LIMIT ${lim} OFFSET ${off}"
        );
        let offset_val = (page - 1) * page_size;
        params.push(page_size.into());
        params.push(offset_val.into());

        let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, &isql, params);
        let rows = db.query_all(stmt).await?;
        let items = rows
            .iter()
            .map(|r| {
                Ok(json!({
                    "id": get::<Uuid>(r, "id")?.to_string(),
                    "name": get::<String>(r, "name")?,
                    "profilePath": get_opt::<String>(r, "profile_path")?,
                    "albumCount": get::<i64>(r, "album_count").unwrap_or(0),
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        Ok((items, total))
    }

    // ── Music: Artist Detail ──

    pub async fn get_artist_detail(
        db: &DatabaseConnection,
        person_id: Uuid,
        music_id: Uuid,
    ) -> Result<Option<JsonValue>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT ma.id, ma.name, ma.original_name, ma.profile_path, ma.biography, \
             ma.popularity, ma.followers, ma.mb_id, \
             (SELECT COUNT(*) FROM music_album_artists maa2 \
              JOIN music_albums a2 ON a2.id = maa2.album_id AND a2.music_id = $2 \
              WHERE maa2.artist_id = ma.id) as album_count, \
             (SELECT COUNT(*) FROM music_album_artists maa3 \
              JOIN music_tracks t3 ON t3.album_id = maa3.album_id \
              JOIN music_albums a3 ON a3.id = maa3.album_id AND a3.music_id = $2 \
              WHERE maa3.artist_id = ma.id) as track_count \
             FROM music_artists ma WHERE ma.id = $1",
            [person_id.into(), music_id.into()],
        );
        let Some(p) = db.query_one(stmt).await? else {
            return Ok(None);
        };

        let album_stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT a.id, a.title, a.year, a.cover_path, a.is_favorite, a.album_type, \
             ar.name as artist_name \
             FROM music_albums a \
             JOIN music_album_artists maa ON maa.album_id = a.id AND maa.artist_id = $1 \
             LEFT JOIN music_artists ar ON ar.id = maa.artist_id \
             WHERE a.music_id = $2 \
             ORDER BY a.year DESC NULLS LAST",
            [person_id.into(), music_id.into()],
        );
        let album_rows = db.query_all(album_stmt).await?;
        let albums: Vec<JsonValue> = album_rows
            .iter()
            .map(|r| {
                Ok(json!({
                    "id": get::<Uuid>(r, "id").map(|v| v.to_string()).unwrap_or_default(),
                    "title": get::<String>(r, "title").unwrap_or_default(),
                    "artistName": get_opt::<String>(r, "artist_name")?,
                    "year": get_opt::<i32>(r, "year")?,
                    "coverPath": get_opt::<String>(r, "cover_path")?,
                    "isFavorite": get::<bool>(r, "is_favorite").unwrap_or(false),
                    "albumType": get_opt::<String>(r, "album_type")?,
                }))
            })
            .collect::<Result<Vec<_>, AppError>>()?;

        Ok(Some(json!({
            "id": get::<Uuid>(&p, "id")?.to_string(),
            "name": get::<String>(&p, "name")?,
            "originalName": get_opt::<String>(&p, "original_name")?,
            "profilePath": get_opt::<String>(&p, "profile_path")?,
            "biography": get_opt::<String>(&p, "biography")?,
            "popularity": get_opt::<i32>(&p, "popularity")?,
            "followers": get_opt::<i32>(&p, "followers")?,
            "mbArtistId": get_opt::<String>(&p, "mb_id")?,
            "albumCount": get::<i64>(&p, "album_count").unwrap_or(0),
            "trackCount": get::<i64>(&p, "track_count").unwrap_or(0),
            "albums": albums,
        })))
    }

    // ── Music: Toggle Album Favorite ──

    pub async fn toggle_album_favorite(db: &DatabaseConnection, album_id: Uuid) -> Result<bool, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "UPDATE music_albums SET is_favorite = NOT is_favorite WHERE id = $1 RETURNING is_favorite",
            [album_id.into()],
        );
        let row = db.query_one(stmt).await?
            .ok_or_else(|| AppError::NotFound(format!("album {album_id} not found")))?;
        get::<bool>(&row, "is_favorite")
    }

    // ── Track Lyrics ──

    pub async fn get_track_lyrics(db: &DatabaseConnection, track_id: Uuid) -> Result<Option<String>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT lyrics_path FROM music_tracks WHERE id = $1",
            [track_id.into()],
        );
        let row = db.query_one(stmt).await?
            .ok_or_else(|| AppError::NotFound(format!("track {track_id} not found")))?;
        get_opt::<String>(&row, "lyrics_path")
    }

    // ── Album Credits ──

    async fn query_album_credits(db: &DatabaseConnection, album_id: Uuid) -> Result<Vec<JsonValue>, AppError> {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT aa.id, aa.role, NULL::text as character, aa.sort_order, \
             ma.id as person_id, ma.name, ma.profile_path \
             FROM music_album_artists aa JOIN music_artists ma ON ma.id = aa.artist_id \
             WHERE aa.album_id = $1 ORDER BY aa.sort_order ASC",
            [album_id.into()],
        );
        let rows = db.query_all(stmt).await?;
        rows.iter()
            .map(|r| {
                Ok(json!({
                    "id": get::<Uuid>(r, "id").map(|v| v.to_string()).unwrap_or_default(),
                    "role": get::<String>(r, "role").unwrap_or_default(),
                    "character": get_opt::<String>(r, "character").unwrap_or_default(),
                    "sortOrder": get::<i32>(r, "sort_order").unwrap_or(0),
                    "person": {
                        "id": get::<Uuid>(r, "person_id").map(|v| v.to_string()).unwrap_or_default(),
                        "name": get::<String>(r, "name").unwrap_or_default(),
                        "profilePath": get_opt::<String>(r, "profile_path").unwrap_or_default(),
                    }
                }))
            })
            .collect()
    }
}

fn dir(d: &str) -> &'static str {
    if d.eq_ignore_ascii_case("desc") { "DESC" } else { "ASC" }
}

fn query_count<'a>(db: &'a DatabaseConnection, sql: &'a str, params: Vec<Value>) -> impl std::future::Future<Output = Result<i64, AppError>> + 'a {
    // Wrap async block to avoid lifetime issues
    async move {
        let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, params);
        let row = db.query_one(stmt).await?
            .ok_or_else(|| AppError::Internal("count query returned no rows".into()))?;
        get::<i64>(&row, "total")
    }
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
