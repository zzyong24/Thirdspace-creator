ALTER TABLE project_transcription_requests ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE project_transcription_requests ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE knowledge_adoptions ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE knowledge_adoptions ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
-- 只从同用户实际根回填；不重写AI任务freeze，不将转组后的project组覆盖原请求归属。
UPDATE project_transcription_requests r SET group_id=p.group_id
FROM projects p, ai_tasks a, account_groups g
WHERE r.group_id IS NULL AND p.id=r.project_id AND p.user_id=r.user_id
 AND p.account_id IS NOT DISTINCT FROM r.account_id
 AND a.id=r.ai_task_id AND a.user_id=r.user_id AND a.project_id=p.id
 AND (a.group_id=p.group_id OR (a.group_id IS NULL AND p.group_id='grp_legacy_'||r.account_id))
 AND g.id=p.group_id AND g.user_id=r.user_id;
--> statement-breakpoint
UPDATE knowledge_adoptions r SET group_id=k.group_id
FROM knowledge_items k, account_groups g
WHERE r.group_id IS NULL AND k.id=r.result->>'knowledgeId' AND k.user_id=r.user_id
 AND k.account_id IS NOT DISTINCT FROM r.account_id
 AND g.id=k.group_id AND g.user_id=r.user_id;
--> statement-breakpoint
ALTER TABLE project_transcription_requests DROP CONSTRAINT IF EXISTS project_transcription_requests_user_id_account_id_attempt_id_key;
--> statement-breakpoint
CREATE UNIQUE INDEX project_transcription_requests_legacy_scope_ux ON project_transcription_requests(user_id,account_id,attempt_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX project_transcription_requests_group_scope_ux ON project_transcription_requests(user_id,group_id,attempt_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS knowledge_adoptions_scope_ux;
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_adoptions_legacy_scope_ux ON knowledge_adoptions(user_id,account_id,proposal_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_adoptions_group_scope_ux ON knowledge_adoptions(user_id,group_id,proposal_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
