//! DB layer — connection pool init + entities + repos.

use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

pub mod entities;
pub mod pagination;
pub mod repos;

pub async fn init_pool() -> anyhow::Result<DatabaseConnection> {
    let base_url =
        std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
    let schema = tokimo_bus_cli::manifest::parse_app_schema(crate::MANIFEST)?
        .ok_or_else(|| anyhow::anyhow!("manifest missing [database] schema"))?;

    let sep = if base_url.contains('?') { '&' } else { '?' };
    let encoded = urlencoding::encode(&schema);
    let url = format!(
        "{base_url}{sep}application_name=tokimo-app-music&options=-c%20search_path%3D%22{encoded}%22%2Cpublic"
    );

    let mut opts = ConnectOptions::new(url);
    opts.max_connections(4)
        .min_connections(1)
        .sqlx_logging(false);

    Ok(Database::connect(opts).await?)
}

pub trait ApiDateTimeExt {
    fn to_api_datetime(&self) -> Option<String>;
    fn to_api_datetime_or_default(&self) -> String;
}

impl ApiDateTimeExt for Option<DateTimeWithTimeZone> {
    fn to_api_datetime(&self) -> Option<String> {
        self.as_ref().map(DateTimeWithTimeZone::to_rfc3339)
    }

    fn to_api_datetime_or_default(&self) -> String {
        self.as_ref()
            .map(DateTimeWithTimeZone::to_rfc3339)
            .unwrap_or_default()
    }
}

pub trait OptionalApiDateTimeExt {
    #[allow(dead_code)] // kept from presplit — wired up later
    fn to_api_datetime(&self) -> Option<String>;
    #[allow(dead_code)] // kept from presplit — wired up later
    fn to_api_datetime_or_default(&self) -> String;
}

impl OptionalApiDateTimeExt for DateTimeWithTimeZone {
    fn to_api_datetime(&self) -> Option<String> {
        Some(self.to_rfc3339())
    }

    fn to_api_datetime_or_default(&self) -> String {
        self.to_rfc3339()
    }
}
