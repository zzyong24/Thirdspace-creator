CREATE TABLE IF NOT EXISTS storage_configs (
  user_id TEXT PRIMARY KEY,
  backend TEXT NOT NULL DEFAULT 'local',
  root_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
