import {workspaceFilter} from "../../workspace-scope";
import {isDeepStrictEqual} from 'node:util';
import {and,eq,aiTasks,jobRuns,scheduledJobs} from '@creatoros/backend';
import {scheduledFlywheelTaskInputSchema} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {ConflictError} from './execution.errors';
type Scope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>['withLease']>[2]>[0];
export async function bindScheduledFlywheel(scope:Scope){
 const {task,tx,context}=scope,payload=task.payload as Record<string,unknown>,input=scheduledFlywheelTaskInputSchema.parse(payload.modelInput);
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
 const [run]=await tx.select().from(jobRuns).where(eq(jobRuns.id,input.jobRunId));
 const [job]=await tx.select().from(scheduledJobs).where(eq(scheduledJobs.id,input.jobId));
 const raw=business?.inputData as Record<string,unknown>|undefined;
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||payload.aiTaskId!==business?.id||business?.taskType!==`scheduled.${input.sourceKind}`||raw?.jobId!==input.jobId||(raw?.jobRunId!==undefined&&raw.jobRunId!==input.jobRunId)||!isDeepStrictEqual(raw?.target??{},input.target)||run?.aiTaskId!==business.id||run?.jobId!==input.jobId||run?.userId!==context.userId||job?.userId!==context.userId||job?.accountId!==context.accountId||job?.sourceKind!==input.sourceKind||input.skillSnapshot.userId!==context.userId||input.skillSnapshot.accountId !== (context.accountId??null) || (input.skillSnapshot.groupId??null)!==(context.groupId??null))throw new ConflictError('飞轮阶段与原调度任务/账号不符');
 return {task,business,payload,input,context};
}
