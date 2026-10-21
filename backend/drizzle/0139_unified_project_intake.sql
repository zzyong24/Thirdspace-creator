-- T1382：统一入口回执与原始引用；新调度前一次性退役旧雷达升级，保留产物和调用。
CREATE TABLE project_source_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  item_id TEXT,
  snapshot_id TEXT,
  account_id TEXT,
  platform TEXT,
  external_id TEXT,
  url TEXT,
  body_available BOOLEAN NOT NULL DEFAULT FALSE,
  source_digest TEXT,
  transcript_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT project_source_references_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_source_references_source_key_ck CHECK (length(btrim(source_key)) > 0),
  CONSTRAINT project_source_references_source_shape_ck CHECK (
    (source_kind = 'intelligence_item'
      AND item_id IS NOT NULL AND length(btrim(item_id)) > 0
      AND snapshot_id IS NOT NULL AND length(btrim(snapshot_id)) > 0)
    OR
    (source_kind = 'platform_work'
      AND account_id IS NOT NULL AND length(btrim(account_id)) > 0
      AND platform IS NOT NULL AND length(btrim(platform)) > 0
      AND external_id IS NOT NULL AND length(btrim(external_id)) > 0)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX project_source_references_project_key_ux
  ON project_source_references(project_id, source_key);
--> statement-breakpoint
CREATE INDEX project_source_references_item_ix ON project_source_references(item_id);
--> statement-breakpoint
CREATE INDEX project_source_references_snapshot_ix ON project_source_references(snapshot_id);
--> statement-breakpoint
-- 回执保留原 project_id；项目被显式物理删除后，同键仍须识别原身份，不能悄悄重建。
CREATE TABLE project_intakes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source TEXT NOT NULL,
  intake_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  project_id TEXT NOT NULL,
  preparation_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT project_intakes_scope_kind_ck CHECK (scope_kind IN ('group', 'legacy-account')),
  CONSTRAINT project_intakes_identity_ck CHECK (
    length(btrim(user_id)) > 0 AND length(btrim(scope_id)) > 0
    AND length(btrim(intake_key)) > 0 AND length(btrim(request_digest)) > 0
    AND length(btrim(project_id)) > 0
  ),
  CONSTRAINT project_intakes_source_ck CHECK (source IN ('manual', 'topic', 'radar', 'imported', 'assistant', 'quick_create'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX project_intakes_scope_key_ux
  ON project_intakes(user_id, scope_kind, scope_id, source, intake_key);
--> statement-breakpoint
CREATE INDEX project_intakes_project_ix ON project_intakes(project_id);

--> statement-breakpoint
-- 与旧父事务使用同一行锁，等待先提交的独占子工作可见，再撤销全部租约。
SELECT id FROM execution_tasks WHERE kind='radar_project_upgrade' AND status NOT IN ('succeeded','failed','cancelled','partial') ORDER BY id FOR UPDATE;
--> statement-breakpoint
-- 停止旧升级父的独占选题工作；共享转写和原调用账本保持原样。
UPDATE execution_tasks child
SET status = CASE WHEN EXISTS (SELECT 1 FROM execution_calls call WHERE call.execution_task_id = child.id AND call.status IN ('started','unknown')) THEN 'unknown_result' ELSE 'cancelled' END,
    lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, fence_token = NULL,
    last_error_code = 'SYSTEM_UPGRADED', last_error_message = '系统已升级，请重新点击升级为项目', updated_at = CURRENT_TIMESTAMP::text
FROM execution_tasks parent
WHERE parent.kind = 'radar_project_upgrade'
  AND parent.status NOT IN ('succeeded','failed','cancelled','partial')
  -- 创建子工作但父checkpoint尚未写回时，原精确动作键仍证明独占关系。
  AND (child.id = parent.checkpoint->>'topicTaskId' OR child.idempotency_key = parent.id || ':preview')
  AND child.kind = 'topic_preview' AND child.owner_type = 'transform'
  AND child.owner_id = parent.owner_id AND child.idempotency_key = parent.id || ':preview'
  AND child.user_id = parent.user_id AND child.account_id IS NOT DISTINCT FROM parent.account_id
  AND child.group_id IS NOT DISTINCT FROM parent.group_id
  AND child.status NOT IN ('succeeded','failed','cancelled','partial');
--> statement-breakpoint
UPDATE execution_tasks
SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, fence_token = NULL,
    last_error_code = 'SYSTEM_UPGRADED', last_error_message = '系统已升级，请重新点击升级为项目', updated_at = CURRENT_TIMESTAMP::text
WHERE kind = 'radar_project_upgrade' AND status NOT IN ('succeeded','failed','cancelled','partial');
