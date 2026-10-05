-- [T-055f SPEC §9] 退役清算:论点树 / 内容合同 / 结构方案(用户拍板③:
-- 「历史数据以及论点树、内容合同,这些东西都可以删掉,不需要保留了,本来都是假数据」,
-- 直接删、不导出)。宪法 §4 修正案:方法论内化为编导 AI 产出标准,不再作为用户面对象。

-- 三类 artifact 数据级联删除(versions → search 文档由应用层重建,不在此处理)。
DELETE FROM artifact_versions
WHERE artifact_id IN (
  SELECT id FROM artifacts
  WHERE artifact_type IN ('thesis_tree', 'content_contract', 'content_outline')
);
--> statement-breakpoint
DELETE FROM artifact_relations
WHERE source_artifact_id IN (
  SELECT id FROM artifacts
  WHERE artifact_type IN ('thesis_tree', 'content_contract', 'content_outline')
)
OR target_artifact_id IN (
  SELECT id FROM artifacts
  WHERE artifact_type IN ('thesis_tree', 'content_contract', 'content_outline')
);
--> statement-breakpoint
DELETE FROM artifacts
WHERE artifact_type IN ('thesis_tree', 'content_contract', 'content_outline');
--> statement-breakpoint
DROP TABLE IF EXISTS evidence_links;
--> statement-breakpoint
DROP TABLE IF EXISTS thesis_nodes;
