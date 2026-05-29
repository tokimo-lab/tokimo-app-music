//! `music_scan` job handler — processes a single audio file discovered during sync.
//!
//! Params: `{ "filePath", "sourceId", "musicId", "fileSize" }`

use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use sea_orm::ActiveValue::Set;
use serde_json::{Value as JsonValue, json};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::ctx::AppCtx;
use crate::db::entities::{music_album_artists, music_albums, music_artists, music_files, music_tracks};
use crate::bus_clients::jobs as jobs_client;

pub async fn handle(
    db: &DatabaseConnection,
    _state: &Arc<AppCtx>,
    _job_id: Uuid,
    params: &JsonValue,
    user_id: Option<Uuid>,
    cancel: &CancellationToken,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error + Send + Sync>> {
    if cancel.is_cancelled() {
        return Ok(Some(json!({ "cancelled": true })));
    }

    let file_path = params
        .get("filePath")
        .and_then(|v| v.as_str())
        .ok_or("missing filePath")?;
    let source_id_str = params
        .get("sourceId")
        .and_then(|v| v.as_str())
        .ok_or("missing sourceId")?;
    let music_id_str = params
        .get("musicId")
        .and_then(|v| v.as_str())
        .ok_or("missing musicId")?;
    let file_size = params
        .get("fileSize")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let source_id = Uuid::parse_str(source_id_str)?;
    let music_id = Uuid::parse_str(music_id_str)?;
    let path = PathBuf::from(file_path);

    let file = AudioFile {
        source_id,
        path,
        size: file_size,
    };

    let txn = db.begin().await?;
    let album_id = process_audio_file(&txn, music_id, &file).await?;
    txn.commit().await?;

    // For new albums, create a music_scrape job
    let album = music_albums::Entity::find_by_id(album_id).one(db).await?;
    let mut scrape_created = false;
    if let Some(album) = album {
        if album.scraped_at.is_none() {
            if let Some(uid) = user_id {
                let request = jobs_client::CreateJobRequest::new(
                    "music_scrape",
                    json!({
                        "albumId": album_id.to_string(),
                        "musicId": music_id.to_string(),
                    }),
                );
                jobs_client::create(
                    _state.client.get().ok_or("bus client not initialized")?,
                    jobs_client::music_caller(Some(uid)),
                    request,
                )
                .await?;
                scrape_created = true;
            }
        }
    }

    Ok(Some(json!({
        "albumId": album_id,
        "scrapeCreated": scrape_created,
    })))
}

struct AudioFile {
    source_id: Uuid,
    path: PathBuf,
    size: i64,
}

struct ParsedTrack {
    title: String,
    artist: Option<String>,
    album: String,
}

async fn process_audio_file<C: ConnectionTrait>(
    db: &C,
    music_id: Uuid,
    file: &AudioFile,
) -> Result<Uuid, Box<dyn std::error::Error + Send + Sync>> {
    let parsed = parse_track(&file.path);
    tracing::info!(
        path = %file.path.display(),
        title = %parsed.title,
        artist = ?parsed.artist,
        album = %parsed.album,
        "music_scan: parsed track"
    );
    let now = Utc::now().fixed_offset();
    let artist_id = match parsed.artist.as_deref() {
        Some(artist) => Some(find_or_create_artist(db, artist, now).await?),
        None => None,
    };
    let album_id = find_or_create_album(db, music_id, &parsed.album, now).await?;
    if let Some(artist_id) = artist_id {
        ensure_album_artist(db, album_id, artist_id).await?;
    }

    let file_path = file.path.to_string_lossy().to_string();
    let filename = file
        .path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("audio")
        .to_string();
    let existing_file = music_files::Entity::find()
        .filter(music_files::Column::SourceId.eq(file.source_id))
        .filter(music_files::Column::Path.eq(file_path.clone()))
        .one(db)
        .await?;

    let track_id = match existing_file.as_ref().and_then(|f| f.track_id) {
        Some(track_id) => {
            if let Some(track) = music_tracks::Entity::find_by_id(track_id).one(db).await? {
                let mut active: music_tracks::ActiveModel = track.into();
                active.album_id = Set(album_id);
                active.title = Set(parsed.title.clone());
                active.genre = Set(None);
                active.duration = Set(None);
                active.codec = Set(codec_for_path(&file.path));
                active.update(db).await?;
                track_id
            } else {
                insert_track(db, album_id, &parsed, &file.path).await?
            }
        }
        None => insert_track(db, album_id, &parsed, &file.path).await?,
    };

    if let Some(existing) = existing_file {
        let mut active: music_files::ActiveModel = existing.into();
        active.filename = Set(filename);
        active.size = Set(Some(file.size));
        active.mime_type = Set(mime_for_path(&file.path));
        active.is_available = Set(true);
        active.scanned_at = Set(Some(now));
        active.updated_at = Set(Some(now));
        active.track_id = Set(Some(track_id));
        active.update(db).await?;
    } else {
        music_files::Entity::insert(music_files::ActiveModel {
            id: Set(Uuid::new_v4()),
            source_id: Set(Some(file.source_id)),
            path: Set(file_path),
            filename: Set(filename),
            size: Set(Some(file.size)),
            mime_type: Set(mime_for_path(&file.path)),
            duration: Set(None),
            checksum: Set(None),
            is_available: Set(true),
            scanned_at: Set(Some(now)),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
            track_id: Set(Some(track_id)),
        })
        .exec(db)
        .await?;
    }

    refresh_album_track_count(db, album_id).await?;
    Ok(album_id)
}

async fn insert_track<C: ConnectionTrait>(
    db: &C,
    album_id: Uuid,
    parsed: &ParsedTrack,
    path: &Path,
) -> Result<Uuid, Box<dyn std::error::Error + Send + Sync>> {
    let id = Uuid::new_v4();
    music_tracks::Entity::insert(music_tracks::ActiveModel {
        id: Set(id),
        album_id: Set(album_id),
        title: Set(parsed.title.clone()),
        track_number: Set(track_number(path)),
        disc_number: Set(None),
        duration: Set(None),
        genre: Set(None),
        bitrate: Set(None),
        sample_rate: Set(None),
        codec: Set(codec_for_path(path)),
        mb_track_id: Set(None),
        lyrics_path: Set(None),
    })
    .exec(db)
    .await?;
    Ok(id)
}

async fn find_or_create_artist<C: ConnectionTrait>(
    db: &C,
    name: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(model) = music_artists::Entity::find()
        .filter(music_artists::Column::Name.eq(name.to_string()))
        .one(db)
        .await?
    {
        return Ok(model.id);
    }
    let id = Uuid::new_v4();
    music_artists::Entity::insert(music_artists::ActiveModel {
        id: Set(id),
        name: Set(name.to_string()),
        original_name: Set(None),
        biography: Set(None),
        profile_path: Set(None),
        profile_key: Set(None),
        popularity: Set(None),
        followers: Set(None),
        genres: Set(None),
        mb_id: Set(None),
        metadata: Set(None),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
    })
    .exec(db)
    .await?;
    Ok(id)
}

async fn find_or_create_album<C: ConnectionTrait>(
    db: &C,
    music_id: Uuid,
    title: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(model) = music_albums::Entity::find()
        .filter(music_albums::Column::MusicId.eq(music_id))
        .filter(music_albums::Column::Title.eq(title.to_string()))
        .one(db)
        .await?
    {
        return Ok(model.id);
    }
    let id = Uuid::new_v4();
    music_albums::Entity::insert(music_albums::ActiveModel {
        id: Set(id),
        music_id: Set(music_id),
        title: Set(title.to_string()),
        sort_title: Set(Some(sort_title(title))),
        year: Set(None),
        release_date: Set(None),
        album_type: Set(None),
        mb_album_id: Set(None),
        cover_path: Set(None),
        overview: Set(None),
        total_tracks: Set(Some(0)),
        total_discs: Set(None),
        is_favorite: Set(false),
        metadata: Set(None),
        scraped_at: Set(None),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
    })
    .exec(db)
    .await?;
    Ok(id)
}

async fn ensure_album_artist<C: ConnectionTrait>(
    db: &C,
    album_id: Uuid,
    artist_id: Uuid,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let exists = music_album_artists::Entity::find()
        .filter(music_album_artists::Column::AlbumId.eq(album_id))
        .filter(music_album_artists::Column::ArtistId.eq(artist_id))
        .filter(music_album_artists::Column::Role.eq("primary"))
        .one(db)
        .await?;
    if exists.is_none() {
        music_album_artists::Entity::insert(music_album_artists::ActiveModel {
            id: Set(Uuid::new_v4()),
            album_id: Set(album_id),
            artist_id: Set(artist_id),
            role: Set("primary".to_string()),
            sort_order: Set(0),
        })
        .exec(db)
        .await?;
    }
    Ok(())
}

async fn refresh_album_track_count<C: ConnectionTrait>(
    db: &C,
    album_id: Uuid,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let count = music_tracks::Entity::find()
        .filter(music_tracks::Column::AlbumId.eq(album_id))
        .count(db)
        .await?;
    if let Some(album) = music_albums::Entity::find_by_id(album_id).one(db).await? {
        let mut active: music_albums::ActiveModel = album.into();
        active.total_tracks = Set(Some(i32::try_from(count).unwrap_or(i32::MAX)));
        active.updated_at = Set(Some(Utc::now().fixed_offset()));
        active.update(db).await?;
    }
    Ok(())
}

fn parse_track(path: &Path) -> ParsedTrack {
    let title = path
        .file_stem()
        .and_then(|name| name.to_str())
        .map(clean_track_title)
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| "Unknown Track".to_string());
    let components: Vec<String> = path
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();

    tracing::info!(
        path = %path.display(),
        components = ?components,
        title = %title,
        "parse_track: analyzing path"
    );

    let album = components
        .len()
        .checked_sub(2)
        .and_then(|index| components.get(index))
        .map(|album| album.trim().to_string())
        .filter(|album| !album.is_empty())
        .unwrap_or_else(|| "Unknown Album".to_string());
    let artist = components
        .len()
        .checked_sub(3)
        .and_then(|index| components.get(index))
        .map(|artist| artist.trim().to_string())
        .filter(|artist| !artist.is_empty());

    tracing::info!(
        path = %path.display(),
        artist = ?artist,
        album = %album,
        title = %title,
        component_count = components.len(),
        "parse_track: result"
    );

    ParsedTrack {
        title,
        artist,
        album,
    }
}

fn clean_track_title(value: &str) -> String {
    let trimmed = value.trim();
    let without_number = trimmed
        .trim_start_matches(|ch: char| ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '_' || ch == ' ')
        .trim();
    if without_number.is_empty() {
        trimmed.to_string()
    } else {
        without_number.to_string()
    }
}

fn sort_title(value: &str) -> String {
    value.trim_start_matches("The ").to_ascii_lowercase()
}

fn track_number(path: &Path) -> Option<i32> {
    let stem = path.file_stem()?.to_str()?.trim();
    let digits: String = stem.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

fn mime_for_path(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "alac" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "aiff" => "audio/aiff",
        _ => return None,
    };
    Some(mime.to_string())
}

fn codec_for_path(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}
