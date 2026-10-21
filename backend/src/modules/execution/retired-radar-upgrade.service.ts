import {sql,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
/** 0139已登记的安装也在启动恢复前幂等收尾；不重发调用，不改变任何费用回执。 */
export async function retireLegacyRadarUpgrades(db:Db,stamp=new Date().toISOString()) {
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM execution_tasks WHERE kind='radar_project_upgrade' AND status NOT IN ('succeeded','failed','cancelled','partial') ORDER BY id FOR UPDATE`);
  await tx.execute(sql`UPDATE execution_tasks child
SET status = CASE WHEN EXISTS (SELECT 1 FROM execution_calls call WHERE call.execution_task_id = child.id AND call.status IN ('started','unknown')) THEN 'unknown_result' ELSE 'cancelled' END,
    lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, fence_token = NULL,
    last_error_code = 'SYSTEM_UPGRADED', last_error_message = '系统已升级，请重新点击升级为项目', updated_at = ${stamp}
FROM execution_tasks parent
WHERE parent.kind = 'radar_project_upgrade'
  AND parent.status NOT IN ('succeeded','failed','cancelled','partial')
  -- 创建子工作但父checkpoint尚未写回时，原精确动作键仍证明独占关系。
  AND (child.id = parent.checkpoint->>'topicTaskId' OR child.idempotency_key = parent.id || ':preview')
  AND child.kind = 'topic_preview' AND child.owner_type = 'transform'
  AND child.owner_id = parent.owner_id AND child.idempotency_key = parent.id || ':preview'
  AND child.user_id = parent.user_id AND child.account_id IS NOT DISTINCT FROM parent.account_id
  AND child.group_id IS NOT DISTINCT FROM parent.group_id
  AND child.status NOT IN ('succeeded','failed','cancelled','partial')`);
  await tx.execute(sql`UPDATE execution_tasks
SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, fence_token = NULL,
    last_error_code = 'SYSTEM_UPGRADED', last_error_message = '系统已升级，请重新点击升级为项目', updated_at = ${stamp}
WHERE kind = 'radar_project_upgrade' AND status NOT IN ('succeeded','failed','cancelled','partial')`);
 });
}

/** SEMANTIC_BOUNDARY_ALLOW: 只按真实旧父/作品及原调用账本找待核对任务，不分析内容。 */
export async function readLegacyRadarPendingCalls(db:Db,ctx:RequestContext,itemId:string):Promise<Array<{childTaskId:string;step:'transcript'|'source_draft';callId:string}>>{
 const rows=(await db.execute(sql`SELECT child.id AS "childTaskId", CASE WHEN child.kind='transcribe' THEN 'transcript' ELSE 'source_draft' END AS step, call.id AS "callId"
 FROM execution_tasks parent JOIN execution_tasks child ON (
   (child.id=parent.checkpoint->>'transcriptTaskId' AND child.kind='transcribe' AND child.owner_type='item') OR
   (child.kind='topic_preview' AND child.owner_type='transform' AND child.idempotency_key=parent.id||':preview'))
 JOIN execution_calls call ON call.execution_task_id=child.id AND call.status IN ('started','unknown')
 WHERE parent.kind='radar_project_upgrade' AND parent.user_id=${ctx.userId}
   AND parent.owner_type='item' AND parent.owner_id=${itemId} AND parent.payload->>'itemId'=${itemId}
   AND (${ctx.groupId??null}::text IS NOT NULL AND parent.group_id=${ctx.groupId??null} OR ${ctx.groupId??null}::text IS NULL AND parent.account_id=${ctx.accountId??null})
   AND child.user_id=parent.user_id AND child.account_id IS NOT DISTINCT FROM parent.account_id AND child.group_id IS NOT DISTINCT FROM parent.group_id AND child.owner_id=parent.owner_id
 ORDER BY child.id,call.sequence`)).rows;
 return rows as Array<{childTaskId:string;step:'transcript'|'source_draft';callId:string}>;
}
