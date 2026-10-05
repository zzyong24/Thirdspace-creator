import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {randomUUID} from "node:crypto";
import {createReconstructedArtifactService} from "../artifacts/reconstructed-artifact.service";
import {and,eq,asc,aiTasks,aiTaskResults,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {structuredGenerationInputSchema,workerStructuredResultSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {reconstructProjectSchema} from '@creatoros/ai-worker';
import {z} from 'zod';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {ConflictError} from '../execution/execution.errors';
import {renderResearch} from '../ai-runtime/reconstruct-content';
/** 模型回执、原项目重建、业务结果与执行终态同一事务；重复完成只回原历史回执。 */
export function createReconstructCompletionService(db:Db,deps:{now?:()=>string;nextId?:(prefix:string)=>string}={}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now}),artifacts=createReconstructedArtifactService({now,nextId:deps.nextId??(prefix=>`${prefix}_${randomUUID()}`)});
 return {async commitResult(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
  const input=workerPortInputSchemas.commitResult.parse(raw);if(input.outcome!=='succeeded')throw new ConflictError('重建失败须经执行状态端口');
  return leases.withLease(ref,'settlement',async({tx,task,context})=>{
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context))).for('update');
   if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||business.taskType!=='reconstruct.project'||(task.payload as {aiTaskId?:unknown}).aiTaskId!==business.id)throw new ConflictError('重建任务归属不符');
   const frozen=structuredGenerationInputSchema.parse((task.payload as {modelInput?:unknown}).modelInput);
   const target=z.object({projectId:z.string().min(1)}).strict().parse(JSON.parse(frozen.facets.__reconstructProject??'null'));
   if(frozen.skillId!=='reconstruct.project'||frozen.capability!=='reconstruct.project'||business.projectId!==target.projectId||((business.inputData as {projectId?:unknown}).projectId!==undefined&&(business.inputData as {projectId?:unknown}).projectId!==target.projectId))throw new ConflictError('重建冻结项目不符');
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence)),call=calls.find(c=>c.id===input.callId);
   if(!call||call.kind!=='model'||call.parentCallId||call.status!=='settled'||!call.providerResult||call.resultText!==input.text)throw new ConflictError('重建缺少真实模型回执');
   const resultId=`reconstruct:${call.id}`;
   const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id,resultId));
   if(existing){if(existing.aiTaskId!==business.id||existing.executionCallId!==call.id||existing.resultType!=='reconstruction'||call.resultRef!==resultId||task.status!=='succeeded'||business.status!=='succeeded')throw new ConflictError('重建历史回执不一致');return {resultId,aiTaskId:business.id};}
   const assertActive=()=>{signal?.throwIfAborted();const stamp=Date.parse(now());if(task.status!=='running'||!task.leaseOwner||!task.leaseExpiresAt||Date.parse(task.leaseExpiresAt)<=stamp||(task.deadlineAt&&Date.parse(task.deadlineAt)<=stamp)||!['queued','running'].includes(business.status)||call.resultRef||calls.at(-1)?.id!==call.id||calls.some(c=>['reserved','started','unknown'].includes(c.status)))throw new ConflictError('重建执行已停止或尚未完整');};
   assertActive();const structured=workerStructuredResultSchema.parse(JSON.parse(input.text));if(structured.validation?.status==='partial')throw new ConflictError('研究重建尚未完整');
   const pkg=reconstructProjectSchema.parse(structured.object);if(!pkg.research.coreTopic.trim())throw new ConflictError('研究重建缺少主题');
   const artifact=await artifacts.materialize(tx as unknown as Db,context,{projectId:target.projectId,...renderResearch(pkg.research)});
   assertActive();const stamp=now();
   await tx.insert(aiTaskResults).values({id:resultId,aiTaskId:business.id,resultType:'reconstruction',executionCallId:call.id,resultData:{artifactId:artifact.id,projectId:target.projectId,origin:'reconstructed'}});
   await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
   await tx.update(aiTasks).set({status:'succeeded',completedAt:stamp,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
   await tx.update(executionTasks).set({status:'succeeded',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
   signal?.throwIfAborted();return {resultId,aiTaskId:business.id};
  });
 }};
}
