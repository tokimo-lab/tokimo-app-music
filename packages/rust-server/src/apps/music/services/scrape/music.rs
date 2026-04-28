//! Music album scraping service.
//!
//! Scrape flow: MusicBrainz search → pick best candidate → fetch full release detail.
//! Lyrics: LrcLib (free, no API key).
//! Cover art: Cover Art Archive (primary) → iTunes (fallback).

use crate::common::url_util::url_encode;
use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::db::entities::{music_album_artists, music_albums, music_artists, music_tracks};
use crate::error::AppError;
use crate::services::media::scrape::shared::artwork::upload_image_buffer;
use crate::services::storage::StorageProvider;
use rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient;
use rust_client_api::types::{ArtistCredit, MusicMatchCandidate, MusicTrack as MbTrack};

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
        url_encode(&query)
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
        mb: &MusicBrainzClient,
        album_id: Uuid,
        artist_name: &str,
        album_title: &str,
    ) -> AlbumScrapeResult {
        let clean_title = Self::extract_clean_title(album_title);
        info!(
            "[music_scrape] Inline scraping \"{}\" by \"{}\"",
            clean_title, artist_name
        );
        Self::do_search_and_scrape(db, storage, album_id, album_title, &clean_title, artist_name, mb).await
    }

    async fn search_and_scrape(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        raw_title: &str,
        clean_title: &str,
    ) -> AlbumScrapeResult {
        let mb = MusicBrainzClient::new();
        let artist_name = Self::get_album_artist(db, album_id).await;
        Self::do_search_and_scrape(db, storage, album_id, raw_title, clean_title, &artist_name, &mb).await
    }

    async fn do_search_and_scrape(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        raw_title: &str,
        clean_title: &str,
        artist_name: &str,
        mb: &MusicBrainzClient,
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

        let mut candidates: Vec<MusicMatchCandidate> = Vec::new();
        if known_artist {
            match mb.search_release(artist_name, clean_title, 10).await {
                Ok(r) => candidates = r,
                Err(e) => warn!("[music_scrape] MusicBrainz search failed: {}", e),
            }
        }
        if candidates.is_empty() {
            match mb.search_release_by_keyword(clean_title, 10).await {
                Ok(r) => candidates = r,
                Err(e) => warn!("[music_scrape] MusicBrainz keyword search failed: {}", e),
            }
        }
        if known_artist && candidates.is_empty() && stripped != clean_title {
            match mb.search_release(artist_name, &stripped, 10).await {
                Ok(r) => candidates = r,
                Err(e) => warn!("[music_scrape] MusicBrainz stripped search failed: {}", e),
            }
        }
        if candidates.is_empty() && stripped != clean_title {
            match mb.search_release_by_keyword(&stripped, 10).await {
                Ok(r) => candidates = r,
                Err(e) => warn!("[music_scrape] MusicBrainz stripped keyword search failed: {}", e),
            }
        }

        let Some(candidate) = Self::pick_best_candidate(&candidates, clean_title, track_count) else {
            warn!("[music_scrape] No MusicBrainz match for \"{}\"", clean_title);
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
            "[music_scrape] Best MusicBrainz match: \"{}\" by {} ({})",
            candidate.title, candidate.artist, candidate.mb_release_id
        );
        let mb_release_id = candidate.mb_release_id.clone();
        Self::do_scrape(
            db,
            storage,
            album_id,
            &mb_release_id,
            raw_title,
            clean_title,
            artist_name,
            mb,
        )
        .await
    }

    /// Fetch full MusicBrainz release detail and persist to DB.
    async fn do_scrape(
        db: &DatabaseConnection,
        storage: &Arc<dyn StorageProvider>,
        album_id: Uuid,
        mb_release_id: &str,
        raw_title: &str,
        clean_title: &str,
        artist_name: &str,
        mb: &MusicBrainzClient,
    ) -> AlbumScrapeResult {
        let Ok(Some(album)) = music_albums::Entity::find_by_id(album_id).one(db).await else {
            return Self::make_error(album_id, raw_title, clean_title, "Album not found");
        };

        // Guard: another album already uses this MB release ID
        let duplicate = music_albums::Entity::find()
            .filter(music_albums::Column::MbAlbumId.eq(mb_release_id))
            .filter(music_albums::Column::Id.ne(album_id))
            .one(db)
            .await
            .unwrap_or(None);
        if let Some(dup) = duplicate {
            warn!(
                "[music_scrape] MB ID {} already used by \"{}\" — skipping \"{}\"",
                mb_release_id, dup.title, clean_title
            );
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
        }

        let detail = match mb.get_release(mb_release_id).await {
            Ok(d) => d,
            Err(e) => {
                error!("[music_scrape] MusicBrainz get_release failed: {}", e);
                return Self::make_error(album_id, raw_title, clean_title, &e.to_string());
            }
        };

        let genres = detail.genres.clone().unwrap_or_default();
        let year = detail.year;
        let now = Utc::now().fixed_offset();

        // Download cover: Cover Art Archive → iTunes fallback
        let cover_path =
            Self::download_cover(storage, album_id, artist_name, clean_title, detail.cover_url.as_deref()).await;
        let cover_downloaded = cover_path.is_some();

        // Persist album metadata
        let mut active: music_albums::ActiveModel = album.into();
        active.mb_album_id = Set(Some(mb_release_id.to_string()));
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
            "scrapedFrom": "musicbrainz",
        })));
        active.scraped_at = Set(Some(now));
        active.updated_at = Set(Some(now));

        if let Err(e) = active.update(db).await {
            error!("[music_scrape] Failed to update album {}: {}", album_id, e);
            return Self::make_error(album_id, raw_title, clean_title, &e.to_string());
        }

        let track_count_updated = if let Some(ref mb_tracks) = detail.tracks {
            Self::update_tracks(
                db,
                storage,
                album_id,
                mb_tracks,
                genres.first().map(String::as_str),
                artist_name,
                clean_title,
            )
            .await
        } else {
            Self::update_tracks(db, storage, album_id, &[], None, artist_name, clean_title).await
        };

        if !detail.artist_credits.is_empty() {
            Self::save_album_artists(db, album_id, &detail.artist_credits).await;
        }

        info!(
            "[music_scrape] ✓ MusicBrainz scraped \"{}\" → year={:?} genres={:?} cover={} tracks_updated={}",
            clean_title, year, genres, cover_downloaded, track_count_updated
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

    /// Upsert artists from MusicBrainz credits.
    ///
    /// Deduplicates by `mb_id` (MusicBrainz Artist ID), so Simplified/Traditional
    /// variants and case differences in the name never produce duplicate records.
    async fn save_album_artists(db: &DatabaseConnection, album_id: Uuid, artist_credits: &[ArtistCredit]) {
        if artist_credits.is_empty() {
            return;
        }
        let now = Utc::now().fixed_offset();
        let mut artist_ids: Vec<Uuid> = Vec::new();

        for credit in artist_credits {
            // Look up by mb_id (canonical dedup key).
            let existing = music_artists::Entity::find()
                .filter(music_artists::Column::MbId.eq(&credit.mb_id))
                .one(db)
                .await
                .unwrap_or(None);

            let artist_id = if let Some(artist) = existing {
                // Update name if MB returns a corrected spelling.
                if artist.name != credit.name {
                    let mut active: music_artists::ActiveModel = artist.clone().into();
                    active.name = Set(credit.name.clone());
                    active.updated_at = Set(Some(now));
                    if let Err(e) = active.update(db).await {
                        warn!("[music_scrape] failed to update artist name for {}: {e}", artist.id);
                    }
                }
                artist.id
            } else {
                let new_id = Uuid::new_v4();
                let active = music_artists::ActiveModel {
                    id: Set(new_id),
                    name: Set(credit.name.clone()),
                    mb_id: Set(Some(credit.mb_id.clone())),
                    created_at: Set(Some(now)),
                    updated_at: Set(Some(now)),
                    ..Default::default()
                };
                match music_artists::Entity::insert(active).exec(db).await {
                    Ok(_) => new_id,
                    Err(e) => {
                        // Race: another task inserted with the same mb_id — re-fetch.
                        if let Some(a) = music_artists::Entity::find()
                            .filter(music_artists::Column::MbId.eq(&credit.mb_id))
                            .one(db)
                            .await
                            .unwrap_or(None)
                        {
                            a.id
                        } else {
                            error!(
                                "[music_scrape] Failed to insert MB artist {} ({}): {}",
                                credit.name, credit.mb_id, e
                            );
                            continue;
                        }
                    }
                }
            };
            artist_ids.push(artist_id);
        }

        if artist_ids.is_empty() {
            return;
        }

        // Rebuild music_album_artists
        let _ = music_album_artists::Entity::delete_many()
            .filter(music_album_artists::Column::AlbumId.eq(album_id))
            .exec(db)
            .await;
        for (i, aid) in artist_ids.iter().enumerate() {
            let link = music_album_artists::ActiveModel {
                id: Set(Uuid::new_v4()),
                artist_id: Set(*aid),
                album_id: Set(album_id),
                role: Set("artist".to_string()),
                sort_order: Set(i as i32),
            };
            if let Err(e) = music_album_artists::Entity::insert(link).exec(db).await {
                warn!("[music_scrape] failed to link album {album_id} artist {aid}: {e}");
            }
        }
        info!(
            "[music_scrape] Updated {} MB artist credits for album {}",
            artist_ids.len(),
            album_id
        );
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

    /// Fetch lyrics for a single track via LrcLib and upload to storage.
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

        let lyrics_result = match rust_client_api::metadata_providers::lrclib::fetch_lyrics(
            http,
            &effective_artist,
            &track_clean_title,
            Some(album_title),
            duration,
        )
        .await
        {
            Ok(Some(l)) => Ok(Some(l)),
            _ => {
                rust_client_api::metadata_providers::lrclib::fetch_lyrics(
                    http,
                    &effective_artist,
                    &track_clean_title,
                    None,
                    duration,
                )
                .await
            }
        };

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
                        Ok(()) => {
                            info!("[music_scrape] Lyrics saved for \"{}\"", title);
                            return Some(format!("/storage/{key}"));
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
        mb_tracks: &[MbTrack],
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
    fn pick_best_candidate<'a>(
        candidates: &'a [MusicMatchCandidate],
        clean_title: &str,
        db_track_count: i32,
    ) -> Option<&'a MusicMatchCandidate> {
        if candidates.is_empty() {
            return None;
        }
        let title_norm = normalize_for_match(clean_title);
        candidates
            .iter()
            .map(|c| {
                let mut score = c.score.unwrap_or(0); // MusicBrainz relevance (0-100)
                let c_norm = normalize_for_match(&c.title);
                if c_norm == title_norm {
                    score += 200;
                } else if c_norm.contains(&title_norm) || title_norm.contains(&c_norm) {
                    score += 100;
                }
                if let Some(tc) = c.track_count
                    && db_track_count > 0
                    && (tc - db_track_count).abs() <= 1
                {
                    score += 50;
                }
                (c, score)
            })
            .filter(|(_, s)| *s >= 50) // require minimum relevance
            .max_by_key(|(_, s)| *s)
            .map(|(c, _)| c)
    }

    /// Batch auto-scrape all unscraped albums in a music library.
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

        // Build a single MusicBrainzClient; rate-limiter is now process-level
        // static inside the client, so this is equivalent to sharing one instance.
        let mb = MusicBrainzClient::new();

        let mut results = Vec::new();
        let mut success = 0i32;
        let mut failed = 0i32;
        let mut skipped = 0i32;

        for album in &albums {
            let clean = Self::extract_clean_title(&album.title);
            let artist_name = Self::get_album_artist(db, album.id).await;
            let r = Self::do_search_and_scrape(db, storage, album.id, &album.title, &clean, &artist_name, &mb).await;
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
}
