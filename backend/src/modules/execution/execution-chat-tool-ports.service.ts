import { createChatToolStreamProjection } from "./chat-tool-stream-projection.service";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { and, asc, eq, aiTasks, executionCalls, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { agenticToolOutcomeSchema, workerToolResultReceiptSchema, chatWorkerInputSchema, chatToolApprovalReceiptSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { chatInputDigest } from "../ai/chat-turn-submission.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createAgenticToolBinding, type AgenticBackendTool } from "./agentic-tool-binding";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { ConflictError } from "./execution.errors";
type Approval=z.infer<typeof chatToolApprovalReceiptSchema>;
export type ChatBackendTool=AgenticBackendTool & {
  approve(context:RequestContext,input:z.infer<ReturnType<typeof z.json>>,scope:{execution:ExecutionRef;modelCallId:string;toolCallId:string;signal?:AbortSignal}):Promise<Approval>;
};
const object=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
/** 宿主独立核对冻结工具和当前权限；不依赖 Worker 先问过授权，也不接收 Worker 自报参数。 */
export function createExecutionChatToolPorts(db:Db,deps:{now?:()=>string;budget:{maxCalls:number;maxTokens:number;deadlineMs:number};tools:Record<string,ChatBackendTool>}){
 const leases=createExecutionLeaseService(db,deps),binding=createAgenticToolBinding(deps.tools);
 async function validateTask(ref:ExecutionRef){
  return leases.withLease(ref,"admission",async({tx,task,context})=>{
   const input=chatWorkerInputSchema.parse(object(task.payload).modelInput);
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
   if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || !business || !["queued","running"].includes(business.status) || business.taskType!=="copilot.assist" || object(task.payload).aiTaskId!==business.id || object(business.inputData).modelInputDigest!==chatInputDigest(input) || input.userId!==context.userId || input.accountId!==context.accountId)throw new ConflictError("聊天工具任务映射无效");
   for(const frozen of input.tools){const tool=deps.tools[frozen.name];if(!tool || tool.version!==frozen.version || tool.effect!==frozen.effect || typeof tool.approve!=="function" || typeof tool.execute!=="function")throw new ConflictError("聊天工具执行或授权端口尚未装配");}
   return input;
  });
 }
 async function scope(ref:ExecutionRef,request:{modelCallId:string;toolCallId:string}){
  await validateTask(ref);
  return leases.withLease(ref,"admission",async({tx,task,context})=>{
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   const bound=binding.bind(task,calls,request);
   // 回放已确认工具允许读取原授权结果；未执行工具只能来自当前模型回合。
   const previous=calls.find(call=>call.operationKey===bound.operationKey);
   if(previous?.status!=="settled" && calls.filter(call=>call.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合不能取得新授权");
   return {bound,context,previous};
  });
 }
 const approvalChecks=new Map<string,Promise<Approval>>();
 async function check(ref:ExecutionRef,raw:unknown,signal?:AbortSignal):Promise<Approval>{
  signal?.throwIfAborted();const request=workerPortInputSchemas.checkChatToolApproval.parse(raw);
  // 同一租约内按请求顺序读取真实权限，避免较晚返回的旧检查覆盖新决定。
  // 仅排队授权检查；等待外部授权服务时不持有数据库事务。
  const key=JSON.stringify([ref.executionTaskId,ref.attempt,ref.fenceToken,request.modelCallId,request.toolCallId]);
  const previous=approvalChecks.get(key);
  const work=(previous?previous.catch(()=>undefined):Promise.resolve()).then(()=>checkOnce(ref,request,signal));
  approvalChecks.set(key,work);
  const cleanup=()=>{if(approvalChecks.get(key)===work)approvalChecks.delete(key);};
  void work.then(cleanup,cleanup);
  return work;
 }
 async function checkOnce(ref:ExecutionRef,raw:unknown,signal?:AbortSignal):Promise<Approval>{
  signal?.throwIfAborted();const request=workerPortInputSchemas.checkChatToolApproval.parse(raw);
  const before=await scope(ref,request);
  if(before.previous?.status==="settled"){
    const output=agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(before.previous.resultText!)).output);
    return output.status==="blocked" && output.sideEffect==="none" && output.error?.code==="permission" && object(output.data).denied===true
      ? {status:"denied",reason:output.summary} : {status:"not-applicable"};
  }
  if(before.bound.validationOutcome)return {status:"not-applicable"};
  let decision:Approval;
  try{decision=chatToolApprovalReceiptSchema.parse(await deps.tools[before.bound.executionToolName]!.approve(before.context,before.bound.input,{execution:ref,...request,signal}));}
  catch{decision={status:"unavailable"};}
  signal?.throwIfAborted();const after=await scope(ref,request);
  if(before.bound.inputDigest!==after.bound.inputDigest)throw new ConflictError("授权期间工具绑定已改变");
  await project.recordApproval(ref,request,decision);
  return decision;
 }
 const guardedTools=Object.fromEntries(Object.entries(deps.tools).map(([name,tool])=>[name,{...tool,execute:async(context,input,executionScope)=>{
  const bound=await leases.withLease(executionScope.execution,"admission",async({tx,task})=>{
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   const current=calls.find(call=>call.id===executionScope.callId);if(!current)throw new ConflictError("聊天调用不存在");return binding.forCall(task,calls,current);
  });
  const decision=await check(executionScope.execution,{modelCallId:bound.modelCallId,toolCallId:bound.toolCallId},executionScope.signal);
  if(decision.status!=="not-applicable")return agenticToolOutcomeSchema.parse({status:"blocked",summary:decision.status==="denied"?"本次操作已被拒绝":"本次操作需要恢复授权",evidence:[],data:decision.status==="denied"?{denied:true}:{recoveryState:"chat_authorization_required"},error:{code:"permission",retryable:false,recovery:"恢复工具权限后继续原任务"},continuation:null,sideEffect:"none"});
  executionScope.signal.throwIfAborted();return tool.execute!(context,input,executionScope);
 }} satisfies AgenticBackendTool]));
 const project=createChatToolStreamProjection(db,deps);
 const tools=createExecutionAgenticToolPorts(db,{...deps,tools:guardedTools});
 async function settle(ref:ExecutionRef,raw:unknown){
  const request=workerPortInputSchemas.settleAgenticTool.parse(raw);
  const state=await leases.withLease(ref,"settlement",async({tx,task})=>{
    const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
    const call=calls.find(item=>item.id===request.callId);if(!call)throw new ConflictError("聊天调用不存在");
    return {call,bound:binding.forCall(task,calls,call)};
  });
  if(request.status!=="settled" || state.call.status==="settled" || state.bound.validationOutcome)return tools.settle(ref,request);
  const denial=agenticToolOutcomeSchema.parse({status:"blocked",summary:"用户未允许本次操作",evidence:[],data:{denied:true},error:{code:"permission",retryable:false,recovery:"用户已拒绝，本次不执行。"},continuation:null,sideEffect:"none"});
  if(!isDeepStrictEqual(request.output,denial))throw new ConflictError("聊天工具结果必须由宿主实际执行确认");
  const decision=await check(ref,{modelCallId:state.bound.modelCallId,toolCallId:state.bound.toolCallId});
  if(decision.status!=="denied")throw new ConflictError("宿主未确认用户拒绝");
  return tools.settle(ref,request);
 }
 return {...tools,validateTask,check,
  async reserve(ref:ExecutionRef,raw:unknown){const result=await tools.reserve(ref,raw);if(result.status==="settled")await project(ref,result.callId);return result;},
  async execute(...args:Parameters<typeof tools.execute>){const result=await tools.execute(...args);await project(args[0],workerPortInputSchemas.executeAgenticTool.parse(args[1]).callId);return result;},
  async settle(ref:ExecutionRef,raw:unknown){const result=await settle(ref,raw);if(result.status==="settled")await project(ref,result.callId);return result;},
 };
}
