-- T-939 当前使用版本与历史最大版本分离；不改写或复制任何历史陈述。
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS current_statement_id TEXT;
