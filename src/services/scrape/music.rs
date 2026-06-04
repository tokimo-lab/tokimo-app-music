//! Music album scraping service.
//!
//! Multi-source scrape flow: Netease → QQ Music → MusicBrainz → fallbacks.
//! Uses ProviderRegistry for concurrent search across all sources.
//! Lyrics: LrcLib (free, no API key).
//! Cover art: from metadata source (primary) → iTunes (fallback).

use urlencoding::encode;
use std::sync::Arc;

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::db::entities::{music_album_artists, music_albums, music_artists, music_tracks};
use crate::error::AppError;
use crate::services::scrape::shared::artwork::upload_image_buffer;
use crate::services::storage::StorageProvider;
use tokimo_package_client_api::metadata_providers::deezer::DeezerClient;
use tokimo_package_client_api::metadata_providers::musicbrainz::MusicBrainzClient;
use tokimo_package_client_api::metadata_providers::netease::NeteaseClient;
use tokimo_package_client_api::metadata_providers::qqmusic::QQMusicClient;
use tokimo_package_client_api::metadata_providers::{MusicMetadataProvider, ProviderRegistry, ProviderSelector};
use tokimo_package_client_api::types::{AlbumDetail, AlbumSearchResult, MetadataSource};

// ── Public DTOs ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumScrapeResult {
    pub album_id: String,
    pub title: String,
    pub clean_title: String,
    pub status: String,
    pub cover_downloaded: bool,
    pub genres: Vec<String>,
    pub year: Option<i32>,
    pub track_count_updated: i32,
    pub error: Option<String>,
}

#[allow(dead_code)] // kept from presplit — wired up later
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchScrapeResult {
    pub total: i32,
    pub success: i32,
    pub failed: i32,
    pub skipped: i32,
    pub results: Vec<AlbumScrapeResult>,
}

// ── iTunes Search API ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ItunesSearchResponse {
    results: Vec<ItunesAlbumResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesAlbumResult {
    artwork_url100: Option<String>,
    collection_name: Option<String>,
    #[allow(dead_code)]
    artist_name: Option<String>,
}

async fn itunes_get_cover_url(http: &reqwest::Client, artist: &str, album: &str) -> Option<String> {
    let query = format!("{artist} {album}");
    let url = format!(
        "https://itunes.apple.com/search?term={}&entity=album&country=cn&limit=5",
        encode(&query)
    );
    let resp = http.get(&url).send().await.ok()?;
    let data: ItunesSearchResponse = resp.json().await.ok()?;

    // Find the best match by album name similarity
    let album_lower = album.to_lowercase();
    let result = data.results.into_iter().find(|r| {
        r.collection_name
            .as_deref()
            .is_some_and(|n| n.to_lowercase().contains(&album_lower) || album_lower.contains(&n.to_lowercase()))
    })?;

    // Replace _100 with _3000 for high-res artwork
    result
        .artwork_url100
        .map(|u| u.replace("100x100bb", "3000x3000bb").replace("/100x100", "/3000x3000"))
}

// ── Core Scrape Service ───────────────────────────────────────────────────────

/// Normalize a string for fuzzy title matching: lowercase, alphanumeric only.
fn normalize_for_match(s: &str) -> String {
    s.chars()
        .filter_map(|c| {
            if c.is_alphanumeric() {
                c.to_lowercase().next()
            } else {
                None
            }
        })
        .collect()
}

pub struct MusicScrapeService;

