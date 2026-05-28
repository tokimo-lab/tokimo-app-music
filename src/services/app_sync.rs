use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseConnection,
    EntityTrait, PaginatorTrait, QueryFilter, TransactionTrait,
};
use serde::Serialize;
use serde_json::json;
use tokimo_bus_client::BusClient;
use tokimo_vfs::Vfs;
use tracing::warn;
use uuid::Uuid;

use crate::{
    bus_clients::jobs::{self as jobs_client, CreateJobRequest},
    db::{
        entities::{albums, artists, genres, libraries, tracks},
        repos::{libraries_repo::LibrariesRepo, sync_status_repo::SyncStatusRepo},
    },
    error::AppError,
    services::source::{SourceRegistry, normalize_source_path},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub total_files: u64,
    pub albums_seen: u64,
    pub scrape_jobs: u64,
}

#[derive(Debug, Clone)]
struct AudioFile {
    path: PathBuf,
    size_bytes: i64,
}

#[derive(Debug)]
struct ParsedTrack {
    title: String,
    artist: Option<String>,
    album: Option<String>,
}

pub struct AppSyncService;

impl AppSyncService {
    #[allow(dead_code)]
    pub async fn clear_library_data(
        db: &DatabaseConnection,
        library_id: Uuid,
    ) -> Result<(), AppError> {
        let txn = db.begin().await?;
        tracks::Entity::delete_many()
            .filter(tracks::Column::LibraryId.eq(library_id))
            .exec(&txn)
            .await?;
        albums::Entity::delete_many()
            .filter(albums::Column::LibraryId.eq(library_id))
            .exec(&txn)
            .await?;
        artists::Entity::delete_many()
            .filter(artists::Column::LibraryId.eq(library_id))
            .exec(&txn)
            .await?;
        genres::Entity::delete_many()
            .filter(genres::Column::LibraryId.eq(library_id))
            .exec(&txn)
            .await?;
        txn.commit().await?;
        Ok(())
    }

    pub async fn execute_music_sync(
        db: DatabaseConnection,
        sources: Arc<SourceRegistry>,
        bus_client: Arc<OnceLock<Arc<BusClient>>>,
        library_id: Uuid,
    ) -> Result<(), AppError> {
        SyncStatusRepo::upsert_status(
            &db,
            library_id,
            "syncing",
            None,
            Some(json!({ "phase": "scan" })),
        )
        .await?;

        let library = LibrariesRepo::find_by_id(&db, library_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("library {library_id} not found")))?;
        let source_id = library.source_id.ok_or_else(|| {
            AppError::BadRequest(format!("library {library_id} has no source_id"))
        })?;
        let root_path = normalize_source_path(&library.root_path).map_err(AppError::BadRequest)?;
        let source_id_str = source_id.to_string();
        let vfs = sources.ensure_vfs(&source_id_str).await.map_err(|error| {
            AppError::Internal(format!("ensure VFS for source {source_id_str}: {error}"))
        })?;

        let files = collect_audio_files(&vfs, &root_path).await?;
        let mut seen_albums = Vec::new();

        for file in files.iter().cloned() {
            match process_audio_file_txn(&db, &library, file).await {
                Ok(Some(album_id)) if !seen_albums.contains(&album_id) => {
                    seen_albums.push(album_id)
                }
                Ok(_) => {}
                Err(error) => warn!(%error, library_id = %library_id, "music sync skipped file"),
            }
        }

        let mut scrape_jobs = 0;
        if let Some(client) = bus_client.get() {
            for album_id in &seen_albums {
                if album_needs_scrape(&db, *album_id).await? {
                    let request = CreateJobRequest {
                        job_type: "music_scrape".to_string(),
                        params: json!({
                            "albumId": album_id,
                            "libraryId": library_id,
                        }),
                        data: None,
                        parent_job_id: None,
                        task_type: Some("music_scrape".to_string()),
                        dedupe_key: Some(format!("music_scrape:{album_id}")),
                        priority: None,
                    };
                    match jobs_client::create(client, jobs_client::service_caller(), request).await
                    {
                        Ok(_) => scrape_jobs += 1,
                        Err(error) => {
                            warn!(%error, album_id = %album_id, "music scrape job dispatch failed")
                        }
                    }
                }
            }
        } else {
            warn!(library_id = %library_id, "music sync completed without bus client; skipping scrape jobs");
        }

        let result = SyncResult {
            total_files: files.len() as u64,
            albums_seen: seen_albums.len() as u64,
            scrape_jobs,
        };
        SyncStatusRepo::upsert_status(
            &db,
            library_id,
            "completed",
            None,
            Some(
                serde_json::to_value(&result)
                    .map_err(|error| AppError::Internal(format!("sync result encode: {error}")))?,
            ),
        )
        .await?;
        Ok(())
    }
}

async fn collect_audio_files(vfs: &Vfs, root_path: &str) -> Result<Vec<AudioFile>, AppError> {
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
                    path: path_buf,
                    size_bytes: i64::try_from(entry.size).unwrap_or(i64::MAX),
                });
            }
        }
    }

    Ok(files)
}

async fn process_audio_file_txn(
    db: &DatabaseConnection,
    library: &libraries::Model,
    file: AudioFile,
) -> Result<Option<Uuid>, AppError> {
    let txn = db.begin().await?;
    let result = process_audio_file(&txn, library, file).await;
    match result {
        Ok(album_id) => {
            txn.commit().await?;
            Ok(album_id)
        }
        Err(error) => {
            txn.rollback().await?;
            Err(error)
        }
    }
}

