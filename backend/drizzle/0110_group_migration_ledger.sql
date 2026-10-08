CREATE TABLE IF NOT EXISTS account_group_migrations (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,from_group_id TEXT NOT NULL,to_group_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,input_hash TEXT NOT NULL,status TEXT NOT NULL,
 before_image JSONB NOT NULL,after_digest TEXT NOT NULL,created_at TEXT NOT NULL,undone_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_migration_user_key_ux ON account_group_migrations(user_id,idempotency_key);
