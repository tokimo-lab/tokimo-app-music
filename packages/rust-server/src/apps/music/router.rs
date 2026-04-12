use axum::{
    Router,
    routing::{get, post},
};
use std::sync::Arc;

use crate::AppState;

use super::handlers;

pub fn build_music_app_routes() -> Router<Arc<AppState>> {
    Router::new()
        // File streaming
        .route(
            "/api/apps/music/files/{file_id}/stream",
            get(handlers::stream_music_file),
        )
        .route(
            "/api/apps/music",
            get(handlers::list_musics).post(handlers::create_music),
        )
        .route("/api/apps/music/reorder", post(handlers::reorder_musics))
        .route(
            "/api/apps/music/sync-statuses",
            get(handlers::get_all_music_sync_statuses),
        )
        // Album / track / artist detail routes (must come before /{id})
        .route(
            "/api/apps/music/album/{id}",
            get(handlers::get_album_detail),
        )
        .route(
            "/api/apps/music/artist/{person_id}",
            get(handlers::get_artist_detail),
        )
        .route(
            "/api/apps/music/album/{id}/toggle-favorite",
            post(handlers::toggle_album_favorite),
        )
        .route(
            "/api/apps/music/track/{id}/lyrics",
            get(handlers::get_track_lyrics),
        )
        // Library-scoped routes (parameterized /{id} — must come after named routes)
        .route(
            "/api/apps/music/{id}",
            get(handlers::get_music)
                .patch(handlers::update_music)
                .delete(handlers::delete_music),
        )
        .route("/api/apps/music/{id}/sync", post(handlers::sync_music))
        .route(
            "/api/apps/music/{id}/sync-status",
            get(handlers::get_music_sync_status),
        )
        .route(
            "/api/apps/music/{id}/sync-progress",
            get(handlers::get_music_sync_progress),
        )
        .route(
            "/api/apps/music/{id}/albums",
            get(handlers::list_albums),
        )
        .route(
            "/api/apps/music/{id}/tracks",
            get(handlers::list_tracks),
        )
        .route(
            "/api/apps/music/{id}/artists",
            get(handlers::list_artists),
        )
        .route(
            "/api/apps/music/{id}/genres",
            get(handlers::list_music_genres),
        )
}
