CREATE TABLE asset_tag_adoptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL, source_digest TEXT NOT NULL, result JSONB NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX asset_tag_adoptions_scope_ux ON asset_tag_adoptions(user_id, account_id, proposal_id);
--> statement-breakpoint
CREATE TABLE knowledge_adoptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL, source_digest TEXT NOT NULL, result JSONB NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_adoptions_scope_ux ON knowledge_adoptions(user_id, account_id, proposal_id);
