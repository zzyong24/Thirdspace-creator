-- T-983：前向修正0098拆分后仍同刻运行的默认计划，不改用户自定义cron或关闭状态。
-- 不触及已在运行的task/run、冻结输入、历史计数和各能力增量水位。
UPDATE scheduled_job SET
 schedule=CASE source_kind
  WHEN 'self.metrics' THEN '0 */2 * * *'
  WHEN 'self.traffic' THEN '15 */2 * * *'
  WHEN 'comments' THEN '30 */2 * * *'
  WHEN 'self.detail' THEN '45 */2 * * *'
 END,
 target=target||'{"scheduleTimezone":"Asia/Shanghai"}'::jsonb,
 next_run_at=NULL
WHERE source_kind IN ('self.metrics','self.traffic','comments','self.detail')
 AND target->'collectionSplitVersion'='1'::jsonb
 AND schedule='0 */2 * * *';
