//! Tokimo Music App — 多进程架构：sidecar 二进制。

/// Compile-time embedded app manifest.
const MANIFEST: &str = include_str!("../tokimo-app.toml");

mod app_server;
mod assets;
mod bus_clients;
mod bus_services;
mod ctx;
mod db;
mod error;
mod handlers;
mod queue;
mod services;

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use tokimo_bus_client::{BusClient, ClientConfig};

use crate::services::source::SourceRegistry;
use tracing::{error, info};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                    "info,tokimo_bus_client=info,tokimo_app_music=debug".into()
                }),
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

    let data_path = std::env::var("DATA_LOCAL_PATH")
        .or_else(|_| std::env::var("TOKIMO_DATA_PATH"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".data"));
    let storage = services::storage::create_storage_from_env(&data_path);

    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());
    let sources = Arc::new(SourceRegistry::new(Arc::clone(&client_slot)));
    let context = Arc::new(ctx::AppCtx {
        db: db.clone(),
        client: Arc::clone(&client_slot),
        sources,
        storage,
    });

    let app_socket = app_server::spawn("music", Arc::clone(&context))
        .await
        .map_err(|e| anyhow::anyhow!("app_server spawn: {e}"))?;

    let client = bus_services::music_jobs::register(
        BusClient::builder(cfg)
            .service("music", env!("CARGO_PKG_VERSION"))
            .data_plane(app_socket),
        Arc::clone(&context),
    )
    .build()
    .await
    .map_err(|e| anyhow::anyhow!("bus build: {e}"))?;
    client_slot
        .set(Arc::clone(&client))
        .map_err(|_| anyhow::anyhow!("client_slot already set"))?;

    // Register job handlers with the main server (appId inferred from bus caller).
    bus_clients::jobs::register_handler(&client, "music_scan", "dispatch_music_scan").await?;
    bus_clients::jobs::register_handler(&client, "music_scrape", "dispatch_music_scrape").await?;

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
