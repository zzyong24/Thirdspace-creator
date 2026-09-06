import { createChatModelStreamEvents } from "./chat-model-stream-events";
import {runChatHooksInWorker} from "./chat-hooks-worker";
import { tool, jsonSchema, modelMessageSchema, type ModelMessage, type ToolApprovalStatus, type UIMessage, type UIMessageChunk } from "ai";
import { z } from "zod";
import {
  chatWorkerInputSchema, workerModelSpecSchema, workerReservationSchema, workerStartReceiptSchema,
  agenticToolReservationSchema, agenticToolOutcomeSchema, type WorkerPort, type WorkerProviderReceipt,
} from "@creatoros/contract/execution-worker";
import { modelFor } from "../runtime/provider-factory";
import { createChatModelStream } from "../runtime/chat/chat-model-stream";
import { sanitizeToolName } from "../runtime/chat/tool-names";
import { createDurableStreamModel } from "./durable-stream-model";
import { runDurableAgenticTool } from "./durable-agentic-tool";
import { GenerationFailure } from "./generation-error";
const checkpointSchema=z.object({acknowledgedBlockedCallIds:z.array(z.string()).default([]),revision:z.number().int().nonnegative(),ledgerSequence:z.number().int().nonnegative(),
  messages:z.array(z.object({role:z.enum(["assistant","tool"]),callId:z.string()})),
  uncheckpointedReceipts:z.array(z.object({kind:z.enum(["model","tool"]),callId:z.string(),sequence:z.number().int().positive()})),
  recovery:z.enum(["ready","pending","requires_replay","requires_reconciliation"])});
