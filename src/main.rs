//! Tokimo Music App — 多进程架构：CLI / Server 双模二进制。

/// Compile-time embedded app manifest.
const MANIFEST: &str = include_str!("../tokimo-app.toml");

mod app_server;
mod assets;
mod bus_clients;
mod bus_services;
mod cli;
mod ctx;
mod db;
mod error;
mod handlers;
mod queue;
mod services;

use std::sync::{Arc, OnceLock};

use clap::{Parser, Subcommand};
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};

use crate::services::source::SourceRegistry;
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(
    name = "tokimo-app-music",
    about = "Music — Tokimo Local Music Library CLI",
    long_about = "Tokimo Music CLI — search songs in the local music library, browse artist catalog.\n\nConnects directly to the database (via DATABASE_URL); no main server needed.",
    term_width = 100
)]
struct Cli {
    #[command(flatten)]
    auth: TokimoAuthArgs,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Find songs by name (fuzzy match title, optionally filter by artist)
    Find {
        /// Song name keyword (fuzzy match, e.g. "love" matches "Love Story")
        query: String,
        /// Filter by artist name (fuzzy match)
        #[arg(short, long, help = "Filter by artist name")]
        artist: Option<String>,
        /// Limit to music library ID (searches all if not provided)
        #[arg(short, long, help = "Limit to music library ID")]
        library: Option<String>,
        /// Max number of results
        #[arg(
            short = 'n',
            long,
            default_value_t = 20,
            help = "Max number of results"
        )]
        limit: u32,
        /// Output raw JSON instead of table
        #[arg(long, help = "Output raw JSON")]
        raw: bool,
    },
    /// Find artist and show full catalog (album + track list)
    Artist {
        /// Artist name (fuzzy match, e.g. "beatles" matches "The Beatles")
        name: String,
        /// Limit to music library ID (searches all if not provided)
        #[arg(short, long, help = "Limit to music library ID")]
        library: Option<String>,
        /// Output raw JSON instead of formatted list
        #[arg(long, help = "Output raw JSON")]
        raw: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let Cli { auth: _, command } = Cli::parse();

    match command {
        None if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() => {
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
        }
        None => {
            use clap::CommandFactory;
            let mut cmd = Cli::command();
            tokimo_bus_cli::print_help_unified(&mut cmd);
            std::process::exit(0);
        }
        Some(cmd) => {
            let result = match cmd {
                Command::Find {
                    query,
                    artist,
                    library,
                    limit,
                    raw,
                } => cli::run_find(query, artist, library, limit, raw).await,
                Command::Artist { name, library, raw } => cli::run_artist(name, library, raw).await,
            };
            if let Err(error) = result {
                eprintln!("Error: {error:#}");
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|e| anyhow::anyhow!("ClientConfig: {e}"))?;
    info!(endpoint = ?cfg.endpoint, "music: connecting to broker");

    let db = db::init_pool().await?;
    info!("music: db connected");

    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());
    let storage = services::storage::create_storage_from_bus(Arc::clone(&client_slot), "music");
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
