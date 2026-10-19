CREATE TABLE IF NOT EXISTS article_text_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  base_version_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  rule_snapshot_ref JSONB,
  applied_rules TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS article_text_candidates_output_idx ON article_text_candidates(account_id,output_id);
