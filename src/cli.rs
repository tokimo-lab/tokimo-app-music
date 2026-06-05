//! CLI entrypoints for music app.
//!
//! Subcommands: `find`, `artist`.

use anyhow::Context;
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use uuid::Uuid;

// ── Shared init ──────────────────────────────────────────────────────────────

/// Connect to the database. CLI mode doesn't need user auth (local music library).
async fn init_db() -> anyhow::Result<sea_orm::DatabaseConnection> {
    crate::db::init_pool()
        .await
        .context("connect database failed")
}

// ── find ─────────────────────────────────────────────────────────────────────

/// `find` — search tracks by title across all music libraries.
pub async fn run_find(
    query: String,
    artist: Option<String>,
    library: Option<String>,
    limit: u32,
    raw: bool,
) -> anyhow::Result<()> {
    let db = init_db().await?;

    let mut conds = vec!["t.title ILIKE $1".to_string()];
    let mut params: Vec<sea_orm::Value> = vec![format!("%{query}%").into()];
    let mut n = 2usize;

    if let Some(ref a) = artist.filter(|s| !s.trim().is_empty()) {
        conds.push(format!("ma.name ILIKE ${n}"));
        params.push(format!("%{a}%").into());
        n += 1;
    }
    if let Some(ref lib) = library.filter(|s| !s.trim().is_empty()) {
        let lib_id: Uuid = lib
            .parse()
            .map_err(|_| anyhow::anyhow!("invalid library ID: '{lib}'"))?;
        conds.push(format!("a.music_id = ${n}"));
        params.push(lib_id.into());
        n += 1;
    }

    let wh = conds.join(" AND ");
    let lim = n;

    let sql = format!(
        "SELECT t.id, t.title, t.track_number, t.disc_number, t.duration, t.genre, \
         a.title as album_title, a.music_id, \
         ma.name as artist_name \
         FROM music_tracks t \
         JOIN music_albums a ON a.id = t.album_id \
         LEFT JOIN music_album_artists maa ON maa.album_id = a.id AND maa.sort_order = 0 \
         LEFT JOIN music_artists ma ON ma.id = maa.artist_id \
         WHERE {wh} \
         ORDER BY t.title ASC \
         LIMIT ${lim}"
    );
    params.push((limit as i64).into());

    let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, &sql, params);
    let rows = db.query_all_raw(stmt).await?;

    if raw {
        let items: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": get_uuid(r, "id"),
                    "title": get_str(r, "title"),
                    "artist": get_opt_str(r, "artist_name"),
                    "album": get_opt_str(r, "album_title"),
                    "trackNumber": get_opt_i32(r, "track_number"),
                    "discNumber": get_opt_i32(r, "disc_number"),
                    "duration": get_opt_i32(r, "duration"),
                    "genre": get_opt_str(r, "genre"),
                    "musicId": get_uuid(r, "music_id"),
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&items)?);
        return Ok(());
    }

    if rows.is_empty() {
        println!("No tracks found for '{query}'.");
        return Ok(());
    }

    println!("♫ Found {} track(s) for \"{query}\":\n", rows.len());
    println!(
        "  {:<36}  {:<30}  {:<25}  {:<30}  {:<8}  Genre",
        "ID", "Title", "Artist", "Album", "Duration"
    );
    println!("  {}", "-".repeat(145));

    for r in &rows {
        let title = truncate(&get_str(r, "title"), 30);
        let artist_name = truncate(get_opt_str(r, "artist_name").as_deref().unwrap_or("-"), 25);
        let album_title = truncate(get_opt_str(r, "album_title").as_deref().unwrap_or("-"), 30);
        let duration = get_opt_i32(r, "duration")
            .map(format_secs)
            .unwrap_or_else(|| "-".into());
        let genre = get_opt_str(r, "genre").unwrap_or_else(|| "-".into());
        let id = get_uuid(r, "id");

        println!(
            "  {:<36}  {:<30}  {:<25}  {:<30}  {:<8}  {}",
            id, title, artist_name, album_title, duration, genre
        );
    }

    Ok(())
}

