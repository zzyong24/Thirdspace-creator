ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS folder_id TEXT;
--> statement-breakpoint
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS asset_id TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_folders_owner_ix
  ON knowledge_folders(user_id, account_id, parent_id);
