import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {and,eq,executionTasks,executionCalls,itemTranscripts,type Db} from '@creatoros/backend';
import {createContinuousExecutionBudget,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {ConflictError} from '../execution/execution.errors';
import {bindIntelligenceTranscript} from './transcript-execution-binding';

type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Row=typeof executionTasks.$inferSelect;
/** SEMANTIC_BOUNDARY_ALLOW: 识别网关的冷却协议，不判断创作内容，也不给付费未知回执重放权。 */
export function transcriptCooldownRemaining(error:unknown):number|null {
 const e=error as {name?:unknown;remainMs?:unknown}|null;
 return e?.name==='DouyinCooldownActiveError'&&typeof e.remainMs==='number'&&Number.isFinite(e.remainMs)&&e.remainMs>=0?e.remainMs:null;
}
export function transcriptSourceRetryDelay(failures:number,remainMs:number,random=Math.random):number {
 const exponential=Math.min(15*60_000,5_000*2**Math.min(Math.max(0,failures-1),8));
 // 抖动只向后加；共享通道 remainMs 是下界，不能被指数上限裁短。
 return Math.ceil(Math.max(remainMs,exponential)+exponential*0.2*Math.max(0,Math.min(1,random())));
}
export function createTranscriptSourceRecoveryService(db:Db,deps:{now?:()=>string;random?:()=>number}={}) {
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 async function schedule(tx:Tx,task:Row,ctx:RequestContext,remainMs:number,legacy:boolean) {
  if(task.kind!=='transcribe'||task.ownerType!=='item')throw new ConflictError('不是原作品转写任务');
  const bound=await bindIntelligenceTranscript({tx,task,context:ctx});
  if((await tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).limit(1)).length)throw new ConflictError('存在调用账本，不能走未调用来源冷却恢复');
  const payload=task.payload as Record<string,unknown>;
  const previous=payload.transcriptSourceRecovery as {failures?:number}|undefined;
  const failures=Number.isInteger(previous?.failures)&&previous!.failures!>=0?previous!.failures!+1:1;
  const stamp=now(),retryAt=new Date(Date.parse(stamp)+transcriptSourceRetryDelay(failures,remainMs,deps.random)).toISOString();
  await tx.update(executionTasks).set({status:'retry_wait',retryAt,deadlineAt:null,executionBudget:createContinuousExecutionBudget(),leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,
   payload:{...payload,transcriptSourceRecovery:{failures,retryAt,remainMs,reason:'TRANSCRIBE_SOURCE_COOLDOWN',...(legacy?{legacyRecovery:{errorCode:task.lastErrorCode,errorMessage:task.lastErrorMessage,deadlineAt:task.deadlineAt}}:{})}},lastErrorCode:'TRANSCRIBE_SOURCE_COOLDOWN',lastErrorMessage:'来源通道冷却中，将在退避结束后自动继续',updatedAt:stamp}).where(eq(executionTasks.id,task.id));
  await tx.update(itemTranscripts).set({status:bound.transcript.text?.trim()?'done':'queued',errorCode:'TRANSCRIBE_SOURCE_COOLDOWN',completedAt:null,updatedAt:stamp}).where(and(eq(itemTranscripts.itemId,bound.item.id),eq(itemTranscripts.executionTaskId,task.id)));
 }
 return {
  async defer(ctx:RequestContext,ref:ExecutionRef,error:unknown):Promise<boolean> {
   const remainMs=transcriptCooldownRemaining(error);if(remainMs===null)return false;
   await leases.withLease(ref,'admission',async({tx,task,context})=>{if(context.userId!==ctx.userId||context.accountId!==ctx.accountId)throw new ConflictError('转写恢复账号不符');await schedule(tx,task,context,remainMs,false);});
   return true;
  },
  /** 仅供已获授权的升级父项点名恢复，不扫描历史任务。 */
  async recoverReferenced(ctx:RequestContext,taskId:string):Promise<boolean> {
   return db.transaction(async tx=>{
    const [task]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,taskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx))).for('update');
    if(!task||task.status!=='failed'||task.kind!=='transcribe'||task.lastErrorCode!=='TRANSCRIBE_FAILED'||task.lastErrorMessage!=='DouyinCooldownActiveError'||task.leaseOwner)return false;
    // 存量只保存了错误名称，已无可信剩余时长；先退避，再由共享网关核验实际冷却。
    await schedule(tx,task,ctx,5_000,true);return true;
   });
  },
 };
}
export type TranscriptSourceRecoveryService=ReturnType<typeof createTranscriptSourceRecoveryService>;
