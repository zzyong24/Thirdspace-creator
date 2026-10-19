ALTER TABLE project_intelligence_references
  ADD COLUMN IF NOT EXISTS transform_id TEXT;
--> statement-breakpoint
ALTER TABLE project_intelligence_references
  ADD COLUMN IF NOT EXISTS transcript_hash TEXT;
--> statement-breakpoint
UPDATE project_intelligence_references AS reference
SET transform_id = transform.id
FROM intelligence_transforms AS transform
WHERE reference.transform_id IS NULL
  AND transform.target_topic_id = reference.topic_id
  AND transform.item_id = reference.item_id
  AND transform.source_snapshot_id = reference.source_snapshot_id
  AND transform.user_id = reference.user_id
  AND transform.account_id = reference.account_id;
--> statement-breakpoint
-- 0050 尚未正式发布，正常安装不会产生缺少 hash 的旧引用。若开发库已有试验行，
-- 保留为空并由读取侧拒绝生成稿件，不能伪造一个与逐字稿无关的 hash。
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_intelligence_reference_transform
  ON project_intelligence_references (user_id, account_id, project_id, transform_id)
  WHERE transform_id IS NOT NULL;
