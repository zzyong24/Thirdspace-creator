CREATE TABLE IF NOT EXISTS platform_collection_bindings (
  account_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL,
  platform_identity TEXT NOT NULL, scopes JSONB NOT NULL, proof_source TEXT NOT NULL,
  verified_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_collection_runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  platform TEXT NOT NULL, platform_identity TEXT NOT NULL, capability TEXT NOT NULL,
  client_request_id TEXT NOT NULL, status TEXT NOT NULL, generation INTEGER NOT NULL,
  lease_token TEXT, lease_expires_at TEXT, source_snapshot_key TEXT,
  committed_pages INTEGER NOT NULL DEFAULT 0, complete_catalog_generation INTEGER,
  reason_code TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_runs_request_ux ON platform_collection_runs(user_id, account_id, capability, client_request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_collection_runs_account_ix ON platform_collection_runs(user_id, account_id, started_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_collection_pages (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, generation INTEGER NOT NULL,
  scan_pass INTEGER NOT NULL, page_index INTEGER NOT NULL, request_cursor TEXT,
  next_cursor TEXT, source_snapshot_key TEXT, page_digest TEXT NOT NULL,
  platform_reported_total INTEGER, total_source TEXT, total_observed_at TEXT,
  terminal_evidence JSONB,
  payload_digest TEXT NOT NULL, has_more INTEGER NOT NULL,
  record_ids JSONB NOT NULL, works JSONB NOT NULL, metrics JSONB NOT NULL,
  observed_at TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_pages_position_ux ON platform_collection_pages(run_id, generation, scan_pass, page_index);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_catalogs (
  account_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0, completed_at TEXT, work_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_works (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  platform TEXT NOT NULL, external_id TEXT NOT NULL, kind TEXT NOT NULL,
  published_at TEXT, visibility TEXT NOT NULL, visibility_source TEXT NOT NULL,
  visibility_priority INTEGER NOT NULL, visibility_observed_at TEXT NOT NULL,
  source TEXT NOT NULL, observed_at TEXT NOT NULL, ingested_at TEXT NOT NULL,
  catalog_generation INTEGER NOT NULL, publication_id TEXT, legacy_project_id TEXT,
  legacy_publication_id TEXT, outbound_frozen_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_works_external_scope_ux ON platform_works(user_id, account_id, platform, external_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_works_catalog_ix ON platform_works(user_id, account_id, catalog_generation);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_visibility_tombstones (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  platform TEXT NOT NULL, external_id TEXT NOT NULL, visibility TEXT NOT NULL,
  source TEXT NOT NULL, source_priority INTEGER NOT NULL, observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_visibility_tombstones_evidence_ux ON platform_visibility_tombstones(user_id, account_id, platform, external_id, source, observed_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_account_metric_snapshots (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  platform TEXT NOT NULL, metric_key TEXT NOT NULL, value DOUBLE PRECISION,
  availability TEXT NOT NULL, unit TEXT NOT NULL, metric_window JSONB NOT NULL,
  window_key TEXT NOT NULL, source TEXT NOT NULL, source_snapshot_key TEXT,
  source_snapshot_key_index TEXT NOT NULL, captured_at TEXT NOT NULL,
  observed_at TEXT NOT NULL, ingested_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_account_metrics_evidence_ux ON platform_account_metric_snapshots(user_id, account_id, metric_key, window_key, source, observed_at, source_snapshot_key_index);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_work_metric_snapshots (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  platform TEXT NOT NULL, metric_key TEXT NOT NULL, value DOUBLE PRECISION,
  availability TEXT NOT NULL, unit TEXT NOT NULL, metric_window JSONB NOT NULL,
  window_key TEXT NOT NULL, source TEXT NOT NULL, source_snapshot_key TEXT,
  source_snapshot_key_index TEXT NOT NULL, captured_at TEXT NOT NULL,
  observed_at TEXT NOT NULL, ingested_at TEXT NOT NULL, platform_work_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_work_metrics_evidence_ux ON platform_work_metric_snapshots(user_id, account_id, platform_work_id, metric_key, window_key, source, observed_at, source_snapshot_key_index);
