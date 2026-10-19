CREATE TABLE IF NOT EXISTS scheduled_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule TEXT NOT NULL,
  tool_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS job_run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  ai_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  items_new INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_scheduled_job_user_enabled ON scheduled_job (user_id, enabled);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_job_run_job ON job_run (job_id, started_at);
