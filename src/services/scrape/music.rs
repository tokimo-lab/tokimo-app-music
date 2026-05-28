use chrono::Utc;
use rust_client_api::metadata_providers::musicbrainz::MusicBrainzClient;
use rust_client_api::types::{MusicMatchCandidate, MusicMatchDetail};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DatabaseConnection, EntityTrait};
use serde::Deserialize;
use uuid::Uuid;

use crate::db::entities::{albums, tracks};
use crate::error::AppError;

pub struct MusicScrapeService;

impl MusicScrapeService {
    pub fn extract_clean_title(title: &str) -> String {
        extract_clean_title(title)
    }

    pub async fn fetch_lyrics_for_track(
        db: &DatabaseConnection,
        track: &tracks::Model,
    ) -> Result<Option<crate::db::entities::lyrics::Model>, AppError> {
        use rust_client_api::metadata_providers::lrclib;

        let title = match track.title.as_deref() {
            Some(title) if !title.is_empty() => title,
            _ => return Ok(None),
        };
        let artist = track.artist.as_deref().unwrap_or("");
        let album = track.album.as_deref();
        let duration = track.duration_secs.map(|duration| duration as u32);
        let http = reqwest::Client::new();
        let result = lrclib::fetch_lyrics(&http, artist, title, album, duration)
            .await
            .map_err(|error| AppError::Internal(format!("LrcLib fetch: {error}")))?;
        let Some(lyrics) = result else {
            return Ok(None);
        };
        if lyrics.plain_lyrics.is_none() && lyrics.synced_lyrics.is_none() {
            return Ok(None);
        }
        let text = lyrics.plain_lyrics.unwrap_or_default();
        let synced = lyrics.synced_lyrics.map(serde_json::Value::String);
        let row =
            crate::db::repos::lyrics_repo::LyricsRepo::upsert(db, track.id, text, synced).await?;
        Ok(Some(row))
    }

    pub async fn auto_scrape_album(
        db: &DatabaseConnection,
        album_id: Uuid,
    ) -> Result<albums::Model, AppError> {
        let album = albums::Entity::find_by_id(album_id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("album {album_id} not found")))?;

        let clean_title = Self::extract_clean_title(&album.name);
        let artist = album.artist.clone().unwrap_or_default();
        let client = MusicBrainzClient::new();

        let mut candidates = if artist.is_empty() {
            Vec::new()
        } else {
            client
                .search_release(&artist, &clean_title, 8)
                .await
                .map_err(|e| AppError::Internal(format!("MusicBrainz search_release: {e}")))?
        };

        if candidates.is_empty() {
            let keyword = if artist.is_empty() {
                clean_title.clone()
            } else {
                format!("{artist} {clean_title}")
            };
            candidates = client
                .search_release_by_keyword(&keyword, 8)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("MusicBrainz search_release_by_keyword: {e}"))
                })?;
        }

        let candidate = pick_best_candidate(
            &clean_title,
            album.artist.as_deref(),
            album.track_count,
            &candidates,
        );
        let detail = match candidate {
            Some(candidate) => Some(
                client
                    .get_release(&candidate.mb_release_id)
                    .await
                    .map_err(|e| AppError::Internal(format!("MusicBrainz get_release: {e}")))?,
            ),
            None => None,
        };

        let mut cover_url = detail
            .as_ref()
            .and_then(|d| d.cover_url.clone())
            .map(|url| url.replace("front-500", "front-1200"))
            .or_else(|| detail.as_ref().and_then(high_res_cover_from_detail))
            .or_else(|| album.cover_url.clone());
        let mut year = detail
            .as_ref()
            .and_then(|d| d.year)
            .or_else(|| candidate.and_then(|c| c.year))
            .or(album.year);
        if cover_url.is_none()
            && let Some((itunes_cover, itunes_year)) =
                itunes_high_res_cover(&clean_title, album.artist.as_deref()).await?
        {
            cover_url = Some(itunes_cover);
            year = year.or(itunes_year);
        }

        let mut active: albums::ActiveModel = album.into();
        active.name = Set(detail.as_ref().map_or(clean_title, |d| d.title.clone()));
        if let Some(artist) = detail
            .as_ref()
            .map(|d| d.artist.clone())
            .filter(|s| !s.is_empty())
        {
            active.artist = Set(Some(artist));
        }
        active.year = Set(year);
        active.cover_url = Set(cover_url);
        active.updated_at = Set(Utc::now().fixed_offset());

        Ok(active.update(db).await?)
    }
}

