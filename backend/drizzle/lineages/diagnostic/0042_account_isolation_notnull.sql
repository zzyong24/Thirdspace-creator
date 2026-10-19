-- =====================================================================================
-- [T-332 S1] 账号全域隔离 —— schema 收口迁移(SPEC 2026-07-15 account-full-isolation §5.2)。
--
-- 用户拍板 ②(存量可清、无兼容负担):per-account 表 account_id 是 schema 终态 NOT NULL。
-- 本迁移四件事:
--   ① 前置 NULL guard(§5.3):任一 per-account 表存在 account_id IS NULL 行 → 迁移**明确中止**
--      (可读错误,指向「设置 → 重置工作区」),**绝不**自动删行、绝不换空库(守 DATA-H09)。
--   ② per-account 表 account_id `SET NOT NULL`(§3 标 ✅ 清单 + §4.1 analytics 归 per-account)。
--   ③ 唯一键补 account 维(benchmark_sources/benchmark_works/trend_sources/audience_signals):
--      两个号对标同博主 / 收同 aweme / 采同评论是合法场景,旧 user 级唯一键会误撞。
--   ④ 幽灵列清理:project_target_platforms.account_id、projects.positioning_statement_id
--      (Drizzle 现役对象从不建模、全仓无代码读写 —— codegraph/grep 实证;项目已归号,子表无需
--      重复维度)。GAP-08:job_run 加 scheduled_for + (job, scheduled_for) 部分唯一(防重复触发)。
--
-- 存量安全 & 幂等:guard 只读、经 to_regclass 判表存在;SET NOT NULL 对已 NOT NULL 列是 no-op;
--   DROP COLUMN/INDEX IF EXISTS、CREATE UNIQUE INDEX IF NOT EXISTS、ADD COLUMN IF NOT EXISTS
--   全部幂等。唯一键「先建新后删旧」:新键是旧键的列超集(更宽松),建新不会因存量数据失败,
--   建新→删旧之间无「无约束窗口」。
-- =====================================================================================

