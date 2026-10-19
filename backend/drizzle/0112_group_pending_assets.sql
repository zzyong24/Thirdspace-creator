ALTER TABLE pending_document_commits ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE pending_document_commits ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE pending_document_commits SET group_id='grp_legacy_'||account_id WHERE group_id IS NULL AND account_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE pending_generated_asset_commits ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE pending_generated_asset_commits ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE pending_generated_asset_commits SET group_id='grp_legacy_'||account_id WHERE group_id IS NULL AND account_id IS NOT NULL;
