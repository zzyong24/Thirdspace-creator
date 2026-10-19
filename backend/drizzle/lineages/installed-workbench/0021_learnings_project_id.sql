-- T-118a gate-F3 经验归位·裁决进复盘:learnings 加 project_id(复盘产经验的来源作品锚)。
-- review.analyze 的 learning_list 采纳时带上 task.projectId(见 ai.service learning_list confirm
-- 分支),让复盘页 `/projects/<id>/review` 能读「本作品的 candidate learnings」当场裁决。
-- NULLABLE:手录/非复盘来源的经验无归属作品(留 NULL);存量行留 NULL(全站库读不过滤时照旧全出)。
-- additive、幂等(IF NOT EXISTS),不动存量数据。
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS project_id TEXT;
--> statement-breakpoint
-- 支撑 project-scoped 复盘读(user+project+status 组合过滤)。
CREATE INDEX IF NOT EXISTS idx_learnings_project ON learnings (user_id, project_id, validation_status);
