use crate::db::ApiDateTimeExt;
use sea_orm::prelude::Expr;
use sea_orm::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::db::entities::{music_albums, music_tracks, playlist_items, playlists};
use crate::error::AppError;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_path: Option<String>,
    pub is_public: bool,
    pub track_count: i64,
    pub total_duration: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MusicTrackDto {
    pub id: String,
    pub album_id: String,
    pub album_title: String,
    pub title: String,
    pub artist_name: Option<String>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub duration: Option<i32>,
    pub cover_path: Option<String>,
    pub file_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItemDto {
    pub id: String,
    pub sort_order: i32,
    pub added_at: String,
    pub track: Option<MusicTrackDto>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDetailDto {
    #[serde(flatten)]
    pub base: PlaylistDto,
    pub items: Vec<PlaylistItemDto>,
}

pub struct PlaylistRepo;

impl PlaylistRepo {
    pub async fn list(
        db: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<Vec<PlaylistDto>, AppError> {
        let playlists_list = playlists::Entity::find()
            .filter(playlists::Column::UserId.eq(user_id))
            .order_by_desc(playlists::Column::UpdatedAt)
            .all(db)
            .await?;

        if playlists_list.is_empty() {
            return Ok(Vec::new());
        }

        let playlist_ids: Vec<Uuid> = playlists_list.iter().map(|p| p.id).collect();

        // Batch: count items per playlist
        let all_items = playlist_items::Entity::find()
            .filter(playlist_items::Column::PlaylistId.is_in(playlist_ids.clone()))
            .all(db)
            .await?;

        let mut count_map: HashMap<Uuid, i64> = HashMap::new();
        let mut track_ids_by_playlist: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
        for item in &all_items {
            *count_map.entry(item.playlist_id).or_default() += 1;
            if let Some(tid) = item.track_id {
                track_ids_by_playlist
                    .entry(item.playlist_id)
                    .or_default()
                    .push(tid);
            }
        }

        // Batch: fetch all referenced tracks at once
        let all_track_ids: Vec<Uuid> = track_ids_by_playlist.values().flatten().copied().collect();
        let duration_map: HashMap<Uuid, i32> = if !all_track_ids.is_empty() {
            music_tracks::Entity::find()
                .filter(music_tracks::Column::Id.is_in(all_track_ids))
                .all(db)
                .await?
                .into_iter()
                .filter_map(|t| t.duration.map(|d| (t.id, d)))
                .collect()
        } else {
            HashMap::new()
        };

        let results = playlists_list
            .into_iter()
            .map(|p| {
                let item_count = count_map.get(&p.id).copied().unwrap_or(0);
                let total_duration = track_ids_by_playlist
                    .get(&p.id)
                    .map(|tids| {
                        tids.iter()
                            .filter_map(|tid| duration_map.get(tid))
                            .map(|&d| d as i64)
                            .sum::<i64>()
                    })
                    .filter(|&sum| sum > 0);

                PlaylistDto {
                    id: p.id.to_string(),
                    name: p.name,
                    description: p.description,
                    cover_path: p.cover_path,
                    is_public: p.is_public,
                    track_count: item_count,
                    total_duration,
                    created_at: p.created_at.to_api_datetime(),
                    updated_at: p.updated_at.to_api_datetime(),
                }
            })
            .collect();

        Ok(results)
    }

    pub async fn get_by_id(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<PlaylistDetailDto>, AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Ok(None);
        };

        if playlist.user_id != user_id && !playlist.is_public {
            return Err(AppError::Forbidden("无权限访问此播放列表".into()));
        }

        let items = playlist_items::Entity::find()
            .filter(playlist_items::Column::PlaylistId.eq(playlist_id))
            .order_by_asc(playlist_items::Column::SortOrder)
            .all(db)
            .await?;

        let track_ids: Vec<Uuid> = items.iter().filter_map(|i| i.track_id).collect();

        let tracks = if !track_ids.is_empty() {
            music_tracks::Entity::find()
                .filter(music_tracks::Column::Id.is_in(track_ids))
                .find_also_related(music_albums::Entity)
                .all(db)
                .await?
        } else {
            vec![]
        };

        let track_map: std::collections::HashMap<
            Uuid,
            (music_tracks::Model, Option<music_albums::Model>),
        > = tracks.into_iter().map(|(t, a)| (t.id, (t, a))).collect();

        // Batch-fetch artist names for all album IDs
        let album_ids: Vec<Uuid> = track_map
            .values()
            .filter_map(|(_, a)| a.as_ref().map(|a| a.id))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        let artist_map: HashMap<Uuid, String> = if !album_ids.is_empty() {
            let placeholders: Vec<String> = album_ids
                .iter()
                .enumerate()
                .map(|(i, _)| format!("${}", i + 1))
                .collect();
            let sql = format!(
                "SELECT DISTINCT ON (mc.album_id) mc.album_id, p.name \
                 FROM media_credits mc JOIN persons p ON p.id = mc.person_id \
                 WHERE mc.album_id IN ({}) AND mc.role IN ('artist', 'albumArtist')",
                placeholders.join(", ")
            );
            let params: Vec<sea_orm::Value> = album_ids.iter().map(|id| (*id).into()).collect();
            let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, &sql, params);
            db.query_all_raw(stmt)
                .await?
                .iter()
                .filter_map(|r| {
                    let album_id: Uuid = r.try_get_by_index(0).ok()?;
                    let name: String = r.try_get_by_index(1).ok()?;
                    Some((album_id, name))
                })
                .collect()
        } else {
            HashMap::new()
        };

        let mut total_duration: i64 = 0;
        let mut item_dtos = Vec::new();
        for item in &items {
            let track_dto = if let Some(tid) = item.track_id {
                if let Some((track, album)) = track_map.get(&tid) {
                    if let Some(d) = track.duration {
                        total_duration += d as i64;
                    }
                    Some(MusicTrackDto {
                        id: track.id.to_string(),
                        album_id: track.album_id.to_string(),
                        album_title: album.as_ref().map(|a| a.title.clone()).unwrap_or_default(),
                        title: track.title.clone(),
                        artist_name: album.as_ref().and_then(|a| artist_map.get(&a.id).cloned()),
                        track_number: track.track_number,
                        disc_number: track.disc_number,
                        duration: track.duration,
                        cover_path: album.as_ref().and_then(|a| a.cover_path.clone()),
                        file_id: None,
                    })
                } else {
                    None
                }
            } else {
                None
            };

            item_dtos.push(PlaylistItemDto {
                id: item.id.to_string(),
                sort_order: item.sort_order,
                added_at: item.added_at.to_api_datetime(),
                track: track_dto,
            });
        }

        let item_count = items.len() as i64;
        Ok(Some(PlaylistDetailDto {
            base: PlaylistDto {
                id: playlist.id.to_string(),
                name: playlist.name,
                description: playlist.description,
                cover_path: playlist.cover_path,
                is_public: playlist.is_public,
                track_count: item_count,
                total_duration: if total_duration > 0 {
                    Some(total_duration)
                } else {
                    None
                },
                created_at: playlist.created_at.to_api_datetime(),
                updated_at: playlist.updated_at.to_api_datetime(),
            },
            items: item_dtos,
        }))
    }

    pub async fn create(
        db: &DatabaseConnection,
        user_id: Uuid,
        name: String,
        description: Option<String>,
    ) -> Result<PlaylistDto, AppError> {
        let now = chrono::Utc::now().fixed_offset();
        let model = playlists::ActiveModel {
            id: Set(Uuid::new_v4()),
            user_id: Set(user_id),
            name: Set(name.clone()),
            description: Set(description.clone()),
            cover_path: Set(None),
            is_public: Set(false),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let result = playlists::Entity::insert(model).exec(db).await?;
        let id = result.last_insert_id;
        Ok(PlaylistDto {
            id: id.to_string(),
            name,
            description,
            cover_path: None,
            is_public: false,
            track_count: 0,
            total_duration: None,
            created_at: now.to_api_datetime(),
            updated_at: now.to_api_datetime(),
        })
    }

    pub async fn update(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
        name: Option<String>,
        description: Option<Option<String>>,
        cover_path: Option<Option<String>>,
        is_public: Option<bool>,
    ) -> Result<Option<PlaylistDto>, AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Ok(None);
        };
        if playlist.user_id != user_id {
            return Err(AppError::Forbidden("无权限".into()));
        }

        let now = chrono::Utc::now().fixed_offset();
        let mut active: playlists::ActiveModel = playlist.into();
        if let Some(n) = name {
            active.name = Set(n);
        }
        if let Some(d) = description {
            active.description = Set(d);
        }
        if let Some(c) = cover_path {
            active.cover_path = Set(c);
        }
        if let Some(p) = is_public {
            active.is_public = Set(p);
        }
        active.updated_at = Set(now);
        let updated = active.update(db).await?;

        let item_count = playlist_items::Entity::find()
            .filter(playlist_items::Column::PlaylistId.eq(playlist_id))
            .count(db)
            .await? as i64;

        Ok(Some(PlaylistDto {
            id: updated.id.to_string(),
            name: updated.name,
            description: updated.description,
            cover_path: updated.cover_path,
            is_public: updated.is_public,
            track_count: item_count,
            total_duration: None,
            created_at: updated.created_at.to_api_datetime(),
            updated_at: updated.updated_at.to_api_datetime(),
        }))
    }

    pub async fn delete(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Ok(false);
        };
        if playlist.user_id != user_id {
            return Err(AppError::Forbidden("无权限".into()));
        }
        playlists::Entity::delete_by_id(playlist_id)
            .exec(db)
            .await?;
        Ok(true)
    }

    pub async fn add_tracks(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
        track_ids: Vec<String>,
    ) -> Result<(), AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Err(AppError::NotFound("播放列表不存在".into()));
        };
        if playlist.user_id != user_id {
            return Err(AppError::Forbidden("无权限".into()));
        }

        let last = playlist_items::Entity::find()
            .filter(playlist_items::Column::PlaylistId.eq(playlist_id))
            .order_by_desc(playlist_items::Column::SortOrder)
            .one(db)
            .await?;
        let mut next_order = last.map(|i| i.sort_order + 1).unwrap_or(0);
        let now = chrono::Utc::now().fixed_offset();

        for tid_str in &track_ids {
            let tid = Uuid::parse_str(tid_str)
                .map_err(|_| AppError::BadRequest("无效的 track ID".into()))?;
            let model = playlist_items::ActiveModel {
                id: Set(Uuid::new_v4()),
                playlist_id: Set(playlist_id),
                movie_id: Set(None),
                episode_id: Set(None),
                track_id: Set(Some(tid)),
                sort_order: Set(next_order),
                added_at: Set(now),
            };
            playlist_items::Entity::insert(model).exec(db).await?;
            next_order += 1;
        }

        let mut active: playlists::ActiveModel = playlist.into();
        active.updated_at = Set(now);
        active.update(db).await?;
        Ok(())
    }

    pub async fn remove_items(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
        item_ids: Vec<String>,
    ) -> Result<(), AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Err(AppError::NotFound("播放列表不存在".into()));
        };
        if playlist.user_id != user_id {
            return Err(AppError::Forbidden("无权限".into()));
        }

        let uuids: Vec<Uuid> = item_ids
            .iter()
            .filter_map(|s| Uuid::parse_str(s).ok())
            .collect();

        playlist_items::Entity::delete_many()
            .filter(playlist_items::Column::Id.is_in(uuids))
            .filter(playlist_items::Column::PlaylistId.eq(playlist_id))
            .exec(db)
            .await?;

        // Re-index sort_order
        let remaining = playlist_items::Entity::find()
            .filter(playlist_items::Column::PlaylistId.eq(playlist_id))
            .order_by_asc(playlist_items::Column::SortOrder)
            .all(db)
            .await?;

        for (idx, item) in remaining.iter().enumerate() {
            let mut active: playlist_items::ActiveModel = item.clone().into();
            active.sort_order = Set(idx as i32);
            active.update(db).await?;
        }

        let now = chrono::Utc::now().fixed_offset();
        let mut active: playlists::ActiveModel = playlist.into();
        active.updated_at = Set(now);
        active.update(db).await?;
        Ok(())
    }

    pub async fn reorder(
        db: &DatabaseConnection,
        playlist_id: Uuid,
        user_id: Uuid,
        item_ids: Vec<String>,
    ) -> Result<(), AppError> {
        let playlist = playlists::Entity::find_by_id(playlist_id).one(db).await?;
        let Some(playlist) = playlist else {
            return Err(AppError::NotFound("播放列表不存在".into()));
        };
        if playlist.user_id != user_id {
            return Err(AppError::Forbidden("无权限".into()));
        }

        for (idx, id_str) in item_ids.iter().enumerate() {
            let uid = Uuid::parse_str(id_str)
                .map_err(|_| AppError::BadRequest("无效的 item ID".into()))?;
            playlist_items::Entity::update_many()
                .col_expr(playlist_items::Column::SortOrder, Expr::value(idx as i32))
                .filter(playlist_items::Column::Id.eq(uid))
                .exec(db)
                .await?;
        }

        let now = chrono::Utc::now().fixed_offset();
        let mut active: playlists::ActiveModel = playlist.into();
        active.updated_at = Set(now);
        active.update(db).await?;
        Ok(())
    }
}