impl MusicScrapeService {
    /// Extract the real album name from a date-prefixed title.
    ///
    /// Handles patterns like:
    /// - "2001年09月14日 - 范特西"   -> "范特西"
    /// - "2003年11月11日《寻找周杰伦EP》" -> "寻找周杰伦EP"
    /// - "2005年8月31日《Initial J》 (日本版)" -> "Initial J (日本版)"
    pub fn extract_clean_title(title: &str) -> String {
        // Try " - " separator pattern (date before, album after)
        if let Some(pos) = title.find(" - ") {
            let before = &title[..pos];
            let is_date_prefix = before
                .chars()
                .all(|c| c.is_ascii_digit() || c == '年' || c == '月' || c == '日' || c == '-' || c == ' ');
            if is_date_prefix {
                return title[pos + 3..].trim().to_string();
            }
        }

        // Try "日-" separator pattern (e.g. "2001年09月14日-范特西")
        if let Some(pos) = title.find("日-") {
            let before = &title[..pos + '日'.len_utf8()];
            let is_date_prefix = before
                .chars()
                .all(|c| c.is_ascii_digit() || c == '年' || c == '月' || c == '日' || c == '-' || c == ' ');
            if is_date_prefix {
                return title[pos + '日'.len_utf8() + 1..].trim().to_string();
            }
        }

        // Try 《...》 bracket pattern — date then 《album name》 optional suffix
        if let (Some(start_byte), Some(end_byte)) = (title.find('《'), title.rfind('》')) {
            // Characters inside 《》
            let inside_start = start_byte + '《'.len_utf8();
            let inside = &title[inside_start..end_byte];
            // Suffix after 》 (e.g. " (日本版)")
            let suffix = title[end_byte + '》'.len_utf8()..].trim();
            if suffix.is_empty() {
                return inside.trim().to_string();
            }
            return format!("{} {}", inside.trim(), suffix);
        }

        title.trim().to_string()
    }

