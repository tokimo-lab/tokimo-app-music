-- External ID mappings for multi-source metadata support
CREATE TABLE IF NOT EXISTS music.music_album_external_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES music.music_albums(id) ON DELETE CASCADE,
    source TEXT NOT NULL,  -- 'musicbrainz', 'netease', 'qqmusic', 'lastfm', 'spotify'
    external_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(album_id, source),
    UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS music.music_artist_external_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES music.music_artists(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(artist_id, source),
    UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_album_external_ids_album ON music.music_album_external_ids(album_id);
CREATE INDEX IF NOT EXISTS idx_album_external_ids_source ON music.music_album_external_ids(source, external_id);
CREATE INDEX IF NOT EXISTS idx_artist_external_ids_artist ON music.music_artist_external_ids(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_external_ids_source ON music.music_artist_external_ids(source, external_id);
