ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief_detail jsonb NOT NULL DEFAULT '{}'::jsonb;
