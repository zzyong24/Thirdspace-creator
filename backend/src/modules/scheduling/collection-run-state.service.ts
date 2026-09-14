import {aiTasks,executionTasks,jobRuns,scheduledJobs,and,eq,inArray,or,sql,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {OwnershipError} from './scheduling.errors';

const sourceKinds=['self.metrics','self.traffic','self.detail','comments','benchmark','favorites'];
const terminal=new Set(['succeeded','failed','cancelled','partial']);
const staleError='自动化运行超时且无活跃执行(stale-run):该 run 仍悬挂在 running,标记为 failed';
type Task=typeof aiTasks.$inferSelect;
type Execution=typeof executionTasks.$inferSelect;
type Job=typeof scheduledJobs.$inferSelect;
type Run=typeof jobRuns.$inferSelect;
type RecordValue=Record<string,unknown>;
const object=(value:unknown):RecordValue=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};

// SEMANTIC_BOUNDARY_ALLOW: 仅校验真实 ID、账号和冻结执行归属，不做内容理解或创作选择。
function matches(task:Task,execution:Execution|undefined,job:Job,run:Run){
 const input=object(task.inputData),payload=object(execution?.payload),frozen=object(payload.modelInput);
 return !!execution&&execution.kind==='ai_task'&&execution.ownerType==='ai_task'&&execution.ownerId===task.id
  &&execution.userId===task.userId&&execution.accountId===task.accountId&&payload.aiTaskId===task.id
  &&task.executionTaskId===execution.id&&task.taskType===`scheduled.${job.sourceKind}`
  &&job.userId===task.userId&&job.accountId===task.accountId&&run.userId===task.userId
  &&run.jobId===job.id&&run.aiTaskId===task.id&&input.jobId===job.id
  &&frozen.kind==='scheduled.flywheel'&&frozen.sourceKind===job.sourceKind&&frozen.jobId===job.id&&frozen.jobRunId===run.id;
}

/** 只对账采集运行投影；不 claim、重试或改写任何执行状态、输入和预算。 */
export function createCollectionRunStateService(db:Db,deps:{now:()=>string}){
 return {
  async syncExecutionRuns(ctx:RequestContext){
   if(!ctx.userId)throw new OwnershipError('采集运行同步缺少真实用户');
   const active=new Set<string>();let finalized=0;
   const inconsistencies:Array<{jobRunId:string;executionTaskId:string;reason:string}>=[];
   const candidates=await db.select({runId:jobRuns.id,executionTaskId:aiTasks.executionTaskId}).from(jobRuns)
    .innerJoin(scheduledJobs,eq(scheduledJobs.id,jobRuns.jobId)).innerJoin(aiTasks,eq(aiTasks.id,jobRuns.aiTaskId))
    .where(and(eq(jobRuns.userId,ctx.userId),eq(scheduledJobs.userId,ctx.userId),eq(aiTasks.userId,ctx.userId),
     ctx.accountId?eq(scheduledJobs.accountId,ctx.accountId):undefined,inArray(scheduledJobs.sourceKind,sourceKinds),sql`${aiTasks.executionTaskId} IS NOT NULL`,
     or(eq(jobRuns.status,'running'),and(eq(jobRuns.status,'failed'),eq(jobRuns.error,staleError)))));
   for(const candidate of candidates)await db.transaction(async tx=>{
    // 与采集结束事务同序：先锁执行再读取并锁运行，防止依据过期状态重新打开已完成运行。
    const [execution]=await tx.select().from(executionTasks).where(eq(executionTasks.id,candidate.executionTaskId!)).for('update');
    const [run]=await tx.select().from(jobRuns).where(and(eq(jobRuns.id,candidate.runId),eq(jobRuns.userId,ctx.userId))).for('update');
    if(!run?.aiTaskId||!(run.status==='running'||(run.status==='failed'&&run.error===staleError)))return;
    const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,run.jobId),eq(scheduledJobs.userId,ctx.userId),ctx.accountId?eq(scheduledJobs.accountId,ctx.accountId):undefined));
    if(!job||!sourceKinds.includes(job.sourceKind))return;
    const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,run.aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,job.accountId)));
    if(!task?.executionTaskId)return;
    if(!matches(task,execution,job,run)){
     // 证据不一致时不能由旧超时清理覆盖结果；保留原状态并报告。
     active.add(task.id);inconsistencies.push({jobRunId:run.id,executionTaskId:task.executionTaskId,reason:'采集运行与持久执行归属映射不一致'});return;
    }
    if(!terminal.has(execution!.status)){
     active.add(task.id);
     // SEMANTIC_BOUNDARY_ALLOW: 精确匹配本系统旧清理器错误，不根据任意失败文案推断可重试。
     if(run.status==='failed'&&run.error===staleError)await tx.update(jobRuns).set({status:'running',error:null,finishedAt:null}).where(eq(jobRuns.id,run.id));
     return;
    }
    if(run.status!=='running')return;
    if(execution!.status==='succeeded'){
     active.add(task.id);inconsistencies.push({jobRunId:run.id,executionTaskId:execution!.id,reason:'采集执行已成功但运行缺少完成回执'});return;
    }
    await tx.update(jobRuns).set({status:'failed',error:execution!.lastErrorMessage||(execution!.status==='cancelled'?'采集已取消':execution!.status==='partial'?'采集部分完成，请查看原任务':'采集执行失败'),finishedAt:deps.now()}).where(eq(jobRuns.id,run.id));
    finalized++;
   });
   return {activeAiTaskIds:[...active],finalized,inconsistencies};
  },
 };
}
