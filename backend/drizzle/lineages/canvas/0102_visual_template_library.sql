CREATE TABLE IF NOT EXISTS visual_template_favorites (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, snapshot JSONB NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS visual_template_favorites_owner_idx ON visual_template_favorites(user_id,account_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS visual_template_mutation_receipts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
 digest TEXT NOT NULL, response JSONB, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS visual_template_mutation_attempt_ux ON visual_template_mutation_receipts(user_id,account_id,attempt_id);
--> statement-breakpoint
ALTER TABLE publication_revisions ADD COLUMN IF NOT EXISTS visual_adoption_key TEXT;
--> statement-breakpoint
ALTER TABLE publication_revisions ADD COLUMN IF NOT EXISTS visual_adoption_digest TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_revisions_visual_adoption_ux ON publication_revisions(publication_id,visual_adoption_key);
