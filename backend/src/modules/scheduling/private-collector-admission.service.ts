import type {RequestContext} from '@creatoros/contract';
import type {Db} from '../../db';
import {and,eq} from 'drizzle-orm';
import {scheduledJobs} from '../../schema/scheduling';
import {createAccountGroupService} from '../platform-account';
import {OwnershipError,ConflictError} from '../../errors';
import {aiTasks} from '../../schema/ai';
import {assertFrozenWorkspaceMembership,type FrozenWorkspace,type MembershipTransaction} from '../platform-account/membership-lock.service';
export const PRIVATE_COLLECTION_SOURCE_KINDS:ReadonlySet<string>=new Set(['self.metrics','self.traffic','comments','self.detail']);
/** SEMANTIC_BOUNDARY_ALLOW: 平台协议能力准入，不做内容或创作选择。 */
export function supportsPrivateCollection(platform:string,sourceKind:string){return platform==='douyin'?PRIVATE_COLLECTION_SOURCE_KINDS.has(sourceKind):(platform==='kuaishou'||platform==='xiaohongshu')&&sourceKind==='self.metrics';}
/** 内部调度口：只验证实际账号私有采集job/成员，不授予组内容创作写权。调用者先持同一account/member锁。 */
export async function assertPrivateCollectorJob(db:Db,ctx:RequestContext,jobId:string,sourceKind?:string){
 if(!ctx.accountId||!ctx.groupId)throw new OwnershipError('私有采集缺少真实账号组');
 const member=await createAccountGroupService({db,now:()=>'',nextId:()=>''}).forAccount(ctx,ctx.accountId);
 if(member.status!=='active'||member.groupId!==ctx.groupId||(ctx.membershipVersion!==undefined&&member.version!==ctx.membershipVersion))throw new ConflictError('采集账号归属或能力已改变');
 const [job]=await db.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,jobId),eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,ctx.accountId),eq(scheduledJobs.groupId,ctx.groupId)));
 if(!job||!supportsPrivateCollection(member.platform,job.sourceKind)||(sourceKind!==undefined&&sourceKind!==job.sourceKind)||job.membershipVersion!==member.version)throw new ConflictError('采集作业与当前真实账号归属不符');
 return job;
}


type AiAdmissionTask=FrozenWorkspace&{id:string;taskType:string;inputData:unknown;executionTaskId:string|null};
type ExecutionAdmissionTask=FrozenWorkspace&{id:string;kind:string;ownerType:string;ownerId:string;payload:unknown};
function record(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
/** 归档豁免从持久化业务事实派生，账号ID或worker payload本身不构成执行权限。 */
export async function assertAiTaskWorkspaceAdmission(tx:MembershipTransaction,task:AiAdmissionTask):Promise<void>{
 const kind=task.taskType.startsWith('scheduled.')?task.taskType.slice(10):'',jobId=record(task.inputData).jobId;
 const privateCollector=!!task.groupId&&!!task.accountId&&PRIVATE_COLLECTION_SOURCE_KINDS.has(kind)&&typeof jobId==='string';
 await assertFrozenWorkspaceMembership(tx,task,{allowArchived:privateCollector});
 if(privateCollector)await assertPrivateCollectorJob(tx as unknown as Db,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,requestId:'private-ai-admission:'+task.id,source:'ingestion'},jobId as string,kind);
}
export async function assertExecutionTaskWorkspaceAdmission(tx:MembershipTransaction,task:ExecutionAdmissionTask):Promise<void>{
 if(task.kind==='ai_task'&&task.ownerType==='ai_task'){
  const [ai]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.userId,task.userId)));
  if(ai?.executionTaskId===task.id&&ai.groupId===task.groupId&&ai.accountId===task.accountId&&ai.groupVersion===task.groupVersion&&ai.membershipVersion===task.membershipVersion){await assertAiTaskWorkspaceAdmission(tx,ai);return;}
 }
 const payload=record(task.payload),job=record(payload.job);
 const privateCollector=task.kind==='automation_sync'&&task.ownerType==='scheduled_job'&&payload.handler==='scheduled_collection'&&job.id===task.ownerId&&typeof job.sourceKind==='string'&&PRIVATE_COLLECTION_SOURCE_KINDS.has(job.sourceKind)&&!!task.groupId&&!!task.accountId;
 await assertFrozenWorkspaceMembership(tx,task,{allowArchived:privateCollector});
 if(privateCollector)await assertPrivateCollectorJob(tx as unknown as Db,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,requestId:'private-execution-admission:'+task.id,source:'ingestion'},task.ownerId,job.sourceKind as string);
}
