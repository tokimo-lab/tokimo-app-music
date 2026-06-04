//! 内嵌 axum HTTP server，监听本地 UDS socket。
//!
//! 路由布局（server 端 `/api/apps/music/<rest>` 反代到本 sock 的 `/<rest>`）。

use std::sync::Arc;

use axum::{Router, routing::{get, post}};
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
        .route("/files/{file_id}/stream", get(handlers::stream_music_file))
        .route("/", get(handlers::list_musics).post(handlers::create_music))
        .route("/reorder", post(handlers::reorder_musics))
        .route("/sync-statuses", get(handlers::get_all_music_sync_statuses))
        .route("/album/{id}", get(handlers::get_album_detail))
        .route("/album/{id}/scrape", post(handlers::scrape_album))
        .route("/artist/{person_id}", get(handlers::get_artist_detail))
        .route("/artist/{person_id}/scrape", post(handlers::scrape_artist))
        .route("/album/{id}/toggle-favorite", post(handlers::toggle_album_favorite))
        .route("/track/{id}/lyrics", get(handlers::get_track_lyrics))
        .route("/track/{id}/scrape-lyrics", post(handlers::scrape_track_lyrics))
        .route(
            "/{id}",
            get(handlers::get_music)
                .patch(handlers::update_music)
                .delete(handlers::delete_music),
        )
        .route("/{id}/sync", post(handlers::sync_music))
        .route("/{id}/sync-status", get(handlers::get_music_sync_status))
        .route("/{id}/albums", get(handlers::list_albums))
        .route("/{id}/tracks", get(handlers::list_tracks))
        .route("/{id}/artists", get(handlers::list_artists))
        .route("/{id}/genres", get(handlers::list_music_genres))
        .route("/{id}/backfill-lyrics", post(handlers::backfill_lyrics))
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
