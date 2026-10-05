-- =====================================================================================
-- [T-235d-distill] 收藏夹作品蒸馏链 —— 他人收藏作品独立 transcript 落点 + 判库 + 蒸馏结果。
--
-- 背景(T-235c 收尾诚实缺口):收藏夹采集候选进池已通,但 transcribe→判库→分类蒸馏未接。
-- 根因:`ensureTranscriptArtifact` 只把逐字稿绑到 imported 作品(本人已发布),他人收藏作品
-- 无 transcript 落点。**origin 隔离铁律**:收藏他人作品**永不建 imported project**(否则污染
-- creative-context/ChatBox/candidate/SEAM 的 imported/reconstructed origin 隔离,把他人作品
-- 当本人已确认前提)——故逐字稿落在 favorites_items **自身**,不进 projects/artifacts。
--
-- 三列 additive(favorites_items,IF NOT EXISTS 幂等,可重跑;不动任何存量表/列):
--   ① transcript      —— 他人作品逐字稿(独立落点,非 project artifact)。NULL=未转写。
--   ② distill_status  —— 蒸馏链状态:NULL(未入链)| knowledge(判为知识,atoms 待确认门采纳)
--                        | topic(判为纯选题,已有跟拍候选无额外动作)| skip(无沉淀价值/图集)
--                        | failed(转写/判库/蒸馏失败,带 error)。
--   ③ distill_result  —— 蒸馏产物 jsonb:{ reason?, atoms?, suggestedTags?, error? }。knowledge
--                        verdict 存 atoms(**确认门候选**,AI 只产候选、人采纳才 knowledge.create,
--                        铁律②);jsonb 免迁移扩展(同 candidates.card 先例)。
-- =====================================================================================

ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS transcript TEXT;
--> statement-breakpoint
ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS distill_status TEXT;
--> statement-breakpoint
ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS distill_result JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
-- 蒸馏链批取用:distill_status IS NULL = 未入链(FIFO by created_at);knowledge = 确认门待采纳读面。
CREATE INDEX IF NOT EXISTS ix_favorites_items_distill ON favorites_items (user_id, distill_status);
