use axum::{
    extract::{Path, Request, State},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

use crate::{
    db::repos::media::MusicRepo,
    handlers::{err404, err500, user::AuthUser},
    AppState,
};

/// Stream a music file over HTTP with range request support.
///
/// `GET /api/apps/music/files/{file_id}/stream`
pub async fn stream_music_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
    AuthUser(_auth): AuthUser,
    request: Request,
) -> Response {
    let db = state.db.clone();

    let target = match MusicRepo::load_stream_target(&db, &file_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return err404::<()>("Music file not found".into()).into_response(),
        Err(e) => return err500::<()>(format!("music file lookup failed: {e}")).into_response(),
    };

    let Some(source_id) = target.source_id.as_deref() else {
        return err500::<()>("Music file has no source_id".into()).into_response();
    };

    let vfs = match state.sources.ensure_vfs(source_id).await {
        Ok(v) => v,
        Err(e) => return err404::<()>(e).into_response(),
    };

    crate::handlers::media::stream::stream_driver_file(
        vfs,
        target.path,
        request.headers().clone(),
        None,
        state.stream_sessions.create_or_get(&file_id),
    )
    .await
}
