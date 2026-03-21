use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;

use crate::handlers::playlist::*;
use crate::AppState;

pub fn build_playlist_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/playlists", get(list_playlists))
        .route("/api/playlists", post(create_playlist))
        .route("/api/playlists/{id}", get(get_playlist))
        .route("/api/playlists/{id}", put(update_playlist))
        .route("/api/playlists/{id}", delete(delete_playlist))
        .route("/api/playlists/{id}/tracks", post(add_tracks))
        .route("/api/playlists/{id}/remove-items", post(remove_items))
        .route("/api/playlists/{id}/reorder", post(reorder_items))
}
