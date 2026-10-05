CREATE TABLE IF NOT EXISTS article_anchors (
  output_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  client_request_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_anchors_artifact_ux ON article_anchors(artifact_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_anchors_request_ux ON article_anchors(user_id, account_id, client_request_id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS article_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  base_version_id TEXT NOT NULL,
  method_version TEXT NOT NULL,
  brand_profile_version_id TEXT,
  client_request_id TEXT NOT NULL,
  proposal JSONB NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_candidates_request_ux ON article_candidates(user_id, account_id, client_request_id);
