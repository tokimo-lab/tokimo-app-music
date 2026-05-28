//! 内嵌 axum HTTP server，监听本地 UDS socket。
//!
//! 路由布局（server 端 `/api/apps/music/<rest>` 反代到本 sock 的 `/<rest>`）。
//!
//! Stage 3a: GET /, GET /{id}/tracks, GET /files/{file_id}/stream are real.
//! All other stubs remain 501 until Stage 3b.

use std::sync::Arc;

use axum::{
    Router,
    http::StatusCode,
    response::{IntoResponse, Response},
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
        // File streaming — Stage 3a real
        .route("/files/{file_id}/stream", get(handlers::stream_file))
        // Library CRUD — GET / is Stage 3a real; POST / remains 501
        .route("/", get(handlers::list_libraries).post(stub))
        .route("/reorder", post(stub))
        .route("/sync-statuses", get(stub))
        // Album / track / artist detail (must come before /{id})
        .route("/album/{id}", get(stub))
        .route("/artist/{person_id}", get(stub))
        .route("/album/{id}/toggle-favorite", post(stub))
        .route("/track/{id}/lyrics", get(stub))
        // Library-scoped routes — GET /{id}/tracks is Stage 3a real
        .route("/{id}", get(stub).patch(stub).delete(stub))
        .route("/{id}/sync", post(stub))
        .route("/{id}/sync-status", get(stub))
        .route("/{id}/albums", get(stub))
        .route("/{id}/tracks", get(handlers::list_tracks))
        .route("/{id}/artists", get(stub))
        .route("/{id}/genres", get(stub))
        // Assets
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}

/// Stub handler — returns 501 Not Implemented.
async fn stub() -> Response {
    (
        StatusCode::NOT_IMPLEMENTED,
        axum::Json(serde_json::json!({
            "success": false,
            "error": "not implemented — music sidecar is being migrated"
        })),
    )
        .into_response()
}
