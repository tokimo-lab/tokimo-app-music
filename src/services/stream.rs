use std::{path::Path as StdPath, sync::Arc};

use axum::{
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use tokimo_vfs::Vfs;

use crate::error::AppError;

pub async fn stream_vfs_file(
    vfs: &Arc<Vfs>,
    path: &str,
    mime: &str,
    req_headers: &HeaderMap,
) -> Result<Response, AppError> {
    let vfs_path = StdPath::new(path);
    let stat = vfs
        .stat(vfs_path)
        .await
        .map_err(|error| AppError::NotFound(format!("VFS stat {path}: {error}")))?;
    let total_size = stat.size;

    let range_header = req_headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let (offset, limit, is_range) = if let Some(range) = range_header {
        if let Some(rest) = range.strip_prefix("bytes=") {
            let parts: Vec<&str> = rest.splitn(2, '-').collect();
            let start: u64 = parts
                .first()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            let end: u64 = parts
                .get(1)
                .and_then(|value| {
                    if value.is_empty() {
                        None
                    } else {
                        value.parse().ok()
                    }
                })
                .unwrap_or(total_size.saturating_sub(1));
            let offset = start.min(total_size.saturating_sub(1));
            let end = end.min(total_size.saturating_sub(1)).max(offset);
            (offset, Some(end - offset + 1), true)
        } else {
            (0, None, false)
        }
    } else {
        (0, None, false)
    };

    let bytes = vfs
        .read_bytes(vfs_path, offset, limit)
        .await
        .map_err(|error| AppError::Internal(format!("VFS read {path}: {error}")))?;
    let content_length = bytes.len();

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        mime.parse()
            .unwrap_or_else(|_| "audio/mpeg".parse().expect("audio/mpeg is valid")),
    );
    headers.insert(
        header::ACCEPT_RANGES,
        "bytes".parse().expect("bytes is valid"),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        content_length
            .to_string()
            .parse()
            .expect("content length is valid"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        "no-cache".parse().expect("no-cache is valid"),
    );

    if is_range {
        let end_byte = offset + content_length.saturating_sub(1) as u64;
        let content_range = format!("bytes {offset}-{end_byte}/{total_size}");
        headers.insert(
            header::CONTENT_RANGE,
            content_range.parse().expect("content range is valid"),
        );
        Ok((StatusCode::PARTIAL_CONTENT, headers, bytes).into_response())
    } else {
        Ok((StatusCode::OK, headers, bytes).into_response())
    }
}
