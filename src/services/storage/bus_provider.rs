use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use async_trait::async_trait;
use base64::Engine;
use bytes::Bytes;
use tokimo_bus_client::BusClient;

use super::types::{StorageObject, StorageProvider, UploadOptions};

/// 通过 bus RPC 调用主进程 storage service 的 `StorageProvider` 实现。
///
/// 主进程管理 S3 连接、app 隔离、key 路径生成；app 只需调 bus 方法。
pub struct BusStorageProvider {
    client: Arc<OnceLock<Arc<BusClient>>>,
    app_id: String,
}

impl BusStorageProvider {
    pub fn new(client: Arc<OnceLock<Arc<BusClient>>>, app_id: String) -> Self {
        Self { client, app_id }
    }

    fn client(&self) -> Result<&Arc<BusClient>, String> {
        self.client
            .get()
            .ok_or_else(|| "BusClient not initialized".to_string())
    }
}

#[async_trait]
impl StorageProvider for BusStorageProvider {
    async fn upload(&self, _key: &str, body: Bytes, options: Option<UploadOptions>) -> Result<(), String> {
        let client = self.client()?;

        let req = serde_json::json!({
            "appId": self.app_id,
            "filename": _key,
            "contentType": options.and_then(|o| o.content_type),
            "dataBase64": base64::engine::general_purpose::STANDARD.encode(&body),
        });

        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        let resp = client
            .invoke("storage", "upload", payload, Default::default())
            .await
            .map_err(|e| format!("bus invoke: {e}"))?;

        let result: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| format!("decode: {e}"))?;
        let _key = result["key"].as_str().unwrap_or_default();
        Ok(())
    }

    async fn download(&self, key: &str) -> Result<Bytes, String> {
        let client = self.client()?;

        let req = serde_json::json!({ "key": key });
        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        let resp = client
            .invoke("storage", "download", payload, Default::default())
            .await
            .map_err(|e| format!("bus invoke: {e}"))?;

        let result: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| format!("decode: {e}"))?;
        let data_b64 = result["dataBase64"]
            .as_str()
            .ok_or("missing dataBase64")?;
        let data = base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| format!("base64 decode: {e}"))?;
        Ok(Bytes::from(data))
    }

    async fn delete(&self, key: &str) -> Result<(), String> {
        let client = self.client()?;

        let req = serde_json::json!({ "key": key });
        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        client
            .invoke("storage", "delete", payload, Default::default())
            .await
            .map_err(|e| format!("bus invoke: {e}"))?;
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, String> {
        let client = self.client()?;

        let req = serde_json::json!({ "key": key });
        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        let resp = client
            .invoke("storage", "exists", payload, Default::default())
            .await
            .map_err(|e| format!("bus invoke: {e}"))?;

        let result: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| format!("decode: {e}"))?;
        Ok(result["exists"].as_bool().unwrap_or(false))
    }

    async fn head(&self, key: &str) -> Result<Option<StorageObject>, String> {
        let client = self.client()?;

        let req = serde_json::json!({ "key": key });
        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        let resp = client
            .invoke("storage", "head", payload, Default::default())
            .await;

        match resp {
            Ok(resp) => {
                let result: serde_json::Value =
                    serde_json::from_slice(&resp).map_err(|e| format!("decode: {e}"))?;
                Ok(Some(StorageObject {
                    key: result["key"].as_str().unwrap_or_default().to_string(),
                    size: result["size"].as_u64().unwrap_or(0),
                }))
            }
            Err(_) => Ok(None),
        }
    }

    async fn list(&self, prefix: Option<&str>) -> Result<Vec<StorageObject>, String> {
        let client = self.client()?;

        let req = serde_json::json!({
            "appId": self.app_id,
            "prefix": prefix,
        });
        let payload = serde_json::to_vec(&req).map_err(|e| format!("encode: {e}"))?;
        let resp = client
            .invoke("storage", "list", payload, Default::default())
            .await
            .map_err(|e| format!("bus invoke: {e}"))?;

        let result: serde_json::Value =
            serde_json::from_slice(&resp).map_err(|e| format!("decode: {e}"))?;
        let objects = result["objects"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|obj| StorageObject {
                        key: obj["key"].as_str().unwrap_or_default().to_string(),
                        size: obj["size"].as_u64().unwrap_or(0),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(objects)
    }

    fn local_absolute_path(&self, _key: &str) -> Option<PathBuf> {
        // bus 模式下没有本地路径
        None
    }
}