    /// Auto-search MusicBrainz for an album, pick the best candidate, and scrape it.
    pub async fn auto_scrape_album(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
    ) -> AlbumScrapeResult {
        let album = match music_albums::Entity::find_by_id(album_id).one(db).await {
            Ok(Some(a)) => a,
            Ok(None) => return Self::make_error(album_id, "", "", "Album not found"),
            Err(e) => return Self::make_error(album_id, "", "", &e.to_string()),
        };
        let clean_title = Self::extract_clean_title(&album.title);
        info!("[music_scrape] Auto-scraping \"{}\" via MusicBrainz", clean_title);
        Self::search_and_scrape(db, storage, album_id, &album.title, &clean_title).await
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn make_error(album_id: Uuid, title: &str, clean_title: &str, error: &str) -> AlbumScrapeResult {
        AlbumScrapeResult {
            album_id: album_id.to_string(),
            title: title.to_string(),
            clean_title: clean_title.to_string(),
            status: "failed".to_string(),
            cover_downloaded: false,
            genres: vec![],
            year: None,
            track_count_updated: 0,
            error: Some(error.to_string()),
        }
    }

    /// Scrape an album during sync, using the artist name from file tags directly.
    /// Called per-album from `process_album_group` so MB is searched before any
    /// artist stub records exist in the DB.
    pub async fn scrape_album_inline(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        artist_name: &str,
        album_title: &str,
    ) -> AlbumScrapeResult {
        let clean_title = Self::extract_clean_title(album_title);
        info!(
            "[music_scrape] Inline scraping \"{}\" by \"{}\"",
            clean_title, artist_name
        );
        let registry = Self::build_registry();
        Self::do_search_and_scrape(db, storage, album_id, album_title, &clean_title, artist_name, &registry).await
    }

    async fn search_and_scrape(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        raw_title: &str,
        clean_title: &str,
    ) -> AlbumScrapeResult {
        let artist_name = Self::get_album_artist(db, album_id).await;
        let registry = Self::build_registry();

        Self::do_search_and_scrape(db, storage, album_id, raw_title, clean_title, &artist_name, &registry).await
    }

    /// Build a provider registry with all available sources.
    fn build_registry() -> ProviderRegistry {
        let mut registry = ProviderRegistry::new();
        registry.register(Arc::new(NeteaseClient::new()));
        registry.register(Arc::new(QQMusicClient::new()));
        registry.register(Arc::new(MusicBrainzClient::new()));
        registry
    }

    async fn do_search_and_scrape(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        raw_title: &str,
        clean_title: &str,
        artist_name: &str,
        registry: &ProviderRegistry,
    ) -> AlbumScrapeResult {
        let track_count = music_tracks::Entity::find()
            .filter(music_tracks::Column::AlbumId.eq(album_id))
            .count(db)
            .await
            .unwrap_or(0) as i32;

        let known_artist = artist_name != "Unknown Artist" && !artist_name.is_empty();
        let stripped = clean_title
            .trim_end_matches("EP")
            .trim_end_matches("电影原声带")
            .trim_end_matches("原声带")
            .trim_end_matches("原声")
            .trim_end_matches("OST")
            .trim()
            .to_string();

        // Search across all providers concurrently
        let mut candidates = if known_artist {
            registry.search_albums(artist_name, clean_title, 10).await
        } else {
            registry.search_albums_by_keyword(clean_title, 10).await
        };

        // If no results, try stripped title
        if candidates.is_empty() && stripped != clean_title {
            candidates = if known_artist {
                registry.search_albums(artist_name, &stripped, 10).await
            } else {
                registry.search_albums_by_keyword(&stripped, 10).await
            };
        }

        // Use selector to pick best match
        let selector = ProviderSelector::auto_detect(artist_name, clean_title);
        let Some(candidate) = selector.select_best(&candidates, artist_name, clean_title, Some(track_count)) else {
            warn!("[music_scrape] No match for \"{}\" across all providers", clean_title);
            return AlbumScrapeResult {
                album_id: album_id.to_string(),
                title: raw_title.to_string(),
                clean_title: clean_title.to_string(),
                status: "no_match".to_string(),
                cover_downloaded: false,
                genres: vec![],
                year: None,
                track_count_updated: 0,
                error: None,
            };
        };

        info!(
            "[music_scrape] Best match: \"{}\" by {} (source={}, id={})",
            candidate.title, candidate.artist, candidate.source, candidate.external_id
        );

        // Get full album detail from the matched provider
        let detail = match registry.get_album_detail(&candidate.source, &candidate.external_id).await {
            Ok(d) => d,
            Err(e) => {
                error!("[music_scrape] Failed to get album detail from {}: {}", candidate.source, e);
                return Self::make_error(album_id, raw_title, clean_title, &e.to_string());
            }
        };

        Self::do_scrape_from_detail(db, storage, album_id, raw_title, clean_title, artist_name, &detail).await
    }

    /// Fetch album detail from metadata provider and persist to DB.
    async fn do_scrape_from_detail(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        raw_title: &str,
        clean_title: &str,
        artist_name: &str,
        detail: &AlbumDetail,
    ) -> AlbumScrapeResult {
        let Ok(Some(album)) = music_albums::Entity::find_by_id(album_id).one(db).await else {
            return Self::make_error(album_id, raw_title, clean_title, "Album not found");
        };

        let genres = detail.genres.clone().unwrap_or_default();
        let year = detail.year;
        let now = Utc::now().fixed_offset();

        // Download cover from metadata source
        let cover_path =
            Self::download_cover(storage, album_id, artist_name, clean_title, detail.cover_url.as_deref()).await;
        let cover_downloaded = cover_path.is_some();

        // Persist album metadata
        let mut active: music_albums::ActiveModel = album.into();
        active.mb_album_id = Set(Some(detail.external_id.clone()));
        active.year = Set(year);
        if let Some(ref rd) = detail.release_date {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(rd, "%Y-%m-%d") {
                active.release_date = Set(Some(date));
            } else if let Some(date) = rd
                .get(..4)
                .and_then(|y| chrono::NaiveDate::parse_from_str(&format!("{y}-01-01"), "%Y-%m-%d").ok())
            {
                active.release_date = Set(Some(date));
            }
        }
        if let Some(ref at) = detail.album_type {
            active.album_type = Set(Some(at.clone()));
        }
        if let Some(total) = detail.total_tracks {
            active.total_tracks = Set(Some(total));
        }
        if let Some(total) = detail.total_discs {
            active.total_discs = Set(Some(total));
        }
        if let Some(cp) = &cover_path {
            active.cover_path = Set(Some(cp.clone()));
        }
        active.metadata = Set(Some(serde_json::json!({
            "genres": genres,
            "scrapedFrom": detail.source.to_string(),
            "externalId": detail.external_id,
        })));
        active.scraped_at = Set(Some(now));
        active.updated_at = Set(Some(now));

        if let Err(e) = active.update(db).await {
            error!("[music_scrape] Failed to update album {}: {}", album_id, e);
            return Self::make_error(album_id, raw_title, clean_title, &e.to_string());
        }

        // Save external ID mapping
        Self::save_external_id(db, album_id, &detail.source, &detail.external_id).await;

        let track_count_updated = if let Some(ref tracks) = detail.tracks {
            Self::update_tracks(
                db,
                storage,
                album_id,
                tracks,
                genres.first().map(String::as_str),
                artist_name,
                clean_title,
            )
            .await
        } else {
            Self::update_tracks(db, storage, album_id, &[], None, artist_name, clean_title).await
        };

        if !detail.artist_credits.is_empty() {
            Self::save_album_artists_from_credits(db, storage, album_id, &detail.artist_credits).await;
        }

        info!(
            "[music_scrape] ✓ Scraped \"{}\" from {} → year={:?} genres={:?} cover={} tracks_updated={}",
            clean_title, detail.source, year, genres, cover_downloaded, track_count_updated
        );

        AlbumScrapeResult {
            album_id: album_id.to_string(),
            title: raw_title.to_string(),
            clean_title: clean_title.to_string(),
            status: "success".to_string(),
            cover_downloaded,
            genres,
            year,
            track_count_updated,
            error: None,
        }
    }

    /// Save external ID mapping for an album.
    async fn save_external_id(db: &DatabaseConnection, album_id: Uuid, source: &MetadataSource, external_id: &str) {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "INSERT INTO music.music_album_external_ids (album_id, source, external_id) \
             VALUES ($1, $2, $3) ON CONFLICT (album_id, source) DO UPDATE SET external_id = $3",
            [album_id.into(), source.to_string().into(), external_id.into()],
        );
        if let Err(e) = db.execute_raw(stmt).await {
            warn!("[music_scrape] Failed to save external ID: {}", e);
        }
    }

