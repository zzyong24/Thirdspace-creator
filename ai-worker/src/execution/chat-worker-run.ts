import {runChatRedfoxInWorker} from "./chat-redfox-worker";
import {createChatWebReadResources} from "./chat-web-read-resources";
import {runChatResearchInWorker,createChatResearchResources} from "./chat-research-worker";
import {runChatGenerationInWorker} from "./chat-generation-worker";
import { createChatModelStreamEvents } from "./chat-model-stream-events";
import {runChatTextNodeInWorker} from "./chat-text-node-worker";
import { tool, jsonSchema, modelMessageSchema, type ModelMessage, type ToolApprovalStatus, type UIMessageChunk } from "ai";
import { z } from "zod";
import {
  chatWorkerInputSchema, workerModelSpecSchema, workerReservationSchema, workerStartReceiptSchema,
  agenticToolReservationSchema, agenticToolOutcomeSchema, type WorkerPort, type WorkerProviderReceipt,
} from "@creatoros/contract/execution-worker";
import { modelFor } from "../runtime/provider-factory";
import { runChatPiLoop, ChatFinalRecoveryError, ChatPlanProgressError, type ChatPlanStatus } from "../runtime/chat/chat-pi-loop";
import { sanitizeToolName } from "../runtime/chat/tool-names";
import { createDurableStreamModel } from "./durable-stream-model";
import { runDurableAgenticTool } from "./durable-agentic-tool";
import { GenerationFailure } from "./generation-error";
import { projectReceiptForPi } from "../capabilities/result-pages";
import { createWorkbenchGateway, toAgenticToolOutcome } from "../capabilities/gateway";
import { workbenchResultSchema,workbenchScreenshotResolvedSchema } from "@creatoros/contract/agent-workbench";
const checkpointSchema=z.object({pendingCalls:z.array(z.object({callId:z.string().optional(),status:z.string()})).default([]),replayableScriptDraftToolCallIds:z.array(z.string()).default([]),replayableWebReadToolCallIds:z.array(z.string()).default([]),replayableGenerationToolCallIds:z.array(z.string()).default([]),completableToolCallIds:z.array(z.string()).default([]),resumableToolCallIds:z.array(z.string()).default([]),acknowledgedBlockedCallIds:z.array(z.string()).default([]),revision:z.number().int().nonnegative(),ledgerSequence:z.number().int().nonnegative(),
  messages:z.array(z.object({role:z.enum(["assistant","tool"]),callId:z.string()})),
  uncheckpointedReceipts:z.array(z.object({kind:z.enum(["model","tool"]),callId:z.string(),sequence:z.number().int().positive()})),
  recovery:z.enum(["ready","pending","requires_replay","requires_reconciliation"])});