-- ① 前置 NULL guard(§5.3)。任一 per-account 表存在 account_id IS NULL 行 → 明确中止 + 可读指引。
--    未重置的旧库(存量 NULL 行)在此**安全停在启动前**,原库分毫未动;重置后的新库无 NULL 行,直接通过。
DO $$
DECLARE
  v_table text;
  v_count bigint;
  v_offenders text := '';
  -- §3 标 ✅ 的 per-account 主表 + §4.1 analytics 指标表(均带 account_id、终态 NOT NULL)。
  -- content_calendar_entries / publishing_cadences 出生即 NOT NULL,不在此列(无 NULL 可查)。
  v_tables text[] := ARRAY[
    'creator_profiles','positioning_statements','candidates','topic_preferences',
    'audience_signals','topic_promotions','topic_attributions','projects',
    'artifacts','assets','publications','external_sources','ingestion_runs',
    'scheduled_job','benchmark_sources','benchmark_works','trend_sources',
    'reviews','review_insights','learnings','learning_applications',
    'rubrics','rubric_versions','predictions','calibration_results',
    'calibration_rule_suggestions','favorites_folders','favorites_items',
    'ai_conversations','ai_tasks','search_documents','knowledge_items',
    'metric_snapshots','metric_values','retention_points','audience_snapshots'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    -- 极老库可能缺某表 —— 判存在再查(幂等安全,不因缺表报错)。
    IF to_regclass(v_table) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I WHERE account_id IS NULL', v_table) INTO v_count;
      IF v_count > 0 THEN
        v_offenders := v_offenders || v_table || '(' || v_count || ') ';
      END IF;
    END IF;
  END LOOP;
  IF length(v_offenders) > 0 THEN
    RAISE EXCEPTION '[T-332 S1] 账号全域隔离要求所有 per-account 表 account_id 非空,但检测到存量 NULL 行:% —— 本版本要求重置工作区(设置 → 重置工作区)后重绑账号、重拉数据。迁移已安全中止,原库未改动。', v_offenders;
  END IF;
END $$;
--> statement-breakpoint

-- ② 幽灵列清理(先删 —— 与 NOT NULL 收口无依赖,放前面语义清晰)。
--    project_target_platforms.account_id:Drizzle projectTargetPlatforms 从不建模,全仓无 .accountId
--    读写(codegraph/grep 实证);项目已 per-account,子表经父锚隔离,冗余列删除。
DROP INDEX IF EXISTS project_target_platforms_account_ix;
--> statement-breakpoint
ALTER TABLE IF EXISTS project_target_platforms DROP COLUMN IF EXISTS account_id;
--> statement-breakpoint
-- projects.positioning_statement_id:0000_init 由 positioning DDL 预留,Drizzle projects 从不建模、
--    全仓无代码读写(grep 实证);项目→定位版本锚从未启用,删除。
ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS positioning_statement_id;
--> statement-breakpoint

-- ③ per-account 表 account_id SET NOT NULL(§3 ✅ + analytics)。guard 已保证无 NULL 行。
--    SET NOT NULL 对已 NOT NULL 列是 no-op(幂等);ALTER TABLE IF EXISTS 兜极老库缺表。
ALTER TABLE IF EXISTS creator_profiles          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS positioning_statements    ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS candidates                ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS topic_preferences         ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS audience_signals          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS topic_promotions          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS topic_attributions        ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS projects                  ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS artifacts                 ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS assets                    ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS publications              ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS external_sources          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS ingestion_runs            ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS scheduled_job             ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS benchmark_sources         ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS benchmark_works           ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS trend_sources             ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS reviews                   ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS review_insights           ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS learnings                 ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS learning_applications     ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS rubrics                   ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS rubric_versions           ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS predictions               ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS calibration_results       ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS calibration_rule_suggestions ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS favorites_folders         ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS favorites_items           ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS ai_conversations          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS ai_tasks                  ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS search_documents          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS knowledge_items           ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS metric_snapshots          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS metric_values             ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS retention_points          ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS audience_snapshots        ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint

-- ④ 唯一键补 account 维(先建新后删旧;account_id 已 NOT NULL,无需 NULLS NOT DISTINCT)。
--    benchmark_sources:两个号对标同一博主(sec_uid)合法。
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_identity_v2
  ON benchmark_sources (user_id, account_id, platform, external_account_id);
--> statement-breakpoint
DROP INDEX IF EXISTS ux_benchmark_sources_identity;
--> statement-breakpoint
-- benchmark_works:两个号各自采集同一 aweme 合法。
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_aweme_v2
  ON benchmark_works (user_id, account_id, platform, aweme_id);
--> statement-breakpoint
DROP INDEX IF EXISTS ux_benchmark_works_aweme;
--> statement-breakpoint
-- trend_sources:两个号登记同一 URL 信源合法(数据地图 4.3 缺口)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_identity_v2
  ON trend_sources (user_id, account_id, url);
--> statement-breakpoint
DROP INDEX IF EXISTS ux_trend_sources_identity;
--> statement-breakpoint
-- audience_signals:同一评论被两个号各自采集,应各归其号(candidate.repository.ts:411 自认缺陷)。
--    保持部分唯一(external_id IS NOT NULL);account_id 入键。
CREATE UNIQUE INDEX IF NOT EXISTS ux_audience_signals_user_source_external_v2
  ON audience_signals (user_id, account_id, source, external_id) WHERE external_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_audience_signals_user_source_external;
--> statement-breakpoint

-- ⑤ GAP-08:job_run 加 scheduled_for(计划触发时刻锚)+ (job_id, scheduled_for) 部分唯一,
--    根治 scheduler「先查再建」无约束下的重复触发。account 无需入键(父 job 已含号,SPEC §3.1)。
--    列 nullable + 部分唯一(WHERE scheduled_for IS NOT NULL):存量 run / 临时「立即运行」不带
--    scheduled_for,不受约束;S2/D3 在到点触发时写入该锚,唯一键即生效。
ALTER TABLE IF EXISTS job_run ADD COLUMN IF NOT EXISTS scheduled_for TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_run_job_scheduled_for
  ON job_run (job_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
