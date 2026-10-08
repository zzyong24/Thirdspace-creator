CREATE TABLE IF NOT EXISTS account_groups (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CONSTRAINT account_groups_status_check CHECK(status IN ('active','archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_group_memberships (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,group_id TEXT NOT NULL,platform_account_id TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,joined_at TEXT NOT NULL,left_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_membership_current_ux ON account_group_memberships(user_id,platform_account_id) WHERE left_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_group_commands (
 user_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,kind TEXT NOT NULL,input_hash TEXT NOT NULL,result JSONB NOT NULL,created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_command_user_key_ux ON account_group_commands(user_id,idempotency_key);
--> statement-breakpoint
INSERT INTO account_groups(id,user_id,name,status,version,created_at,updated_at)
 SELECT 'grp_legacy_'||id,user_id,account_handle,'active',1,created_at,updated_at FROM platform_accounts ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at)
 SELECT 'gm_legacy_'||id,user_id,'grp_legacy_'||id,id,1,created_at FROM platform_accounts ON CONFLICT DO NOTHING;
