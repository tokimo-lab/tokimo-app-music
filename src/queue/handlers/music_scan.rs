//! `music_scan` job handler — processes a single audio file discovered during sync.
//!
//! Params: `{ "filePath", "sourceId", "musicId", "fileSize" }`

use std::collections::BTreeMap;
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
use crate::bus_clients::{app_events, jobs as jobs_client};

struct AudioMeta {
    artist: Option<String>,
    album: Option<String>,
    title: Option<String>,
    duration: Option<i32>,
    bitrate: Option<i32>,
    sample_rate: Option<i32>,
    codec: Option<String>,
}

pub async fn handle(
    db: &DatabaseConnection,
    state: &Arc<AppCtx>,
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
    let source_root = params
        .get("sourceRoot")
        .and_then(|v| v.as_str())
        .map(PathBuf::from);
    let full_path = params
        .get("fullPath")
        .and_then(|v| v.as_str())
        .map(PathBuf::from);

    let source_id = Uuid::parse_str(source_id_str)?;
    let music_id = Uuid::parse_str(music_id_str)?;
    let path = PathBuf::from(file_path);

    // Try to read metadata via ffprobe through VFS (needs full path for SMB access)
    let vfs_path = full_path.as_deref().unwrap_or(&path);
    let meta = probe_metadata(state, source_id_str, vfs_path, file_size).await;

    let file = AudioFile {
        source_id,
        path,
        source_root,
        size: file_size,
        meta,
    };

    let txn = db.begin().await?;
    let album_id = process_audio_file(&txn, music_id, &file).await?;
    txn.commit().await?;

    // Notify frontend to refresh
    if let (Some(uid), Some(client)) = (user_id, state.client.get()) {
        let _ = app_events::emit_entity(
            client,
            uid,
            "music_track",
            Some(format!("library:{music_id}")),
            json!({ "id": album_id.to_string(), "operation": "created", "libraryId": music_id.to_string() }),
        )
        .await;
    }

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
                    state.client.get().ok_or("bus client not initialized")?,
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

async fn probe_metadata(
    state: &Arc<AppCtx>,
    source_id: &str,
    path: &Path,
    file_size: i64,
) -> Option<AudioMeta> {
    let vfs = match state.sources.ensure_vfs(source_id).await {
        Ok(vfs) => vfs,
        Err(e) => {
            tracing::warn!(source_id = %source_id, error = %e, "ffprobe: ensure_vfs failed");
            return None;
        }
    };
    let ra = vfs.to_read_at(path).await;
    let filename_hint = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(str::to_string);
    let direct_input = tokimo_package_ffmpeg::DirectInput::from_read_at(
        ra,
        file_size as u64,
        filename_hint,
        Some(256 * 1024), // 256KB buffer is enough for ID3 tags
    );

    let result = tokio::task::spawn_blocking(move || {
        tokimo_package_ffmpeg::probe_direct(direct_input)
    })
    .await;

    let probe = match result {
        Ok(Ok(probe)) => probe,
        Ok(Err(e)) => {
            tracing::warn!(path = %path.display(), error = %e, "ffprobe: probe_direct failed");
            return None;
        }
        Err(e) => {
            tracing::warn!(path = %path.display(), error = %e, "ffprobe: spawn_blocking failed");
            return None;
        }
    };

    let tags = &probe.format.tags;
    tracing::info!(
        path = %path.display(),
        tags = ?tags,
        duration = %probe.format.duration,
        bit_rate = %probe.format.bit_rate,
        stream_count = probe.streams.len(),
        "ffprobe: extracted tags"
    );

    let audio_stream = probe.streams.iter().find(|s| s.codec_type == "audio");

    Some(AudioMeta {
        artist: tag_get(tags, "artist").or_else(|| tag_get(tags, "album_artist")),
        album: tag_get(tags, "album"),
        title: tag_get(tags, "title"),
        duration: probe.format.duration_secs().round().to_i32().filter(|&d| d > 0),
        bitrate: tag_get(tags, "bitrate")
            .and_then(|s| s.parse().ok())
            .or_else(|| probe.format.bit_rate.parse().ok()),
        sample_rate: audio_stream
            .and_then(|s| s.audio.as_ref())
            .and_then(|a| a.sample_rate.parse().ok()),
        codec: audio_stream.map(|s| s.codec_name.clone()),
    })
}

fn tag_get(tags: &BTreeMap<String, String>, key: &str) -> Option<String> {
    tags.get(key)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

trait RoundToInt32 {
    fn to_i32(&self) -> Option<i32>;
}

impl RoundToInt32 for f64 {
    fn to_i32(&self) -> Option<i32> {
        let rounded = self.round();
        if rounded >= 0.0 && rounded <= i32::MAX as f64 {
            Some(rounded as i32)
        } else {
            None
        }
    }
}

struct AudioFile {
    source_id: Uuid,
    path: PathBuf,
    source_root: Option<PathBuf>,
    size: i64,
    meta: Option<AudioMeta>,
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
    let fallback = parse_track(&file.path, file.source_root.as_deref());

    // Merge: ffprobe tags take priority, filename parsing as fallback
    let artist = file.meta.as_ref().and_then(|m| m.artist.as_deref())
        .or(fallback.artist.as_deref())
        .map(|s| s.to_string());
    let album = file.meta.as_ref().and_then(|m| m.album.as_deref())
        .unwrap_or(&fallback.album)
        .to_string();
    let title = file.meta.as_ref().and_then(|m| m.title.as_deref())
        .unwrap_or(&fallback.title)
        .to_string();

    tracing::info!(
        path = %file.path.display(),
        title = %title,
        artist = ?artist,
        album = %album,
        duration = ?file.meta.as_ref().and_then(|m| m.duration),
        bitrate = ?file.meta.as_ref().and_then(|m| m.bitrate),
        codec = ?file.meta.as_ref().and_then(|m| m.codec.as_deref()),
        has_ffprobe = file.meta.is_some(),
        ffprobe_artist = ?file.meta.as_ref().and_then(|m| m.artist.as_deref()),
        ffprobe_album = ?file.meta.as_ref().and_then(|m| m.album.as_deref()),
        ffprobe_title = ?file.meta.as_ref().and_then(|m| m.title.as_deref()),
        fallback_artist = ?fallback.artist.as_deref(),
        fallback_album = %fallback.album,
        fallback_title = %fallback.title,
        "music_scan: resolved track metadata"
    );

    let now = Utc::now().fixed_offset();
    let artist_id = match artist.as_deref() {
        Some(artist) => Some(find_or_create_artist(db, artist, now).await?),
        None => None,
    };
    let album_id = find_or_create_album(db, music_id, &album, now).await?;
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

    let parsed = ParsedTrack { title, artist, album };

    let track_id = match existing_file.as_ref().and_then(|f| f.track_id) {
        Some(track_id) => {
            if let Some(track) = music_tracks::Entity::find_by_id(track_id).one(db).await? {
                let mut active: music_tracks::ActiveModel = track.into();
                active.album_id = Set(album_id);
                active.title = Set(parsed.title.clone());
                active.genre = Set(None);
                active.duration = Set(file.meta.as_ref().and_then(|m| m.duration));
                active.codec = Set(file.meta.as_ref().and_then(|m| m.codec.clone()).or_else(|| codec_for_path(&file.path)));
                active.update(db).await?;
                track_id
            } else {
                insert_track(db, album_id, &parsed, &file.path, file.meta.as_ref()).await?
            }
        }
        None => insert_track(db, album_id, &parsed, &file.path, file.meta.as_ref()).await?,
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
    meta: Option<&AudioMeta>,
) -> Result<Uuid, Box<dyn std::error::Error + Send + Sync>> {
    let id = Uuid::new_v4();
    music_tracks::Entity::insert(music_tracks::ActiveModel {
        id: Set(id),
        album_id: Set(album_id),
        title: Set(parsed.title.clone()),
        track_number: Set(track_number(path)),
        disc_number: Set(None),
        duration: Set(meta.and_then(|m| m.duration)),
        genre: Set(None),
        bitrate: Set(meta.and_then(|m| m.bitrate)),
        sample_rate: Set(meta.and_then(|m| m.sample_rate)),
        codec: Set(meta.and_then(|m| m.codec.clone()).or_else(|| codec_for_path(path))),
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

fn parse_track(path: &Path, source_root: Option<&Path>) -> ParsedTrack {
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

    // Extract album from path (2nd-to-last component)
    let mut album = components
        .len()
        .checked_sub(2)
        .and_then(|index| components.get(index))
        .map(|album| album.trim().to_string())
        .filter(|album| !album.is_empty());

    // Extract artist from path (3rd-to-last component)
    let mut artist = components
        .len()
        .checked_sub(3)
        .and_then(|index| components.get(index))
        .map(|artist| artist.trim().to_string())
        .filter(|artist| !artist.is_empty());

    // Fallback: try "Artist-Title.mp3" filename pattern first (higher priority)
    if artist.is_none() {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if let Some((a, _t)) = stem.split_once('-') {
                let trimmed = a.trim();
                if !trimmed.is_empty() {
                    artist = Some(trimmed.to_string());
                }
            }
        }
    }

    // Fallback: for flat structures, extract artist from source_root last directory.
    // source_root is like "/media/music-mp3/#MP3/Beyond/" — the last meaningful
    // directory is typically the artist.
    if artist.is_none() && components.len() < 3 {
        if let Some(root) = source_root {
            artist = last_meaningful_dir(root);
        }
    }

    // Don't use generic source_root parent dirs as album — only use path components.
    if album.is_none() {
        album = Some("Unknown Album".to_string());
    }

    if album.is_none() {
        album = Some("Unknown Album".to_string());
    }

    tracing::info!(
        path = %path.display(),
        source_root = ?source_root,
        artist = ?artist,
        album = %album.as_deref().unwrap_or("Unknown Album"),
        title = %title,
        component_count = components.len(),
        "parse_track: result"
    );

    ParsedTrack {
        title,
        artist,
        album: album.unwrap_or_else(|| "Unknown Album".to_string()),
    }
}

/// Extract the last meaningful directory name from a path, skipping generic
/// names like "#MP3", "music", "mp3".
fn last_meaningful_dir(path: &Path) -> Option<String> {
    path.components()
        .filter_map(|c| match c {
            std::path::Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s.starts_with('#')
                    || s.eq_ignore_ascii_case("music")
                    || s.eq_ignore_ascii_case("mp3")
                {
                    None
                } else {
                    Some(s.to_string())
                }
            }
            _ => None,
        })
        .last()
        .filter(|s| !s.is_empty())
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
