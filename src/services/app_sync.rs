use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

use chrono::Utc;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, TransactionTrait};
use serde::Serialize;
use serde_json::json;
use tokimo_bus_client::BusClient;
use tokimo_vfs::Vfs;
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    bus_clients::jobs as jobs_client,
    db::{
        entities::{music_album_artists, music_albums, music_files, music_tracks},
        repos::MusicRepo,
    },
    error::{AppError, OptionExt},
    services::source::{SourceRegistry, normalize_source_path},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub total_files: u64,
    pub total_jobs: usize,
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
        bus_client: Arc<OnceLock<Arc<BusClient>>>,
        music_id: Uuid,
        user_id: Uuid,
    ) -> Result<SyncResult, AppError> {
        MusicRepo::update_sync_status(db, music_id, "syncing", None).await?;
        let result = run_sync(db, sources, &bus_client, music_id, user_id).await;
        match result {
            Ok(result) => {
                MusicRepo::update_sync_status(
                    db,
                    music_id,
                    "completed",
                    Some(Utc::now().fixed_offset()),
                )
                .await?;
                Ok(result)
            }
            Err(error) => {
                let _ = MusicRepo::update_sync_status(
                    db,
                    music_id,
                    "failed",
                    Some(Utc::now().fixed_offset()),
                )
                .await;
                Err(error)
            }
        }
    }
}

async fn run_sync(
    db: &DatabaseConnection,
    sources: &Arc<SourceRegistry>,
    bus_client: &Arc<OnceLock<Arc<BusClient>>>,
    music_id: Uuid,
    _user_id: Uuid,
) -> Result<SyncResult, AppError> {
    let music = MusicRepo::get_by_id(db, music_id)
        .await?
        .not_found(format!("music library {music_id} not found"))?;
    let source_roots = MusicRepo::parse_sources(&music.sources);
    info!(music_id = %music_id, source_count = source_roots.len(), "music sync: parsed sources");
    if source_roots.is_empty() {
        warn!(music_id = %music_id, "music sync: no sources configured, returning 0 jobs");
        return Ok(SyncResult {
            total_files: 0,
            total_jobs: 0,
        });
    }

    let Some(client) = bus_client.get() else {
        return Err(AppError::Internal(
            "bus client is not initialized; refusing to write jobs directly".into(),
        ));
    };

    let mut files = Vec::new();
    for (source_id, root_path, _) in source_roots {
        let source_id_str = source_id.to_string();
        info!(source_id = %source_id_str, root_path = %root_path, "music sync: resolving VFS source");
        let vfs = sources.ensure_vfs(&source_id_str).await.map_err(|error| {
            warn!(source_id = %source_id_str, %error, "music sync: ensure_vfs failed");
            AppError::Internal(format!("ensure VFS for source {source_id_str}: {error}"))
        })?;
        let root_path = normalize_source_path(&root_path).map_err(AppError::BadRequest)?;
        let mut source_files = collect_audio_files(&vfs, source_id, &root_path).await?;
        info!(source_id = %source_id_str, file_count = source_files.len(), "music sync: collected audio files");
        files.append(&mut source_files);
    }

    let total_files = files.len() as u64;
    info!(music_id = %music_id, total_files, "music sync: file collection done, creating jobs");
    let mut total_jobs = 0;

    for file in files {
        let request = jobs_client::CreateJobRequest::new(
            "music_scan",
            json!({
                "filePath": file.relative_path.to_string_lossy(),
                "fullPath": file.full_path.to_string_lossy(),
                "sourceRoot": file.source_root.to_string_lossy(),
                "sourceId": file.source_id.to_string(),
                "musicId": music_id.to_string(),
                "fileSize": file.size,
            }),
        );
        jobs_client::create(client, client.auto_caller("music"), request).await?;
        total_jobs += 1;
    }

    Ok(SyncResult {
        total_files,
        total_jobs,
    })
}

struct AudioFile {
    source_id: Uuid,
    full_path: PathBuf,
    relative_path: PathBuf,
    source_root: PathBuf,
    size: i64,
}

async fn collect_audio_files(
    vfs: &Vfs,
    source_id: Uuid,
    root_path: &str,
) -> Result<Vec<AudioFile>, AppError> {
    let mut files = Vec::new();
    let mut queue = VecDeque::from([PathBuf::from(root_path)]);
    let root = PathBuf::from(root_path);

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
                // Strip the root prefix so parse_track sees a relative path
                // like "Artist/Album/track.mp3" instead of
                // "/media/music/Artist/Album/track.mp3".
                let relative = path_buf.strip_prefix(&root).unwrap_or(&path_buf);
                tracing::info!(
                    full_path = %path_buf.display(),
                    relative_path = %relative.display(),
                    root = %root.display(),
                    "collect_audio_files: found audio file"
                );
                files.push(AudioFile {
                    source_id,
                    full_path: path_buf.clone(),
                    relative_path: relative.to_path_buf(),
                    source_root: root.clone(),
                    size: i64::try_from(entry.size).unwrap_or(i64::MAX),
                });
            }
        }
    }

    Ok(files)
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
