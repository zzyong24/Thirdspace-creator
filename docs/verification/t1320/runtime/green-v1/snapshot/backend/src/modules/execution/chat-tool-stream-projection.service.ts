import {chatToolOutputChunks,externalToolCard,ensureExternalToolCard,chatToolDiagnostic} from './chat-tool-stream-chunks';
import {aiTasks,aiConversations,and} from '@creatoros/backend';
import {workspaceFilter} from '../../workspace-scope';
import {chatInputDigest} from '../ai/chat-turn-submission.service';
import {requireExternalChatCallTree} from '../ai/external-chat-call-tree';
import {originalCodexReadBinding} from './codex-read-recovery';
import {recoverableCodexProposalParents,recoverableCodexSettledProposalParents} from './chat-generation-recovery';
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { eq,asc,desc,executionCalls,executionStreamEvents,type Db } from "@creatoros/backend";
import { agenticToolOutcomeSchema,chatToolProviderName,chatWorkerInputSchema,checkpointToolCallSchema,workerToolResultReceiptSchema,executionStreamChunkSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { applyChatToolOutcome,readChatApprovalFacts } from "../ai/chat-receipt-projection";
import { createExecutionLeaseService } from "./execution-lease.service";
import { agenticModelToolParts,agenticToolOperationKey,createAgenticToolBinding,type AgenticBackendTool } from "./agentic-tool-binding";
import { ConflictError } from "./execution.errors";
/** 后端从已确认事实补卡；不暴露任意chunks写入权给Worker。 */
export function createChatToolStreamProjection(db:Db,deps:{now?:()=>string;tools:Record<string,AgenticBackendTool>}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now}),binding=createAgenticToolBinding(deps.tools);
 const project=async(ref:ExecutionRef,callId:string)=>leases.withLease(ref,"settlement",async({tx,task})=>{
  const frozen=chatWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const call=calls.find(row=>row.id===callId);if(!call || call.status!=="settled")throw new ConflictError("工具卡缺少已确认调用");
  const readonlyRecovery=confirmedCodexProjectionCalls(task,calls,binding).includes(call.id);
  const bound=binding.forCall(task,calls,call,readonlyRecovery?{readonlyRecovery:true}:undefined),model=calls.find(row=>row.id===bound.modelCallId)!;
  const proposed=checkpointToolCallSchema.parse(agenticModelToolParts(task,model,readonlyRecovery?{readonlyRecovery:true}:undefined).find(raw=>raw && typeof raw==="object" && "toolCallId" in raw && raw.toolCallId===bound.toolCallId));
  const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText!));
  if(receipt.toolCallId!==bound.toolCallId || receipt.toolName!==bound.toolName)throw new ConflictError("工具卡回执绑定不符");
  let input:z.infer<ReturnType<typeof z.json>>,invalid=false;
  try{input=z.json().parse(JSON.parse(proposed.input));}catch{input=proposed.input;invalid=true;}
  const part:Record<string,z.infer<ReturnType<typeof z.json>>>={type:`tool-${bound.toolName}`,toolCallId:bound.toolCallId,input,state:"input-available"};
  if(proposed.providerMetadata)part.callProviderMetadata=z.json().parse(proposed.providerMetadata);
  const history=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
  let approval=readChatApprovalFacts(history.map(event=>event.chunk)).get(bound.toolCallId);
  const outcome=agenticToolOutcomeSchema.parse(receipt.output);
  if(approval?.id===`chat-approval:${model.id}:${bound.toolCallId}` && outcome.sideEffect==="none" && outcome.error?.code==="permission")approval={id:approval.id,approved:false,reason:outcome.summary};
  applyChatToolOutcome(part,call.id,receipt.output,invalid,approval,frozen.toolOutcomeProjectionVersion);
  const chunks=chatToolOutputChunks(part,bound.toolCallId,bound.toolName,call.id);
  await ensureInputs(tx,task,model,now,Boolean(readonlyRecovery),binding);
  const allCallEvents=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,call.id)).orderBy(asc(executionStreamEvents.callIndex));
  const progress=allCallEvents.filter(row=>row.chunk.type==="data-workbench-progress");
  const existing=allCallEvents.filter(row=>row.chunk.type!=="data-workbench-progress");
  if(existing.length){if(existing.length!==chunks.length || existing.some((row,i)=>row.callIndex!==progress.length+i || !isDeepStrictEqual(row.chunk,chunks[i])))throw new ConflictError("已保存工具卡与回执不符");return;}
  if(allCallEvents.length!==progress.length || progress.some((row,i)=>row.callIndex!==i))throw new ConflictError("工具进度事件顺序不符");
  if(history.some(event=>event.chunk.type==="finish"))throw new ConflictError("聊天结束后不能追加新工具卡");
  const [last]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(desc(executionStreamEvents.sequence)).limit(1);
  const sequence=last?.sequence??0,stamp=now();
  await tx.insert(executionStreamEvents).values(chunks.map((chunk,i)=>({executionTaskId:task.id,sequence:sequence+i+1,callId:call.id,callIndex:progress.length+i,chunk,createdAt:stamp})));
 });
 return Object.assign(project,{recordApproval:async(ref:ExecutionRef,request:{modelCallId:string;toolCallId:string},decision:{status:string;reason?:string})=>{
  if(decision.status==="unavailable")return;
  await leases.withLease(ref,"admission",async({tx,task})=>{
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   const original=calls.find(call=>call.operationKey===agenticToolOperationKey(request.modelCallId,request.toolCallId));
   const readonlyRecovery=original&&[...recoverableCodexProposalParents(task,calls),...recoverableCodexSettledProposalParents(task,calls)].includes(original.id);
   const bound=binding.bind(task,calls,request,readonlyRecovery?{readonlyRecovery:true}:undefined);
   if(calls.some(call=>call.operationKey===bound.operationKey && call.status==="settled"))return;
   const model=calls.find(call=>call.id===bound.modelCallId)!;
   const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,model.id)).orderBy(asc(executionStreamEvents.callIndex));
   const id=`chat-approval:${model.id}:${bound.toolCallId}`;
   const previous=events.filter(event=>event.chunk.approvalId===id).at(-1)?.chunk;
   if(!previous && decision.status!=="user-approval")return;
   const chunk=executionStreamChunkSchema.parse(decision.status==="user-approval"
    ? {type:"tool-approval-request",toolCallId:bound.toolCallId,approvalId:id}
    : {type:"tool-approval-response",approvalId:id,approved:decision.status==="not-applicable",...(decision.reason?{reason:decision.reason}:{})});
   if(previous && isDeepStrictEqual(previous,chunk))return;
   await ensureInputs(tx,task,model,now,Boolean(readonlyRecovery),binding);
   const [tail]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(desc(executionStreamEvents.sequence)).limit(1);
   const [callTail]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,model.id)).orderBy(desc(executionStreamEvents.callIndex)).limit(1);
   await tx.insert(executionStreamEvents).values({executionTaskId:task.id,sequence:(tail?.sequence??0)+1,callId:model.id,callIndex:(callTail?.callIndex??-1)+1,chunk,createdAt:now()});
  });
 }});

}

