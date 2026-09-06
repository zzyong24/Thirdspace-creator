import {and,eq,aiTasks,jobRuns,scheduledJobs,requireAccountId,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {z} from 'zod';
import {OwnershipError,ValidationError} from './scheduling.errors';
const intentSchema=z.object({version:z.literal(1),scheduledFor:z.string().datetime().refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'调度时刻必须为规范UTC ISO时间').nullable()}).strict();
/** 恢复创建task后、写run前的中断；只落实已冻结的调度意图，不猜测计划时刻。 */
export function createDailyTopicRunIntentService(db:Db,deps:{now:()=>string;nextId:(prefix:string)=>string}){
 return {
  async ensureRunForTask(ctx:RequestContext,aiTaskId:string){
   const accountId=requireAccountId(ctx.accountId,'scheduling.ensureDailyRun');
   return db.transaction(async tx=>{
    const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,accountId))).for('update');
    if(!task||task.taskType!=='scheduled.topic.daily')throw new OwnershipError('每日选题任务不存在');
    const input=task.inputData as Record<string,unknown>;
    if(typeof input.jobId!=='string'||!input.jobId)throw new ValidationError('每日选题缺少真实作业');
    const [job]=await tx.select().from(scheduledJobs).where(and(eq(scheduledJobs.id,input.jobId),eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,accountId))).for('update');
    if(!job||job.sourceKind!=='topic.daily')throw new OwnershipError('每日选题作业不存在');
    const existing=await tx.select().from(jobRuns).where(eq(jobRuns.aiTaskId,task.id));
    if(existing.length){
     if(existing.length!==1||existing[0]!.userId!==ctx.userId||existing[0]!.jobId!==job.id)throw new ValidationError('每日选题运行绑定不唯一或归属不符');
     if(Object.hasOwn(input,'scheduledRun')){
      const intent=intentSchema.parse(input.scheduledRun);
      if(existing[0]!.scheduledFor!==intent.scheduledFor)throw new ValidationError('每日选题运行时刻与冻结意图不符');
     }
     return existing[0]!;
    }
    if(task.status!=='queued'||task.executionTaskId||task.leaseOwner)throw new ValidationError('每日选题当前不可补建运行记录');
    const intent=intentSchema.safeParse(input.scheduledRun);
    if(!intent.success)throw new ValidationError('每日选题缺少有效冻结调度意图，不能猜测恢复');
    const [run]=await tx.insert(jobRuns).values({id:deps.nextId('run'),userId:ctx.userId,jobId:job.id,aiTaskId:task.id,status:'running',itemsNew:0,itemsUpdated:0,error:null,scheduledFor:intent.data.scheduledFor,startedAt:deps.now(),finishedAt:null,progress:null}).returning();
    return run!;
   });
  },
 };
}