export interface ChatWorkerPorts {
  call(port:WorkerPort,data:unknown,signal?:AbortSignal):Promise<unknown>;
  /** 判定必须来自宿主对真实工具调用的授权，不能由模型参数自行决定。 */
  approve(input:{modelCallId:string;toolCallId:string},signal:AbortSignal):Promise<ToolApprovalStatus>;
  onChunk?(chunk:UIMessageChunk):Promise<void>;
}
/** 执行回合而不提交业务终态；调用方须把返回消息/授权状态与任务原子保存。 */
export async function runChatInWorker(rawInput:z.infer<typeof chatWorkerInputSchema>,rawSpec:z.infer<typeof workerModelSpecSchema>,parentSignal:AbortSignal,ports:ChatWorkerPorts){
  const input=chatWorkerInputSchema.parse(rawInput),spec=workerModelSpecSchema.parse(rawSpec);
  const stop=new AbortController(),signal=AbortSignal.any([parentSignal,stop.signal]);
  let failure:GenerationFailure|undefined,lastModelCallId:string|undefined;
  const modelForTool=new Map<string,string>(),toolCallIds=new Set<string>();
  const fail=(error:unknown,code:string)=>{
    const result=error instanceof GenerationFailure?error:new GenerationFailure("unknown_result",code);
    failure??=result;stop.abort();return result;
  };
  signal.throwIfAborted();
  const initial=checkpointSchema.parse(await ports.call("readCheckpoint",{},signal));
  if(initial.recovery==="requires_reconciliation")throw new GenerationFailure("unknown_result","CHAT_CHECKPOINT_REQUIRES_RECONCILIATION");
  let checkpointTail:Promise<void>=Promise.resolve();
  const checkpoint=()=>{
    checkpointTail=checkpointTail.then(async()=>{
      const current=checkpointSchema.parse(await ports.call("readCheckpoint",{},signal));
      const messages=[...current.messages],seen=new Set(messages.map(message=>message.callId));
      for(const receipt of [...current.uncheckpointedReceipts].sort((a,b)=>a.sequence-b.sequence))if(!seen.has(receipt.callId)){
        messages.push({role:receipt.kind==="model"?"assistant":"tool",callId:receipt.callId});seen.add(receipt.callId);
      }
      if(messages.length!==current.messages.length){
        const saved=z.object({revision:z.number().int().positive()}).parse(await ports.call("saveCheckpoint",{expectedRevision:current.revision,expectedLedgerSequence:current.ledgerSequence,messages},signal));
        if(saved.revision!==current.revision+1)throw Error("checkpoint receipt mismatch");
      }
    }).catch(error=>{throw fail(error,"CHAT_CHECKPOINT_RECEIPT_UNKNOWN");});
    return checkpointTail;
  };
  const bind=async(callId:string,receipt:WorkerProviderReceipt)=>{
    lastModelCallId=callId;
    for(const part of receipt.content){
      if(!part || typeof part!=="object" || Array.isArray(part) || part.type!=="tool-call")continue;
      const call=z.object({toolCallId:z.string(),toolName:z.string()}).parse(part);
      if(!input.tools.some(tool=>sanitizeToolName(tool.name)===call.toolName))throw new GenerationFailure("unknown_result","CHAT_TOOL_OUTSIDE_FROZEN_SCOPE");
      const previous=modelForTool.get(call.toolCallId);
      if(previous && previous!==callId)throw new GenerationFailure("unknown_result","CHAT_TOOL_CALL_ID_REUSED");
      modelForTool.set(call.toolCallId,callId);
    }
    await checkpoint();
  };
  const model=createDurableStreamModel({model:modelFor(spec),operationKey:input.operationKey,signal,streamEvents:callId=>createChatModelStreamEvents(callId,batch=>ports.call("appendStreamEvents",batch,signal)),ports:{
    reserve:async(request)=>{
      const result=workerReservationSchema.parse(await ports.call("reserveGenerationCall",request,signal));
      if(result.status==="settled" && result.providerResult)await bind(result.callId,result.providerResult);
      return result;
    },
    start:async(callId)=>{const result=workerStartReceiptSchema.parse(await ports.call("startCall",{callId},signal));if(result.callId!==callId)throw Error("start receipt mismatch");},
    settle:async(callId,result)=>{
      const receipt=z.object({callId:z.string(),status:z.string()}).parse(await ports.call("settleGenerationCall",{callId,...result}));
      if(receipt.callId!==callId || receipt.status!==result.status)throw Error("settlement receipt mismatch");
      if(result.status==="settled")await bind(callId,result.providerResult);
    },
  }});
  const tools=Object.fromEntries(input.tools.map(definition=>[definition.name,tool({description:definition.description,inputSchema:jsonSchema(definition.parameters),
    execute:async(_input,options)=>{
      try{
        const modelCallId=modelForTool.get(options.toolCallId);if(!modelCallId)throw Error("model receipt missing");
        let reservedCallId:string|undefined;
        const output=await runDurableAgenticTool({modelCallId,toolCallId:options.toolCallId},{signal,call:async(port,data,portSignal)=>{
          const result=await ports.call(port,data,portSignal);
          if(port==="reserveAgenticTool"){
            const reservation=agenticToolReservationSchema.parse(result);
            if(reservation.toolName!==sanitizeToolName(definition.name))throw Error("tool receipt mismatch");
            reservedCallId=reservation.callId;
          }
          return result;
        },execute:async()=>{
          if(!reservedCallId)throw Error("tool reservation missing");
          if(definition.execution==="worker.script-hooks")return runChatHooksInWorker(reservedCallId,modelFor(spec),signal,(port,data,portSignal)=>ports.call(port,data,portSignal));
          return agenticToolOutcomeSchema.parse(await ports.call("executeAgenticTool",{callId:reservedCallId},signal));
        }});
        if(!reservedCallId)throw Error("tool receipt missing");
        toolCallIds.add(reservedCallId);await checkpoint();
        if(!initial.acknowledgedBlockedCallIds.includes(reservedCallId) && (output.error?.code==="needs_login" || output.error?.code==="captcha" || output.error?.code==="permission"))throw new GenerationFailure("waiting_user","CHAT_TOOL_REQUIRES_USER");
        return output.data??output;
      }catch(error){throw fail(error,"CHAT_TOOL_RESULT_UNKNOWN");}
    },
  })]));
  const toolApproval=Object.fromEntries(input.tools.map(definition=>[definition.name,async(_input:unknown,options:{toolCallId:string})=>{
    try{
      const modelCallId=modelForTool.get(options.toolCallId);if(!modelCallId)throw Error("approval model receipt missing");
      signal.throwIfAborted();
      const decision=await ports.approve({modelCallId,toolCallId:options.toolCallId},signal);
      if(decision==="denied" || (typeof decision==="object" && decision?.type==="denied")){
        const reservation=agenticToolReservationSchema.parse(await ports.call("reserveAgenticTool",{modelCallId,toolCallId:options.toolCallId},signal));
        if(reservation.toolName!==sanitizeToolName(definition.name))throw Error("denied tool mismatch");
        const output=agenticToolOutcomeSchema.parse({status:"blocked",summary:"用户未允许本次操作",evidence:[],data:{denied:true},error:{code:"permission",retryable:false,recovery:"用户已拒绝，本次不执行。"},continuation:null,sideEffect:"none"});
        if(reservation.status==="settled"){
          const previous=agenticToolOutcomeSchema.parse(reservation.receipt?.output);
          const data=previous.data;
          if(previous.status!=="blocked" || previous.sideEffect!=="none" || previous.error?.code!=="permission" || !data || typeof data!=="object" || Array.isArray(data) || data.denied!==true)throw Error("denial conflicts with existing receipt");
        }else{
          if(reservation.status!=="reserved")throw Error("denied tool requires reconciliation");
          const started=workerStartReceiptSchema.parse(await ports.call("startAgenticTool",{callId:reservation.callId},signal));
          if(started.callId!==reservation.callId)throw Error("denied tool start mismatch");
          const saved=z.object({callId:z.string(),status:z.literal("settled")}).parse(await ports.call("settleAgenticTool",{callId:reservation.callId,status:"settled",output}));
          if(saved.callId!==reservation.callId)throw Error("denied tool receipt mismatch");
        }
        toolCallIds.add(reservation.callId);await checkpoint();
      }
      return decision;
    }catch(error){throw fail(error,"CHAT_APPROVAL_RESULT_UNKNOWN");}
  }]));
  let message:UIMessage|undefined;
  const result=createChatModelStream({model,system:input.system,messages:await Promise.all(input.messages.map(message=>modelMessageSchema.parse(message))) as ModelMessage[],
    tools,toolApproval,deduplicateTools:false,maxSteps:input.maxSteps,maxOutputTokens:input.maxOutputTokens,forcedTool:input.forcedTool,forcedToolSequence:input.forcedToolSequence,abortSignal:signal,
    onError:({error})=>{fail(error,"CHAT_MODEL_RESULT_UNKNOWN");},
  });
  const reader=result.toUIMessageStream({generateMessageId:()=>`chat:${input.sourceMessageId}`,onFinish:({responseMessage})=>{message=responseMessage;}}).getReader();
  try{
    while(true){const next=await reader.read();if(next.done)break;await ports.onChunk?.(next.value);}
    await checkpointTail;
    if(failure)throw failure;
    parentSignal.throwIfAborted();
    if(!message || !lastModelCallId)throw new GenerationFailure("unknown_result","CHAT_RESULT_RECEIPT_MISSING");
    const awaitingApproval=message.parts.some(part=>"state" in part && part.state==="approval-requested");
    const finishReason=await result.finishReason;
    const hasOutput=message.parts.some(part=>(part.type==="text" && part.text.trim().length>0) || part.type==="file" || ("state" in part && part.state==="output-available"));
    if(!awaitingApproval && !hasOutput)throw new GenerationFailure("failed","CHAT_OUTPUT_EMPTY");
    return {message,text:await result.text,lastModelCallId,toolCallIds:[...toolCallIds],outcome:awaitingApproval?"awaiting_confirmation" as const:finishReason==="stop"?"completed" as const:"partial" as const,finishReason};
  }catch(error){stop.abort();await reader.cancel().catch(()=>{});throw failure??fail(error,"CHAT_STREAM_RESULT_UNKNOWN");}
}
