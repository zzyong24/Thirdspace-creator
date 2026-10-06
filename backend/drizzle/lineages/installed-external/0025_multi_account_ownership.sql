-- =====================================================================================
-- T-136 多账号(多人设)地基:按号隔离表加 account_id + 存量 backfill + creator_profiles
-- 换唯一约束(UNIQUE(user_id) → UNIQUE(user_id, account_id))。
--
-- 权威设计:docs/superpowers/specs/2026-07-05-multi-account-persona-design.md
--   §B 表归属分类 / §6 数据与契约(有序 4 步)/ §10 re-gate 注意项。
--
-- 铁律(顺序神圣):必须「① 建默认号 → ② 加列 → ③ backfill → ④ 换约束」。
--   顺序错 = 撞复合 UNIQUE 或丢数据。backfill(③)必须在旧 UNIQUE(user_id) 仍生效时做,
--   保证每 user 单 profile → 单号,不撞新复合唯一(SPEC §6 MAJOR-1 化解顺序)。
-- additive only:列全 nullable、全幂等(IF NOT EXISTS / ON CONFLICT / WHERE account_id IS NULL),
--   可重跑、可回滚(account_id 设回 NULL)。nullable 是稳定终态(SPEC §6 MAJOR-3),不改 NOT NULL。
--
-- 预检(迁移前应满足;现约束保证):
--   SELECT user_id, COUNT(*) FROM creator_profiles GROUP BY user_id HAVING COUNT(*) > 1;  -- 应为空
-- 校后(迁移后应满足):
--   SELECT COUNT(*) FROM creator_profiles WHERE account_id IS NULL;                        -- 应为 0
--   SELECT COUNT(*) FROM projects        WHERE account_id IS NULL;                          -- 应为 0(存量归默认号)
-- 下方以 DO $$ ... RAISE EXCEPTION 断言硬化预检/校后。
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 预检断言:creator_profiles 每 user 至多一条(现 UNIQUE(user_id) 保证)。非空 = 存量异常,
-- 停止迁移交人工处置(否则 backfill 后换复合唯一会撞约束)。
-- ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT user_id FROM creator_profiles GROUP BY user_id HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'T-136 迁移预检失败:creator_profiles 存在 % 个 user 有多条 profile,换复合唯一前须人工处置', dup_count;
  END IF;
