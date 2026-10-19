CREATE TABLE IF NOT EXISTS douyin_throttle_state (
  channel TEXT PRIMARY KEY,
  cooldown_until TEXT,
  consecutive_throttles INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT,
  updated_at TEXT NOT NULL
);
