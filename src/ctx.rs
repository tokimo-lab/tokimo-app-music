//! AppCtx — DB connection + 延迟绑定的 BusClient。

use std::sync::{Arc, OnceLock};

use sea_orm::DatabaseConnection;
use tokimo_bus_client::BusClient;

use crate::services::source::SourceRegistry;
use crate::services::storage::StorageProvider;

pub struct AppCtx {
    pub db: DatabaseConnection,
    pub client: Arc<OnceLock<Arc<BusClient>>>,
    pub sources: Arc<SourceRegistry>,
    pub storage: Arc<dyn StorageProvider>,
}
