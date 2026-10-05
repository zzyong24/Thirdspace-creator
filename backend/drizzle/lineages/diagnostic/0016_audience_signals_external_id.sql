-- T-065 评论采集去重:audience_signals 加 external_id(评论粒度幂等锚,形如
-- `douyin:comment:<cid>`)。此前评论落库只有 run 内 record_key 去重(每次采集新建 run
-- → 跨 run 无锚 → 同一评论重复入库)。NULLABLE:存量行与非评论信号(dm/consultation/
-- review)无锚,留空。
ALTER TABLE audience_signals ADD COLUMN IF NOT EXISTS external_id TEXT;
--> statement-breakpoint
-- 存量清洗:同 user+同 publication+同文本 的 comment 信号只保最早一条(created_at,id
-- 双序保确定性;publication_id 用 IS NOT DISTINCT FROM 让 NULL 组也参与去重)。
-- 注:表无评论作者列,故按 publication+文本 锚(同作品同文本的真实同文评论会合一,
-- 诚实边界,重采后以 cid 粒度恢复)。幂等:重复执行删 0 行。
DELETE FROM audience_signals a
  USING audience_signals b
  WHERE a.source = 'comment' AND b.source = 'comment'
    AND a.user_id = b.user_id
    AND a.publication_id IS NOT DISTINCT FROM b.publication_id
    AND a.raw_text = b.raw_text
    AND (b.created_at, b.id) < (a.created_at, a.id);
--> statement-breakpoint
-- 幂等唯一锚:user+source+external_id(部分索引 —— 只约束带锚的行;存量/非评论 NULL 行
-- 不受限)。采集写入走 onConflictDoNothing 命中此索引即跳过。
CREATE UNIQUE INDEX IF NOT EXISTS ux_audience_signals_user_source_external
  ON audience_signals (user_id, source, external_id)
  WHERE external_id IS NOT NULL;
