CREATE TABLE IF NOT EXISTS cli_invocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  account_scope TEXT NOT NULL,
  client_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  effect TEXT NOT NULL,
  idempotency_key TEXT,
  input_hash TEXT NOT NULL,
  target_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL,
  task_id TEXT,
  error_code TEXT,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_cli_invocations_idempotency
  ON cli_invocations (user_id, account_scope, operation, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_cli_invocations_recent
  ON cli_invocations (user_id, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cli_invocation_results (
  invocation_id TEXT PRIMARY KEY,
  result_encrypted TEXT NOT NULL,
  response_schema_version TEXT NOT NULL,
  result_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
