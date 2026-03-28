//! Music album scraping service.
//!
//! Searches MusicBrainz for metadata, downloads cover art with priority:
//! Spotify (if configured) → iTunes → MusicBrainz CAA,
//! and fetches synced lyrics from LrcLib for each track.

use std::sync::Arc;

use chrono::Utc;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::db::entities::{media_credits, music_albums, music_tracks, persons};
use crate::error::AppError;
use crate::queue::handlers::file_scrape::artwork::upload_image_buffer;
use crate::AppState;

// ── Public DTOs ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumScrapeResult {
    pub album_id: String,
    pub title: String,
    pub clean_title: String,
    pub status: String,
    pub mb_release_id: Option<String>,
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

async fn itunes_get_cover_url(artist: &str, album: &str) -> Option<String> {
    let query = format!("{} {}", artist, album);
    let url = format!(
        "https://itunes.apple.com/search?term={}&entity=album&country=cn&limit=5",
        urlencoding::encode(&query)
    );
    let resp = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "tokimo/1.0")
        .send()
        .await
        .ok()?;
    let data: ItunesSearchResponse = resp.json().await.ok()?;

    // Find the best match by album name similarity
    let album_lower = album.to_lowercase();
    let result = data.results.into_iter().find(|r| {
        r.collection_name
            .as_deref()
            .map(|n| n.to_lowercase().contains(&album_lower) || album_lower.contains(&n.to_lowercase()))
            .unwrap_or(false)
    })?;

    // Replace _100 with _3000 for high-res artwork
    result
        .artwork_url100
        .map(|u| u.replace("100x100bb", "3000x3000bb").replace("/100x100", "/3000x3000"))
}

