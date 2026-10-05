CREATE TABLE IF NOT EXISTS execution_evidence (
  id TEXT PRIMARY KEY,
  execution_task_id TEXT NOT NULL REFERENCES execution_tasks(id),
  origin_call_id TEXT NOT NULL REFERENCES execution_calls(id),
  requested_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  full_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 2097152),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_evidence_origin_call_unique ON execution_evidence(origin_call_id);
