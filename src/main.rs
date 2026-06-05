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
    about = "Music — Tokimo 本地音乐库 CLI",
    long_about = "Tokimo Music CLI — 在本地音乐库中搜索歌曲、浏览艺术家曲库。\n\n直接连接数据库（通过 DATABASE_URL），不需要主 server 运行。",
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
    /// 按名称查找歌曲（模糊匹配 title，可选按艺术家过滤）
    Find {
        /// 歌曲名称关键词（支持模糊匹配，如 "love" 匹配 "Love Story"）
        query: String,
        /// 按艺术家名称过滤（模糊匹配）
        #[arg(short, long, help = "按艺术家名称过滤")]
        artist: Option<String>,
        /// 限定音乐库 ID（不传则搜索所有库）
        #[arg(short, long, help = "限定音乐库 ID")]
        library: Option<String>,
        /// 返回结果数量上限
        #[arg(short = 'n', long, default_value_t = 20, help = "返回结果数量上限")]
        limit: u32,
        /// 输出原始 JSON 而非表格
        #[arg(long, help = "输出原始 JSON")]
        raw: bool,
    },
    /// 查找艺术家并展示其完整曲库（专辑 + 曲目列表）
    Artist {
        /// 艺术家名称（模糊匹配，如 "beatles" 匹配 "The Beatles"）
        name: String,
        /// 限定音乐库 ID（不传则搜索所有库）
        #[arg(short, long, help = "限定音乐库 ID")]
        library: Option<String>,
        /// 输出原始 JSON 而非格式化列表
        #[arg(long, help = "输出原始 JSON")]
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
