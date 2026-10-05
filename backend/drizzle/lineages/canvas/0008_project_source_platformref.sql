ALTER TABLE projects ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS platform_ref jsonb NOT NULL DEFAULT '{}'::jsonb;