async fn process_audio_file(
    db: &impl ConnectionTrait,
    library: &libraries::Model,
    file: AudioFile,
) -> Result<Option<Uuid>, AppError> {
    let parsed = parse_track(&file.path);
    let now = Utc::now().fixed_offset();
    let artist_id = match parsed.artist.as_deref() {
        Some(artist) => Some(find_or_create_artist(db, library.id, artist, now).await?),
        None => None,
    };
    let album_id = match parsed.album.as_deref() {
        Some(album) => {
            Some(find_or_create_album(db, library.id, album, parsed.artist.as_deref(), now).await?)
        }
        None => None,
    };

    let file_path = file.path.to_string_lossy().to_string();
    if let Some(existing) = tracks::Entity::find()
        .filter(tracks::Column::LibraryId.eq(library.id))
        .filter(tracks::Column::FilePath.eq(file_path.clone()))
        .one(db)
        .await?
    {
        let mut active: tracks::ActiveModel = existing.into();
        active.title = Set(Some(parsed.title));
        active.artist = Set(parsed.artist.clone());
        active.album = Set(parsed.album.clone());
        active.size_bytes = Set(Some(file.size_bytes));
        active.mime = Set(mime_for_path(&file.path));
        active.album_id = Set(album_id);
        active.artist_id = Set(artist_id);
        active.updated_at = Set(now);
        active.update(db).await?;
    } else {
        tracks::Entity::insert(tracks::ActiveModel {
            id: Set(Uuid::new_v4()),
            library_id: Set(Some(library.id)),
            file_path: Set(file_path),
            title: Set(Some(parsed.title)),
            artist: Set(parsed.artist.clone()),
            album: Set(parsed.album.clone()),
            duration_secs: Set(None),
            size_bytes: Set(Some(file.size_bytes)),
            mime: Set(mime_for_path(&file.path)),
            album_id: Set(album_id),
            artist_id: Set(artist_id),
            genre_id: Set(None),
            lyrics_text: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        })
        .exec(db)
        .await?;
    }

    if let Some(album_id) = album_id {
        let track_count = tracks::Entity::find()
            .filter(tracks::Column::AlbumId.eq(album_id))
            .count(db)
            .await?;
        if let Some(album) = albums::Entity::find_by_id(album_id).one(db).await? {
            let mut active: albums::ActiveModel = album.into();
            active.track_count = Set(i32::try_from(track_count).unwrap_or(i32::MAX));
            active.updated_at = Set(now);
            active.update(db).await?;
        }
        return Ok(Some(album_id));
    }

    Ok(None)
}

async fn find_or_create_artist(
    db: &impl ConnectionTrait,
    library_id: Uuid,
    name: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, AppError> {
    if let Some(model) = artists::Entity::find()
        .filter(artists::Column::LibraryId.eq(library_id))
        .filter(artists::Column::Name.eq(name.to_string()))
        .one(db)
        .await?
    {
        return Ok(model.id);
    }

    let id = Uuid::new_v4();
    artists::Entity::insert(artists::ActiveModel {
        id: Set(id),
        library_id: Set(Some(library_id)),
        name: Set(name.to_string()),
        bio: Set(None),
        photo_url: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .exec(db)
    .await?;
    Ok(id)
}

async fn find_or_create_album(
    db: &impl ConnectionTrait,
    library_id: Uuid,
    name: &str,
    artist: Option<&str>,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<Uuid, AppError> {
    let mut query = albums::Entity::find()
        .filter(albums::Column::LibraryId.eq(library_id))
        .filter(albums::Column::Name.eq(name.to_string()));
    query = match artist {
        Some(artist) => query.filter(albums::Column::Artist.eq(artist.to_string())),
        None => query.filter(albums::Column::Artist.is_null()),
    };
    if let Some(model) = query.one(db).await? {
        return Ok(model.id);
    }

    let id = Uuid::new_v4();
    albums::Entity::insert(albums::ActiveModel {
        id: Set(id),
        library_id: Set(Some(library_id)),
        name: Set(name.to_string()),
        artist: Set(artist.map(str::to_string)),
        year: Set(None),
        cover_url: Set(None),
        is_favorite: Set(false),
        track_count: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .exec(db)
    .await?;
    Ok(id)
}

async fn album_needs_scrape(db: &impl ConnectionTrait, album_id: Uuid) -> Result<bool, AppError> {
    Ok(albums::Entity::find_by_id(album_id)
        .one(db)
        .await?
        .is_some_and(|album| album.cover_url.is_none() || album.year.is_none()))
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
        .map(|album| crate::services::scrape::music::MusicScrapeService::extract_clean_title(album))
        .filter(|album| !album.is_empty());
    let artist = components
        .len()
        .checked_sub(3)
        .and_then(|index| components.get(index))
        .map(|artist| artist.trim().to_string())
        .filter(|artist| !artist.is_empty());

    ParsedTrack {
        title,
        artist,
        album,
    }
}

fn clean_track_title(value: &str) -> String {
    let trimmed = value.trim();
    let without_number = trimmed
        .trim_start_matches(|ch: char| {
            ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '_' || ch == ' '
        })
        .trim();
    if without_number.is_empty() {
        trimmed.to_string()
    } else {
        without_number.to_string()
    }
}

fn is_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp3" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wav" | "aiff" | "alac"
            )
        })
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
