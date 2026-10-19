CREATE TABLE IF NOT EXISTS pending_document_commits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  asset_id TEXT NOT NULL UNIQUE,
  file_id TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 2097152),
  created_at TEXT NOT NULL,
  committed_at TEXT
);