    /// Upsert artists from unified ArtistCreditInfo (multi-source).
    /// DB operations (upsert artists + rebuild links) are wrapped in a transaction.
    /// Profile image downloads happen outside the transaction.
    async fn save_album_artists_from_credits(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        credits: &[tokimo_package_client_api::types::ArtistCreditInfo],
    ) {
        if credits.is_empty() {
            return;
        }
        let now = Utc::now().fixed_offset();

        // Phase 1: Upsert artists + rebuild album_artists in a transaction
        let (artist_ids, new_artist_names) = {
            let txn = match db.begin().await {
                Ok(t) => t,
                Err(e) => {
                    error!("[music_scrape] failed to begin txn: {e}");
                    return;
                }
            };

            let mut artist_ids: Vec<Uuid> = Vec::new();
            let mut new_artist_names: Vec<(Uuid, String)> = Vec::new();

            for credit in credits {
                let existing = music_artists::Entity::find()
                    .filter(music_artists::Column::MbId.eq(&credit.external_id))
                    .one(&txn)
                    .await
                    .unwrap_or(None);

                let artist_id = if let Some(artist) = existing {
                    artist.id
                } else {
                    let new_id = Uuid::new_v4();
                    let active = music_artists::ActiveModel {
                        id: Set(new_id),
                        name: Set(credit.name.clone()),
                        mb_id: Set(Some(credit.external_id.clone())),
                        created_at: Set(Some(now)),
                        updated_at: Set(Some(now)),
                        ..Default::default()
                    };
                    match music_artists::Entity::insert(active).exec(&txn).await {
                        Ok(_) => {
                            new_artist_names.push((new_id, credit.name.clone()));
                            new_id
                        }
                        Err(e) => {
                            // Race: another scrape inserted the same artist concurrently
                            if let Some(a) = music_artists::Entity::find()
                                .filter(music_artists::Column::MbId.eq(&credit.external_id))
                                .one(&txn)
                                .await
                                .unwrap_or(None)
                            {
                                a.id
                            } else {
                                error!("[music_scrape] Failed to insert artist {} ({}): {}", credit.name, credit.external_id, e);
                                continue;
                            }
                        }
                    }
                };
                artist_ids.push(artist_id);
            }

            if artist_ids.is_empty() {
                let _ = txn.rollback().await;
                return;
            }

            // Rebuild music_album_artists atomically
            let _ = music_album_artists::Entity::delete_many()
                .filter(music_album_artists::Column::AlbumId.eq(album_id))
                .exec(&txn)
                .await;
            for (i, aid) in artist_ids.iter().enumerate() {
                let link = music_album_artists::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    artist_id: Set(*aid),
                    album_id: Set(album_id),
                    role: Set("artist".to_string()),
                    sort_order: Set(i as i32),
                };
                if let Err(e) = music_album_artists::Entity::insert(link).exec(&txn).await {
                    warn!("[music_scrape] failed to link album {album_id} artist {aid}: {e}");
                }
            }

            if let Err(e) = txn.commit().await {
                error!("[music_scrape] failed to commit txn: {e}");
                return;
            }

            (artist_ids, new_artist_names)
        };

