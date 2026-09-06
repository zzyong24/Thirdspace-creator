import {z} from "zod";
import {and,asc,eq,isNull,sql,aiTasks,executionTasks,executionCalls,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {agenticToolOutcomeSchema,chatWorkerInputSchema,workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {classifyLlmError,computeBackoffMs,getRetryAfterMs} from "@creatoros/ai-worker/retry-policy";
import {createAgenticToolBinding} from "./agentic-tool-binding";
const originSchema=z.object({executionTaskId:z.string(),callId:z.string(),inputDigest:z.string()}).strict();
const recoverySchema=z.object({attempts:z.number().int().min(0).max(3),nextAt:z.string().datetime(),deadlineAt:z.string().datetime(),errorCode:z.string().nullable()}).strict();
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
/** 已提交子任务的准备补偿；只复用原任务，不创建模型调用或新任务。 */
export function createSubmittedTaskPreparationService(db:Db,deps:{
 deadlineMs:number;now?:()=>number;random?:()=>number;
 prepare(context:RequestContext,taskId:string,signal:AbortSignal):Promise<unknown>;
 fail(context:RequestContext,taskId:string,message:string):Promise<unknown>;
}){
 if(!Number.isSafeInteger(deps.deadlineMs)||deps.deadlineMs<1)throw new Error("准备期限无效");
 const now=deps.now??Date.now,controller=new AbortController(),active=new Map<string,Promise<void>>();
 // 轮询游标只用于公平扫描；重启丢失游标不改变持久重试次数、截止时间或原任务 ID。
 let cursor:string|undefined;
 const pending=()=>and(eq(aiTasks.taskType,"planning.thesis"),eq(aiTasks.status,"queued"),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner),sql`${aiTasks.runtimeData}->'hostTaskSubmission' IS NOT NULL`);
 async function claimed(context:RequestContext,taskId:string,signal:AbortSignal){
  return db.transaction(async tx=>{
   signal.throwIfAborted();
   const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId??""))).for("update");
   if(!task || task.taskType!=="planning.thesis")throw new Error("提交任务不存在或归属不符");
   if(task.executionTaskId || task.status!=="queued" || task.leaseOwner || task.leaseToken || task.modelCallStartedAt)return null;
   const runtime=object(task.runtimeData),origin=originSchema.parse(runtime.hostTaskSubmission);
   const [parent]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,origin.executionTaskId),eq(executionTasks.userId,task.userId),eq(executionTasks.accountId,task.accountId)));
   const [business]=parent?await tx.select().from(aiTasks).where(and(eq(aiTasks.id,parent.ownerId),eq(aiTasks.executionTaskId,parent.id),eq(aiTasks.userId,task.userId),eq(aiTasks.accountId,task.accountId))):[];
   if(!parent || parent.kind!=="ai_task" || parent.ownerType!=="ai_task" || business?.taskType!=="copilot.assist")throw new Error("子任务缺少真实聊天提交来源");
   const input=chatWorkerInputSchema.parse(object(parent.payload).modelInput);
   const definition=input.tools.find(tool=>tool.name==="planning.thesis" && tool.execution==="host.task-submit" && tool.effect==="committed");
   if(!definition || input.userId!==task.userId || input.accountId!==task.accountId)throw new Error("父任务未声明原子论点提交");
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,parent.id)).orderBy(asc(executionCalls.sequence));
   const call=calls.find(row=>row.id===origin.callId);
   if(!call || call.kind!=="tool" || call.parentCallId || call.status!=="settled" || call.inputDigest!==origin.inputDigest || task.attemptId!==`chat-submit:${call.id}`)throw new Error("提交来源与原调用不符");
   const binding=createAgenticToolBinding({[definition.name]:{version:definition.version,effect:definition.effect,execution:definition.execution,parameters:z.fromJSONSchema(definition.parameters as Parameters<typeof z.fromJSONSchema>[0])}}).forCall(parent,calls,call);
   const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??"")),result=agenticToolOutcomeSchema.parse(receipt.output),data=object(result.data);
   if(binding.validationOutcome || binding.executionToolName!==definition.name || receipt.toolCallId!==binding.toolCallId || receipt.toolName!==binding.toolName || result.status!=="ok" || result.sideEffect!=="committed" || result.error || data.kind!==definition.name || data.taskId!==task.id)throw new Error("子任务没有真实成功回执");
   const stamp=now(),deadlineAt=new Date(Date.parse(task.requestedAt)+deps.deadlineMs).toISOString();
   const previous=runtime.hostTaskPreparation===undefined?{attempts:0,nextAt:new Date(0).toISOString(),deadlineAt,errorCode:null}:recoverySchema.parse(runtime.hostTaskPreparation);
   if(previous.deadlineAt!==deadlineAt)throw new Error("准备期限与原任务不符");
   if(stamp>=Date.parse(deadlineAt))return {failed:"任务准备已超过原定期限，请重新发起"};
   if(previous.attempts>=3)return {failed:"任务准备连续失败，请检查服务后重新发起"};
   if(stamp<Date.parse(previous.nextAt))return null;
   const next={...previous,attempts:previous.attempts+1,nextAt:new Date(stamp+computeBackoffMs(previous.attempts+1,deps.random)).toISOString(),errorCode:null};
   signal.throwIfAborted();
   await tx.update(aiTasks).set({runtimeData:{...runtime,hostTaskPreparation:next}}).where(eq(aiTasks.id,task.id));
   return {attempt:next.attempts,deadlineAt};
  });
 }
 async function run(context:RequestContext,taskId:string,signal:AbortSignal){
  signal.throwIfAborted();const claim=await claimed(context,taskId,signal);signal.throwIfAborted();if(!claim)return;
  if("failed" in claim){await deps.fail(context,taskId,claim.failed!);return;}
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Date.parse(claim.deadlineAt)-now()))]);
  try{await deps.prepare(context,taskId,bounded);bounded.throwIfAborted();}
  catch(error){
   if(signal.aborted)throw error;
   const classified=bounded.aborted?{retryable:false,reason:"deadline"}:classifyLlmError(error),stamp=now(),retryAt=stamp+(getRetryAfterMs(error,now)??computeBackoffMs(claim.attempt,deps.random));
   await db.transaction(async tx=>{
    const [task]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
    if(!task || task.executionTaskId || task.status!=="queued")return;
    const runtime=object(task.runtimeData),current=recoverySchema.parse(runtime.hostTaskPreparation);
    if(current.attempts!==claim.attempt)return;
    await tx.update(aiTasks).set({runtimeData:{...runtime,hostTaskPreparation:{...current,nextAt:new Date(Math.min(retryAt,Date.parse(claim.deadlineAt))).toISOString(),errorCode:classified.reason}}}).where(eq(aiTasks.id,task.id));
   });
   signal.throwIfAborted();
   if(!classified.retryable || claim.attempt>=3 || stamp>=Date.parse(claim.deadlineAt))await deps.fail(context,taskId,"任务准备未完成，请检查项目与服务后重新发起");
  }
 }
 function prepare(context:RequestContext,taskId:string,signal?:AbortSignal):Promise<void>{
  const key=JSON.stringify([context.userId,context.accountId,taskId]);
  const current=active.get(key);if(current)return current;
  const combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  const work=run(structuredClone(context),taskId,combined);active.set(key,work);
  const clear=()=>{if(active.get(key)===work)active.delete(key);};void work.then(clear,clear);return work;
 }
 return {prepare,
  async recover(signal:AbortSignal){
   const combined=AbortSignal.any([controller.signal,signal]);combined.throwIfAborted();
   const rows=await db.select({id:aiTasks.id,userId:aiTasks.userId,accountId:aiTasks.accountId}).from(aiTasks).where(and(pending(),...(cursor?[sql`${aiTasks.id} > ${cursor}`]:[]))).orderBy(asc(aiTasks.id)).limit(20);
   if(!rows.length){cursor=undefined;return;}
   for(const row of rows){combined.throwIfAborted();cursor=row.id;try{await prepare({userId:row.userId,accountId:row.accountId,requestId:`submitted-prepare:${row.id}`,source:"ai"},row.id,combined);}catch{if(combined.aborted)throw combined.reason;console.error("[submitted-task] PREPARATION_RECOVERY_REJECTED");}}
  },
  async stop(){controller.abort();await Promise.allSettled([...active.values()]);},
 };
}
