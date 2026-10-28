-- 不回填旧行、不改变旧规则内容/状态/时间；NULL继续显式共享兼容。
ALTER TABLE review_rules ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS review_rules_group_status_idx ON review_rules(user_id,group_id,status);
