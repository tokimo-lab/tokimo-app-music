-- Stage 3b: expand schema for albums, artists, genres, lyrics, sync status.
-- No CREATE SCHEMA, no schema prefix, no IF NOT EXISTS.

CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    artist TEXT,
    year INT,
    cover_url TEXT,
    is_favorite BOOL NOT NULL DEFAULT false,
    track_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    bio TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    track_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lyrics (
    track_id UUID PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    synced_lyrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE library_sync_status (
    library_id UUID PRIMARY KEY REFERENCES libraries(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    progress JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tracks
    ADD COLUMN album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
    ADD COLUMN artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
    ADD COLUMN genre_id UUID REFERENCES genres(id) ON DELETE SET NULL,
    ADD COLUMN lyrics_text TEXT;

CREATE INDEX albums_library_id_idx ON albums (library_id);
CREATE INDEX artists_library_id_idx ON artists (library_id);
CREATE INDEX genres_library_id_idx ON genres (library_id);
CREATE INDEX tracks_album_id_idx ON tracks (album_id);
CREATE INDEX tracks_artist_id_idx ON tracks (artist_id);
CREATE INDEX tracks_genre_id_idx ON tracks (genre_id);
