-- Migration 20260528000004: Align music schema with presplit entities
-- Drop old tables in dependency order, create new tables matching presplit entities

-- Drop old tables (in reverse dependency order)
DROP TABLE lyrics;
DROP TABLE library_sync_status;
DROP TABLE tracks;
DROP TABLE genres;
DROP TABLE artists;
DROP TABLE albums;
DROP TABLE libraries;

-- Create new musics table (top-level library entity)
CREATE TABLE musics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    avatar JSONB,
    description TEXT,
    poster_path TEXT,
    scrape_enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    settings JSONB,
    sources JSONB NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'idle',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create music_albums table
CREATE TABLE music_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    music_id UUID NOT NULL REFERENCES musics(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_title TEXT,
    year INTEGER,
    release_date DATE,
    album_type TEXT,
    mb_album_id TEXT UNIQUE,
    cover_path TEXT,
    overview TEXT,
    total_tracks INTEGER,
    total_discs INTEGER,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX music_albums_music_id_idx ON music_albums (music_id);

-- Create music_artists table
CREATE TABLE music_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    original_name TEXT,
    biography TEXT,
    profile_path TEXT,
    profile_key TEXT,
    popularity INTEGER,
    followers INTEGER,
    genres TEXT[],
    mb_id TEXT UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create music_tracks table
CREATE TABLE music_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES music_albums(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    track_number INTEGER,
    disc_number INTEGER,
    duration INTEGER,
    genre TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    codec TEXT,
    mb_track_id TEXT UNIQUE,
    lyrics_path TEXT
);

CREATE INDEX music_tracks_album_id_idx ON music_tracks (album_id);

-- Create music_files table
-- Note: source_id references vfs(id), relying on search_path (schema, public)
-- because db/mod.rs uses search_path="schema",public
CREATE TABLE music_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES vfs(id) ON UPDATE CASCADE ON DELETE CASCADE,
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    size BIGINT,
    mime_type TEXT,
    duration INTEGER,
    checksum TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    track_id UUID REFERENCES music_tracks(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT music_files_source_id_path_key UNIQUE (source_id, path)
);

CREATE INDEX music_files_source_id_idx ON music_files (source_id);
CREATE INDEX music_files_track_id_idx ON music_files (track_id);

-- Create music_album_artists junction table
CREATE TABLE music_album_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES music_albums(id) ON UPDATE CASCADE ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES music_artists(id) ON UPDATE CASCADE ON DELETE CASCADE,
    role TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT music_album_artists_album_id_artist_id_role_key UNIQUE (album_id, artist_id, role)
);

CREATE INDEX music_album_artists_album_id_idx ON music_album_artists (album_id);
CREATE INDEX music_album_artists_artist_id_idx ON music_album_artists (artist_id);

-- Note: album_genres table not created - it is only a compile stub for relation target
-- Note: vfs table not created - it is managed by main server/sidecar
