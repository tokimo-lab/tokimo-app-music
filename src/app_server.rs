//! 内嵌 axum HTTP server，监听本地 UDS socket。
//!
//! 路由布局（server 端 `/api/apps/music/<rest>` 反代到本 sock 的 `/<rest>`）。
//!
//! Stage 3b: All CRUD + sync stubs + albums/artists/genres/lyrics routes now real.

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tracing::{error, info};

use crate::{assets, ctx::AppCtx, handlers};

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let (listener, socket) = BusListener::bind_for_app(service)?;
    info!(?socket, "music: app server listening");

    let router = build_router(ctx);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            error!(error = %e, "music: app server stopped");
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    Router::new()
        // File streaming
        .route("/files/{file_id}/stream", get(handlers::stream_file))
        // Library CRUD
        .route(
            "/",
            get(handlers::list_libraries).post(handlers::create_library),
        )
        .route("/reorder", post(handlers::reorder_libraries))
        .route("/sync-statuses", get(handlers::list_sync_statuses))
        // Album / track / artist detail (must come before /{id})
        .route("/album/{id}", get(handlers::get_album_detail))
        .route("/artist/{person_id}", get(handlers::get_artist_detail))
        .route(
            "/album/{id}/toggle-favorite",
            post(handlers::toggle_album_favorite),
        )
        .route("/track/{id}/lyrics", get(handlers::get_track_lyrics))
        // Library-scoped routes
        .route(
            "/{id}",
            get(handlers::get_library)
                .patch(handlers::update_library)
                .delete(handlers::delete_library),
        )
        .route("/{id}/sync", post(handlers::start_library_sync))
        .route("/{id}/sync-status", get(handlers::get_library_sync_status))
        .route("/{id}/albums", get(handlers::list_library_albums))
        .route("/{id}/tracks", get(handlers::list_tracks))
        .route("/{id}/artists", get(handlers::list_library_artists))
        .route("/{id}/genres", get(handlers::list_library_genres))
        // Assets
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
