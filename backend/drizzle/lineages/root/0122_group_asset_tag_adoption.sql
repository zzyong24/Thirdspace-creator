ALTER TABLE asset_tag_adoptions ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE asset_tag_adoptions ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE asset_tag_adoptions a SET group_id=g.id FROM account_groups g WHERE a.group_id IS NULL AND g.user_id=a.user_id AND g.id='grp_legacy_'||a.account_id;
--> statement-breakpoint
DROP INDEX IF EXISTS asset_tag_adoptions_scope_ux;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_tag_adoptions_legacy_scope_ux ON asset_tag_adoptions(user_id,account_id,proposal_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_tag_adoptions_group_scope_ux ON asset_tag_adoptions(user_id,group_id,proposal_id) WHERE group_id IS NOT NULL;