type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
async function ensureInputs(tx:Transaction,task:typeof import("@creatoros/backend").executionTasks.$inferSelect,model:typeof executionCalls.$inferSelect,now:()=>string,readonlyRecovery=false,binding?:ReturnType<typeof createAgenticToolBinding>){
 const frozen=chatWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
  // SEMANTIC_BOUNDARY_ALLOW: 按模型原始声明顺序建立卡片，不按工具完成速度改变显示顺序。
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const native=model.kind==='external_agent';
  const permitted=new Set([...recoverableCodexProposalParents(task,calls),...(binding?confirmedCodexProjectionCalls(task,calls,binding):recoverableCodexSettledProposalParents(task,calls))]);
  const parts=agenticModelToolParts(task,model,readonlyRecovery?{readonlyRecovery:true}:undefined).filter(raw=>!native||calls.some(call=>call.kind==='tool'&&(!readonlyRecovery||permitted.has(call.id))&&call.operationKey===agenticToolOperationKey(model.id,checkpointToolCallSchema.parse(raw).toolCallId)));
  if(native)parts.sort((a,b)=>{const sequence=(raw:unknown)=>calls.find(call=>call.operationKey===agenticToolOperationKey(model.id,checkpointToolCallSchema.parse(raw).toolCallId))!.sequence;return sequence(a)-sequence(b);});
  const initial=parts.flatMap(raw=>{
    const parsed=checkpointToolCallSchema.safeParse(raw);if(!parsed.success)return [];
    const tool=parsed.data;
    if(!frozen.tools.some(item=>chatToolProviderName(item.name)===tool.toolName))throw new ConflictError("工具卡超出冻结范围");
    const metadata=tool.providerMetadata?{providerMetadata:z.json().parse(tool.providerMetadata)}:{};
    try{return [{type:"tool-input-available",toolCallId:tool.toolCallId,toolName:tool.toolName,input:z.json().parse(JSON.parse(tool.input)),...metadata}];}
    catch{return [{type:"tool-input-start",toolCallId:tool.toolCallId,toolName:tool.toolName,...metadata}];}
  }).map(chunk=>executionStreamChunkSchema.parse(chunk));
  const taskEvents=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
  const modelEvents=taskEvents.filter(event=>event.callId===model.id).sort((a,b)=>a.callIndex-b.callIndex);
  const savedInputs=modelEvents.filter(event=>["tool-input-start","tool-input-available"].includes(String(event.chunk.type)));
  let savedOrdinaryCount=savedInputs.length;
  if(native){
   // SEMANTIC_BOUNDARY_ALLOW: 按原账本归属核对两类输入，不选择工具或改变已有事件顺序。
   requireExternalChatCallTree(task,calls,model.id);
   if(taskEvents.some(event=>["tool-input-start","tool-input-available"].includes(String(event.chunk.type))&&event.callId!==model.id))throw new ConflictError("工具输入卡不属于原回合");
   const seen=new Set<string>();savedOrdinaryCount=0;
   const finished=modelEvents.some(event=>event.chunk.type==='finish');
   for(const event of savedInputs){
    const id=event.chunk.toolCallId;
    if(typeof id!=='string'||seen.has(id))throw new ConflictError("工具输入卡与模型回执不符");
    seen.add(id);
    const ordinary=initial.filter(chunk=>chunk.toolCallId===id);
    const external=calls.filter(call=>call.kind==='external_tool'&&call.parentCallId===model.id&&(call.providerResult as {toolCallId?:unknown}|null)?.toolCallId===id);
    if(ordinary.length){
     if(ordinary.length!==1||external.length||!isDeepStrictEqual(event.chunk,initial[savedOrdinaryCount]))throw new ConflictError("工具输入卡与模型回执不符");
     savedOrdinaryCount++;
    }else{
     if(external.length!==1)throw new ConflictError("工具输入卡缺少真实调用来源");
     const card=externalToolCard(task,calls,external[0]!);
     if(card.parent.id!==model.id||(!finished&&card.definition.effect==='proposal')||!isDeepStrictEqual(event.chunk,card.input))throw new ConflictError("外部工具输入卡与原回执不符");
    }
   }
  }else if(savedInputs.length && (savedInputs.length!==initial.length || savedInputs.some((event,i)=>!isDeepStrictEqual(event.chunk,initial[i]))))throw new ConflictError("工具输入卡与模型回执不符");
  // SEMANTIC_BOUNDARY_ALLOW: 原生工具来源随真实call增长，只按Host账本次序追加未保存的输入前缀。
  const remaining=initial.slice(savedOrdinaryCount);
  if(remaining.length){
    const [tail]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(desc(executionStreamEvents.sequence)).limit(1);
    if(tail?.chunk.type==='finish')throw new ConflictError('聊天结束后不能追加工具输入');
    const index=(modelEvents.at(-1)?.callIndex??-1)+1,sequence=tail?.sequence??0;
    await tx.insert(executionStreamEvents).values(remaining.map((chunk,i)=>({executionTaskId:task.id,sequence:sequence+i+1,callId:model.id,callIndex:index+i,chunk,createdAt:now()})));
  }
}

