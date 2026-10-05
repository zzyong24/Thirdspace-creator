CREATE TABLE IF NOT EXISTS account_skill_overlays (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  row_revision INTEGER NOT NULL CHECK (row_revision >= 1),
  observed_base_version TEXT NOT NULL,
  overlay_version TEXT,
  overlay JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_skill_overlays_owner_skill
  ON account_skill_overlays (user_id, account_id, skill_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_skill_overlay_versions (
  id TEXT PRIMARY KEY,
  overlay_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  row_revision INTEGER NOT NULL CHECK (row_revision >= 1),
  observed_base_version TEXT NOT NULL,
  overlay_version TEXT,
  overlay JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_skill_overlay_versions_revision
  ON account_skill_overlay_versions (user_id, account_id, skill_id, row_revision);
