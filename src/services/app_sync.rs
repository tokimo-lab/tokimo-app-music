use std::{collections::{HashSet, VecDeque}, path::{Path, PathBuf}, sync::Arc};

use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter, TransactionTrait};
use serde::Serialize;
use tokimo_vfs::Vfs;
use tracing::warn;
use uuid::Uuid;

use crate::{
    db::{
        entities::{music_album_artists, music_albums, music_artists, music_files, music_tracks},
        repos::MusicRepo,
    },
    error::{AppError, OptionExt},
    services::{source::{SourceRegistry, normalize_source_path}, storage::StorageProvider},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub total_files: u64,
    pub total_jobs: usize,
}

#[derive(Debug, Clone)]
struct AudioFile {
    source_id: Uuid,
    path: PathBuf,
    size: i64,
}

#[derive(Debug)]
struct ParsedTrack {
    title: String,
    artist: Option<String>,
    album: String,
}

pub struct AppSyncService;

impl AppSyncService {
    pub async fn clear_library_data(
        db: &DatabaseConnection,
        music_id: Uuid,
        _music_type: &str,
    ) -> Result<(), AppError> {
        let txn = db.begin().await?;
        let albums = music_albums::Entity::find()
            .filter(music_albums::Column::MusicId.eq(music_id))
            .all(&txn)
            .await?;
        let album_ids: Vec<Uuid> = albums.iter().map(|album| album.id).collect();

        if !album_ids.is_empty() {
            let tracks = music_tracks::Entity::find()
                .filter(music_tracks::Column::AlbumId.is_in(album_ids.clone()))
                .all(&txn)
                .await?;
            let track_ids: Vec<Uuid> = tracks.iter().map(|track| track.id).collect();

            if !track_ids.is_empty() {
                music_files::Entity::delete_many()
                    .filter(music_files::Column::TrackId.is_in(track_ids.clone()))
                    .exec(&txn)
                    .await?;
                music_tracks::Entity::delete_many()
                    .filter(music_tracks::Column::Id.is_in(track_ids))
                    .exec(&txn)
                    .await?;
            }

            music_album_artists::Entity::delete_many()
                .filter(music_album_artists::Column::AlbumId.is_in(album_ids.clone()))
                .exec(&txn)
                .await?;
            music_albums::Entity::delete_many()
                .filter(music_albums::Column::Id.is_in(album_ids))
                .exec(&txn)
                .await?;
        }
        txn.commit().await?;
        Ok(())
    }

    pub async fn execute_music_sync(
        db: &DatabaseConnection,
        sources: &Arc<SourceRegistry>,
        _storage: &Arc<dyn StorageProvider>,
        music_id: Uuid,
        _force: bool,
        _user_id: Option<Uuid>,
    ) -> Result<SyncResult, AppError> {
        MusicRepo::update_sync_status(db, music_id, "syncing", None).await?;
        let result = run_sync(db, sources, music_id).await;
        match result {
            Ok(result) => {
                MusicRepo::update_sync_status(db, music_id, "completed", Some(Utc::now().fixed_offset())).await?;
                Ok(result)
            }
            Err(error) => {
                let _ = MusicRepo::update_sync_status(db, music_id, "failed", Some(Utc::now().fixed_offset())).await;
                Err(error)
            }
        }
    }
}

async fn run_sync(
    db: &DatabaseConnection,
    sources: &Arc<SourceRegistry>,
    music_id: Uuid,
) -> Result<SyncResult, AppError> {
    let music = MusicRepo::get_by_id(db, music_id)
        .await?
        .not_found(format!("music library {music_id} not found"))?;
    let source_roots = MusicRepo::parse_sources(&music.sources);
    if source_roots.is_empty() {
        return Ok(SyncResult { total_files: 0, total_jobs: 0 });
    }

    let mut files = Vec::new();
    for (source_id, root_path, _) in source_roots {
        let source_id_str = source_id.to_string();
        let vfs = sources.ensure_vfs(&source_id_str).await.map_err(|error| {
            AppError::Internal(format!("ensure VFS for source {source_id_str}: {error}"))
        })?;
        let root_path = normalize_source_path(&root_path).map_err(AppError::BadRequest)?;
        let mut source_files = collect_audio_files(&vfs, source_id, &root_path).await?;
        files.append(&mut source_files);
    }

    let mut album_ids = HashSet::new();
    let total_files = files.len() as u64;
    for file in files {
        match process_audio_file_txn(db, music_id, file).await {
            Ok(album_id) => {
                album_ids.insert(album_id);
            }
            Err(error) => warn!(%error, music_id = %music_id, "music sync skipped file"),
        }
    }

    Ok(SyncResult { total_files, total_jobs: album_ids.len() })
}

