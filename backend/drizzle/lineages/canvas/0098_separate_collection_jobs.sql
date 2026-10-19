-- T-983 前向拆分：只改变后续作业配置，原 task/run、成功水位和冻结输入保持不变。
INSERT INTO scheduled_job(id,user_id,account_id,name,prompt,source_kind,target,schedule,tool_grants,enabled,created_at,updated_at)
SELECT 'split-'||md5(m.user_id||':'||m.account_id||':'||v.kind),m.user_id,m.account_id,v.name,v.prompt,v.kind,
 (m.target-'operationsSync'-'mergedIntoSelfMetrics')||jsonb_build_object('collectionSplitVersion',1)||
 CASE WHEN v.kind='self.detail' THEN '{"__backfillOnly":true,"__skipMetricRefresh":true,"__operationsSync":true}'::jsonb ELSE '{}'::jsonb END,
 '0 */2 * * *','[]'::jsonb,m.enabled AND COALESCE(m.target->'operationsSync'->'capabilities'->v.cap='true'::jsonb,false),m.created_at,m.updated_at
FROM scheduled_job m CROSS JOIN (VALUES
 ('comments','comments','作品评论同步','增量同步作品评论'),
 ('self.traffic','traffic','作品流量来源同步','增量同步作品流量来源'),
 ('self.detail','content','作品内容补全','后台补全视频内容与封面')
) AS v(kind,cap,name,prompt)
WHERE m.source_kind='self.metrics' AND m.target->'operationsSync'->'version'='1'::jsonb
AND NOT EXISTS(SELECT 1 FROM scheduled_job old WHERE old.user_id=m.user_id AND old.account_id=m.account_id AND old.source_kind=v.kind)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE scheduled_job child SET
 enabled=m.enabled AND COALESCE(m.target->'operationsSync'->'capabilities'->(CASE child.source_kind WHEN 'comments' THEN 'comments' WHEN 'self.traffic' THEN 'traffic' ELSE 'content' END)='true'::jsonb,false)
  AND COALESCE((child.source_kind<>'self.detail' OR child.target->'mergedIntoSelfMetrics'='true'::jsonb OR child.target->'collectionSplitVersion'='1'::jsonb OR child.enabled),false),
 name=CASE child.source_kind WHEN 'comments' THEN '作品评论同步' WHEN 'self.traffic' THEN '作品流量来源同步' ELSE '作品内容补全' END,
 schedule='0 */2 * * *',next_run_at=NULL,
 target=(child.target-'operationsSync'-'mergedIntoSelfMetrics')||jsonb_build_object('collectionSplitVersion',1)||
 CASE WHEN child.source_kind='self.detail' THEN '{"__backfillOnly":true,"__skipMetricRefresh":true,"__operationsSync":true}'::jsonb ELSE '{}'::jsonb END
FROM scheduled_job m
WHERE m.source_kind='self.metrics' AND m.target->'operationsSync'->'version'='1'::jsonb
AND child.user_id=m.user_id AND child.account_id=m.account_id AND child.source_kind IN ('comments','self.traffic','self.detail');
--> statement-breakpoint
UPDATE scheduled_job SET name='作品数据同步',prompt='增量同步已发布作品与表现数据',schedule='0 */2 * * *',next_run_at=NULL,
 enabled=enabled AND COALESCE(target->'operationsSync'->'capabilities'->'metrics'='true'::jsonb,false),
 target=(target-'operationsSync'-'mergedIntoSelfMetrics')||'{"collectionSplitVersion":1,"__skipHeavyBackfill":true,"__operationsSync":true}'::jsonb
WHERE source_kind='self.metrics' AND target->'operationsSync'->'version'='1'::jsonb;

--> statement-breakpoint
ALTER TABLE publication_sync_state DROP CONSTRAINT IF EXISTS publication_sync_capability;
--> statement-breakpoint
ALTER TABLE publication_sync_state ADD CONSTRAINT publication_sync_capability CHECK (capability IN ('metrics','comments','content','cover'));
