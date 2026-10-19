CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_bindings_identity_ux
  ON platform_collection_bindings(user_id, platform, platform_identity);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_bind_attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL,
  client_request_id TEXT NOT NULL, status TEXT NOT NULL,
  platform_identity TEXT, proof_source TEXT, scopes JSONB,
  proof_verified_at TEXT, proof_expires_at TEXT, account_id TEXT,
  cleanup_pending_at TEXT,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_bind_attempts_request_ux
  ON platform_bind_attempts(user_id, platform, client_request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_bind_attempts_expiry_ix
  ON platform_bind_attempts(status, expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_runs_active_ux
  ON platform_collection_runs(account_id, capability)
  WHERE status IN ('queued', 'running');
--> statement-breakpoint
ALTER TABLE platform_works ADD COLUMN IF NOT EXISTS uncertain_visibility_at TEXT;
