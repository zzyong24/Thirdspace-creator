import { isDeepStrictEqual } from "node:util";
import { executionStreamEvents, type executionCalls, type Db } from "@creatoros/backend";
import { workerToolResultReceiptSchema } from "@creatoros/contract/execution-worker";
import { ConflictError } from "../execution/execution.errors";
type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
type Event=typeof executionStreamEvents.$inferSelect;
/** 仅供已验证的旧完成回执补展示记录；不调用工具，不生成新的业务结果。调用方持有任务行锁。 */
export async function restoreHistoricalChatToolCards(tx:Transaction,taskId:string,calls:Array<typeof executionCalls.$inferSelect>,parts:Array<Record<string,unknown>>,events:Event[],now:()=>string){
 const append=async(callId:string,chunks:Array<Record<string,unknown>>)=>{
  if(!chunks.length)return;
  const sequence=events.at(-1)?.sequence??0,index=(events.filter(event=>event.callId===callId).at(-1)?.callIndex??-1)+1;
  const rows=chunks.map((chunk,i)=>({executionTaskId:taskId,sequence:sequence+i+1,callId,callIndex:index+i,chunk,createdAt:now()}));
  await tx.insert(executionStreamEvents).values(rows);events.push(...rows);
 };
 for(const part of parts.filter(part=>typeof part.toolCallId==="string")){
  const call=calls.find(call=>call.kind==="tool" && workerToolResultReceiptSchema.parse(JSON.parse(call.resultText!)).toolCallId===part.toolCallId);
  const model=calls.find(call=>call.kind==="model" && (call.providerResult as {content:Array<Record<string,unknown>>}).content.some(item=>item.type==="tool-call" && item.toolCallId===part.toolCallId));
  if(!call || !model)throw new ConflictError("历史工具卡缺少原调用");
  const toolName=String(part.type).slice(5),metadata=part.callProviderMetadata?{providerMetadata:part.callProviderMetadata}:{};
  const input=part.state==="output-error"?{type:"tool-input-start",toolCallId:part.toolCallId,toolName,...metadata}:{type:"tool-input-available",toolCallId:part.toolCallId,toolName,input:part.input,...metadata};
  const inputs=events.filter(event=>event.chunk.toolCallId===part.toolCallId && ["tool-input-start","tool-input-available"].includes(String(event.chunk.type)));
  if(inputs.length){if(inputs.length!==1 || !isDeepStrictEqual(inputs[0]!.chunk,input))throw new ConflictError("历史工具输入卡不一致");}
  else await append(model.id,[input]);
  const approval=part.approval as {id:string;approved:boolean;reason?:string}|undefined;
  const outputs=part.state==="output-error"?[{type:"tool-input-error",toolCallId:part.toolCallId,toolName,input:part.rawInput,errorText:part.errorText,...metadata}]
   :part.state==="output-denied"?[
    {type:"tool-approval-request",toolCallId:part.toolCallId,approvalId:approval!.id},
    {type:"tool-approval-response",approvalId:approval!.id,approved:false,reason:approval!.reason},
    {type:"tool-output-denied",toolCallId:part.toolCallId}]
   :[{type:"tool-output-available",toolCallId:part.toolCallId,output:part.output}];
  const saved=events.filter(event=>event.callId===call.id);
  if(saved.length){if(saved.length!==outputs.length || saved.some((event,i)=>!isDeepStrictEqual(event.chunk,outputs[i])))throw new ConflictError("历史工具结果卡不一致");}
  else await append(call.id,outputs);
 }
}