pub fn extract_clean_title(title: &str) -> String {
    let trimmed = title.trim();
    if let Some(rest) = strip_date_dash_prefix(trimmed) {
        return rest.to_string();
    }
    if let (Some(start), Some(end)) = (trimmed.find('《'), trimmed.rfind('》'))
        && end > start
    {
        let prefix = trimmed[..start].trim();
        if prefix.chars().all(is_date_noise) {
            let inside = trimmed[start + '《'.len_utf8()..end].trim();
            let suffix = trimmed[end + '》'.len_utf8()..].trim();
            return if suffix.is_empty() {
                inside.to_string()
            } else {
                format!("{inside} {suffix}")
            };
        }
    }
    trimmed.to_string()
}

fn strip_date_dash_prefix(value: &str) -> Option<&str> {
    let separators = [" - ", " – ", " — ", "日-", "日 - "];
    for separator in separators {
        if let Some(pos) = value.find(separator) {
            let prefix = &value[..pos];
            if !prefix.is_empty() && prefix.chars().all(is_date_noise) {
                return Some(value[pos + separator.len()..].trim());
            }
        }
    }
    None
}

fn is_date_noise(ch: char) -> bool {
    ch.is_ascii_digit() || matches!(ch, '年' | '月' | '日' | '-' | '/' | '.' | ' ')
}

pub fn pick_best_candidate<'a>(
    title: &str,
    artist: Option<&str>,
    track_count: i32,
    candidates: &'a [MusicMatchCandidate],
) -> Option<&'a MusicMatchCandidate> {
    let expected_title = normalize(title);
    let expected_artist = artist.map(normalize).unwrap_or_default();

    candidates.iter().max_by_key(|candidate| {
        let mut score = candidate.score.unwrap_or(0);
        let candidate_title = normalize(&candidate.title);
        if candidate_title == expected_title {
            score += 80;
        } else if candidate_title.contains(&expected_title)
            || expected_title.contains(&candidate_title)
        {
            score += 30;
        }

        if !expected_artist.is_empty() {
            let candidate_artist = normalize(&candidate.artist);
            if candidate_artist == expected_artist {
                score += 50;
            } else if candidate_artist.contains(&expected_artist)
                || expected_artist.contains(&candidate_artist)
            {
                score += 20;
            }
        }

        if candidate.track_count == Some(track_count) {
            score += 15;
        }
        if candidate.format.as_deref() == Some("CD") {
            score += 5;
        }
        score
    })
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn high_res_cover_from_detail(detail: &MusicMatchDetail) -> Option<String> {
    detail.mb_release_group_id.as_ref().map(|id| {
        MusicBrainzClient::get_release_group_cover_url(id).replace("front-500", "front-1200")
    })
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesSearchResponse {
    results: Vec<ItunesAlbum>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesAlbum {
    collection_name: Option<String>,
    artist_name: Option<String>,
    artwork_url100: Option<String>,
    release_date: Option<String>,
}

#[allow(dead_code)]
async fn itunes_high_res_cover(
    title: &str,
    artist: Option<&str>,
) -> Result<Option<(String, Option<i32>)>, AppError> {
    let term = match artist {
        Some(artist) if !artist.trim().is_empty() => format!("{artist} {title}"),
        _ => title.to_string(),
    };
    let url = format!(
        "https://itunes.apple.com/search?entity=album&limit=8&term={}",
        urlencoding::encode(&term)
    );
    let response = reqwest::get(url)
        .await
        .map_err(|e| AppError::Internal(format!("iTunes search: {e}")))?
        .json::<ItunesSearchResponse>()
        .await
        .map_err(|e| AppError::Internal(format!("iTunes decode: {e}")))?;
    let expected_title = normalize(title);
    let expected_artist = artist.map(normalize).unwrap_or_default();
    let best = response.results.into_iter().max_by_key(|item| {
        let mut score = 0;
        if item
            .collection_name
            .as_deref()
            .map(normalize)
            .is_some_and(|value| value == expected_title)
        {
            score += 50;
        }
        if !expected_artist.is_empty()
            && item
                .artist_name
                .as_deref()
                .map(normalize)
                .is_some_and(|value| value == expected_artist)
        {
            score += 30;
        }
        score
    });
    Ok(best.and_then(|item| {
        let cover = item
            .artwork_url100?
            .replace("100x100bb", "1200x1200bb")
            .replace("100x100-999", "1200x1200-999");
        let year = item
            .release_date
            .and_then(|date| date.get(..4).and_then(|year| year.parse().ok()));
        Some((cover, year))
    }))
}