        // Phase 2: Download profile images outside the transaction
        for (artist_id, artist_name) in new_artist_names {
            if let Some(path) = Self::download_artist_profile(storage, artist_id, &artist_name).await {
                let key = format!("library-images/music/{artist_id}/profile.jpg");
                let _ = music_artists::Entity::update_many()
                    .filter(music_artists::Column::Id.eq(artist_id))
                    .col_expr(music_artists::Column::ProfilePath, Expr::value(Some(path)))
                    .col_expr(music_artists::Column::ProfileKey, Expr::value(Some(key)))
                    .col_expr(music_artists::Column::UpdatedAt, Expr::value(Some(now)))
                    .exec(db)
                    .await;
            }
        }
    }

    /// Download cover art: cover URL (primary) → iTunes (fallback).
    async fn download_cover(
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        artist_name: &str,
        clean_title: &str,
        cover_url: Option<&str>,
    ) -> Option<String> {
        let http = reqwest::Client::builder()
            .user_agent("tokimo/1.0")
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        let key = format!("library-images/music/{album_id}/cover.jpg");

        macro_rules! try_cover {
            ($url:expr, $source:expr) => {{
                match http.get($url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(bytes) = resp.bytes().await {
                            match upload_image_buffer(storage, &bytes, &key).await {
                                Ok(path) => {
                                    info!("[music_scrape] Cover saved from {}: {}", $source, path);
                                    return Some(path);
                                }
                                Err(e) => warn!("[music_scrape] {} cover upload failed: {}", $source, e),
                            }
                        }
                    }
                    Ok(resp) => info!(
                        "[music_scrape] {} cover not available ({})",
                        $source,
                        resp.status()
                    ),
                    Err(e) => warn!("[music_scrape] {} request failed: {}", $source, e),
                }
            }};
        }

        if let Some(url) = cover_url {
            try_cover!(url, "Cover Art Archive");
        }

        if let Some(itunes_url) = itunes_get_cover_url(&http, artist_name, clean_title).await {
            try_cover!(&itunes_url, "iTunes");
        }

        warn!("[music_scrape] No cover found for \"{}\"", clean_title);
        None
    }

    /// Fetch artist profile image from Deezer and upload to storage.
    /// Returns the storage path on success.
    async fn download_artist_profile(
        storage: &Arc<dyn StorageProvider>,
        artist_id: Uuid,
        artist_name: &str,
    ) -> Option<String> {
        let deezer = DeezerClient::new();
        let photo_url = match deezer.get_artist_photo(artist_name).await {
            Ok(Some(url)) => url,
            Ok(None) => {
                info!("[music_scrape] No Deezer photo for \"{}\"", artist_name);
                return None;
            }
            Err(e) => {
                warn!("[music_scrape] Deezer photo fetch failed for \"{}\": {}", artist_name, e);
                return None;
            }
        };

        let http = reqwest::Client::builder()
            .user_agent("tokimo/1.0")
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        match http.get(&photo_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = resp.bytes().await {
                    let key = format!("library-images/music/{artist_id}/profile.jpg");
                    match upload_image_buffer(storage, &bytes, &key).await {
                        Ok(path) => {
                            info!("[music_scrape] Artist profile saved for \"{}\": {}", artist_name, path);
                            return Some(path);
                        }
                        Err(e) => warn!("[music_scrape] Artist profile upload failed for \"{}\": {}", artist_name, e),
                    }
                }
                None
            }
            Ok(resp) => {
                info!(
                    "[music_scrape] Deezer photo not available for \"{}\" ({})",
                    artist_name,
                    resp.status()
                );
                None
            }
            Err(e) => {
                warn!("[music_scrape] Deezer photo download failed for \"{}\": {}", artist_name, e);
                None
            }
        }
    }

    /// Fetch lyrics from multiple sources (LrcLib → QQ Music → Netease) and upload to storage.
    /// Returns the storage path on success.
    async fn fetch_and_save_lyrics(
        storage: &Arc<dyn StorageProvider>,
        http: &reqwest::Client,
        album_id: Uuid,
        track_id: Uuid,
        title: &str,
        artist_name: &str,
        album_title: &str,
        duration: Option<u32>,
    ) -> Option<String> {
        let (track_clean_title, effective_artist) = {
            let sep = title
                .find('－')
                .map(|p| (p, '－'))
                .or_else(|| title.rfind('-').map(|p| (p, '-')));
            if let Some((pos, sep_char)) = sep {
                let raw = title[..pos].trim().to_string();
                let after = title[pos + sep_char.len_utf8()..].trim().to_string();
                if after.is_empty() {
                    (title.to_string(), artist_name.to_string())
                } else {
                    (raw, after)
                }
            } else {
                (title.to_string(), artist_name.to_string())
            }
        };

        // Try multi-source lyrics: LrcLib → QQ Music → Netease
        let lyrics_result = tokimo_package_client_api::metadata_providers::lyrics::fetch_lyrics_multi(
            http,
            &effective_artist,
            &track_clean_title,
            Some(album_title),
            duration,
        )
        .await;

        match lyrics_result {
            Ok(Some(lyrics)) if !lyrics.instrumental => {
                let content = lyrics
                    .synced_lyrics
                    .as_deref()
                    .or(lyrics.plain_lyrics.as_deref())
                    .unwrap_or("")
                    .to_string();
                if !content.is_empty() {
                    let ext = if lyrics.synced_lyrics.is_some() { "lrc" } else { "txt" };
                    let key = format!("lyrics/music/{album_id}/{track_id}.{ext}");
                    match storage
                        .upload(
                            &key,
                            bytes::Bytes::from(content.into_bytes()),
                            Some(crate::services::storage::UploadOptions {
                                content_type: Some("text/plain; charset=utf-8".to_string()),
                            }),
                        )
                        .await
                    {
                        Ok(returned_key) => {
                            info!("[music_scrape] Lyrics saved for \"{}\"", title);
                            return Some(format!("/storage/{returned_key}"));
                        }
                        Err(e) => warn!("[music_scrape] Lyrics upload failed: {}", e),
                    }
                }
                None
            }
            Ok(_) => None,
            Err(e) => {
                warn!("[music_scrape] LrcLib failed for \"{}\": {}", title, e);
                None
            }
        }
    }

    /// Update track durations from MusicBrainz (matched by title) and fetch lyrics from LrcLib.
    async fn update_tracks(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        mb_tracks: &[tokimo_package_client_api::types::TrackInfo],
        primary_genre: Option<&str>,
        artist_name: &str,
        album_title: &str,
    ) -> i32 {
        let db_tracks = match music_tracks::Entity::find()
            .filter(music_tracks::Column::AlbumId.eq(album_id))
            .order_by_asc(music_tracks::Column::DiscNumber)
            .order_by_asc(music_tracks::Column::TrackNumber)
            .all(db)
            .await
        {
            Ok(t) => t,
            Err(e) => {
                error!("[music_scrape] Failed to load tracks: {}", e);
                return 0;
            }
        };

        let http = reqwest::Client::builder()
            .user_agent("tokimo/1.0")
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        let mut updated = 0i32;
        for db_track in &db_tracks {
            // Match by normalized title (MB doesn't reliably give disc+number for flat lists)
            let mb_track = mb_tracks
                .iter()
                .find(|t| normalize_for_match(&t.title) == normalize_for_match(&db_track.title));

            let mut active: music_tracks::ActiveModel = db_track.clone().into();
            let mut changed = false;

            if let Some(mt) = mb_track {
                if db_track.duration.is_none()
                    && let Some(dur) = mt.duration
                {
                    active.duration = Set(Some(dur));
                    changed = true;
                }
                if let Some(genre) = primary_genre
                    && db_track.genre.is_none()
                {
                    active.genre = Set(Some(genre.to_string()));
                    changed = true;
                }
            }

            if db_track.lyrics_path.is_none() {
                let duration = db_track.duration.map(|d| d as u32);
                if let Some(path) = Self::fetch_and_save_lyrics(
                    storage,
                    &http,
                    album_id,
                    db_track.id,
                    &db_track.title,
                    artist_name,
                    album_title,
                    duration,
                )
                .await
                {
                    active.lyrics_path = Set(Some(path));
                    changed = true;
                }
            }

            if changed {
                if let Err(e) = active.update(db).await {
                    warn!("[music_scrape] Track update failed: {}", e);
                } else {
                    updated += 1;
                }
            }
        }
        updated
    }

    /// Pick best MusicBrainz candidate by MB score + title similarity + track count.
    /// Batch auto-scrape all unscraped albums in a music library.
    #[allow(dead_code)] // kept from presplit — wired up later
    pub async fn batch_scrape_app(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        app_id: Uuid,
        force: bool,
    ) -> Result<BatchScrapeResult, AppError> {
        let albums = if force {
            music_albums::Entity::find()
                .filter(music_albums::Column::MusicId.eq(app_id))
                .all(db)
                .await?
        } else {
            music_albums::Entity::find()
                .filter(music_albums::Column::MusicId.eq(app_id))
                .filter(music_albums::Column::ScrapedAt.is_null())
                .all(db)
                .await?
        };

        info!(
            "[music_scrape] Batch scraping {} albums for app {}",
            albums.len(),
            app_id
        );

        // Build a registry with all available providers.
        let registry = Self::build_registry();

        let mut results = Vec::new();
        let mut success = 0i32;
        let mut failed = 0i32;
        let mut skipped = 0i32;

        for album in &albums {
            let clean = Self::extract_clean_title(&album.title);
            let artist_name = Self::get_album_artist(db, album.id).await;
            let r = Self::do_search_and_scrape(db, storage, album.id, &album.title, &clean, &artist_name, &registry).await;
            match r.status.as_str() {
                "success" => success += 1,
                "no_match" => skipped += 1,
                _ => failed += 1,
            }
            results.push(r);
        }

        Ok(BatchScrapeResult {
            total: albums.len() as i32,
            success,
            failed,
            skipped,
            results,
        })
    }

    /// Public wrapper for `get_album_artist` (used by handlers).
    #[allow(dead_code)] // kept from presplit — wired up later
    pub async fn get_album_artist_pub(db: &DatabaseConnection, album_id: Uuid) -> String {
        Self::get_album_artist(db, album_id).await
    }

    /// Get the primary artist name for an album from `music_album_artists`.
    async fn get_album_artist(db: &DatabaseConnection, album_id: Uuid) -> String {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT ma.name FROM music_album_artists maa \
             JOIN music_artists ma ON ma.id = maa.artist_id \
             WHERE maa.album_id = $1 AND maa.role IN ('artist', 'albumArtist') \
             ORDER BY maa.sort_order ASC \
             LIMIT 1",
            [album_id.into()],
        );
        match db.query_one_raw(stmt).await {
            Ok(Some(row)) => row
                .try_get::<String>("", "name")
                .unwrap_or_else(|_| "Unknown Artist".to_string()),
            _ => "Unknown Artist".to_string(),
        }
    }

    /// Public static wrapper for `fetch_and_save_lyrics` (used by backfill endpoint).
    pub async fn fetch_and_save_lyrics_static(
        storage: &Arc<dyn StorageProvider>,
        http: &reqwest::Client,
        album_id: Uuid,
        track_id: Uuid,
        title: &str,
        artist_name: &str,
        album_title: &str,
        duration: Option<u32>,
    ) -> Option<String> {
        Self::fetch_and_save_lyrics(storage, http, album_id, track_id, title, artist_name, album_title, duration).await
    }

    /// Public static wrapper for `download_artist_profile` (used by re-scrape endpoint).
    pub async fn download_artist_profile_static(
        storage: &Arc<dyn StorageProvider>,
        artist_id: Uuid,
        artist_name: &str,
    ) -> Option<String> {
        Self::download_artist_profile(storage, artist_id, artist_name).await
    }
}
