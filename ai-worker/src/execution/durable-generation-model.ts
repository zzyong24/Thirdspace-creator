import { isStructuredResponseCompatibilityError } from "../nodes/structured-response-errors";
import { wrapLanguageModel,type LanguageModel } from "ai";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { workerProviderReceiptSchema,type WorkerProviderReceipt } from "@creatoros/contract/execution-worker";
import { GenerationFailure,generationFailure } from "./generation-error";
import { structuredOutputModeFor,markStructuredOutputMode } from "../runtime/provider-factory";

export interface DurableGenerationPorts {
  /** 宿主根据请求内容计算指纹和预留，Worker 不自报预算真值。 */
  reserve(input:{operationKey:string;request:Record<string,unknown>}):Promise<{callId:string;status:string;providerResult?:unknown;rejectionCode?:string|null}>;
  start(callId:string):Promise<void>;
  settle(callId:string,input:{status:"settled";providerResult:WorkerProviderReceipt;usage:{inputTokens?:number;outputTokens?:number;inputTokenDetails:{noCacheTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number};outputTokenDetails:{textTokens?:number;reasoningTokens?:number}}}|{status:"unknown"}|{status:"rejected";rejectionCode?:"STRUCTURED_PROTOCOL_UNSUPPORTED"|"CHAT_MODEL_RETRYABLE_REJECTION"}):Promise<void>;
}
const durableModels=new WeakSet<object>();
export function isDurableGenerationModel(model:LanguageModel){return typeof model==="object" && model!==null && durableModels.has(model);}
/** 结构化协议降级和补充生成仍用原节点；每次真正的provider调用单独预留、启动、结算。 */
export function createDurableGenerationModel(input:{model:LanguageModel;operationKey:string;ports:DurableGenerationPorts;signal?:AbortSignal}){
  if(typeof input.model === "string")throw new Error("DURABLE_MODEL_REQUIRES_RESOLVED_PROVIDER");
  let sequence=0;
  const wrapped=wrapLanguageModel({model:input.model,middleware:{
    specificationVersion:"v4",
    async transformParams({params}){
      const signals=[params.abortSignal,input.signal].filter((signal):signal is AbortSignal=>Boolean(signal));
      return {...params,...(signals.length ? {abortSignal:AbortSignal.any(signals)} : {})};
    },
    async wrapGenerate({params,doGenerate,model}){
      params.abortSignal?.throwIfAborted();
      // 请求只发往后端计量端口，账本只保存其摘要；HTTP头和取消对象不进入协议。
      const {abortSignal:_signal,headers:_headers,...request}=params;
      const reservation=await input.ports.reserve({operationKey:`${input.operationKey}/model/${++sequence}`,request:{...request,modelId:model.modelId,provider:model.provider}});
      params.abortSignal?.throwIfAborted();
      if(reservation.status==="settled" && reservation.providerResult){
        const receipt=workerProviderReceiptSchema.parse(reservation.providerResult);
        return receipt as LanguageModelV4GenerateResult;
      }
      if(reservation.status==="rejected" && reservation.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED")throw new Error("response_format unsupported");
      if(reservation.status!=="reserved")throw new GenerationFailure("unknown_result","MODEL_CALL_REQUIRES_RECONCILIATION");
      params.abortSignal?.throwIfAborted();
      // 启动回执丢失也不能重发供应商请求。
      try{await input.ports.start(reservation.callId);}catch{throw new GenerationFailure("unknown_result","MODEL_START_RECEIPT_UNKNOWN");}
      let result:LanguageModelV4GenerateResult;
      try{params.abortSignal?.throwIfAborted();result=await doGenerate();}
      catch(error){
        const failure=generationFailure(error,false);
        try{await input.ports.settle(reservation.callId,failure.outcome==="unknown_result" ? {status:"unknown"} : {status:"rejected",...(isStructuredResponseCompatibilityError(error) ? {rejectionCode:"STRUCTURED_PROTOCOL_UNSUPPORTED" as const} : {})});}
        catch{throw new GenerationFailure("unknown_result","MODEL_SETTLEMENT_RECEIPT_UNKNOWN");}
        // 明确协议拒绝保留给原结构化兼容判断；未知提交不能触发协议回退。
        throw failure.outcome==="unknown_result" ? failure : error;
      }
      let receipt:WorkerProviderReceipt;
      try{receipt=workerProviderReceiptSchema.parse(JSON.parse(JSON.stringify({content:result.content,finishReason:result.finishReason,usage:result.usage,warnings:result.warnings,providerMetadata:result.providerMetadata})));}
      catch{await input.ports.settle(reservation.callId,{status:"unknown"}).catch(()=>{});throw new GenerationFailure("unknown_result","MODEL_RECEIPT_UNAVAILABLE");}
      const usage=receipt.usage;
      try{await input.ports.settle(reservation.callId,{status:"settled",providerResult:receipt,usage:{
        inputTokens:usage.inputTokens.total,outputTokens:usage.outputTokens.total,
        inputTokenDetails:{noCacheTokens:usage.inputTokens.noCache,cacheReadTokens:usage.inputTokens.cacheRead,cacheWriteTokens:usage.inputTokens.cacheWrite},
        outputTokenDetails:{textTokens:usage.outputTokens.text,reasoningTokens:usage.outputTokens.reasoning},
      }});}catch{throw new GenerationFailure("unknown_result","MODEL_SETTLEMENT_RECEIPT_UNKNOWN");}
      return result;
    },
    async wrapStream(){throw new Error("DURABLE_GENERATION_REQUIRES_NONSTREAM_CALL");},
  }});
  durableModels.add(wrapped);
  return markStructuredOutputMode(wrapped,structuredOutputModeFor(input.model));
}
