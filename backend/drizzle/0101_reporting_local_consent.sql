CREATE TABLE IF NOT EXISTS reporting_consents (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('diagnostics','creator')),
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version INTEGER NOT NULL,
  consent_epoch INTEGER NOT NULL DEFAULT 0,
  account_alias TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, scope, account_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reporting_outbox (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  work_alias TEXT,
  consent_epoch INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reporting_outbox_owner_scope ON reporting_outbox(user_id,scope,account_id,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reporting_consent_changes (
  user_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, change_id)
);
