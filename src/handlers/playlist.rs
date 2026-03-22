use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::db::repos::playlist_repo::PlaylistRepo;
use crate::error::AppError;
use crate::handlers::{ok, ok_empty, user::AuthUser};
use crate::AppState;

// ── Request bodies ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaylistInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlaylistInput {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub cover_path: Option<Option<String>>,
    pub is_public: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTracksInput {
    pub track_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveItemsInput {
    pub item_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderInput {
    pub item_ids: Vec<String>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn list_playlists(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    match PlaylistRepo::list(&state.db, user_id).await {
        Ok(playlists) => ok(playlists).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn get_playlist(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::get_by_id(&state.db, playlist_id, user_id).await {
        Ok(Some(detail)) => ok(detail).into_response(),
        Ok(None) => AppError::NotFound("播放列表不存在".into()).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn create_playlist(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Json(input): Json<CreatePlaylistInput>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    match PlaylistRepo::create(&state.db, user_id, input.name, input.description).await {
        Ok(playlist) => ok(playlist).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn update_playlist(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<UpdatePlaylistInput>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::update(
        &state.db,
        playlist_id,
        user_id,
        input.name,
        input.description,
        input.cover_path,
        input.is_public,
    )
    .await
    {
        Ok(Some(playlist)) => ok(playlist).into_response(),
        Ok(None) => AppError::NotFound("播放列表不存在".into()).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn delete_playlist(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::delete(&state.db, playlist_id, user_id).await {
        Ok(true) => ok_empty().into_response(),
        Ok(false) => AppError::NotFound("播放列表不存在".into()).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn add_tracks(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<AddTracksInput>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::add_tracks(&state.db, playlist_id, user_id, input.track_ids).await {
        Ok(()) => ok_empty().into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn remove_items(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<RemoveItemsInput>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::remove_items(&state.db, playlist_id, user_id, input.item_ids).await {
        Ok(()) => ok_empty().into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn reorder_items(
    State(state): State<Arc<AppState>>,
    AuthUser(auth): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<ReorderInput>,
) -> Response {
    let user_id = match Uuid::parse_str(&auth.user_id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的用户 ID".into()).into_response(),
    };
    let playlist_id = match Uuid::parse_str(&id) {
        Ok(id) => id,
        Err(_) => return AppError::BadRequest("无效的播放列表 ID".into()).into_response(),
    };
    match PlaylistRepo::reorder(&state.db, playlist_id, user_id, input.item_ids).await {
        Ok(()) => ok_empty().into_response(),
        Err(e) => e.into_response(),
    }
}
