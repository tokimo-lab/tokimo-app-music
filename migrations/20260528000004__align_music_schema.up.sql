-- Drop old tables in dependency order
DROP TABLE IF EXISTS lyrics CASCADE;
DROP TABLE IF EXISTS library_sync_status CASCADE;
DROP TABLE IF EXISTS tracks CASCADE;
DROP TABLE IF EXISTS genres CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS albums CASCADE;
DROP TABLE IF EXISTS libraries CASCADE;

CREATE TABLE IF NOT EXISTS musics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'music',
    avatar JSONB,
    description TEXT,
    poster_path TEXT,
    scrape_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    settings JSONB,
    sources JSONB NOT NULL DEFAULT '[]',
    sync_status TEXT NOT NULL DEFAULT 'pending',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_artists (
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

CREATE TABLE IF NOT EXISTS music_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    music_id UUID NOT NULL REFERENCES musics(id) ON DELETE CASCADE,
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
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES music_albums(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS music_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID,
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    size BIGINT,
    mime_type TEXT,
    duration INTEGER,
    checksum TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    scanned_at TIMESTAMPTZ,
    track_id UUID REFERENCES music_tracks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_id, path)
);

CREATE TABLE IF NOT EXISTS music_album_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES music_albums(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES music_artists(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'AlbumArtist',
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (album_id, artist_id, role)
);

CREATE INDEX IF NOT EXISTS idx_music_albums_music_id ON music_albums(music_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_album_id ON music_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_music_files_track_id ON music_files(track_id);
CREATE INDEX IF NOT EXISTS idx_music_album_artists_album_id ON music_album_artists(album_id);
CREATE INDEX IF NOT EXISTS idx_music_album_artists_artist_id ON music_album_artists(artist_id);
