ALTER TABLE publications ADD COLUMN IF NOT EXISTS draft_adoption_key TEXT;
--> statement-breakpoint
ALTER TABLE publications ADD COLUMN IF NOT EXISTS draft_adoption_digest TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publications_draft_adoption_ux ON publications(user_id, account_id, draft_adoption_key);
