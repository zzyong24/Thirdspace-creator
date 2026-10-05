ALTER TABLE account_skill_overlays ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE account_skill_overlays ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE account_skill_overlays SET group_id='grp_legacy_'||account_id WHERE group_id IS NULL AND account_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE account_skill_overlay_versions ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE account_skill_overlay_versions ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE account_skill_overlay_versions v SET group_id=o.group_id FROM account_skill_overlays o WHERE v.overlay_id=o.id AND v.group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_skill_overlays_owner_skill ON account_skill_overlays(user_id,group_id,skill_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_skill_overlay_versions_revision ON account_skill_overlay_versions(user_id,group_id,skill_id,row_revision) WHERE group_id IS NOT NULL;
