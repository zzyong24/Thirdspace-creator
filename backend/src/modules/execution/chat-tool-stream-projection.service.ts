import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { eq,asc,desc,executionCalls,executionStreamEvents,type Db } from "@creatoros/backend";
import { chatToolProviderName,chatWorkerInputSchema,checkpointToolCallSchema,workerToolResultReceiptSchema,executionStreamChunkSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { applyChatToolOutcome } from "../ai/chat-receipt-projection";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createAgenticToolBinding,type AgenticBackendTool } from "./agentic-tool-binding";
import { ConflictError } from "./execution.errors";
/** 后端从已确认事实补卡；不暴露任意chunks写入权给Worker。 */
export function createChatToolStreamProjection(db:Db,deps:{now?:()=>string;tools:Record<string,AgenticBackendTool>}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now}),binding=createAgenticToolBinding(deps.tools);
 return async(ref:ExecutionRef,callId:string)=>leases.withLease(ref,"settlement",async({tx,task})=>{
  const frozen=chatWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const call=calls.find(row=>row.id===callId);if(!call || call.status!=="settled")throw new ConflictError("工具卡缺少已确认调用");
  const bound=binding.forCall(task,calls,call),model=calls.find(row=>row.id===bound.modelCallId)!;
  const proposed=checkpointToolCallSchema.parse((model.providerResult as {content:unknown[]}).content.find(raw=>raw && typeof raw==="object" && "toolCallId" in raw && raw.toolCallId===bound.toolCallId));
  const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText!));
  if(receipt.toolCallId!==bound.toolCallId || receipt.toolName!==bound.toolName)throw new ConflictError("工具卡回执绑定不符");
  let input:z.infer<ReturnType<typeof z.json>>,invalid=false;
  try{input=z.json().parse(JSON.parse(proposed.input));}catch{input=proposed.input;invalid=true;}
  const part:Record<string,z.infer<ReturnType<typeof z.json>>>={type:`tool-${bound.toolName}`,toolCallId:bound.toolCallId,input,state:"input-available"};
  if(proposed.providerMetadata)part.callProviderMetadata=z.json().parse(proposed.providerMetadata);
  applyChatToolOutcome(part,call.id,receipt.output,invalid);
  const metadata=part.callProviderMetadata?{providerMetadata:part.callProviderMetadata}:{};
  const chunks=z.array(executionStreamChunkSchema).parse(part.state==="output-error"
   ? [{type:"tool-input-error",toolCallId:bound.toolCallId,toolName:bound.toolName,input:part.rawInput,errorText:part.errorText,...metadata}]
   : (part.state==="output-denied"?[
    {type:"tool-approval-request",toolCallId:bound.toolCallId,approvalId:`receipt:${call.id}`},
    {type:"tool-approval-response",approvalId:`receipt:${call.id}`,approved:false,reason:(part.approval as {reason:string}).reason},
    {type:"tool-output-denied",toolCallId:bound.toolCallId}]:[{type:"tool-output-available",toolCallId:bound.toolCallId,output:part.output}]));
  // SEMANTIC_BOUNDARY_ALLOW: 按模型原始声明顺序建立卡片，不按工具完成速度改变显示顺序。
  const initial=(model.providerResult as {content:unknown[]}).content.flatMap(raw=>{
    const parsed=checkpointToolCallSchema.safeParse(raw);if(!parsed.success)return [];
    const tool=parsed.data;
    if(!frozen.tools.some(item=>chatToolProviderName(item.name)===tool.toolName))throw new ConflictError("工具卡超出冻结范围");
    const metadata=tool.providerMetadata?{providerMetadata:z.json().parse(tool.providerMetadata)}:{};
    try{return [{type:"tool-input-available",toolCallId:tool.toolCallId,toolName:tool.toolName,input:z.json().parse(JSON.parse(tool.input)),...metadata}];}
    catch{return [{type:"tool-input-start",toolCallId:tool.toolCallId,toolName:tool.toolName,...metadata}];}
  }).map(chunk=>executionStreamChunkSchema.parse(chunk));
  const modelEvents=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,model.id)).orderBy(asc(executionStreamEvents.callIndex));
  const savedInputs=modelEvents.filter(event=>["tool-input-start","tool-input-available"].includes(String(event.chunk.type)));
  if(savedInputs.length){if(savedInputs.length!==initial.length || savedInputs.some((event,i)=>!isDeepStrictEqual(event.chunk,initial[i])))throw new ConflictError("工具输入卡与模型回执不符");}
  else {
    const [tail]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(desc(executionStreamEvents.sequence)).limit(1);
    const index=(modelEvents.at(-1)?.callIndex??-1)+1,sequence=tail?.sequence??0;
    await tx.insert(executionStreamEvents).values(initial.map((chunk,i)=>({executionTaskId:task.id,sequence:sequence+i+1,callId:model.id,callIndex:index+i,chunk,createdAt:now()})));
  }
  const existing=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.callId,call.id)).orderBy(asc(executionStreamEvents.callIndex));
  if(existing.length){if(existing.length!==chunks.length || existing.some((row,i)=>row.callIndex!==i || !isDeepStrictEqual(row.chunk,chunks[i])))throw new ConflictError("已保存工具卡与回执不符");return;}
  const [last]=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(desc(executionStreamEvents.sequence)).limit(1);
  const sequence=last?.sequence??0,stamp=now();
  await tx.insert(executionStreamEvents).values(chunks.map((chunk,i)=>({executionTaskId:task.id,sequence:sequence+i+1,callId:call.id,callIndex:i,chunk,createdAt:stamp})));
 });
}
