ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS facets jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS downstream_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
