import {bindIntelligenceTranscript} from '../intelligence/transcript-execution-binding';
import {z} from 'zod';
import {and,eq,aiTasks} from '@creatoros/backend';
import {createExecutionLeaseService} from './execution-lease.service';
import {ConflictError} from './execution.errors';
import {isDeepStrictEqual} from 'node:util';
export type TranscribeExecutionScope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>['withLease']>[2]>[0];
const target=z.object({kind:z.literal('transcribe.douyin'),awemeIds:z.array(z.string().min(1).max(128)).min(1).max(10000)});
/** 音频输入对本地与云模型相同；只绑定原任务作品，模型身份另由专用执行端口验证。 */
export async function bindTranscribeExecution(scope:TranscribeExecutionScope,awemeId:string){
 const {task,context,tx}=scope,payload=task.payload as Record<string,unknown>,input=target.parse(payload.modelInput);
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!)));
 const raw=business?.inputData as {awemeIds?:unknown;awemeId?:unknown}|undefined,ids=Array.isArray(raw?.awemeIds)?raw.awemeIds:typeof raw?.awemeId==='string'?[raw.awemeId]:[];
 if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||business.taskType!=='transcribe.douyin'||payload.aiTaskId!==business.id||!isDeepStrictEqual(input.awemeIds,ids)||!input.awemeIds.includes(awemeId))throw new ConflictError('转写输入与原任务作品不符');
 return {payload,input,business};
}

/** 仅共享音频与 ASR 叶子；作品工件/ai_task 终态仍只用上面的严格绑定。 */
export async function bindTranscribeAudioExecution(scope:TranscribeExecutionScope,awemeId:string){
 if(scope.task.kind!=='transcribe'){
  const bound=await bindTranscribeExecution(scope,awemeId);
  return {payload:bound.payload,input:bound.input,credentialIntentId:bound.business.id};
 }
 const bound=await bindIntelligenceTranscript(scope),payload=scope.task.payload as Record<string,unknown>,input=target.parse(payload.modelInput);
 if(bound.awemeId!==awemeId||!isDeepStrictEqual(input.awemeIds,[awemeId]))throw new ConflictError('情报 ASR 与原来源不符');
 return {payload,input,credentialIntentId:scope.task.id};
}

/** 领域提供锁内真实资源归属与冻结输入；ASR 叶子不接收任意 Worker 资源声明。 */
export type TranscribeResourceBinding=(scope:TranscribeExecutionScope,awemeId:string)=>Promise<{payload:Record<string,unknown>;input:unknown;credentialIntentId:string}>;
