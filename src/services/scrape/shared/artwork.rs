use bytes::Bytes;
use std::sync::Arc;

use crate::services::storage::{StorageProvider, UploadOptions};

pub async fn upload_image_buffer(
    storage: &Arc<dyn StorageProvider>,
    buf: &[u8],
    storage_key: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let ext = storage_key.rsplit('.').next().unwrap_or("jpg");
    let mime = match ext {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    let returned_key = storage
        .upload(
            storage_key,
            Bytes::from(buf.to_vec()),
            Some(UploadOptions {
                content_type: Some(mime.to_string()),
            }),
        )
        .await
        .map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(format!("Storage upload failed: {e}")))?;
    Ok(format!("/storage/{returned_key}"))
}
