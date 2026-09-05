ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS deadline_at TEXT;
--> statement-breakpoint
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS execution_budget JSONB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS execution_calls (
  id TEXT PRIMARY KEY,
  execution_task_id TEXT NOT NULL REFERENCES execution_tasks(id),
  sequence INTEGER NOT NULL,
  operation_key TEXT NOT NULL,
  retry_of_call_id TEXT,
  kind TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  reserved_tokens INTEGER NOT NULL,
  started_attempt INTEGER,
  usage JSONB,
  total_tokens INTEGER,
  result_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_calls_sequence_unique ON execution_calls(execution_task_id, sequence);