// ── artist ───────────────────────────────────────────────────────────────────

/// `artist` — find an artist and display their full discography.
pub async fn run_artist(name: String, library: Option<String>, raw: bool) -> anyhow::Result<()> {
    let db = init_db().await?;

    // Step 1: Find matching artists
    let mut artist_conds = vec!["ma.name ILIKE $1".to_string()];
    let mut artist_params: Vec<sea_orm::Value> = vec![format!("%{name}%").into()];
    let mut n = 2usize;

    if let Some(lib) = library.as_deref().filter(|s| !s.trim().is_empty()) {
        let lib_id: Uuid = lib
            .parse()
            .map_err(|_| anyhow::anyhow!("invalid library ID: '{lib}'"))?;
        artist_conds.push(format!(
            "EXISTS (SELECT 1 FROM music_album_artists maa2 \
             JOIN music_albums a2 ON a2.id = maa2.album_id \
             WHERE maa2.artist_id = ma.id AND a2.music_id = ${n})"
        ));
        artist_params.push(lib_id.into());
        n += 1;
    }

    let artist_wh = artist_conds.join(" AND ");
    let lim = n;
    artist_params.push(20i64.into()); // max artists

    let artist_sql = format!(
        "SELECT DISTINCT ma.id, ma.name, ma.genres \
         FROM music_artists ma \
         WHERE {artist_wh} \
         ORDER BY ma.name \
         LIMIT ${lim}"
    );
    let artist_stmt =
        Statement::from_sql_and_values(DatabaseBackend::Postgres, &artist_sql, artist_params);
    let artist_rows = db.query_all_raw(artist_stmt).await?;

    if artist_rows.is_empty() {
        println!("No artists found for '{name}'.");
        return Ok(());
    }

    // Step 2: For each artist, get their albums and tracks
    let mut results: Vec<serde_json::Value> = Vec::new();

    for ar in &artist_rows {
        let artist_id = get_uuid(ar, "id");
        let artist_name = get_str(ar, "name");

        // Get albums for this artist
        let mut album_conds = vec!["maa.artist_id = $1".to_string()];
        let artist_uuid: Uuid = artist_id.parse().unwrap_or_default();
        let mut album_params: Vec<sea_orm::Value> = vec![artist_uuid.into()];
        let mut an = 2usize;

        if let Some(lib) = library.as_deref().filter(|s| !s.trim().is_empty()) {
            let lib_id: Uuid = lib.parse().unwrap();
            album_conds.push(format!("a.music_id = ${an}"));
            album_params.push(lib_id.into());
            an += 1;
        }

        let album_wh = album_conds.join(" AND ");
        let album_lim = an;
        album_params.push(100i64.into());

        let album_sql = format!(
            "SELECT a.id, a.title, a.year, a.cover_path, a.album_type, a.is_favorite \
             FROM music_albums a \
             JOIN music_album_artists maa ON maa.album_id = a.id \
             WHERE {album_wh} \
             ORDER BY a.year DESC NULLS LAST \
             LIMIT ${album_lim}"
        );
        let album_stmt =
            Statement::from_sql_and_values(DatabaseBackend::Postgres, &album_sql, album_params);
        let album_rows = db.query_all_raw(album_stmt).await?;

        let mut albums: Vec<serde_json::Value> = Vec::new();

        for al in &album_rows {
            let album_id = get_uuid(al, "id");
            let album_title = get_str(al, "title");

            // Get tracks for this album
            let track_sql = "SELECT t.id, t.title, t.track_number, t.disc_number, t.duration, t.genre \
                             FROM music_tracks t WHERE t.album_id = $1 \
                             ORDER BY t.disc_number ASC NULLS FIRST, t.track_number ASC NULLS LAST";
            let album_uuid: Uuid = album_id.parse().unwrap_or_default();
            let track_stmt = Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                track_sql,
                [album_uuid.into()],
            );
            let track_rows = db.query_all_raw(track_stmt).await?;

            let tracks: Vec<serde_json::Value> = track_rows
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "id": get_uuid(t, "id"),
                        "title": get_str(t, "title"),
                        "trackNumber": get_opt_i32(t, "track_number"),
                        "discNumber": get_opt_i32(t, "disc_number"),
                        "duration": get_opt_i32(t, "duration"),
                        "genre": get_opt_str(t, "genre"),
                    })
                })
                .collect();

            albums.push(serde_json::json!({
                "id": album_id.clone(),
                "title": album_title,
                "year": get_opt_i32(al, "year"),
                "albumType": get_opt_str(al, "album_type"),
                "isFavorite": get_bool(al, "is_favorite"),
                "coverPath": get_opt_str(al, "cover_path"),
                "tracks": tracks,
            }));
        }

        let genres: Vec<String> = get_opt_str(ar, "genres")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        results.push(serde_json::json!({
            "id": artist_id.clone(),
            "name": artist_name,
            "genres": genres,
            "albums": albums,
        }));
    }

    if raw {
        println!("{}", serde_json::to_string_pretty(&results)?);
        return Ok(());
    }

    // Formatted output
    for (i, ar) in results.iter().enumerate() {
        let artist_name = ar["name"].as_str().unwrap_or("-");
        let albums = ar["albums"].as_array().unwrap();
        let total_tracks: i64 = albums
            .iter()
            .flat_map(|a| a["tracks"].as_array())
            .map(|t| t.len() as i64)
            .sum();

        if i > 0 {
            println!();
        }
        println!(
            "🎤 {} ({} album(s), {} track(s))",
            artist_name,
            albums.len(),
            total_tracks
        );

        for album in albums {
            let album_title = album["title"].as_str().unwrap_or("-");
            let year = album["year"]
                .as_i64()
                .map(|y| y.to_string())
                .unwrap_or_else(|| "-".into());
            let tracks = album["tracks"].as_array().unwrap();

            println!();
            println!("  📁 {album_title} ({year}) — {} track(s)", tracks.len());
            println!("     {:<4}  {:<40}  {:<8}  Genre", "#", "Title", "Duration");
            println!("     {}", "-".repeat(70));

            for track in tracks {
                let track_num = track["trackNumber"]
                    .as_i64()
                    .map(|n| n.to_string())
                    .unwrap_or_else(|| "-".into());
                let track_title = truncate(track["title"].as_str().unwrap_or("-"), 40);
                let duration = track["duration"]
                    .as_i64()
                    .map(|d| format_secs(d as i32))
                    .unwrap_or_else(|| "-".into());
                let genre = track["genre"].as_str().unwrap_or("-");

                println!(
                    "     {:<4}  {:<40}  {:<8}  {}",
                    track_num, track_title, duration, genre
                );
            }
        }
    }

    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let end = s
            .char_indices()
            .nth(max - 1)
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(s.len());
        format!("{}…", &s[..end])
    }
}

fn format_secs(secs: i32) -> String {
    let mins = secs / 60;
    let s = secs % 60;
    format!("{mins}:{s:02}")
}

fn get_uuid(row: &sea_orm::QueryResult, col: &str) -> String {
    row.try_get::<Uuid>("", col)
        .map(|v| v.to_string())
        .unwrap_or_default()
}

fn get_str(row: &sea_orm::QueryResult, col: &str) -> String {
    row.try_get::<String>("", col).unwrap_or_default()
}

fn get_opt_str(row: &sea_orm::QueryResult, col: &str) -> Option<String> {
    row.try_get::<Option<String>>("", col).unwrap_or_default()
}

fn get_opt_i32(row: &sea_orm::QueryResult, col: &str) -> Option<i32> {
    row.try_get::<Option<i32>>("", col).unwrap_or_default()
}

fn get_bool(row: &sea_orm::QueryResult, col: &str) -> bool {
    row.try_get::<bool>("", col).unwrap_or(false)
}