// ── Core Scrape Service ───────────────────────────────────────────────────────

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
            let is_date_prefix = before.chars().all(|c| {
                c.is_ascii_digit()
                    || c == '年'
                    || c == '月'
                    || c == '日'
                    || c == '-'
                    || c == ' '
            });
            if is_date_prefix {
                return title[pos + 3..].trim().to_string();
            }
        }

        // Try 《...》 bracket pattern — date then 《album name》 optional suffix
        if let (Some(start_byte), Some(end_byte)) = (
            title.find('《'),
            title.rfind('》'),
        ) {
            // Characters inside 《》
            let inside_start = start_byte + '《'.len_utf8();
            let inside = &title[inside_start..end_byte];
            // Suffix after 》 (e.g. " (日本版)")
            let suffix = title[end_byte + '》'.len_utf8()..].trim();
            if suffix.is_empty() {
                return inside.trim().to_string();
            } else {
                return format!("{} {}", inside.trim(), suffix);
            }
        }

        title.trim().to_string()
    }

    /// Search MusicBrainz for an album, pick best candidate, scrape and save.
    pub async fn auto_scrape_album(
        db: &DatabaseConnection,
        state: &Arc<AppState>,
        album_id: Uuid,
    ) -> AlbumScrapeResult {
        let album = match music_albums::Entity::find_by_id(album_id)
            .one(db)
            .await
        {
            Ok(Some(a)) => a,
            Ok(None) => {
                return AlbumScrapeResult {
                    album_id: album_id.to_string(),
                    title: String::new(),
                    clean_title: String::new(),
                    status: "failed".to_string(),
                    mb_release_id: None,
                    cover_downloaded: false,
                    genres: vec![],
                    year: None,
                    track_count_updated: 0,
                    error: Some("Album not found".to_string()),
                };
            }
            Err(e) => {
                return AlbumScrapeResult {
                    album_id: album_id.to_string(),
                    title: String::new(),
                    clean_title: String::new(),
                    status: "failed".to_string(),
                    mb_release_id: None,
                    cover_downloaded: false,
                    genres: vec![],
                    year: None,
                    track_count_updated: 0,
                    error: Some(e.to_string()),
                };
            }
        };

        // Get artist name from credits
        let artist_name = Self::get_album_artist(db, album_id).await;
        let clean_title = Self::extract_clean_title(&album.title);

        info!(
            "[music_scrape] Album \"{}\" → clean=\"{}\" artist=\"{}\"",
            album.title, clean_title, artist_name
        );

        // Search MusicBrainz with multiple fallback strategies
        let mb = rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient::new();
        let track_count = music_tracks::Entity::find()
            .filter(music_tracks::Column::AlbumId.eq(album_id))
            .count(db)
            .await
            .unwrap_or(0) as i32;

        let known_artist = artist_name != "Unknown Artist" && !artist_name.is_empty();

        // Build list of (artist, title) search variants to try in order
        let mut search_variants: Vec<(String, String)> = Vec::new();
        if known_artist {
            search_variants.push((artist_name.clone(), clean_title.clone()));
        }
        // Always add title-only search (works when artist is unknown or MB uses different artist)
        search_variants.push((String::new(), clean_title.clone()));
        // Strip common suffixes (EP, OST, 电影原声带, 原声带, 原声)
        let stripped = clean_title
            .trim_end_matches("EP")
            .trim_end_matches("电影原声带")
            .trim_end_matches("原声带")
            .trim_end_matches("原声")
            .trim_end_matches("OST")
            .trim()
            .to_string();
        if stripped != clean_title && !stripped.is_empty() {
            if known_artist {
                search_variants.push((artist_name.clone(), stripped.clone()));
            }
            search_variants.push((String::new(), stripped));
        }

        let mut best = None;
        for (search_artist, search_title) in &search_variants {
            let candidates = if search_artist.is_empty() {
                match mb.search_release_by_keyword(search_title, 15).await {
                    Ok(c) => c,
                    Err(e) => {
                        warn!("[music_scrape] MB keyword search failed for \"{}\": {}", search_title, e);
                        continue;
                    }
                }
            } else {
                match mb.search_release(search_artist, search_title, 15).await {
                    Ok(c) => c,
                    Err(e) => {
                        warn!("[music_scrape] MB search failed for \"{}\": {}", search_title, e);
                        continue;
                    }
                }
            };
            if let Some(c) = Self::pick_best_candidate(&candidates, &clean_title, track_count) {
                best = Some(c.clone());
                break;
            }
        }

        let mb_release_id = match best {
            Some(c) => {
                info!(
                    "[music_scrape] Best match for \"{}\": {} ({})",
                    clean_title, c.title, c.mb_release_id
                );
                c.mb_release_id.clone()
            }
            None => {
                warn!("[music_scrape] No MB match for \"{}\"", clean_title);
                return AlbumScrapeResult {
                    album_id: album_id.to_string(),
                    title: album.title.clone(),
                    clean_title,
                    status: "no_match".to_string(),
                    mb_release_id: None,
                    cover_downloaded: false,
                    genres: vec![],
                    year: None,
                    track_count_updated: 0,
                    error: None,
                };
            }
        };

        Self::scrape_album_by_mb_id(db, state, album_id, &mb_release_id, &artist_name, &clean_title).await
    }

    /// Upsert persons and rebuild media_credits for an album's artist-credits list.
    ///
    /// For each artist:
    /// 1. Find existing person by `mb_artist_id`, or by name; create if absent.
    /// 2. If birthday/birthplace not set, fetch from MusicBrainz artist endpoint.
    /// 3. If no profile photo: try Spotify (if configured) → Deezer (free fallback).
    /// 4. If no biography: fetch from Wikipedia (via MB url-rels, free).
    /// 5. Dispatch a TMDB person scrape job for each artist (gets richer bio/photo if TMDB configured).
    /// 6. Rebuild `media_credits` for the album (delete-then-insert).
    async fn save_album_artists(
        db: &DatabaseConnection,
        state: &Arc<AppState>,
        album_id: Uuid,
        artist_credits: &[rust_client_api::types::ArtistCredit],
    ) {
        use rust_client_api::metadata_providers::deezer::DeezerClient;
        use rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient;
        use rust_client_api::metadata_providers::spotify::{SpotifyClient, SpotifyConfig};
        use rust_client_api::metadata_providers::wikipedia::fetch_artist_biography;

        if artist_credits.is_empty() {
            return;
        }

        // Load Spotify config once
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent("tokimo/1.0 (https://tokimo.io; music-scraper)")
            .build()
            .unwrap_or_default();
        let spotify_client: Option<SpotifyClient> = {
            use crate::db::repos::config_repo::{ConfigRepo, SpotifySettings};
            if let Ok(cfg) = ConfigRepo::get::<SpotifySettings>(db).await {
                if let (Some(client_id), Some(client_secret)) = (cfg.client_id, cfg.client_secret) {
                    if !client_id.is_empty() && !client_secret.is_empty() {
                        Some(SpotifyClient::new(SpotifyConfig {
                            client_id,
                            client_secret,
                            cache_ttl: None,
                            http_client: http.clone(),
                        }))
                    } else { None }
                } else { None }
            } else { None }
        };
        let mb = MusicBrainzClient::new();
        let deezer = DeezerClient::new();

        let now = Utc::now().fixed_offset();
        let mut person_ids: Vec<Uuid> = Vec::new();

        for credit in artist_credits {
            // Find by mb_artist_id first, then by name
            let existing = persons::Entity::find()
                .filter(persons::Column::MbArtistId.eq(&credit.mb_id))
                .one(db)
                .await
                .unwrap_or(None)
                .or_else(|| None); // placeholder for name fallback below

            let existing = if existing.is_none() {
                persons::Entity::find()
                    .filter(persons::Column::Name.eq(&credit.name))
                    .one(db)
                    .await
                    .unwrap_or(None)
            } else {
                existing
            };

            let person_id = if let Some(mut p) = existing {
                // Update mb_artist_id if missing
                let mut active: persons::ActiveModel = p.clone().into();
                let mut changed = false;

                if p.mb_artist_id.is_none() {
                    active.mb_artist_id = Set(Some(credit.mb_id.clone()));
                    p.mb_artist_id = Some(credit.mb_id.clone());
                    changed = true;
                }

                // Fetch MB detail if any field is missing (birthday, birthplace, or biography)
                // biography requires wikipedia_url which only comes from get_artist_detail
                let mb_detail: Option<rust_client_api::metadata_providers::musicbrainz::ArtistDetail> =
                    if p.birthday.is_none() || p.birthplace.is_none() || p.biography.is_none() {
                        match mb.get_artist_detail(&credit.mb_id).await {
                            Ok(detail) => {
                                if p.birthday.is_none() {
                                    if let Some(bd_str) = detail.birthday.as_deref() {
                                        if let Ok(bd) = chrono::NaiveDate::parse_from_str(bd_str, "%Y-%m-%d") {
                                            active.birthday = Set(Some(bd));
                                            changed = true;
                                        }
                                    }
                                }
                                if p.birthplace.is_none() {
                                    if let Some(bp) = detail.birthplace.as_deref() {
                                        active.birthplace = Set(Some(bp.to_string()));
                                        changed = true;
                                    }
                                }
                                Some(detail)
                            }
                            Err(e) => {
                                warn!("[music_scrape] Failed to fetch MB artist detail for {}: {}", credit.mb_id, e);
                                None
                            }
                        }
                    } else {
                        None
                    };

                let mb_spotify_id = mb_detail.as_ref().and_then(|d| d.spotify_id.clone());

                // Fetch biography from Wikipedia if missing
                if p.biography.is_none() {
                    if let Some(ref wiki_url) = mb_detail.as_ref().and_then(|d| d.wikipedia_url.clone()) {
                        if let Some(bio) = fetch_artist_biography(&http, wiki_url).await {
                            active.biography = Set(Some(bio));
                            changed = true;
                        }
                    }
                }

                // Fetch photo independently: Spotify → Deezer (runs even if MB detail was skipped)
                if p.profile_path.is_none() {
                    let spotify_photo = if let Some(ref spotify) = spotify_client {
                        if let Some(ref sid) = mb_spotify_id {
                            spotify.get_artist_photo_by_id(sid).await.unwrap_or(None)
                        } else {
                            spotify.get_artist_photo(&credit.name).await.unwrap_or(None)
                        }
                    } else {
                        None
                    };
                    let photo_url = if spotify_photo.is_some() {
                        spotify_photo
                    } else {
                        deezer.get_artist_photo(&credit.name).await.unwrap_or(None)
                    };
                    if let Some(url) = photo_url {
                        active.profile_path = Set(Some(match Self::download_and_store_image(state, &url).await {
                            Some(stored) => stored,
                            None => url,
                        }));
                        changed = true;
                    }
                }

                if changed {
                    active.updated_at = Set(Some(now));
                    match active.update(db).await {
                        Ok(_) => {}
                        Err(e) => error!("[music_scrape] Failed to update person {}: {}", credit.name, e),
                    }
                }

                p.id
            } else {
                // Create new person record
                let new_id = Uuid::new_v4();
                let mut birthday = None;
                let mut birthplace = None;
                let mut profile_path: Option<String> = None;
                let mut biography: Option<String> = None;

                match mb.get_artist_detail(&credit.mb_id).await {
                    Ok(detail) => {
                        birthday = detail.birthday
                            .as_deref()
                            .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
                        birthplace = detail.birthplace.clone();
                        // Biography from Wikipedia
                        if let Some(ref wiki_url) = detail.wikipedia_url {
                            biography = fetch_artist_biography(&http, wiki_url).await;
                        }
                        // Photo: Spotify → Deezer
                        let spotify_photo = if let Some(ref spotify) = spotify_client {
                            if let Some(sid) = &detail.spotify_id {
                                spotify.get_artist_photo_by_id(sid).await.unwrap_or(None)
                            } else {
                                spotify.get_artist_photo(&credit.name).await.unwrap_or(None)
                            }
                        } else {
                            None
                        };
                        let photo_url = if spotify_photo.is_some() {
                            spotify_photo
                        } else {
                            deezer.get_artist_photo(&credit.name).await.unwrap_or(None)
                        };
                        if let Some(url) = photo_url {
                            profile_path = match Self::download_and_store_image(state, &url).await {
                                Some(stored) => Some(stored),
                                None => Some(url),
                            };
                        }
                    }
                    Err(e) => {
                        warn!("[music_scrape] Failed to fetch MB artist detail for new person {}: {}", credit.mb_id, e);
                    }
                }

                let active = persons::ActiveModel {
                    id: Set(new_id),
                    name: Set(credit.name.clone()),
                    original_name: Set(None),
                    aliases: Set(None),
                    gender: Set(None),
                    birthday: Set(birthday),
                    birthplace: Set(birthplace),
                    profile_path: Set(profile_path),
                    profile_key: Set(None),
                    biography: Set(biography),
                    deathday: Set(None),
                    known_for_dept: Set(Some("music".to_string())),
                    popularity: Set(None),
                    tmdb_id: Set(None),
                    imdb_id: Set(None),
                    javbus_id: Set(None),
                    javdb_id: Set(None),
                    tpdb_id: Set(None),
                    mb_artist_id: Set(Some(credit.mb_id.clone())),
                    metadata: Set(None),
                    created_at: Set(Some(now)),
                    updated_at: Set(Some(now)),
                };

                match persons::Entity::insert(active).exec(db).await {
                    Ok(_) => new_id,
                    Err(e) => {
                        // Unique constraint race: re-fetch
                        match persons::Entity::find()
                            .filter(persons::Column::MbArtistId.eq(&credit.mb_id))
                            .one(db)
                            .await
                            .unwrap_or(None)
                        {
                            Some(p) => p.id,
                            None => {
                                error!("[music_scrape] Failed to insert person {}: {}", credit.name, e);
                                continue;
                            }
                        }
                    }
                }
            };

            person_ids.push(person_id);
        }

        if person_ids.is_empty() {
            return;
        }

        // Dispatch TMDB person scrape for each artist (biography + richer photo via background job)
        for pid in &person_ids {
            let _ = crate::queue::handlers::common::force_dispatch_person_tmdb_scrape(
                db,
                *pid,
                None,
                None,
            )
            .await;
        }

        // Rebuild media_credits: delete old entries for this album, insert new ones
        let _ = media_credits::Entity::delete_many()
            .filter(media_credits::Column::AlbumId.eq(album_id))
            .exec(db)
            .await;

        for (i, pid) in person_ids.iter().enumerate() {
            let credit_model = media_credits::ActiveModel {
                id: Set(Uuid::new_v4()),
                person_id: Set(*pid),
                role: Set("artist".to_string()),
                character: Set(None),
                sort_order: Set(i as i32),
                movie_id: Set(None),
                tv_show_id: Set(None),
                episode_id: Set(None),
                album_id: Set(Some(album_id)),
                novel_id: Set(None),
            };
            let _ = media_credits::Entity::insert(credit_model).exec(db).await;
        }

        info!(
            "[music_scrape] Updated {} artist credits for album {}",
            person_ids.len(),
            album_id
        );
    }

    /// Download an image from a URL and store it via the upload infrastructure.
    /// Returns the stored path, or None on failure.
    async fn download_and_store_image(
        state: &Arc<AppState>,
        url: &str,
    ) -> Option<String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .ok()?;
        let response = client.get(url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let bytes = response.bytes().await.ok()?;
        let key = format!("persons/{}.jpg", Uuid::new_v4());
        match upload_image_buffer(state, &bytes, &key).await {
            Ok(path) => Some(path),
            Err(_) => None,
        }
    }

    /// Scrape a specific album using a known MusicBrainz release ID.
    pub async fn scrape_album_by_mb_id(
        db: &DatabaseConnection,
        state: &Arc<AppState>,
        album_id: Uuid,
        mb_release_id: &str,
        artist_name: &str,
        clean_title: &str,
    ) -> AlbumScrapeResult {
        let album = match music_albums::Entity::find_by_id(album_id).one(db).await {
            Ok(Some(a)) => a,
            _ => {
                return AlbumScrapeResult {
                    album_id: album_id.to_string(),
                    title: String::new(),
                    clean_title: clean_title.to_string(),
                    status: "failed".to_string(),
                    mb_release_id: Some(mb_release_id.to_string()),
                    cover_downloaded: false,
                    genres: vec![],
                    year: None,
                    track_count_updated: 0,
                    error: Some("Album not found".to_string()),
                };
            }
        };

        // Check if another album already uses this MB release ID
        let duplicate = music_albums::Entity::find()
            .filter(music_albums::Column::MbAlbumId.eq(mb_release_id))
            .filter(music_albums::Column::Id.ne(album_id))
            .one(db)
            .await
            .unwrap_or(None);
        if let Some(dup) = duplicate {
            warn!(
                "[music_scrape] MB release {} already used by album \"{}\" — skipping \"{}\"",
                mb_release_id, dup.title, clean_title
            );
            return AlbumScrapeResult {
                album_id: album_id.to_string(),
                title: album.title.clone(),
                clean_title: clean_title.to_string(),
                status: "no_match".to_string(),
                mb_release_id: None,
                cover_downloaded: false,
                genres: vec![],
                year: None,
                track_count_updated: 0,
                error: None,
            };
        }

        let mb = rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient::new();
        let detail = match mb.get_release(mb_release_id).await {
            Ok(d) => d,
            Err(e) => {
                error!("[music_scrape] MB get_release failed: {}", e);
                return AlbumScrapeResult {
                    album_id: album_id.to_string(),
                    title: album.title.clone(),
                    clean_title: clean_title.to_string(),
                    status: "failed".to_string(),
                    mb_release_id: Some(mb_release_id.to_string()),
                    cover_downloaded: false,
                    genres: vec![],
                    year: None,
                    track_count_updated: 0,
                    error: Some(e.to_string()),
                };
            }
        };

        let genres = detail.genres.clone().unwrap_or_default();
        let year = detail.year;
        let now = Utc::now().fixed_offset();

        // Download cover art
        let cover_path = Self::download_cover(state, album_id, &detail.cover_url, artist_name, clean_title).await;
        let cover_downloaded = cover_path.is_some();

        // Update album in DB
        let mut active: music_albums::ActiveModel = album.clone().into();
        active.mb_album_id = Set(Some(mb_release_id.to_string()));
        active.year = Set(year);
        if let Some(rd) = &detail.release_date {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(rd, "%Y-%m-%d") {
                active.release_date = Set(Some(date));
            } else if let Ok(date) = chrono::NaiveDate::parse_from_str(&format!("{}-01-01", &rd[..rd.len().min(4)]), "%Y-%m-%d") {
                active.release_date = Set(Some(date));
            }
        }
        if let Some(at) = &detail.album_type {
            active.album_type = Set(Some(at.clone()));
        }
        if let Some(total) = detail.total_tracks {
            active.total_tracks = Set(Some(total));
        }
        if let Some(discs) = detail.total_discs {
            active.total_discs = Set(Some(discs));
        }
        if let Some(cp) = &cover_path {
            active.cover_path = Set(Some(cp.clone()));
        }
        // Store genres and MB release group in metadata
        active.metadata = Set(Some(serde_json::json!({
            "mbReleaseGroupId": detail.mb_release_group_id,
            "genres": genres,
            "scrapedFrom": "musicbrainz",
        })));
        active.scraped_at = Set(Some(now));
        active.updated_at = Set(Some(now));

        if let Err(e) = active.update(db).await {
            error!("[music_scrape] Failed to update album {}: {}", album_id, e);
            return AlbumScrapeResult {
                album_id: album_id.to_string(),
                title: album.title.clone(),
                clean_title: clean_title.to_string(),
                status: "failed".to_string(),
                mb_release_id: Some(mb_release_id.to_string()),
                cover_downloaded: false,
                genres,
                year,
                track_count_updated: 0,
                error: Some(e.to_string()),
            };
        }

        // Update tracks with duration, genre and lyrics from MB + LrcLib
        let track_count_updated = if let Some(mb_tracks) = &detail.tracks {
            Self::update_tracks(db, state, album_id, mb_tracks, genres.first().cloned().as_deref(), artist_name, clean_title).await
        } else {
            // No MB tracks, still try to fetch lyrics
            Self::update_tracks(db, state, album_id, &[], None, artist_name, clean_title).await
        };

        // Upsert artist persons and rebuild media_credits
        Self::save_album_artists(db, state, album_id, &detail.artist_credits).await;

        info!(
            "[music_scrape] ✓ Scraped \"{}\" → year={:?} genres={:?} cover={} tracks_updated={}",
            clean_title, year, genres, cover_downloaded, track_count_updated
        );

        AlbumScrapeResult {
            album_id: album_id.to_string(),
            title: album.title.clone(),
            clean_title: clean_title.to_string(),
            status: "success".to_string(),
            mb_release_id: Some(mb_release_id.to_string()),
            cover_downloaded,
            genres,
            year,
            track_count_updated,
            error: None,
        }
    }

    /// Download cover art with priority: Spotify (if configured) → iTunes → MusicBrainz CAA.
    async fn download_cover(
        state: &Arc<AppState>,
        album_id: Uuid,
        mb_cover_url: &Option<String>,
        artist_name: &str,
        clean_title: &str,
    ) -> Option<String> {
        use rust_client_api::metadata_providers::spotify::{SpotifyClient, SpotifyConfig};
        use crate::db::repos::config_repo::{ConfigRepo, SpotifySettings};

        let http = reqwest::Client::builder()
            .user_agent("tokimo/1.0")
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        let key = format!("library-images/music/{}/cover.jpg", album_id);

        // Helper: download url and upload to storage
        macro_rules! try_cover {
            ($url:expr, $source:expr) => {{
                match http.get($url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(bytes) = resp.bytes().await {
                            match upload_image_buffer(state, &bytes, &key).await {
                                Ok(path) => {
                                    info!("[music_scrape] Cover saved from {}: {}", $source, path);
                                    return Some(path);
                                }
                                Err(e) => warn!("[music_scrape] {} cover upload failed: {}", $source, e),
                            }
                        }
                    }
                    Ok(resp) => info!("[music_scrape] {} cover not available ({})", $source, resp.status()),
                    Err(e) => warn!("[music_scrape] {} request failed: {}", $source, e),
                }
            }};
        }

        // Priority 1: Spotify (only if client_id + client_secret are configured)
        if let Ok(spotify_settings) = ConfigRepo::get::<SpotifySettings>(&state.db).await {
            if let (Some(client_id), Some(client_secret)) =
                (spotify_settings.client_id, spotify_settings.client_secret)
            {
                if !client_id.is_empty() && !client_secret.is_empty() {
                    let spotify = SpotifyClient::new(SpotifyConfig {
                        client_id,
                        client_secret,
                        cache_ttl: None,
                        http_client: http.clone(),
                    });
                    match spotify.search_album(artist_name, clean_title, 1).await {
                        Ok(results) => {
                            if let Some(cover_url) = results.into_iter().next().and_then(|r| r.cover_url) {
                                try_cover!(&cover_url, "Spotify");
                            }
                        }
                        Err(e) => warn!("[music_scrape] Spotify search failed: {}", e),
                    }
                }
            }
        }

        // Priority 2: iTunes Search API (free, no key, good quality)
        if let Some(itunes_url) = itunes_get_cover_url(artist_name, clean_title).await {
            try_cover!(&itunes_url, "iTunes");
        }

        // Priority 3: MusicBrainz Cover Art Archive
        if let Some(url) = mb_cover_url {
            try_cover!(url.as_str(), "MusicBrainz CAA");
        }

        warn!("[music_scrape] No cover found for \"{}\"", clean_title);
        None
    }

    /// Update track durations, genres, and fetch lyrics from LrcLib.
    async fn update_tracks(
        db: &DatabaseConnection,
        state: &Arc<AppState>,
        album_id: Uuid,
        mb_tracks: &[rust_client_api::types::MusicTrack],
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
            let mb_track = mb_tracks
                .iter()
                .find(|t| t.number == db_track.track_number.unwrap_or(0));

            let mut active: music_tracks::ActiveModel = db_track.clone().into();
            let mut changed = false;

            if let Some(mb_t) = mb_track {
                if mb_t.duration.is_some() && db_track.duration.is_none() {
                    active.duration = Set(mb_t.duration);
                    changed = true;
                }
                if let Some(genre) = primary_genre {
                    if db_track.genre.is_none() {
                        active.genre = Set(Some(genre.to_string()));
                        changed = true;
                    }
                }
            }

            // Fetch lyrics if not already cached
            if db_track.lyrics_path.is_none() {
                let duration = db_track.duration.map(|d| d as u32);

                // For compilation tracks, title may be "曲名－艺术家" or "曲名-艺术家"
                // Parse out per-track artist and clean title if separator present.
                // We must track the actual separator char to get correct byte length.
                let (track_clean_title, effective_artist) = {
                    let sep = db_track
                        .title
                        .find('－')
                        .map(|p| (p, '－'))
                        .or_else(|| db_track.title.rfind('-').map(|p| (p, '-')));
                    if let Some((pos, sep_char)) = sep {
                        let raw_title = db_track.title[..pos].trim().to_string();
                        let after = db_track.title[pos + sep_char.len_utf8()..].trim().to_string();
                        if after.is_empty() {
                            (db_track.title.clone(), artist_name.to_string())
                        } else {
                            (raw_title, after)
                        }
                    } else {
                        (db_track.title.clone(), artist_name.to_string())
                    }
                };

                // Try with album name first, then without, for best coverage
                let lyrics_result = match rust_client_api::metadata_providers::lrclib::fetch_lyrics(
                    &http,
                    &effective_artist,
                    &track_clean_title,
                    Some(album_title),
                    duration,
                )
                .await
                {
                    Ok(Some(l)) => Ok(Some(l)),
                    _ => rust_client_api::metadata_providers::lrclib::fetch_lyrics(
                        &http,
                        &effective_artist,
                        &track_clean_title,
                        None,
                        duration,
                    )
                    .await,
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
                            let key = format!("lyrics/music/{}/{}.{}", album_id, db_track.id, ext);
                            match state
                                .storage
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
                                    active.lyrics_path = Set(Some(format!("/storage/{key}")));
                                    changed = true;
                                    info!("[music_scrape] Lyrics saved for \"{}\"", db_track.title);
                                }
                                Err(e) => warn!("[music_scrape] Lyrics upload failed: {}", e),
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(e) => warn!("[music_scrape] LrcLib failed for \"{}\": {}", db_track.title, e),
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

    /// Batch auto-scrape all unscraped albums in a music app.
    pub async fn batch_scrape_app(
        db: &DatabaseConnection,
        state: &Arc<AppState>,
        app_id: Uuid,
        force: bool,
    ) -> Result<BatchScrapeResult, AppError> {
        let albums = if force {
            music_albums::Entity::find()
                .filter(music_albums::Column::AppId.eq(app_id))
                .all(db)
                .await?
        } else {
            music_albums::Entity::find()
                .filter(music_albums::Column::AppId.eq(app_id))
                .filter(music_albums::Column::ScrapedAt.is_null())
                .all(db)
                .await?
        };

        info!("[music_scrape] Batch scraping {} albums for app {}", albums.len(), app_id);

        let mut results = Vec::new();
        let mut success = 0i32;
        let mut failed = 0i32;
        let mut skipped = 0i32;

        for album in &albums {
            // When force=true and the album already has an mb_album_id, reuse it (preserves
            // any manual corrections) and just refresh metadata/lyrics. Only auto-search when
            // there is no known MB release yet.
            let r = if let Some(ref mb_id) = album.mb_album_id {
                let artist = Self::get_album_artist(db, album.id).await;
                let clean = Self::extract_clean_title(&album.title);
                Self::scrape_album_by_mb_id(db, state, album.id, mb_id, &artist, &clean).await
            } else {
                Self::auto_scrape_album(db, state, album.id).await
            };
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

    /// Public wrapper for get_album_artist (used by handlers).
    pub async fn get_album_artist_pub(db: &DatabaseConnection, album_id: Uuid) -> String {
        Self::get_album_artist(db, album_id).await
    }

    /// Get the primary artist name for an album from media_credits.
    async fn get_album_artist(db: &DatabaseConnection, album_id: Uuid) -> String {
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT p.name FROM media_credits mc \
             JOIN persons p ON p.id = mc.person_id \
             WHERE mc.album_id = $1 AND mc.role IN ('artist', 'albumArtist') \
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

    /// Pick best MusicBrainz candidate by title similarity and track count.
    fn pick_best_candidate<'a>(
        candidates: &'a [rust_client_api::types::MusicMatchCandidate],
        clean_title: &str,
        db_track_count: i32,
    ) -> Option<&'a rust_client_api::types::MusicMatchCandidate> {
        if candidates.is_empty() {
            return None;
        }

        let title_lower = clean_title.to_lowercase();

        // Score candidates: title match (0-2) + track count match (0-1) + MB score (0-1)
        let scored: Vec<(usize, i32)> = candidates
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let mut score = 0i32;

                // Title match
                let mb_lower = c.title.to_lowercase();
                if mb_lower == title_lower {
                    score += 200;
                } else if mb_lower.contains(&title_lower) || title_lower.contains(&mb_lower) {
                    score += 100;
                }

                // Track count match
                if let Some(tc) = c.track_count {
                    if db_track_count > 0 && (tc - db_track_count).abs() <= 1 {
                        score += 50;
                    }
                }

                // MB search score
                score += c.score.unwrap_or(0);

                (i, score)
            })
            .collect();

        scored
            .into_iter()
            .max_by_key(|&(_, s)| s)
            .map(|(i, _)| &candidates[i])
    }
}
