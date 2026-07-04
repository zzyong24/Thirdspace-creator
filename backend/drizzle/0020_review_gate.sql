-- T-086 编导文案审核门数据层(SPEC docs/superpowers/specs/2026-07-03-content-review-gate.md §1/§2):
-- ① review_rules — L1 违禁词/模式 lint 规则库。种子(backend/src/modules/review/review-rules.seed.ts)
--    移植自用户知识库:主源 douyin-compliance.md(Tier1 官方硬规则/Tier2 经验限流/doud+ 投放词)+
--    辅源 内容发布审核清单.md(❌→✅ 替代词表;冲突条目以主源为准,更正说明落 note)。
--    status='candidate' 是 T-087 复盘回流落点 —— AI/回流绝不直接写 active,用户采纳才转。
-- ② script_review_reports — 双层审核报告(L1 lint + L2 语义审),绑脚本 artifact 版本号:
--    改稿产新版本 → 旧报告自然过期(稿面按「报告版本 < 当前版本」提示重审)。
-- 幂等:IF NOT EXISTS,重复执行 no-op。
CREATE TABLE IF NOT EXISTS review_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  category TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  replacement TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'seed',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_review_rules_user_status ON review_rules (user_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS script_review_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  artifact_id TEXT,
  artifact_version INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  lint_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_label TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_script_review_reports_project ON script_review_reports (user_id, project_id, reviewed_at);