/** 仅投影已结算原工具事实；普通未知工具仍没有执行或恢复许可。 */
function confirmedCodexProjectionCalls(task:Parameters<typeof originalCodexReadBinding>[0],calls:Parameters<ReturnType<typeof createAgenticToolBinding>['forCall']>[1],binding:ReturnType<typeof createAgenticToolBinding>){
 const originalRoots=calls.filter(call=>originalCodexReadBinding(task,call)&&call.kind==='external_agent');
 if(originalRoots.length!==1)return [];
 return calls.filter(call=>{
  if(call.kind!=='tool'||call.parentCallId||call.status!=='settled'||call.totalTokens!==0||!call.resultText)return false;
  try{
   const bound=binding.forCall(task,calls,call,{readonlyRecovery:true}),receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText));
   return bound.modelCallId===originalRoots[0]!.id&&receipt.toolCallId===bound.toolCallId&&receipt.toolName===bound.toolName&&agenticToolOutcomeSchema.safeParse(receipt.output).success;
  }catch{return false;}
 }).map(call=>call.id);
}

/** 外部只读调用仍使用原账本/租约，不能接收Worker自报chunk。 */
export async function projectExternalChatTool(db:Db,ref:ExecutionRef,callId:string,now=()=>new Date().toISOString()){
 const result=await createExecutionLeaseService(db,{now}).withLease(ref,'settlement',async({tx,task,context})=>{
  const frozen=chatWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
  if(frozen.externalToolProjectionVersion!==1)return null;
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
  const [conversation]=await tx.select().from(aiConversations).where(and(eq(aiConversations.id,frozen.conversationId),eq(aiConversations.userId,context.userId),workspaceFilter(aiConversations,context)));
  if(task.kind!=='ai_task'||task.ownerType!=='ai_task'||!['running','cancel_requested','cancelled','pause_requested','paused'].includes(task.status)||!business||business.taskType!=='copilot.assist'||!conversation||conversation.projectId!==business.projectId||(business.inputData as Record<string,unknown>).modelInputDigest!==chatInputDigest(frozen)||frozen.userId!==context.userId||(frozen.accountId??null)!==(context.accountId??null)||(frozen.groupId??null)!==(context.groupId??null))throw new ConflictError('外部投影原任务或会话归属不符');
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence)),call=calls.find(row=>row.id===callId);
  if(!call)throw new ConflictError('外部投影调用不存在');
  const card=externalToolCard(task,calls,call);
  if(card.definition.effect!=='none')return null;
  const appended=await ensureExternalToolCard(tx,task,call,card,now);
  return {appended:appended.appended,inputSchemaBytes:Buffer.byteLength(JSON.stringify(card.definition.parameters))};
 });
 if(result?.appended)chatToolDiagnostic({executionTaskId:ref.executionTaskId,callId,attempt:ref.attempt,phase:'tool_projection_appended',observedAt:now(),inputSchemaBytes:result.inputSchemaBytes,projectionTiming:'before_finish',result:'ok'});
}
