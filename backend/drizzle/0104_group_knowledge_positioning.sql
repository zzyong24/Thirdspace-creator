ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE knowledge_items ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE knowledge_items t SET group_id=g.id FROM account_groups g WHERE g.user_id=t.user_id AND g.id='grp_legacy_'||t.account_id AND t.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_items_group_scope_ix ON knowledge_items(user_id,group_id);
--> statement-breakpoint
ALTER TABLE knowledge_folders ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE knowledge_folders ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE knowledge_folders t SET group_id=g.id FROM account_groups g WHERE g.user_id=t.user_id AND g.id='grp_legacy_'||t.account_id AND t.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_folders_group_scope_ix ON knowledge_folders(user_id,group_id);
--> statement-breakpoint
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE creator_profiles ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE creator_profiles t SET group_id=g.id FROM account_groups g WHERE g.user_id=t.user_id AND g.id='grp_legacy_'||t.account_id AND t.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creator_profiles_group_scope_ix ON creator_profiles(user_id,group_id);
--> statement-breakpoint
ALTER TABLE positioning_statements ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE positioning_statements ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE positioning_statements t SET group_id=g.id FROM account_groups g WHERE g.user_id=t.user_id AND g.id='grp_legacy_'||t.account_id AND t.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS positioning_statements_group_scope_ix ON positioning_statements(user_id,group_id);
--> statement-breakpoint
ALTER TABLE positioning_discovery_sessions ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE positioning_discovery_sessions ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE positioning_discovery_sessions t SET group_id=g.id FROM account_groups g WHERE g.user_id=t.user_id AND g.id='grp_legacy_'||t.account_id AND t.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS positioning_discovery_sessions_group_scope_ix ON positioning_discovery_sessions(user_id,group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_group_ux ON creator_profiles(user_id,group_id) WHERE group_id IS NOT NULL;
