CREATE TABLE IF NOT EXISTS production_edit_versions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, production_id TEXT NOT NULL,
  revision INTEGER NOT NULL, request_id TEXT, request_digest TEXT,
  plan_digest TEXT NOT NULL, source TEXT NOT NULL, plan JSONB NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_revision_ux ON production_edit_versions(production_id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_request_ux ON production_edit_versions(production_id, request_id);
