import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { and, asc, eq, aiConversations, aiTasks, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { agenticToolOutcomeSchema, chatWorkerInputSchema, externalChatStartSchema, externalTaskToolCallSchema, externalTaskToolListSchema, externalTaskToolResultSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError, ExecutionBudgetError } from "../execution/execution.errors";
import { chatInputDigest } from "./chat-turn-submission.service";

type Tools=Record<string,ChatBackendTool>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** 逐个审计的宿主短读取与纯候选；本机命令、发布、采纳、删除和 Worker 专用工具不开放给 ACP。 */
const safeNames=new Set([
 "history.read","tool.result.read","skill.read","creatoros.guide","context.projects","context.projects.search","context.comments",
 "context.knowledge","context.materials","context.project.detail","context.project.lifecycle","context.review.report",
 "context.positioning.detail","context.knowledge.detail","context.artifacts","context.artifact.text","context.knowledge.text",
 "context.publications","context.metrics","context.learnings","context.candidates","context.predictions","learning.capture","brief.fill","script.patch","video.edit",
]);

/** 每次执行都从任务快照、当前租约及真实业务归属重新绑定；进程只接收窄工具结果。 */
export function createExternalTaskToolService(db:Db,deps:{now?:()=>string}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 async function scope(ref:ExecutionRef,mode:"admission"|"settlement"){
  return leases.withLease(ref,mode,async({tx,task,context})=>{
   const frozen=chatWorkerInputSchema.parse(object(task.payload).modelInput);
   if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!["codex","codebuddy"].includes(frozen.executionEngine??"")||frozen.userId!==context.userId||frozen.accountId!==context.accountId)throw new ConflictError("外部工具任务身份无效");
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
   if(!business||business.taskType!=="copilot.assist"||object(task.payload).aiTaskId!==business.id||object(business.inputData).modelInputDigest!==chatInputDigest(frozen)||!["queued","running"].includes(business.status))throw new ConflictError("外部工具冻结任务映射无效");
   const [conversation]=await tx.select().from(aiConversations).where(and(eq(aiConversations.id,frozen.conversationId),eq(aiConversations.userId,context.userId),eq(aiConversations.accountId,context.accountId!))).for("update");
   if(!conversation||conversation.projectId!==business.projectId)throw new ConflictError("外部工具会话或项目归属已变化");
   return {frozen,context,business};
  });
 }
 function available(frozen:Awaited<ReturnType<typeof scope>>["frozen"],tools:Tools){
  return frozen.tools.filter(def=>{
   const tool=tools[def.name];
   return safeNames.has(def.name)&&(def.execution??"host")==="host"&&
     (def.effect==="none"||def.effect==="proposal")&&!!tool&&tool.version===def.version&&tool.effect===def.effect&&
     (tool.execution??"host")==="host"&&typeof tool.execute==="function"&&typeof tool.approve==="function";
  });
 }
 async function reserve(ref:ExecutionRef,request:z.infer<typeof workerPortInputSchemas.executeExternalTaskTool>,tools:Tools){
  return leases.withLease(ref,"admission",async({tx,task,context})=>{
   const frozen=chatWorkerInputSchema.parse(object(task.payload).modelInput);
   if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!["codex","codebuddy"].includes(frozen.executionEngine??"")||frozen.userId!==context.userId||frozen.accountId!==context.accountId)throw new ConflictError("外部工具任务身份无效");
   const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
   const [conversation]=await tx.select().from(aiConversations).where(and(eq(aiConversations.id,frozen.conversationId),eq(aiConversations.userId,context.userId),eq(aiConversations.accountId,context.accountId!))).for("update");
   if(!business||business.taskType!=="copilot.assist"||object(task.payload).aiTaskId!==business.id||object(business.inputData).modelInputDigest!==chatInputDigest(frozen)||!["queued","running"].includes(business.status)||!conversation||conversation.projectId!==business.projectId)throw new ConflictError("外部工具账号或项目归属无效");
   const def=available(frozen,tools).find(item=>item.name===request.toolName),tool=tools[request.toolName];
   if(!def||!tool)throw new ConflictError("外部工具未获当前任务授权");
   const parsed=tool.parameters.safeParse(request.input);
   if(!parsed.success)throw new ConflictError("外部工具参数不符合冻结定义");
   const input=z.json().parse(parsed.data),digest=`sha256:${chatInputDigest({turnCallId:request.turnCallId,toolCallId:request.toolCallId,toolName:def.name,version:def.version,input})}`;
   const rows=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   const turn=rows.find(row=>row.id===request.turnCallId);
   if(!turn||turn.kind!=="external_agent"||turn.status!=="started"||turn.parentCallId||turn.inputDigest!==chatInputDigest(frozen)||!externalChatStartSchema.safeParse(turn.providerResult).success)throw new ConflictError("外部工具缺少已启动的 Agent 回合");
   if(rows.some(row=>!["external_agent","external_tool"].includes(row.kind)))throw new ConflictError("外部工具任务混入其他执行账本");
   const operationKey=`external-tool:${createHash("sha256").update(JSON.stringify([request.turnCallId,request.toolCallId])).digest("hex")}`;
   const identity=externalTaskToolCallSchema.parse({schemaVersion:1,kind:"external_tool",turnCallId:turn.id,toolCallId:request.toolCallId,toolName:def.name,toolVersion:def.version});
   const existing=rows.find(row=>row.operationKey===operationKey);
   if(existing){if(existing.kind!=="external_tool"||existing.parentCallId!==turn.id||existing.inputDigest!==digest||!isDeepStrictEqual(existing.providerResult,identity))throw new ConflictError("外部工具调用 ID 已绑定不同参数");return {call:existing,input,replayed:true};}
   if(rows.some(row=>row.kind==="external_tool" && (row.status==="started" || row.status==="unknown")))throw new ConflictError("已有外部工具结果尚未对账，不能启动新调用");
   const budget=task.executionBudget;
   const maxCalls=budget&&typeof budget==="object"?object(budget).maxCalls:null;
   if((typeof maxCalls==="number"&&rows.length>=maxCalls)||rows.length>=1000)throw new ExecutionBudgetError("外部工具调用次数已达上限");
   const stamp=now(),[call]=await tx.insert(executionCalls).values({id:`call_${randomUUID()}`,executionTaskId:task.id,sequence:rows.length+1,operationKey,parentCallId:turn.id,kind:"external_tool",inputDigest:digest,status:"started",startedAttempt:ref.attempt,reservedTokens:0,accountingBasis:"requests",providerResult:identity,createdAt:stamp,updatedAt:stamp}).returning();
   if(!call)throw new ConflictError("外部工具预留失败");
   return {call,input,replayed:false};
  });
 }
 return {
  async list(ref:ExecutionRef,raw:unknown,tools:Tools){
   workerPortInputSchemas.listExternalTaskTools.parse(raw);
   const {frozen}=await scope(ref,"admission");
   return externalTaskToolListSchema.parse({tools:available(frozen,tools).map(def=>({name:def.name,version:def.version,description:def.description,inputSchema:def.parameters}))});
  },
  async execute(ref:ExecutionRef,raw:unknown,tools:Tools,signal:AbortSignal){
   const request=workerPortInputSchemas.executeExternalTaskTool.parse(raw);
   const {call,input,replayed}=await reserve(ref,request,tools);
   const base={turnCallId:request.turnCallId,toolCallId:request.toolCallId,callId:call.id};
   if(call.status==="settled")return externalTaskToolResultSchema.parse({...base,status:"settled",outcome:agenticToolOutcomeSchema.parse(JSON.parse(call.resultText??""))});
   if(replayed||call.startedAttempt!==ref.attempt||call.status!=="started"||call.resultText!==null)return externalTaskToolResultSchema.parse({...base,status:"unknown"});
   // 只有本轮刚创建的调用可执行；旧 started 表示可能已经到达业务端口，必须先对账。
   const tool=tools[request.toolName]!;
   const current=await scope(ref,"admission");
   if(!available(current.frozen,tools).some(def=>def.name===request.toolName))throw new ConflictError("外部工具授权已变化");
   const approval=await tool.approve(current.context,input,{execution:ref,modelCallId:request.turnCallId,toolCallId:request.toolCallId,signal});
   if(approval.status!=="not-applicable"){
    const blocked=agenticToolOutcomeSchema.parse({status:"blocked",summary:"此工具需要在 CreatorOS 内确认授权",evidence:[],data:{},error:{code:"permission",retryable:false,recovery:"请在 CreatorOS 内操作"},continuation:null,sideEffect:"none"});
    const [settled]=await leases.withLease(ref,"settlement",async({tx,task})=>tx.update(executionCalls).set({status:"settled",resultText:JSON.stringify(blocked),updatedAt:now()}).where(and(eq(executionCalls.id,call.id),eq(executionCalls.executionTaskId,task.id))).returning());
    if(!settled)throw new ConflictError("外部工具拒绝回执未保存");
    return externalTaskToolResultSchema.parse({...base,status:"settled",outcome:blocked});
   }
   // 入场后再核验一次租约；业务调用不在数据库事务中执行。
   await scope(ref,"admission");
   let outcome:z.infer<typeof agenticToolOutcomeSchema>;
   try{
    outcome=agenticToolOutcomeSchema.parse(await tool.execute!(current.context,input,{execution:ref,aiTaskId:current.business.id,callId:call.id,toolCallId:request.toolCallId,signal,executionSignal:signal}));
   }catch{
    await leases.withLease(ref,"settlement",async({tx,task})=>tx.update(executionCalls).set({status:"unknown",updatedAt:now()}).where(and(eq(executionCalls.id,call.id),eq(executionCalls.executionTaskId,task.id))));
    return externalTaskToolResultSchema.parse({...base,status:"unknown"});
   }
   if(outcome.sideEffect==="unknown"||outcome.sideEffect==="committed"||outcome.error?.code==="unknown_commit"){
    await leases.withLease(ref,"settlement",async({tx,task})=>tx.update(executionCalls).set({status:"unknown",updatedAt:now()}).where(and(eq(executionCalls.id,call.id),eq(executionCalls.executionTaskId,task.id))));
    return externalTaskToolResultSchema.parse({...base,status:"unknown"});
   }
   const [settled]=await leases.withLease(ref,"settlement",async({tx,task})=>tx.update(executionCalls).set({status:"settled",resultText:JSON.stringify(outcome),updatedAt:now()}).where(and(eq(executionCalls.id,call.id),eq(executionCalls.executionTaskId,task.id))).returning());
   if(!settled)throw new ConflictError("外部工具结果未结算");
   return externalTaskToolResultSchema.parse({...base,status:"settled",outcome});
  },
 };
}
