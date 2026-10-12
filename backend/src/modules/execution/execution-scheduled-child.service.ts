import {createExecutionRoute,frozenExecutionEngine} from '@creatoros/contract/execution-worker';
import {workspaceFilter} from "../../workspace-scope";
import {and,asc,eq,inArray,sql,executionTasks,executionCalls,jobRuns,scheduledJobs,aiTasks,type Db} from '@creatoros/backend';
import type {ExecutionRef} from '@creatoros/contract/execution-worker';
import {ConflictError} from './execution.errors';
type Row=typeof executionTasks.$inferSelect;
const payload=(row:Row)=>row.payload as Record<string,unknown>;
export function scheduledChildId(row:Row):string|undefined{const value=payload(row).__scheduledChild as {executionTaskId?:unknown}|undefined;return typeof value?.executionTaskId==='string'?value.executionTaskId:undefined;}
function scheduledInput(child:Row):{jobId?:string;jobRunId?:string}{
 const input=payload(child).modelInput as {kind?:string;sourceKind?:string;jobId?:string;jobRunId?:string;facets?:Record<string,string>};
 if(input?.kind==='scheduled.flywheel'&&['benchmark','self.detail','self.metrics','self.traffic','comments','favorites'].includes(input.sourceKind??''))return {jobId:input.jobId,jobRunId:input.jobRunId};
 try{return JSON.parse(input?.facets?.__dailyTopic??'null')??{};}catch{throw new ConflictError('调度子任务冻结来源无效');}
}
export function assertScheduledChild(parent:Row,child:Row){
 const daily=scheduledInput(child);
 if(parent.kind!=='automation_sync'||parent.ownerType!=='scheduled_job'||child.kind!=='ai_task'||parent.userId!==child.userId||parent.accountId!==child.accountId||parent.groupId!==child.groupId||daily?.jobId!==parent.ownerId)throw new ConflictError('调度父子任务归属不一致');
}
export function scheduledParentProjection(child:Row){return {status:['queued','running','retry_wait'].includes(child.status)?'blocked':child.status,lastErrorCode:child.lastErrorCode,lastErrorMessage:child.lastErrorMessage,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null};}
export function createExecutionScheduledChildService(db:Db,deps:{now?:()=>string}={}){
 const now=deps.now??(()=>new Date().toISOString());
 return {
 async attach(ref:ExecutionRef,childId:string){
 if(ref.executionTaskId===childId)throw new ConflictError('调度任务不能引用自身');
 await db.transaction(async tx=>{
 const rows=await tx.select().from(executionTasks).where(inArray(executionTasks.id,[ref.executionTaskId,childId])).orderBy(asc(executionTasks.id)).for('update');
 const parent=rows.find(r=>r.id===ref.executionTaskId),child=rows.find(r=>r.id===childId);
 if(!parent||!child||parent.attempt!==ref.attempt||parent.fenceToken!==ref.fenceToken)throw new ConflictError('调度父任务租约已失效');
 assertScheduledChild(parent,child);
 const daily=scheduledInput(child);
 const [run]=await tx.select().from(jobRuns).where(eq(jobRuns.id,daily.jobRunId??''));
 const [job]=await tx.select().from(scheduledJobs).where(eq(scheduledJobs.id,parent.ownerId));
 const [ai]=await tx.select().from(aiTasks).where(eq(aiTasks.id,String(payload(child).aiTaskId??'')));
 const frozenInput=payload(child).modelInput as {kind?:string;sourceKind?:string};
 const expectedTaskType=frozenInput.kind==='scheduled.flywheel'?`scheduled.${frozenInput.sourceKind}`:'scheduled.topic.daily';
 if(!run||!job||!ai||ai.taskType!==expectedTaskType||(frozenInput.kind==='scheduled.flywheel'&&job.sourceKind!==frozenInput.sourceKind)||run.aiTaskId!==ai.id||ai.executionTaskId!==child.id||ai.userId!==parent.userId||ai.accountId!==parent.accountId||ai.groupId!==parent.groupId||run.jobId!==parent.ownerId||run.userId!==parent.userId||job.userId!==parent.userId||job.accountId!==parent.accountId||job.groupId!==parent.groupId||run.scheduledFor!==payload(parent).scheduledFor||(payload(parent).job as {id?:string})?.id!==job.id)throw new ConflictError('调度运行记录不属于此父任务');
 const reverse=payload(child).parentExecutionTaskId;if(reverse&&reverse!==parent.id)throw new ConflictError('子任务已经绑定其它父任务');
 // 首次委派只允许尚未领取/调用的子任务继承；历史与在途执行保留原路由。
 // 同一事务更新两处权威，避免Worker读业务runtime与飞轮读payload得到不同引擎。
 const calls=await tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,child.id)).limit(1);
 const inherit=!reverse&&child.status==='queued'&&child.attempt===0&&!child.leaseOwner&&calls.length===0;
 const route=inherit?createExecutionRoute(frozenExecutionEngine(payload(parent)),"parent"):undefined;
 await tx.update(executionTasks).set({payload:{...payload(child),...(route?{executionRoute:route}:{}),parentExecutionTaskId:parent.id}}).where(eq(executionTasks.id,child.id));
 if(route)await tx.update(aiTasks).set({runtimeData:{...(ai.runtimeData as Record<string,unknown>??{}),executionRoute:route}}).where(eq(aiTasks.id,ai.id));
 const existing=scheduledChildId(parent);if(existing&&existing!==child.id)throw new ConflictError('调度父任务已有不同子任务');
 if(!existing&&!['running','pause_requested','cancel_requested','cancelled','paused'].includes(parent.status))throw new ConflictError('调度父任务不可委派');
 let childState=child;
 if(['cancel_requested','cancelled','pause_requested','paused'].includes(parent.status)&&!['succeeded','failed','cancelled','partial'].includes(child.status)){
 const cancel=parent.status.startsWith('cancel');const status=child.status==='cancel_requested'?'cancel_requested':child.status==='unknown_result'&&!cancel?'unknown_result':child.status==='running'||child.status==='pause_requested'?(cancel?'cancel_requested':'pause_requested'):(cancel?'cancelled':'paused');
 const [updated]=await tx.update(executionTasks).set({status,...(['cancelled','paused'].includes(status)?{leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null}:{}),updatedAt:now()}).where(eq(executionTasks.id,child.id)).returning();childState=updated!;
 }
 await tx.update(executionTasks).set({...scheduledParentProjection(childState),payload:{...payload(parent),__scheduledChild:{executionTaskId:child.id}},updatedAt:now()}).where(eq(executionTasks.id,parent.id));
 });
 },
 async reconcile(){
 const parents=await db.select().from(executionTasks).where(and(eq(executionTasks.kind,'automation_sync'),sql`${executionTasks.payload} ? '__scheduledChild'`));
 const report={succeeded:0,failed:0,pending:0,inconsistent:0};
 for(const row of parents){try{await db.transaction(async tx=>{const childId=scheduledChildId(row);if(!childId)return;const rows=await tx.select().from(executionTasks).where(inArray(executionTasks.id,[row.id,childId])).orderBy(asc(executionTasks.id)).for('update');const parent=rows.find(r=>r.id===row.id),child=rows.find(r=>r.id===childId);if(!parent||!child)throw new ConflictError('调度子任务不存在');assertScheduledChild(parent,child);if(payload(child).parentExecutionTaskId!==parent.id||scheduledChildId(parent)!==child.id)throw new ConflictError('调度链接已变更');
 const projection=scheduledParentProjection(child);if(parent.status!==projection.status||parent.lastErrorCode!==projection.lastErrorCode||parent.lastErrorMessage!==projection.lastErrorMessage){await tx.update(executionTasks).set({...projection,updatedAt:now()}).where(eq(executionTasks.id,parent.id));if(child.status==='succeeded')report.succeeded++;else if(['failed','cancelled'].includes(child.status))report.failed++;}if(!['succeeded','failed','cancelled','partial'].includes(child.status))report.pending++;
 });}catch{report.inconsistent++;console.error('[scheduled-child] 父子任务关系异常，保留待检查',row.id);}}return report;
 }
 };
}