async fn collect_audio_files(vfs: &Vfs, source_id: Uuid, root_path: &str) -> Result<Vec<AudioFile>, AppError> {
    let mut files = Vec::new();
    let mut queue = VecDeque::from([PathBuf::from(root_path)]);

    while let Some(dir) = queue.pop_front() {
        let entries = vfs
            .list(&dir)
            .await
            .map_err(|error| AppError::Internal(format!("VFS list {}: {error}", dir.display())))?;
        for entry in entries {
            let path = normalize_source_path(&entry.path).map_err(AppError::BadRequest)?;
            let path_buf = PathBuf::from(&path);
            if entry.is_dir {
                queue.push_back(path_buf);
            } else if is_audio_path(&path_buf) {
                files.push(AudioFile {
                    source_id,
                    path: path_buf,
                    size: i64::try_from(entry.size).unwrap_or(i64::MAX),
                });
            }
        }
    }

    Ok(files)
}

async fn process_audio_file_txn(
    db: &DatabaseConnection,
    music_id: Uuid,
    file: AudioFile,
) -> Result<Uuid, AppError> {
    let txn = db.begin().await?;
    let album_id = process_audio_file(&txn, music_id, file).await?;
    txn.commit().await?;
    Ok(album_id)
}

async fn process_audio_file<C: ConnectionTrait>(
    db: &C,
    music_id: Uuid,
    file: AudioFile,
) -> Result<Uuid, AppError> {
    let parsed = parse_track(&file.path);
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
    let filename = file.path.file_name().and_then(|name| name.to_str()).unwrap_or("audio").to_string();
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
        }).exec(db).await?;
    }

    refresh_album_track_count(db, album_id).await?;
    Ok(album_id)
}

async fn insert_track<C: ConnectionTrait>(
    db: &C,
    album_id: Uuid,
    parsed: &ParsedTrack,
    path: &Path,
) -> Result<Uuid, AppError> {
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
    }).exec(db).await?;
    Ok(id)
}

async fn find_or_create_artist<C: ConnectionTrait>(
    db: &C,
    name: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, AppError> {
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
    }).exec(db).await?;
    Ok(id)
}

async fn find_or_create_album<C: ConnectionTrait>(
    db: &C,
    music_id: Uuid,
    title: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, AppError> {
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
    }).exec(db).await?;
    Ok(id)
}

async fn ensure_album_artist<C: ConnectionTrait>(db: &C, album_id: Uuid, artist_id: Uuid) -> Result<(), AppError> {
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
        }).exec(db).await?;
    }
    Ok(())
}

async fn refresh_album_track_count<C: ConnectionTrait>(db: &C, album_id: Uuid) -> Result<(), AppError> {
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

    ParsedTrack { title, artist, album }
}

fn clean_track_title(value: &str) -> String {
    let trimmed = value.trim();
    let without_number = trimmed
        .trim_start_matches(|ch: char| ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '_' || ch == ' ')
        .trim();
    if without_number.is_empty() { trimmed.to_string() } else { without_number.to_string() }
}

fn sort_title(value: &str) -> String {
    value.trim_start_matches("The ").to_ascii_lowercase()
}

fn track_number(path: &Path) -> Option<i32> {
    let stem = path.file_stem()?.to_str()?.trim();
    let digits: String = stem.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

fn is_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "mp3" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wav" | "aiff" | "alac"))
        .unwrap_or(false)
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
