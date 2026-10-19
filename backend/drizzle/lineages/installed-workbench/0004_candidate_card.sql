ALTER TABLE candidates ADD COLUMN IF NOT EXISTS card jsonb NOT NULL DEFAULT '{}'::jsonb;
