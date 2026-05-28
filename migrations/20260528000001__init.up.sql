-- Initial schema for music app.
-- Schema name + search_path are injected by host (TOKIMO_APP_SCHEMA env).
-- No CREATE SCHEMA, no schema prefix, no IF NOT EXISTS — host ledger handles idempotency.

CREATE TABLE libraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name TEXT NOT NULL DEFAULT '',
    root_path TEXT NOT NULL DEFAULT '',
    source_id UUID,
    source_type VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL DEFAULT '',
    title TEXT,
    artist TEXT,
    album TEXT,
    duration_secs DOUBLE PRECISION,
    size_bytes BIGINT,
    mime TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tracks_library_id_idx ON tracks (library_id);