END $$;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- ① 建默认号:为「有内容(projects)但无 douyin platform_account」的 user 建一条默认号。
--   id 用确定性方式 acct-douyin-default-<user_id> 便于 ③ backfill 直接引用。
--   handle='待完善'(T-131 引导用户改真实号);ON CONFLICT DO NOTHING 防并发/重跑双建。
--   同一 user 若已有任意 douyin 号,不建默认号(下方 ③ backfill 会归到「最早的 active douyin 号」)。
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO platform_accounts (
  id, user_id, platform, account_handle, secret_reference,
  follower_baseline, status, created_at, updated_at
)
SELECT
  'acct-douyin-default-' || u.user_id,
  u.user_id,
  'douyin',
  '待完善',
  NULL,
  0,
  'active',
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM (
  -- 有内容(至少一条 project)的 user
  SELECT DISTINCT user_id FROM projects
) u
WHERE NOT EXISTS (
  -- 且该 user 尚无任何 douyin platform_account
  SELECT 1 FROM platform_accounts pa
  WHERE pa.user_id = u.user_id AND pa.platform = 'douyin'
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- ② 加列:按号隔离表 ADD COLUMN IF NOT EXISTS account_id TEXT(幂等)。全 nullable。
--   publications / project_target_platforms 的 account_id 已在 0000_init 预留(SPEC §6 MAJOR-5),
--   这里对它们重复 ADD IF NOT EXISTS 是幂等防御、非新增。
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects                     ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE artifacts                    ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE assets                       ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE knowledge_items              ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE candidates                   ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE audience_signals             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE topic_promotions             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE learnings                    ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE learning_applications        ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE reviews                      ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE review_insights              ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE rubrics                      ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE rubric_versions              ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE predictions                  ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE calibration_results          ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE calibration_rule_suggestions ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE creator_profiles             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE positioning_statements       ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE external_sources             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE ingestion_runs               ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE metric_snapshots             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE metric_values                ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE retention_points             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE audience_snapshots           ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE search_documents             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE ai_conversations             ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE ai_tasks                     ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
-- 预留列已在 0000_init;这里幂等防御(SPEC §6 MAJOR-5)
ALTER TABLE publications                 ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint
ALTER TABLE project_target_platforms     ADD COLUMN IF NOT EXISTS account_id TEXT;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- ③ backfill:把存量按号隔离行归到「该 user 的默认 douyin 号」。
--   默认号 = 该 user 最早创建的 active douyin 号(①建的 acct-douyin-default-<user_id> 或用户已有的号)。
--   仅回填 account_id IS NULL 的行(幂等、可重跑;可回滚 = 设回 NULL)。
--   ⚠️ 必须在换约束(④)之前:此刻旧 UNIQUE(user_id) 仍生效 → 每 user 单 profile → 单号,
--      backfill 后 creator_profiles(user_id, account_id) 天然唯一,不撞新复合约束(SPEC §6 MAJOR-1)。
--
-- 复用一张「user → 默认号」映射子查询(取每 user created_at 最早的 active douyin 号)。
-- ─────────────────────────────────────────────────────────────────────────────────────

-- 内容 / 定位 / 派生索引(直接带 user_id 的按号隔离表)
UPDATE projects        t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE artifacts       t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE assets          t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE knowledge_items t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE candidates      t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE audience_signals t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE topic_promotions t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE learnings       t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE learning_applications t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE reviews         t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE review_insights t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE rubrics         t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE rubric_versions t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE predictions     t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE calibration_results t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE calibration_rule_suggestions t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE creator_profiles t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE positioning_statements t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE external_sources t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE ingestion_runs  t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE metric_snapshots t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE metric_values   t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE retention_points t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE audience_snapshots t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE search_documents t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE ai_conversations t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE ai_tasks        t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint

-- 预留列(SPEC §6 MAJOR-5,已在 0000_init 建列,这里只 backfill):
--   publications 自带 user_id → 与其余按号隔离表同款,按该 user 默认号回填(仅 NULL 行)。
--   project_target_platforms 无 user_id → 经 project_id 承 projects 的号回填(仅 NULL 行)。
UPDATE publications t SET account_id = da.account_id FROM (SELECT DISTINCT ON (user_id) user_id, id AS account_id FROM platform_accounts WHERE platform='douyin' AND status='active' ORDER BY user_id, created_at ASC) da WHERE t.user_id = da.user_id AND t.account_id IS NULL;--> statement-breakpoint
UPDATE project_target_platforms t SET account_id = p.account_id
  FROM projects p
  WHERE t.project_id = p.id AND t.account_id IS NULL AND p.account_id IS NOT NULL;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- ④ 换约束:creator_profiles UNIQUE(user_id) → UNIQUE(user_id, account_id)。
--   backfill(③)已完成 → 每 user 单 profile 单号 → 复合唯一不撞。加各表 (user_id, account_id) 复合索引。
--   幂等:DROP INDEX IF EXISTS 旧唯一 → CREATE UNIQUE INDEX IF NOT EXISTS 新复合。
-- ─────────────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS uq_creator_profiles_user;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_user_account ON creator_profiles (user_id, account_id);--> statement-breakpoint

-- (user_id, account_id) 复合索引:repo 门下推(§A)按号过滤的读路径。全 IF NOT EXISTS(幂等)。
CREATE INDEX IF NOT EXISTS idx_projects_user_account                     ON projects (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_artifacts_user_account                    ON artifacts (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_assets_user_account                       ON assets (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_account              ON knowledge_items (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_candidates_user_account                   ON candidates (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audience_signals_user_account             ON audience_signals (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_topic_promotions_user_account             ON topic_promotions (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learnings_user_account                    ON learnings (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learning_apps_user_account                ON learning_applications (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reviews_user_account                      ON reviews (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_review_insights_user_account              ON review_insights (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rubrics_user_account                      ON rubrics (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rubric_versions_user_account              ON rubric_versions (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_predictions_user_account                  ON predictions (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_calibration_results_user_account          ON calibration_results (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_calibration_rule_suggestions_user_account ON calibration_rule_suggestions (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_external_sources_user_account             ON external_sources (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_user_account              ON ingestion_runs (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user_account             ON metric_snapshots (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_values_user_account                ON metric_values (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_retention_points_user_account             ON retention_points (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_user_account           ON audience_snapshots (user_id, account_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_search_documents_user_account             ON search_documents (user_id, account_id, indexed_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_account             ON ai_conversations (user_id, account_id, updated_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_account                     ON ai_tasks (user_id, account_id);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 校后断言:按号隔离的「有内容」核心表存量行不应残留 account_id IS NULL(护 71 真作品归默认号)。
--   仅断言「有默认号的 user 名下的行」——即经过 backfill 覆盖面的表(projects/artifacts/…)。
--   creator_profiles / projects 是最直接的「作品可见」锚。断言失败 = backfill 漏行,须查。
-- ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  null_projects INTEGER;
  null_profiles INTEGER;
BEGIN
  -- 有默认 douyin 号的 user,其 projects/creator_profiles 应全部已归号
  SELECT COUNT(*) INTO null_projects
  FROM projects t
  WHERE t.account_id IS NULL
    AND EXISTS (SELECT 1 FROM platform_accounts pa WHERE pa.user_id = t.user_id AND pa.platform='douyin' AND pa.status='active');
  IF null_projects > 0 THEN
    RAISE EXCEPTION 'T-136 迁移校后失败:% 条 projects 应归默认号却仍 account_id IS NULL', null_projects;
  END IF;

  SELECT COUNT(*) INTO null_profiles
  FROM creator_profiles t
  WHERE t.account_id IS NULL
    AND EXISTS (SELECT 1 FROM platform_accounts pa WHERE pa.user_id = t.user_id AND pa.platform='douyin' AND pa.status='active');
  IF null_profiles > 0 THEN
    RAISE EXCEPTION 'T-136 迁移校后失败:% 条 creator_profiles 应归默认号却仍 account_id IS NULL', null_profiles;
  END IF;
END $$;
