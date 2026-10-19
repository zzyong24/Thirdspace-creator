import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {z} from "zod";
import {and,eq,asc,aiTasks,aiTaskResults,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {structuredGenerationInputSchema,workerStructuredResultSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {scriptSourceSimilaritySchema} from '@creatoros/ai-worker';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {ConflictError} from '../execution/execution.errors';
import {scriptSimilarityInputSchema} from "../ai-runtime/script-similarity-business-adapter";
/** 模型回执、只读评分、业务结果与执行终态同一事务；重复完成只回原历史回执。 */
export function createScriptSimilarityCompletionService(db:Db,deps:{now?:()=>string;nextId?:(prefix:string)=>string}={}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 return {async commitResult(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
  const input=workerPortInputSchemas.commitResult.parse(raw);if(input.outcome!=='succeeded')throw new ConflictError('相似度评估失败须经执行状态端口');
  return leases.withLease(ref,'settlement',async({tx,task,context})=>{
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context))).for('update');
   if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!business||business.taskType!=='script.source_similarity'||(task.payload as {aiTaskId?:unknown}).aiTaskId!==business.id)throw new ConflictError('相似度评估任务归属不符');
   const frozen=structuredGenerationInputSchema.parse((task.payload as {modelInput?:unknown}).modelInput);
   const target=scriptSimilarityInputSchema.extend({referenceIds:z.array(z.string().min(1)).min(1)}).parse(JSON.parse(frozen.facets.__scriptSimilarity??'null'));
   const {referenceIds,...boundInput}=target;
   if(frozen.skillId!=="script.source_similarity"||frozen.capability!=="default"||JSON.stringify(scriptSimilarityInputSchema.parse(boundInput))!==JSON.stringify(scriptSimilarityInputSchema.parse(business.inputData))||business.projectId!==target.projectId)throw new ConflictError("相似度冻结来源不符");
   const [parent]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,target.sourceTaskId),eq(executionTasks.userId,context.userId),workspaceFilter(executionTasks,context)));
   if(!parent||parent.kind!=="script_candidate"||parent.ownerType!=="project"||parent.ownerId!==target.projectId||parent.status!=="succeeded"||JSON.stringify((parent.checkpoint as {referenceIds?:unknown})?.referenceIds)!==JSON.stringify(target.referenceIds))throw new ConflictError("相似度来源任务归属或回执不符");
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence)),call=calls.find(c=>c.id===input.callId);
   if(!call||call.kind!=='model'||call.parentCallId||call.status!=='settled'||!call.providerResult||call.resultText!==input.text)throw new ConflictError('相似度评估缺少真实模型回执');
   const resultId=`script-similarity:${call.id}`;
   const [existing]=await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id,resultId));
   if(existing){if(existing.aiTaskId!==business.id||existing.executionCallId!==call.id||existing.resultType!=='script_similarity'||call.resultRef!==resultId||task.status!=='succeeded'||business.status!=='succeeded')throw new ConflictError('相似度评估历史回执不一致');return {resultId,aiTaskId:business.id};}
   const assertActive=()=>{signal?.throwIfAborted();const stamp=Date.parse(now());if(task.status!=='running'||!task.leaseOwner||!task.leaseExpiresAt||Date.parse(task.leaseExpiresAt)<=stamp||(task.deadlineAt&&Date.parse(task.deadlineAt)<=stamp)||!['queued','running'].includes(business.status)||call.resultRef||calls.at(-1)?.id!==call.id||calls.some(c=>['reserved','started','unknown'].includes(c.status)))throw new ConflictError('相似度评估执行已停止或尚未完整');};
   assertActive();const structured=workerStructuredResultSchema.parse(JSON.parse(input.text));if(structured.validation?.status==='partial')throw new ConflictError('相似度评估尚未完整');
   const output=scriptSourceSimilaritySchema.parse(structured.object);
   assertActive();const stamp=now();
   await tx.insert(aiTaskResults).values({id:resultId,aiTaskId:business.id,resultType:'script_similarity',executionCallId:call.id,resultData:{...output,sourceTaskId:target.sourceTaskId,sourceDigest:target.sourceDigest}});
   await tx.update(executionCalls).set({resultRef:resultId,updatedAt:stamp}).where(eq(executionCalls.id,call.id));
   await tx.update(aiTasks).set({status:'succeeded',completedAt:stamp,errorMessage:null,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,business.id));
   await tx.update(executionTasks).set({status:'succeeded',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,task.id));
   signal?.throwIfAborted();return {resultId,aiTaskId:business.id};
  });
 }};
}
