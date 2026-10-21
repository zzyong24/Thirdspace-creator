import {assertPreparationSource,readPreparationParentProof} from './execution-preparation-parent';
import type {PersistentTaskClaim} from './persistent-task.service';
import {asc,inArray,sql,and,desc,eq,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workspaceFilter} from '../../workspace-scope';
import {assertFrozenWorkspaceMembership,lockWorkspaceMembership} from '../platform-account/membership-lock.service';
import {ConflictError} from './execution.errors';
export type PreparationTaskRow=typeof executionTasks.$inferSelect;
/** 准备流程的执行记录仍归 execution；事务端口仅供 backend 组合，不暴露给 worker。 */
export function createProjectPreparationStateService(db:Db){
 const owned=(ctx:RequestContext)=>and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx));
 return {
  async reuseTranscript(ctx:RequestContext,input:{parentClaim:PersistentTaskClaim;referenceId:string;childTaskId:string;now:string}){
   return db.transaction(async tx=>{
    await lockWorkspaceMembership(tx,ctx);
    const rows=await tx.select().from(executionTasks).where(and(owned(ctx),inArray(executionTasks.id,[input.parentClaim.task.id,input.childTaskId]))).orderBy(asc(executionTasks.id)).for('update');
    const parent=rows.find(r=>r.id===input.parentClaim.task.id),child=rows.find(r=>r.id===input.childTaskId),lease=input.parentClaim.lease;
    if(!parent||!child||parent.status!=='running'||parent.attempt!==lease.attempt||parent.fenceToken!==lease.fenceToken||parent.leaseOwner!==lease.workerId||!parent.leaseExpiresAt||Date.parse(parent.leaseExpiresAt)<=Date.parse(input.now)||!['queued','running','retry_wait','succeeded','failed','blocked','paused','waiting_user','unknown_result'].includes(child.status))throw new ConflictError('共享转写原执行不可复用');
    await assertFrozenWorkspaceMembership(tx,parent);await assertFrozenWorkspaceMembership(tx,child);
    await assertPreparationSource(tx,parent,child,input.referenceId);
    if(child.kind!=='transcribe'||child.ownerType!=='item')throw new ConflictError('只有真实作品转写可共享');
    const proof=readPreparationParentProof(child);
    if(proof?.exclusive&&proof.parentTaskId!==parent.id)await tx.update(executionTasks).set({payload:{...child.payload as object,preparationParentProof:{...proof,exclusive:false}},updatedAt:input.now}).where(eq(executionTasks.id,child.id));
   });
  },
  async calls(ctx:RequestContext,id:string){const [row]=await db.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.id,id)));if(!row)throw new ConflictError('准备执行记录不属于当前工作区');return db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,id)).orderBy(executionCalls.sequence);},
  async byKey(ctx:RequestContext,kind:string,key:string){return (await db.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.kind,kind),eq(executionTasks.idempotencyKey,key))).limit(1))[0]??null;},
  async candidateParent(ctx:RequestContext,projectId:string,candidateId:string){return (await db.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.kind,'project_preparation'),eq(executionTasks.ownerType,'project'),eq(executionTasks.ownerId,projectId),sql`${executionTasks.checkpoint}->'candidates' @> ${JSON.stringify([{id:candidateId}])}::jsonb`)).orderBy(desc(executionTasks.createdAt)).limit(1))[0]??null;},
  async startRequest(ctx:RequestContext,projectId:string,key:string){
   const [row]=await db.select({checkpoint:executionTasks.checkpoint}).from(executionTasks).where(and(owned(ctx),eq(executionTasks.kind,'project_preparation'),eq(executionTasks.ownerType,'project'),eq(executionTasks.ownerId,projectId),sql`${executionTasks.checkpoint}->'startRequests'->>${key} IS NOT NULL`)).limit(1);
   return (row?.checkpoint as {startRequests?:Record<string,string>}|undefined)?.startRequests?.[key];
  },
  async latest(ctx:RequestContext,projectId:string){return (await db.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.kind,'project_preparation'),eq(executionTasks.ownerType,'project'),eq(executionTasks.ownerId,projectId))).orderBy(desc(executionTasks.createdAt),desc(executionTasks.id)).limit(1))[0]??null;},
  async read(ctx:RequestContext,id:string){const [row]=await db.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.id,id)));if(!row)throw new ConflictError('准备执行记录不属于当前工作区');return row;},
  async update<T>(ctx:RequestContext,id:string,projectId:string,action:(tx:Db,row:PreparationTaskRow)=>Promise<{checkpoint:unknown;payload?:unknown;status?:string;result:T}>):Promise<T>{
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    await lockWorkspaceMembership(transaction,ctx);
    const [row]=await tx.select().from(executionTasks).where(and(owned(ctx),eq(executionTasks.id,id))).for('update');
    if(!row||row.ownerType!=='project'||row.ownerId!==projectId||!['project_preparation','topic_preview'].includes(row.kind))throw new ConflictError('准备任务与项目不符');
    await assertFrozenWorkspaceMembership(transaction,row);
    const change=await action(tx,row);
    await tx.update(executionTasks).set({checkpoint:change.checkpoint,updatedAt:new Date().toISOString(),...(change.payload===undefined?{}:{payload:change.payload}),...(change.status?{status:change.status,...(change.status==='queued'?{retryAt:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null}:{} )}:{} )}).where(eq(executionTasks.id,row.id));
    return change.result;
   });
  },
 };
}
