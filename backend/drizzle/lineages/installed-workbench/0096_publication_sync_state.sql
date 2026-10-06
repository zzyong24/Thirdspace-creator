CREATE TABLE IF NOT EXISTS publication_sync_state (
 user_id text NOT NULL, account_id text NOT NULL, publication_id text NOT NULL,
 capability text NOT NULL, external_id text NOT NULL, last_succeeded_at text,
 attempted_at text NOT NULL, retry_at text, failures integer NOT NULL DEFAULT 0, error text,
 CONSTRAINT publication_sync_capability CHECK (capability IN ('metrics','comments','content'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_sync_state_scope ON publication_sync_state(user_id,account_id,publication_id,capability);
--> statement-breakpoint
-- 仅存兼容作业时直接写入各能力真值，不能把聚合总开关当作旧指标开关。
-- self.detail 旧采集器包含作品指标及内容；不替它开启评论和流量。
INSERT INTO scheduled_job (id,user_id,account_id,name,prompt,source_kind,target,schedule,tool_grants,enabled,created_at,updated_at)
SELECT 'ops-'||md5(j.user_id||':'||j.account_id),j.user_id,j.account_id,'作品自动同步','按作品发布时间同步指标、评论、流量来源和内容','self.metrics',
 jsonb_build_object('operationsSync',jsonb_build_object('version',1,'capabilities',jsonb_build_object(
  'metrics',bool_or(j.enabled AND j.source_kind='self.detail'),
  'content',bool_or(j.enabled AND j.source_kind='self.detail'),
  'comments',bool_or(j.enabled AND j.source_kind='comments'),
  'traffic',bool_or(j.enabled AND j.source_kind='self.traffic')))),
 '0 */2 * * *','[]'::jsonb,bool_or(j.enabled),min(j.created_at),max(j.updated_at)
FROM scheduled_job j WHERE j.source_kind IN ('comments','self.traffic','self.detail')
AND NOT EXISTS (SELECT 1 FROM scheduled_job m WHERE m.user_id=j.user_id AND m.account_id=j.account_id AND m.source_kind='self.metrics')
GROUP BY j.user_id,j.account_id ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE scheduled_job m SET name='作品自动同步',schedule='0 */2 * * *',next_run_at=NULL,
 enabled=m.enabled OR EXISTS (SELECT 1 FROM scheduled_job e WHERE e.user_id=m.user_id AND e.account_id=m.account_id AND e.source_kind IN ('comments','self.traffic') AND e.enabled=true),
 target=m.target||jsonb_build_object('operationsSync',jsonb_build_object('version',1,'capabilities',jsonb_build_object(
 'metrics',m.enabled,'content',m.enabled,
 'comments',COALESCE((SELECT c.enabled FROM scheduled_job c WHERE c.user_id=m.user_id AND c.account_id=m.account_id AND c.source_kind='comments' LIMIT 1),m.enabled),
 'traffic',COALESCE((SELECT t.enabled FROM scheduled_job t WHERE t.user_id=m.user_id AND t.account_id=m.account_id AND t.source_kind='self.traffic' LIMIT 1),m.enabled))))
WHERE m.source_kind='self.metrics' AND NOT (m.target ? 'operationsSync');
--> statement-breakpoint
UPDATE scheduled_job j SET enabled=false,next_run_at=NULL,target=j.target||jsonb_build_object('mergedIntoSelfMetrics',true,'enabledBeforeMerge',j.enabled)
WHERE j.source_kind IN ('comments','self.traffic','self.detail') AND NOT (j.target ? 'mergedIntoSelfMetrics')
AND EXISTS (SELECT 1 FROM scheduled_job m WHERE m.user_id=j.user_id AND m.account_id=j.account_id AND m.source_kind='self.metrics' AND m.target ? 'operationsSync');
--> statement-breakpoint
UPDATE scheduled_job SET schedule='0 */2 * * *',next_run_at=NULL WHERE source_kind='intelligence.sync' AND schedule='*/15 * * * *';
