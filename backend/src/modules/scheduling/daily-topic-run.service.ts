import {dailyTopicInputSchema,topicGenerateFrozenSchema} from '@creatoros/ai-worker';
import {aiTasks,executionTasks,jobRuns,scheduledJobs,and,eq,requireAccountId,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {OwnershipError,ValidationError} from './scheduling.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
export interface DailyTopicRunRef {jobId:string;jobRunId:string;aiTaskId:string}
/** 定时选题的内部运行绑定端口；不新增HTTP操作，不接受Worker自报运行归属。 */
export function createDailyTopicRunService(db:Db,deps:{now:()=>string}){
 async function validateRun(ctx:RequestContext,input:DailyTopicRunRef,tx:Tx,allowCompleted=false){
  const accountId=requireAccountId(ctx.accountId,'scheduling.dailyTopicRun');
  const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,input.jobId),eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,accountId))).for('update');
  if(!job||job.sourceKind!=='topic.daily')throw new OwnershipError('每日选题作业不存在');
  const [run]=await tx.select().from(jobRuns).where(and(eq(jobRuns.id,input.jobRunId),eq(jobRuns.jobId,job.id),eq(jobRuns.userId,ctx.userId))).for('update');
  if(!run?.aiTaskId||run.aiTaskId!==input.aiTaskId)throw new OwnershipError('每日选题运行缺少任务绑定');
  const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,run.aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,accountId)));
  if(!task||task.taskType!=='scheduled.topic.daily'||(task.inputData as {jobId?:unknown})?.jobId!==job.id)throw new OwnershipError('每日选题任务绑定不符');
  if(run.status!=='running'&&!(allowCompleted&&run.status==='succeeded'))throw new ValidationError('每日选题运行当前不可执行');
  return {job,run,aiTaskId:task.id};
 }
 return {
  /** 仅由持久命令在既有retry授权检查后调用，与命令共享事务，不重置执行账本。 */
  async reopenForExecutionRetry(ctx:RequestContext,executionTaskId:string,tx:Tx){
   const accountId=requireAccountId(ctx.accountId,'scheduling.dailyTopicRetry');
   const [execution]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,executionTaskId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,accountId))).for('update');
   if(!execution)throw new OwnershipError('重试执行不存在');
   if(execution.kind!=='ai_task'||execution.ownerType!=='ai_task')return false;
   const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,execution.ownerId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,accountId))).for('update');
   const payload=execution.payload as {aiTaskId?:unknown;modelInput?:{kind?:unknown;skillId?:unknown;facets?:Record<string,unknown>}};
   if(task?.taskType!=='scheduled.topic.daily'){
    if(payload.modelInput?.facets?.__dailyTopic!==undefined)throw new OwnershipError('每日重试缺少真实任务归属');
    return false;
   }
   if(task.executionTaskId!==execution.id||payload.aiTaskId!==task.id||payload.modelInput?.kind!=='model.structured'||payload.modelInput.skillId!=='topic.generate')throw new OwnershipError('每日重试执行映射无效');
   if(!['failed','retry_wait','blocked'].includes(execution.status))throw new ValidationError('每日执行当前不可重试');
   const raw=payload.modelInput.facets?.__dailyTopic;
   const frozen=dailyTopicInputSchema.parse(JSON.parse(typeof raw==='string'?raw:'null'));
   if(!frozen.skipReason){const topicRaw=payload.modelInput.facets?.__topicGenerate;const topic=topicGenerateFrozenSchema.parse(JSON.parse(typeof topicRaw==='string'?topicRaw:'null'));if(topic.mode!=='daily'||topic.basis!=='positioning'||topic.projectId!==null)throw new ValidationError('每日重试冻结模式无效');}
   if((task.inputData as {jobId?:unknown})?.jobId!==frozen.jobId)throw new OwnershipError('每日重试冻结作业不符');
   const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,frozen.jobId),eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,accountId))).for('update');
   if(!job||job.sourceKind!=='topic.daily')throw new OwnershipError('每日重试作业不存在');
   const [run]=await tx.select().from(jobRuns).where(and(eq(jobRuns.id,frozen.jobRunId),eq(jobRuns.jobId,job.id),eq(jobRuns.userId,ctx.userId))).for('update');
   if(!run||run.aiTaskId!==task.id)throw new OwnershipError('每日重试运行绑定不符');
   if(!['failed','running'].includes(run.status)||run.itemsNew!==0||run.itemsUpdated!==0)throw new ValidationError('已有完成或写入事实的每日运行不可重新打开');
   if(!['queued','running','failed'].includes(task.status))throw new ValidationError('每日AI任务当前不可重试');
   if(run.status==='failed')await tx.update(jobRuns).set({status:'running',finishedAt:null,error:null,progress:null}).where(eq(jobRuns.id,run.id));
   if(task.status==='failed')await tx.update(aiTasks).set({status:'queued',completedAt:null,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,task.id));
   return true;
  },
  /** 唯一调度tick的只读执行投影；只改job_run，不claim/retry或完成execution。 */
  async syncExecutionRuns(ctx:RequestContext){
   if(!ctx.userId)throw new OwnershipError('每日运行同步缺少真实用户');
   const active=new Set<string>();let finalized=0;
   const inconsistencies:{jobRunId:string;executionTaskId:string;reason:string}[]=[];
   const pending=await db.select({id:jobRuns.id}).from(jobRuns).where(and(eq(jobRuns.userId,ctx.userId),eq(jobRuns.status,'running')));
   for(const item of pending)await db.transaction(async tx=>{
    const [run]=await tx.select().from(jobRuns).where(and(eq(jobRuns.id,item.id),eq(jobRuns.userId,ctx.userId))).for('update');
    if(!run||run.status!=='running'||!run.aiTaskId)return;
    const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,run.jobId),eq(scheduledJobs.userId,ctx.userId)));
    if(!job||job.sourceKind!=='topic.daily'||!job.accountId)return;
    const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,run.aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,job.accountId)));
    if(!task||task.taskType!=='scheduled.topic.daily'||!task.executionTaskId)return;
    const [execution]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,job.accountId)));
    const mismatch=!execution||execution.kind!=='ai_task'||execution.ownerType!=='ai_task'||execution.ownerId!==task.id||(execution.payload as {aiTaskId?:unknown})?.aiTaskId!==task.id||(task.inputData as {jobId?:unknown})?.jobId!==job.id;
    if(mismatch){active.add(task.id);inconsistencies.push({jobRunId:run.id,executionTaskId:task.executionTaskId,reason:'每日运行与持久执行归属映射不一致'});return;}
    if(execution.status==='failed'||execution.status==='cancelled'){
     await tx.update(jobRuns).set({status:'failed',error:execution.status==='cancelled'?'每日选题已取消':execution.lastErrorMessage||'每日选题执行失败',finishedAt:deps.now(),progress:null}).where(eq(jobRuns.id,run.id));finalized++;return;
    }
    active.add(task.id);
    if(execution.status==='succeeded')inconsistencies.push({jobRunId:run.id,executionTaskId:execution.id,reason:'每日执行已成功但缺少原子入池运行回执'});
   });
   return {activeAiTaskIds:[...active],finalized,inconsistencies};
  },
  validateRun:(ctx:RequestContext,input:DailyTopicRunRef,tx:Tx)=>validateRun(ctx,input,tx),
  async resolveRun(ctx:RequestContext,aiTaskId:string){return db.transaction(async tx=>{
   requireAccountId(ctx.accountId,'scheduling.dailyTopicRun');
   const runs=await tx.select().from(jobRuns).where(and(eq(jobRuns.aiTaskId,aiTaskId),eq(jobRuns.userId,ctx.userId)));
   if(runs.length!==1)throw new ValidationError('每日选题任务必须绑定唯一运行');
   const run=runs[0]!;const valid=await validateRun(ctx,{jobId:run.jobId,jobRunId:run.id,aiTaskId},tx);
   if(valid.run.status!=='running')throw new ValidationError('每日选题运行当前不可准备');
   return {jobId:run.jobId,jobRunId:run.id,dayKey:run.startedAt.slice(0,10)};
  });},
  async finishRun(ctx:RequestContext,input:DailyTopicRunRef&{itemsNew:number;message:string},tx:Tx){
   if(!Number.isSafeInteger(input.itemsNew)||input.itemsNew<0)throw new ValidationError('每日选题完成数量无效');
   const {run}=await validateRun(ctx,input,tx,true);
   if(run.status==='succeeded'){
    if(run.itemsNew!==input.itemsNew||run.itemsUpdated!==0)throw new ValidationError('已完成的每日选题回执不能改写');
    return;
   }
   if(run.status!=='running')throw new ValidationError('每日选题运行不是可完成状态');
   await tx.update(jobRuns).set({status:'succeeded',itemsNew:input.itemsNew,itemsUpdated:0,error:null,finishedAt:deps.now(),progress:null}).where(eq(jobRuns.id,run.id));
  },
 };
}
