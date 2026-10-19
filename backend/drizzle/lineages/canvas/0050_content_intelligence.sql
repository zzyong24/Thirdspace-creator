CREATE TABLE IF NOT EXISTS intelligence_collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_collection_sibling
  ON intelligence_collections (user_id, account_id, parent_id, normalized_name) NULLS NOT DISTINCT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_collection_account
  ON intelligence_collections (user_id, account_id, parent_id, sort_order);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  collection_id TEXT,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  canonical_url TEXT,
  canonical_url_hash TEXT,
  external_key TEXT NOT NULL,
  browser_session_ref TEXT,
  adapter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  monitor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sync_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_instruction TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_identity
  ON intelligence_sources (user_id, account_id, type, external_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_source_collection
  ON intelligence_sources (user_id, account_id, collection_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_source_collection_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_collection_membership
  ON intelligence_source_collection_memberships
    (user_id, account_id, source_id, collection_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  canonical_url TEXT NOT NULL,
  canonical_url_hash TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT,
  cover_url TEXT,
  cover_asset_id TEXT,
  published_at TEXT,
  duration_ms INTEGER,
  captured_at TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_external
  ON intelligence_items (user_id, account_id, platform, type, external_id)
  WHERE external_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_url
  ON intelligence_items (user_id, account_id, platform, type, canonical_url_hash)
  WHERE external_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_item_account_published
  ON intelligence_items (user_id, account_id, published_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_item_metric_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  collect_count INTEGER,
  share_count INTEGER,
  follower_count INTEGER,
  metric_source TEXT NOT NULL,
  quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_metric_identity
  ON intelligence_item_metric_snapshots (item_id, captured_at, metric_source);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_metric_item_time
  ON intelligence_item_metric_snapshots (item_id, captured_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS execution_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint JSONB,
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  cost_estimate JSONB,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_execution_task_idempotency
  ON execution_tasks (user_id, account_id, kind, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_execution_task_claim
  ON execution_tasks (status, priority DESC, created_at)
  WHERE status = 'queued';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_execution_task_lease
  ON execution_tasks (lease_expires_at)
  WHERE status IN ('running', 'pause_requested', 'cancel_requested');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_item_transcripts (
  item_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_requested',
  text TEXT,
  source TEXT,
  provider TEXT,
  model TEXT,
  language TEXT,
  execution_task_id TEXT,
  queued_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_transcript_status
  ON intelligence_item_transcripts (user_id, account_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_sync_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  execution_task_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  checkpoint JSONB,
  adapter_evidence JSONB,
  started_at TEXT,
  finished_at TEXT,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_summary TEXT,
  next_action TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_sync_run_task
  ON intelligence_sync_runs (execution_task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_sync_run_source
  ON intelligence_sync_runs (source_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_sync_run_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  item_ref TEXT,
  message TEXT NOT NULL,
  safe_details JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_run_event
  ON intelligence_sync_run_events (run_id, occurred_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_item_source_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  discovery_context JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_observation_identity
  ON intelligence_item_source_observations
  (user_id, account_id, item_id, source_id, external_ref);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_observation_source
  ON intelligence_item_source_observations (source_id, last_seen_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_source_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  item_id TEXT,
  captured_at TEXT NOT NULL,
  final_url TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  safe_extract TEXT,
  storage_ref TEXT,
  retention_until TEXT,
  privacy_class TEXT NOT NULL DEFAULT 'public'
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_snapshot_identity
  ON intelligence_source_snapshots (source_id, run_id, item_id, content_hash) NULLS NOT DISTINCT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_snapshot_item
  ON intelligence_source_snapshots (item_id, captured_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_transforms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_snapshot_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'topic',
  positioning_version_id TEXT NOT NULL,
  ai_task_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  output_snapshot JSONB,
  target_topic_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_transform_idempotency
  ON intelligence_transforms (user_id, account_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_intelligence_transform_item
  ON intelligence_transforms (item_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_intelligence_references (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_snapshot_id TEXT NOT NULL,
  transform_id TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_intelligence_reference
  ON project_intelligence_references (project_id, item_id, source_snapshot_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_project_intelligence_reference_project
  ON project_intelligence_references (user_id, account_id, project_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_intelligence_reference_transform
  ON project_intelligence_references (user_id, account_id, project_id, transform_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS intelligence_migration_ledgers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  inventory_hash TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'inventory',
  checkpoint JSONB,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  orphan_report JSONB,
  write_fence_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_migration_idempotency
  ON intelligence_migration_ledgers (user_id, account_id, idempotency_key);
