import {generateText,type LanguageModel} from "ai";
import {generationFailure} from "./generation-error";
import {DurableToolSuspension} from "./durable-agentic-tool";
import {z} from "zod";
import {chatHooksPreparationSchema,workerReservationSchema,workerStartReceiptSchema,agenticToolOutcomeSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {createDurableGenerationModel} from "./durable-generation-model";
/** 同一 Worker 内执行宿主登记的单次文本节点；结果始终由宿主根据回执重建。 */
export async function runChatTextNodeInWorker(callId:string,model:LanguageModel,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>,node:"hooks"|"script-draft"="hooks"){
 const ports=node==="hooks"?{prepare:"prepareChatHooks",reserve:"reserveChatHooksModel",start:"startChatHooksModel",settle:"settleChatHooksModel",complete:"completeChatHooks",fail:"failChatHooks"} as const:{prepare:"prepareChatScriptDraft",reserve:"reserveChatScriptDraftModel",start:"startChatScriptDraftModel",settle:"settleChatScriptDraftModel",complete:"completeChatScriptDraft",fail:"failChatScriptDraft"} as const;
 const prepared=(node==="hooks"?chatHooksPreparationSchema:chatHooksPreparationSchema.extend({noModel:z.literal(true).optional()})).parse(await call(ports.prepare,{callId},signal));
 if("noModel" in prepared && prepared.noModel)return agenticToolOutcomeSchema.parse(await call(ports.complete,{callId},signal));
 const durable=createDurableGenerationModel({model,operationKey:prepared.operationKey,signal,ports:{
  // 请求遵循 JSON 契约，显式移除 SDK 可选 undefined，兼容 advanced IPC。
  reserve:async request=>workerReservationSchema.parse(await call(ports.reserve,JSON.parse(JSON.stringify({...request,callId,...(prepared.retryOfCallId?{retryOfCallId:prepared.retryOfCallId}:{})})),signal)),
  start:async childId=>{const receipt=workerStartReceiptSchema.parse(await call(ports.start,{callId:childId},signal));if(receipt.callId!==childId)throw new Error("内部模型启动回执不符");},
  settle:async(childId,input)=>{const receipt=z.object({callId:z.string(),status:z.string()}).parse(await call(ports.settle,{callId:childId,...input}));if(receipt.callId!==childId || receipt.status!==input.status)throw new Error("内部模型结算回执不符");},
 }});
 try{await generateText({model:durable,system:prepared.system,prompt:prepared.prompt,maxOutputTokens:prepared.maxOutputTokens,maxRetries:0,abortSignal:signal});}catch(error){
  const failure=generationFailure(error,false);
  if(signal.aborted)throw error;
  // 子结算确认可能丢失；只请宿主依据真实回执完成，不重发模型。
  if(failure.outcome==="unknown_result")return agenticToolOutcomeSchema.parse(await call(ports.complete,{callId},signal));
  const report={callId,outcome:failure.outcome,errorCode:failure.errorCode,retryAfterMs:failure.retryAfterMs};
  // 仅重读同一宿主挂起回执，不重发供应商请求；最终事实仍在任务账本。
  const saved=z.object({status:z.enum(["retry_wait","waiting_user","failed"])}).parse(await call(ports.fail,report).catch(()=>call(ports.fail,report)));
  throw new DurableToolSuspension(saved.status,failure.errorCode,failure.retryAfterMs);
 }
 return agenticToolOutcomeSchema.parse(await call(ports.complete,{callId},signal));
}
