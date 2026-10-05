ALTER TABLE content_outputs ADD COLUMN IF NOT EXISTS target_platform TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS graphic_post_anchors (
  output_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_artifact_ux ON graphic_post_anchors(artifact_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_account_output_ux ON graphic_post_anchors(account_id,output_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_request_ux ON graphic_post_anchors(user_id,account_id,client_request_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS graphic_post_text_candidates (
  id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  base_version_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value JSONB NOT NULL,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  rule_snapshot_ref JSONB,
  applied_rules TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS graphic_post_text_candidates_output_idx ON graphic_post_text_candidates(account_id,output_id);