export interface ChatWorkerPorts {
  call(port:WorkerPort,data:unknown,signal?:AbortSignal):Promise<unknown>;
  /** 判定必须来自宿主对真实工具调用的授权，不能由模型参数自行决定。 */
  approve(input:{modelCallId:string;toolCallId:string},signal:AbortSignal):Promise<ToolApprovalStatus>;
  onChunk?(chunk:UIMessageChunk):Promise<void>;
  readPlanStatus?(signal:AbortSignal):Promise<ChatPlanStatus|null>;
}
/** 执行回合而不提交业务终态；调用方须把返回消息/授权状态与任务原子保存。 */
export async function runChatInWorker(rawInput:z.infer<typeof chatWorkerInputSchema>,rawSpec:z.infer<typeof workerModelSpecSchema>,parentSignal:AbortSignal,ports:ChatWorkerPorts){
  const input=chatWorkerInputSchema.parse(rawInput),spec=workerModelSpecSchema.parse(rawSpec);
  const stop=new AbortController(),signal=AbortSignal.any([parentSignal,stop.signal]);
  let failure:GenerationFailure|undefined,lastModelCallId:string|undefined;
  const modelForTool=new Map<string,string>(),toolCallIds=new Set<string>();
  const outcomesForProjection=new Map<string,{callId:string;outcome:z.infer<typeof agenticToolOutcomeSchema>}>();
  const fail=(error:unknown,code:string)=>{
    const result=error instanceof GenerationFailure?error:new GenerationFailure("unknown_result",code);
    failure??=result;stop.abort();return result;
  };
  signal.throwIfAborted();
  const initial=checkpointSchema.parse(await ports.call("readCheckpoint",{},signal));
  // 旧协议任务保留账本与历史，但升级后不再启动已退役的执行器。
  // 未知回执继续要求对账；其余旧任务明确等待用户另建任务，不自动重发动作。
  if(input.executionEngine!=="pi")throw new GenerationFailure((initial.recovery==="requires_reconciliation" || initial.pendingCalls.some(call=>call.status==="started" || call.status==="unknown"))?"unknown_result":"waiting_user","CHAT_LEGACY_RUNTIME_UPGRADE_REQUIRED");
  const recoverableCalls=new Set([...initial.replayableScriptDraftToolCallIds,...initial.replayableWebReadToolCallIds,...initial.replayableGenerationToolCallIds,...initial.completableToolCallIds,...initial.resumableToolCallIds]);
  if(initial.recovery==="requires_reconciliation" || initial.pendingCalls.some(call=>call.status==="unknown" || (call.status==="started" && !recoverableCalls.has(call.callId??""))))throw new GenerationFailure("unknown_result","CHAT_CHECKPOINT_REQUIRES_RECONCILIATION");
  const restoreHooks=async(callId:string)=>{
    const receipt=workerStartReceiptSchema.parse(await ports.call("restoreChatHooks",{callId},signal));
    if(receipt.callId!==callId)throw new GenerationFailure("unknown_result","CHAT_HOOKS_RESTORE_RECEIPT_UNKNOWN");
  };
  const restoreScriptDraft=async(callId:string)=>{
    const receipt=workerStartReceiptSchema.parse(await ports.call("restoreChatScriptDraft",{callId},signal));
    if(receipt.callId!==callId)throw new GenerationFailure("unknown_result","CHAT_SCRIPT_DRAFT_RESTORE_RECEIPT_UNKNOWN");
  };
  const restoreGeneration=async(callId:string)=>{
    const saved=workerStartReceiptSchema.parse(await ports.call("restoreChatGeneration",{callId},signal));
    if(saved.callId!==callId)throw new GenerationFailure("unknown_result","CHAT_GENERATION_RESTORE_RECEIPT_UNKNOWN");
  };
  const restoreWebRead=async(callId:string)=>{
    const saved=workerStartReceiptSchema.parse(await ports.call("restoreChatWebRead",{callId},signal));
    if(saved.callId!==callId)throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RESTORE_RECEIPT_UNKNOWN");
  };
  // 已成功子模型只恢复候选投影；不重新预留或调用供应商。
  for(const callId of initial.completableToolCallIds)agenticToolOutcomeSchema.parse(await ports.call("completeChatHooks",{callId},signal));
  for(const callId of initial.resumableToolCallIds)await restoreHooks(callId);
  for(const callId of initial.replayableGenerationToolCallIds)await restoreGeneration(callId);
  for(const callId of initial.replayableWebReadToolCallIds)await restoreWebRead(callId);
  for(const callId of initial.replayableScriptDraftToolCallIds)await restoreScriptDraft(callId);
  // 已持久网页观察直接完成原提交；启动恢复不创建浏览器或查询搜索配置。
  for(const callId of initial.replayableWebReadToolCallIds)agenticToolOutcomeSchema.parse(await ports.call("completeChatWebRead",{callId},signal));
  // 所有同轮父工具先归入当前租约，再允许任一节点申请后续修复调用。
  for(const callId of initial.replayableGenerationToolCallIds)await runChatGenerationInWorker(callId,signal,ports.call);
  for(const callId of initial.replayableScriptDraftToolCallIds)await runChatTextNodeInWorker(callId,modelFor(spec),signal,ports.call,"script-draft");
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
  const model=createDurableStreamModel({model:modelFor(spec),operationKey:input.operationKey,signal,
    fallbackModel:async operationKey=>{
      const raw=await ports.call("resolveChatFallbackCredential",{operationKey},signal);
      return raw===null?null:modelFor(workerModelSpecSchema.parse(raw));
    },streamEvents:callId=>createChatModelStreamEvents(callId,batch=>ports.call("appendStreamEvents",batch,signal)),ports:{
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
  const research=input.tools.some(tool=>tool.execution==="worker.research")?await createChatResearchResources(signal,ports.call):undefined;
  const workbenchCatalog=input.workbenchCapabilities??[];
  const workbenchGateway=workbenchCatalog.length?createWorkbenchGateway(workbenchCatalog,{
    platform:input.workbenchPlatform!,capabilities:[...new Set(workbenchCatalog.flatMap(item=>item.requiredCapabilities))],
    dispatch:async()=>{throw new Error("WORKBENCH_HOST_CONTEXT_IS_BACKEND_ONLY");},
    dispatchReserved:async(_invocation,operationId,{signal:dispatchSignal})=>{
      const output=agenticToolOutcomeSchema.parse(await ports.call("executeAgenticTool",{callId:operationId},dispatchSignal));
      const data=output.data && typeof output.data==="object" && !Array.isArray(output.data)?output.data as Record<string,unknown>:{};
      return workbenchResultSchema.parse(data.workbench);
    },
  }):null;
  let webRead:ReturnType<typeof createChatWebReadResources>|undefined;
  try{
  if(input.tools.some(tool=>tool.execution==="worker.web-read"))webRead=createChatWebReadResources(signal,ports.call);
  const tools=Object.fromEntries(input.tools.map(definition=>[definition.name,tool({description:definition.description,inputSchema:jsonSchema(definition.parameters),
    execute:async(_input,options)=>{
      try{
        const modelCallId=modelForTool.get(options.toolCallId);if(!modelCallId)throw Error("model receipt missing");
        let reservedCallId:string|undefined;
        const output=await runDurableAgenticTool({modelCallId,toolCallId:options.toolCallId},{signal,...(definition.execution==="worker.script-draft"?{resumeStarted:restoreScriptDraft}:definition.execution==="worker.web-read"?{resumeStarted:restoreWebRead}:definition.execution==="worker.script-hooks"?{resumeStarted:restoreHooks}:definition.execution==="worker.structured-node"?{resumeStarted:restoreGeneration}:{}),call:async(port,data,portSignal)=>{
          const result=await ports.call(port,data,portSignal);
          if(port==="reserveAgenticTool"){
            const reservation=agenticToolReservationSchema.parse(result);
            if(reservation.toolName!==sanitizeToolName(definition.name))throw Error("tool receipt mismatch");
            reservedCallId=reservation.callId;
          }
          return result;
        },execute:async(_reservedName,reservationInput)=>{
          if(!reservedCallId)throw Error("tool reservation missing");
          if(definition.execution==="worker.web-read"){if(!webRead)throw Error("网页读取尚未装配");return webRead.run(reservedCallId,signal);}
          if(definition.execution==="worker.redfox")return runChatRedfoxInWorker(reservedCallId,signal,ports.call);
          if(definition.execution==="worker.research"){if(!research)throw Error("浏览器搜索尚未装配");return runChatResearchInWorker(reservedCallId,signal,ports.call,research);}
          if(definition.execution==="worker.structured-node")return runChatGenerationInWorker(reservedCallId,signal,ports.call);
          if(definition.execution==="worker.script-draft")return runChatTextNodeInWorker(reservedCallId,modelFor(spec),signal,ports.call,"script-draft");
          if(definition.execution==="worker.script-hooks")return runChatTextNodeInWorker(reservedCallId,modelFor(spec),signal,(port,data,portSignal)=>ports.call(port,data,portSignal));
          const descriptor=workbenchCatalog.find(item=>item.name===definition.name);
          if(descriptor){
            if(!workbenchGateway)throw Error("WORKBENCH_GATEWAY_UNAVAILABLE");
            const result=await workbenchGateway.invokeReserved({name:definition.name,schemaVersion:descriptor.schemaVersion,input:reservationInput as Record<string,unknown>},reservedCallId,signal);
            return toAgenticToolOutcome(result,descriptor);
          }
          return agenticToolOutcomeSchema.parse(await ports.call("executeAgenticTool",{callId:reservedCallId},signal));
        }});
        if(!reservedCallId)throw Error("tool receipt missing");
        toolCallIds.add(reservedCallId);await checkpoint();
        outcomesForProjection.set(options.toolCallId,{callId:reservedCallId,outcome:output});
        if(!initial.acknowledgedBlockedCallIds.includes(reservedCallId) && (output.error?.code==="needs_login" || output.error?.code==="captcha" || output.error?.code==="permission"))throw new GenerationFailure("waiting_user","CHAT_TOOL_REQUIRES_USER");
        return (input as typeof input & {executionEngine?:"pi"}).executionEngine==="pi" && output.error ? output : output.data??output;
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
  // 所有可执行聊天只进入 Pi；旧非终态在任何工具恢复之前已明确暂停。
    const result=await runChatPiLoop({model,system:input.system,messages:input.messages.map(message=>modelMessageSchema.parse(message)) as ModelMessage[],
      definitions:input.tools,maxOutputTokens:input.maxOutputTokens,signal,messageId:`chat:${input.sourceMessageId}`,
      recoverMissingFinal:input.recoverMissingFinal,contextPolicyVersion:input.contextPolicyVersion,forcedTool:input.forcedTool,forcedToolSequence:input.forcedToolSequence,onChunk:ports.onChunk,
      readPlanStatus:ports.readPlanStatus?()=>ports.readPlanStatus!(signal):undefined,
      presentToolResult:async(_name,_visible,toolCallId)=>{
        const receipt=outcomesForProjection.get(toolCallId);
        if(!receipt)return null;
        const record=receipt.outcome.data && typeof receipt.outcome.data==="object" && !Array.isArray(receipt.outcome.data) ? receipt.outcome.data as Record<string,unknown> : {};
        const workbench=workbenchResultSchema.safeParse(record.workbench??record.result);
        const hasImage=workbench.success && workbench.data.status==="succeeded" && workbench.data.content.some(item=>item.type==="image");
        const reference=`[原工具调用 ID: ${receipt.callId}；完成计划步骤时引用此 operationRef。]`;
        // 原回执已先结算。只解析本轮工具结果中的图片，恢复历史文本保持分页但不重复注入媒体。
        // 分页 reader 按 provider toolCallId 找回执；计划引用和截图解析仍用 execution callId。
        const projected=await projectReceiptForPi(receipt.outcome,toolCallId,hasImage?{
          resolveImage:async dataRef=>workbenchScreenshotResolvedSchema.parse(await ports.call("resolveWorkbenchScreenshot",{callId:receipt.callId,dataRef},signal)),
          fallbackToText:true,
        }:{});
        signal.throwIfAborted();
        return projected.content.map(item=>item.type==="text"?{...item,text:`${reference}\n${item.text}`}:item);
      },
      approve:(name,args,options)=>toolApproval[name]!(args,options),
      approvalId:toolCallId=>`chat-approval:${modelForTool.get(toolCallId)!}:${toolCallId}`,
      execute:async(name,args,options)=>{
        const executable=tools[name] as unknown as {execute:(input:unknown,options:{toolCallId:string;messages:ModelMessage[];abortSignal:AbortSignal})=>Promise<unknown>};
        return executable.execute(args,{...options,messages:[],abortSignal:signal});
      },
    }).catch(error=>{
      if(error instanceof ChatFinalRecoveryError)throw new GenerationFailure("failed",error.code);
      if(error instanceof ChatPlanProgressError)throw new GenerationFailure(error.code==="CHAT_PLAN_REQUIRES_USER"?"waiting_user":"failed",error.code);
      throw error;
    });
    await checkpointTail;
    if(failure)throw failure;
    parentSignal.throwIfAborted();
    if(!lastModelCallId)throw new GenerationFailure("unknown_result","CHAT_RESULT_RECEIPT_MISSING");
    if(!result.awaitingApproval && !result.message.parts.some(part=>(part.type==="text" && part.text.trim()) || part.type==="file" || ("state" in part && part.state==="output-available")))throw new GenerationFailure("failed","CHAT_OUTPUT_EMPTY");
    return {...result,lastModelCallId,toolCallIds:[...toolCallIds],outcome:result.awaitingApproval?"awaiting_confirmation" as const:result.finishReason==="stop"?"completed" as const:"partial" as const};
  }finally{await Promise.all([research?.close(),webRead?.close()]);}
}
