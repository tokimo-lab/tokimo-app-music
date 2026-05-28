//! Tokimo Music App — 多进程架构：sidecar 二进制。

/// Compile-time embedded app manifest.
const MANIFEST: &str = include_str!("../tokimo-app.toml");

mod app_server;
mod assets;
mod ctx;
mod db;
mod error;
mod handlers;

use std::sync::{Arc, OnceLock};

use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "info,tokimo_bus_client=info,tokimo_app_music=debug".into()),
            )
            .init();
        if let Err(error) = run_server().await {
            error!(%error, "music: fatal");
            std::process::exit(1);
        }
    } else {
        eprintln!("tokimo-app-music: managed sidecar — set TOKIMO_BUS_SOCKET to run.");
        std::process::exit(0);
    }

    Ok(())
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "music: connecting to broker");

    let db = db::init_pool().await?;
    info!("music: db connected");

    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());
    let context = Arc::new(ctx::AppCtx {
        db: db.clone(),
        client: Arc::clone(&client_slot),
    });

    let app_socket = app_server::spawn("music", Arc::clone(&context))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    let client = BusClient::builder(cfg)
        .service("music", env!("CARGO_PKG_VERSION"))
        .data_plane(app_socket)
        .build()
        .await
        .map_err(|e| anyhow::anyhow!("bus build: {e}"))?;
    client_slot
        .set(Arc::clone(&client))
        .map_err(|_| anyhow::anyhow!("client_slot already set"))?;

    info!("music: registered with broker");

    let shutdown = {
        let client = Arc::clone(&client);
        tokio::spawn(async move { client.run_until_shutdown().await })
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("music: SIGINT received");
            client.shutdown();
        }
        _ = shutdown => info!("music: broker sent Shutdown"),
    }

    Ok(())
}
