import {createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import type {AiService} from "../ai/ai.service";
import type {PersistentTaskService} from "../execution";
import type {ProjectIntelligenceReferenceService} from "../intelligence/project-reference.service";
import type {ScriptSemanticSimilarityPort} from "../intelligence/project-script-candidate.service";
import type {StructuredBusinessAdapter} from "./structured-business-execution.service";
export const scriptSimilarityInputSchema=z.object({sourceTaskId:z.string().min(1),projectId:z.string().min(1),candidateText:z.string().min(1),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const checkpointSchema=z.object({referenceIds:z.array(z.string().min(1)).min(1),candidateText:z.string().min(1)});
interface SourcePorts {tasks:Pick<PersistentTaskService,"get">;references:Pick<ProjectIntelligenceReferenceService,"getSourceContexts">}
async function readSources(deps:SourcePorts,ctx:RequestContext,input:{sourceTaskId:string;projectId:string}){
 const task=await deps.tasks.get(ctx,input.sourceTaskId);
 if(task.kind!=="script_candidate"||task.status!=="succeeded"||task.ownerType!=="project"||task.ownerId!==input.projectId)throw new Error("相似度评估来源不属于已完成的项目候选");
 const checkpoint=checkpointSchema.parse(task.checkpoint);
 const sources=await deps.references.getSourceContexts(ctx,{projectId:input.projectId,referenceIds:checkpoint.referenceIds});
 const sourceDigest=createHash("sha256").update(JSON.stringify(sources.map(source=>[source.reference.id,source.transcript.hash,source.transcript.text]))).digest("hex");
 return {sourceDigest,referenceIds:checkpoint.referenceIds,texts:sources.map(source=>source.transcript.text)};
}
export function createScriptSimilarityBusinessAdapter(deps:SourcePorts):StructuredBusinessAdapter {
 return {skillId:"script.source_similarity",capability:"default",async prepare(ctx,task){
  const input=scriptSimilarityInputSchema.parse(task.inputData);
  if(task.projectId!==input.projectId)throw new Error("相似度评估项目不符");
  const source=await readSources(deps,ctx,input);
  if(source.sourceDigest!==input.sourceDigest)throw new Error("来源逐字稿已变化，请重新采纳");
  return {candidate:input.candidateText,sources:source.texts.map((text,index)=>`【来源 ${index+1}】\n${text}`).join("\n\n"),__scriptSimilarity:JSON.stringify({...input,referenceIds:source.referenceIds})};
 },project(){throw new Error("相似度仅通过评估完成事务返回，不生成稿件候选");}};
}
/** 真实独立任务等待；超时/未知只返回未完成，不重建任务或借用来源的旧租约。 */
export function createScriptSimilarityEvaluator(deps:SourcePorts&{ai:Pick<AiService,"createTask"|"getTask"|"listResults">;prepare(ctx:RequestContext,taskId:string):Promise<unknown>;wake():void|Promise<void>;waitMs?:number}):ScriptSemanticSimilarityPort{
 return {async evaluate(context,input){
  const ctx={...context};const candidateText=input.candidateText,sourceTaskId=input.sourceTaskId,projectId=input.projectId;
  const source=await readSources(deps,ctx,{sourceTaskId,projectId});
  const body={sourceTaskId,projectId,candidateText,sourceDigest:source.sourceDigest};
  const attemptId=`script-sim:${createHash("sha256").update(JSON.stringify([ctx.userId,ctx.accountId,body])).digest("hex")}`;
  const created=await deps.ai.createTask(ctx,{taskType:"script.source_similarity",attemptId,inputData:body});
  if(["queued","running"].includes(created.status)){await deps.prepare(ctx,created.id);await deps.wake();}
  const until=Date.now()+(deps.waitMs??120000);
  while(true){
   const task=await deps.ai.getTask(ctx,created.id);
   if(task.status==="succeeded"){
    const results=await deps.ai.listResults(ctx,task.id),result=results.find(result=>result.resultType==="script_similarity");
    return z.object({score:z.number().min(0).max(1)}).parse(result?.resultData).score;
   }
   if(!["queued","running"].includes(task.status)||(task.runtimeStatus&&!["queued","running","retry_wait"].includes(task.runtimeStatus))||Date.now()>=until)throw new Error(`相似度评估尚未完成（${task.id}：${task.status}），请稍后重试采纳`);
   await delay(250);
  }
 }};
}
