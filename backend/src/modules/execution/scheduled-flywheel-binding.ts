import {workspaceFilter} from "../../workspace-scope";
import {isDeepStrictEqual} from 'node:util';
import {and,eq,aiTasks,jobRuns,scheduledJobs} from '@creatoros/backend';
import {scheduledFlywheelTaskInputSchema} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {ConflictError} from './execution.errors';
type Scope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>['withLease']>[2]>[0];
const bindingReasons={
 business:'原采集任务与执行记录未对应',
 input:'冻结输入与原采集任务不一致',
 run:'原采集运行记录未对应',
 job:'原采集作业与执行账号不一致',
 snapshot:'原执行配置的账号组不一致',
} as const;
export class ScheduledFlywheelBindingError extends ConflictError {
 constructor(readonly reason:keyof typeof bindingReasons){super(`飞轮阶段与原调度任务/账号不符：${bindingReasons[reason]}`);}
}
export async function bindScheduledFlywheel(scope:Scope){
 const {task,tx,context}=scope,payload=task.payload as Record<string,unknown>,input=scheduledFlywheelTaskInputSchema.parse(payload.modelInput);
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
 const [run]=await tx.select().from(jobRuns).where(eq(jobRuns.id,input.jobRunId));
 const [job]=await tx.select().from(scheduledJobs).where(eq(scheduledJobs.id,input.jobId));
 const raw=business?.inputData as Record<string,unknown>|undefined;
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||payload.aiTaskId!==business.id||business.taskType!==`scheduled.${input.sourceKind}`)throw new ScheduledFlywheelBindingError('business');
 if(raw?.jobId!==input.jobId||(raw?.jobRunId!==undefined&&raw.jobRunId!==input.jobRunId)||!isDeepStrictEqual(raw?.target??{},input.target))throw new ScheduledFlywheelBindingError('input');
 if(run?.aiTaskId!==business.id||run?.jobId!==input.jobId||run?.userId!==context.userId)throw new ScheduledFlywheelBindingError('run');
 if(job?.userId!==context.userId||job?.accountId!==context.accountId||job?.sourceKind!==input.sourceKind)throw new ScheduledFlywheelBindingError('job');
 if(input.skillSnapshot.userId!==context.userId||input.skillSnapshot.accountId !== (context.accountId??null) || (input.skillSnapshot.groupId??null)!==(context.groupId??null))throw new ScheduledFlywheelBindingError('snapshot');
 return {task,business,payload,input,context};
}
