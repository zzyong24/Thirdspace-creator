CREATE TABLE IF NOT EXISTS publication_text_candidates (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, project_id TEXT NOT NULL,
  output_id TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL, value JSONB NOT NULL,
  publication_id TEXT, base_revision_id TEXT, source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  rule_snapshot_ref JSONB, applied_rules TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_text_candidates_output_idx ON publication_text_candidates(account_id,output_id,platform);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS publication_result_anchors (
  user_id TEXT NOT NULL, account_id TEXT NOT NULL, output_id TEXT NOT NULL, platform TEXT NOT NULL,
  publication_id TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_anchors_output_platform_ux
  ON publication_result_anchors(user_id,account_id,output_id,platform);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_anchors_publication_ux ON publication_result_anchors(publication_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS publication_result_adoptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL, candidate_id TEXT NOT NULL, publication_id TEXT NOT NULL,
  revision_id TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_adoptions_request_ux
  ON publication_result_adoptions(user_id,account_id,client_request_id);
