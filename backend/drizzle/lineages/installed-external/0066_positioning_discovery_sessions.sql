CREATE TABLE IF NOT EXISTS positioning_discovery_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  web_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  adopted_candidate_id TEXT,
  adopted_statement_id TEXT,
  confirm_idempotency_key TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_positioning_discovery_active
  ON positioning_discovery_sessions (user_id, account_id, updated_at DESC);
