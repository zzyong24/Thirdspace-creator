CREATE TABLE IF NOT EXISTS pending_generated_asset_commits (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, input_digest TEXT NOT NULL,
 asset_id TEXT NOT NULL UNIQUE, file_id TEXT NOT NULL UNIQUE, storage_key TEXT NOT NULL UNIQUE,
 asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video')), mime_type TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT NOT NULL, checksum TEXT NOT NULL,
 byte_length INTEGER NOT NULL CHECK (byte_length > 0), created_at TEXT NOT NULL, committed_at TEXT
);