/** 仅读真实调度运行关系；调用者随后必须统一锁父子并复查。 */
export async function findScheduledParent(tx:Parameters<Parameters<Db['transaction']>[0]>[0],child:Row):Promise<Row|undefined>{
 if(child.kind!=='ai_task')return undefined;
 const [ai]=await tx.select().from(aiTasks).where(eq(aiTasks.id,String(payload(child).aiTaskId??'')));
 if(!ai||!['scheduled.topic.daily','scheduled.benchmark','scheduled.self.detail','scheduled.self.metrics','scheduled.self.traffic','scheduled.comments','scheduled.favorites'].includes(ai.taskType))return undefined;
 const input=payload(child).modelInput as {kind?:string;sourceKind?:string};
 if(ai.taskType!=='scheduled.topic.daily'&&(input?.kind!=='scheduled.flywheel'||ai.taskType!==`scheduled.${input.sourceKind}`))return undefined;
 if(ai.executionTaskId!==child.id||ai.userId!==child.userId||ai.accountId!==child.accountId)throw new ConflictError('每日子任务归属无效');
 const [run]=await tx.select().from(jobRuns).where(and(eq(jobRuns.aiTaskId,ai.id),eq(jobRuns.userId,child.userId)));
 if(!run?.scheduledFor)return undefined;
 // execution.kind 是任务类型；整行传入会被误认成 WorkspaceKey.kind。
 const parents=await tx.select().from(executionTasks).where(and(eq(executionTasks.kind,'automation_sync'),eq(executionTasks.ownerType,'scheduled_job'),eq(executionTasks.ownerId,run.jobId),eq(executionTasks.userId,child.userId),workspaceFilter(executionTasks,{groupId:child.groupId,accountId:child.accountId}),sql`${executionTasks.payload}->>'scheduledFor' = ${run.scheduledFor}`));
 if(parents.length!==1)throw new ConflictError('每日子任务缺少唯一调度父任务');
 const parent=parents[0]!;const reverse=payload(child).parentExecutionTaskId;if(reverse&&reverse!==parent.id)throw new ConflictError('每日父任务绑定不一致');return parent;
}
