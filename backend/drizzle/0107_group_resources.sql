ALTER TABLE assets ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE assets ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE assets t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_group_ix ON assets(user_id,group_id);
--> statement-breakpoint
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE asset_uploads ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE asset_uploads t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_uploads_group_ix ON asset_uploads(user_id,group_id);
--> statement-breakpoint
ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE search_documents ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE search_documents t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS search_documents_group_ix ON search_documents(user_id,group_id);
--> statement-breakpoint
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE notifications ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE notifications t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_group_ix ON notifications(user_id,group_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS resource_access_grants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,target_group_id TEXT NOT NULL,resource_type TEXT NOT NULL,resource_id TEXT NOT NULL,origin_group_id TEXT NOT NULL,migration_id TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS resource_grant_current_ux ON resource_access_grants(user_id,target_group_id,resource_type,resource_id) WHERE revoked_at IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS workspace_blob_objects(storage_key TEXT PRIMARY KEY,user_id TEXT NOT NULL,group_id TEXT,account_id TEXT,expires_at TEXT NOT NULL);
