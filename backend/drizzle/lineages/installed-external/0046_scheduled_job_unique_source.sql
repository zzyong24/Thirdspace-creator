-- =====================================================================================
-- [T-367] 自动化页定时任务重复根治 —— scheduled_job (user_id, account_id, source_kind)
-- 采集类部分唯一约束 + 存量重复清理。
--
-- 背景:同 user+account+sourceKind 出现两条定时任务。主因是前端模板卡路径无查重
-- (automations-island TemplateCards 无条件渲染 6 张卡,create 不查同 sourceKind 直接
-- createScheduledJob,默认 enabled=true)—— 用户看到绑号 bootstrap 自动建的禁用 job
-- (如 benchmark,T-359 分层启用默认关),点模板卡想「开启」,结果建了第二条。根因是
-- scheduled_job 表无唯一约束(仅有非唯一 ix_scheduled_job_user_enabled),auto 路径
-- (ensureCollectionJobs 先 listJobs 查重)键虽正确,但无 DB 兜底挡不住并发 TOCTOU。
-- 同表 job_run 已有部分唯一先例 ux_job_run_job_scheduled_for(迁移 0042)。
--
-- 本迁移两步(顺序不可换:先清存量,否则建唯一索引直接失败):
--   ① 清存量重复:对 6 类采集 kind,按 (user_id, account_id, source_kind) 分组,
--      保留优先级 = enabled 那条优先(用户真在用的),同 enabled 取 created_at 最早
--      (id 兜底定序),删其余;同时删被删 job 的孤儿 job_run。
--   ② 建部分唯一索引 ux_scheduled_job_user_account_source —— 仅约束 6 类采集 kind
--      (WHERE source_kind IN (...)),不限制未来非采集类 job 的多实例。
--
-- 应用层配套:scheduling.repository createJob 对采集 kind 幂等复用(先查,命中返已有行
-- 并按传入 enabled=true 开启;竞态撞索引 catch 后查回),前端模板卡对已存在 kind 显
-- 「已存在」态不再走 create。索引同步登记在 backend/src/schema/scheduling.ts 的
-- SCHEDULING_DDL 常量(文档一致)。
-- =====================================================================================

-- ① a. 先删「将被删除的重复 job」名下的孤儿 job_run(job_run.job_id 无 FK,需手清)。
DELETE FROM job_run
WHERE job_id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, account_id, source_kind
             ORDER BY enabled DESC, created_at ASC, id ASC
           ) AS rn
    FROM scheduled_job
    WHERE source_kind IN ('self.metrics','self.detail','comments','benchmark','topic.daily','favorites')
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint

-- ① b. 删重复 job 本体(保留 rn=1:enabled 优先 → created_at 最早 → id 最小兜底)。
DELETE FROM scheduled_job
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, account_id, source_kind
             ORDER BY enabled DESC, created_at ASC, id ASC
           ) AS rn
    FROM scheduled_job
    WHERE source_kind IN ('self.metrics','self.detail','comments','benchmark','topic.daily','favorites')
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint

-- ② 部分唯一索引:同 user+account+采集 kind 至多一条(DB 层兜底并发 TOCTOU)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_job_user_account_source
  ON scheduled_job (user_id, account_id, source_kind)
  WHERE source_kind IN ('self.metrics','self.detail','comments','benchmark','topic.daily','favorites');
