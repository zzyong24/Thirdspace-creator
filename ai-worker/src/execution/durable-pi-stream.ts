import { z } from "zod";
import type { AssistantMessage, AssistantMessageEvent, Context, StreamFunction } from "@earendil-works/pi-ai";
import {workerProviderReceiptSchema,workerReservationSchema,workerStartReceiptSchema,type WorkerProviderReceipt,type WorkerPort} from "@creatoros/contract/execution-worker";
import {GenerationFailure,generationFailure} from "./generation-error";

const jsonCopy=(value:unknown)=>z.json().parse(JSON.parse(JSON.stringify(value)));
/** Keep actual message content, including tool arguments/signatures, without transport metadata. */
export function normalizePiContext(context:Context) {
  const messages=context.messages.map(message=>{
    if(message.role==="user")return {role:message.role,content:message.content};
    if(message.role==="assistant")return {role:message.role,content:message.content};
    return {role:message.role,toolCallId:message.toolCallId,toolName:message.toolName,content:message.content,isError:message.isError};
  });
  const result=jsonCopy({systemPrompt:context.systemPrompt ?? "",messages,tools:(context.tools ?? []).map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters}))});
  if(JSON.stringify(result).length>4_000_000)throw new Error("PI_CONTEXT_TOO_LARGE");
  return result;
}
const count=z.number().int().nonnegative();
const metadataSchema=z.object({api:z.string(),provider:z.string(),model:z.string(),timestamp:z.number().finite(),responseModel:z.string().optional(),responseId:z.string().optional(),cacheWrite1h:count.optional(),cost:z.object({input:z.number().nonnegative(),output:z.number().nonnegative(),cacheRead:z.number().nonnegative(),cacheWrite:z.number().nonnegative(),total:z.number().nonnegative()})});
const partSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("text"),text:z.string(),textSignature:z.string().optional()}).strict(),
  z.object({type:z.literal("reasoning"),text:z.string(),thinkingSignature:z.string().optional(),redacted:z.boolean().optional()}).strict(),
  z.object({type:z.literal("tool-call"),toolCallId:z.string().min(1),toolName:z.string().min(1),input:z.string(),thoughtSignature:z.string().optional()}).strict(),
]);
export function piAssistantToCanonical(message:AssistantMessage):WorkerProviderReceipt {
  if(!["stop","length","toolUse"].includes(message.stopReason))throw new Error("PI_RESULT_INCOMPLETE");
  const u=message.usage;
  const noCache=count.parse(u.input),cacheRead=count.parse(u.cacheRead),cacheWrite=count.parse(u.cacheWrite),output=count.parse(u.output);
  // Pi将缺失用量初始化为0。非空任务无法证明全零计量，保守要求对账。
  // 这只识别全零，无法证明部分usage字段是否由供应商真实提供。
  if(noCache+cacheRead+cacheWrite+output===0)throw new GenerationFailure("unknown_result","MODEL_USAGE_UNKNOWN");
  const reasoning=u.reasoning===undefined?undefined:count.parse(u.reasoning);
  if(reasoning!==undefined && reasoning>output)throw new Error("PI_USAGE_CONFLICT");
  const content=message.content.map(part=>{
    if(part.type==="text")return partSchema.parse({type:"text",text:part.text,textSignature:part.textSignature});
    if(part.type==="thinking")return partSchema.parse({type:"reasoning",text:part.thinking,thinkingSignature:part.thinkingSignature,redacted:part.redacted});
    return partSchema.parse({type:"tool-call",toolCallId:part.id,toolName:part.name,input:JSON.stringify(part.arguments),thoughtSignature:part.thoughtSignature});
  });
  const pi=metadataSchema.parse({api:message.api,provider:message.provider,model:message.model,timestamp:message.timestamp,responseModel:message.responseModel,responseId:message.responseId,cacheWrite1h:u.cacheWrite1h,cost:u.cost});
  return workerProviderReceiptSchema.parse(jsonCopy({content,finishReason:{unified:message.stopReason==="toolUse"?"tool-calls":message.stopReason,raw:message.stopReason},usage:{inputTokens:{total:noCache+cacheRead+cacheWrite,noCache,cacheRead,cacheWrite},outputTokens:{total:output,...(reasoning===undefined?{}:{reasoning,text:output-reasoning})}},warnings:[],providerMetadata:{pi}}));
}
export function canonicalToPiAssistant(raw:WorkerProviderReceipt):AssistantMessage {
  const receipt=workerProviderReceiptSchema.parse(raw);
  const pi=metadataSchema.parse(receipt.providerMetadata?.pi);
  const stopReason=z.enum(["stop","length","toolUse"]).parse(receipt.finishReason.raw);
  const content:AssistantMessage["content"]=receipt.content.map(rawPart=>{
    const part=partSchema.parse(rawPart);
    if(part.type==="text")return {type:"text",text:part.text,...(part.textSignature===undefined?{}:{textSignature:part.textSignature})};
    if(part.type==="reasoning")return {type:"thinking",thinking:part.text,...(part.thinkingSignature===undefined?{}:{thinkingSignature:part.thinkingSignature}),...(part.redacted===undefined?{}:{redacted:part.redacted})};
    const args=z.record(z.string(),z.json()).parse(JSON.parse(part.input));
    return {type:"toolCall",id:part.toolCallId,name:part.toolName,arguments:args,...(part.thoughtSignature===undefined?{}:{thoughtSignature:part.thoughtSignature})};
  });
  const u=receipt.usage;const input=count.parse(u.inputTokens.noCache),cacheRead=count.parse(u.inputTokens.cacheRead),cacheWrite=count.parse(u.inputTokens.cacheWrite),output=count.parse(u.outputTokens.total);
  return {role:"assistant",content,api:pi.api as AssistantMessage["api"],provider:pi.provider,model:pi.model,timestamp:pi.timestamp,stopReason,
    ...(pi.responseModel===undefined?{}:{responseModel:pi.responseModel}),...(pi.responseId===undefined?{}:{responseId:pi.responseId}),
    usage:{input,cacheRead,cacheWrite,output,totalTokens:input+cacheRead+cacheWrite+output,cost:pi.cost,...(pi.cacheWrite1h===undefined?{}:{cacheWrite1h:pi.cacheWrite1h}),...(u.outputTokens.reasoning===undefined?{}:{reasoning:u.outputTokens.reasoning})}};
}
export interface DurablePiStreamDeps {
  call(port:WorkerPort,data:unknown,signal?:AbortSignal):Promise<unknown>;
  signal:AbortSignal;
  maxOutputTokens:number;
  frozenSystemPrompt?:string;
  onSettled(callId:string,receipt:WorkerProviderReceipt):void|Promise<void>;
  onFailure?(error:GenerationFailure):void;
}
/** Only provisional events stream early; Pi sees completion only after the durable receipt. */
export function wrapDurablePiStream(native:StreamFunction,deps:DurablePiStreamDeps):StreamFunction {
  return ((model,context,options)=>{
    const queue:AssistantMessageEvent[]=[];let finished=false;let failure:unknown;let wake:()=>void=()=>{};
    let resolve!:(message:AssistantMessage)=>void,reject!:(error:unknown)=>void;
    const result=new Promise<AssistantMessage>((yes,no)=>{resolve=yes;reject=no;});void result.catch(()=>{});
    const push=(event:AssistantMessageEvent)=>{queue.push(event);wake();};
    const signal=options?.signal?AbortSignal.any([deps.signal,options.signal]):deps.signal;
    void(async()=>{
      let responseFact:{status:number;responseHeaders:Record<string,string>;retryAfterMs?:number}|undefined;
      let callId:string|undefined;let nativeBegan=false;let terminalSettled=false;let settling=false;let hasOutput=false;
      try{
        signal.throwIfAborted();
        const ceiling=count.positive().parse(deps.maxOutputTokens);
        const maxTokens=Math.min(ceiling,options?.maxTokens===undefined?ceiling:count.positive().parse(options.maxTokens));
        const effectiveContext={...context,systemPrompt:deps.frozenSystemPrompt ?? context.systemPrompt};
        const request=normalizePiContext(effectiveContext);
        const reserved=workerReservationSchema.parse(await deps.call("reserveAgenticModel",{request,maxOutputTokens:maxTokens},signal));callId=reserved.callId;
        signal.throwIfAborted();
        let canonical:WorkerProviderReceipt;
        if(reserved.status==="settled" && reserved.providerResult){canonical=workerProviderReceiptSchema.parse(reserved.providerResult);terminalSettled=true;}
        else {
          if(reserved.status!=="reserved")throw new GenerationFailure("unknown_result","MODEL_CALL_REQUIRES_RECONCILIATION");
          const start=workerStartReceiptSchema.parse(await deps.call("startCall",{callId},signal));if(start.callId!==callId)throw new Error("MODEL_START_RECEIPT_MISMATCH");
          signal.throwIfAborted();nativeBegan=true;
          const source=await native(model,effectiveContext,{...options,maxTokens,signal,maxRetries:0,
            onResponse:async(response,responseModel)=>{
              // 固定版本provider补丁仅从SDK APIError补发拒绝响应；2xx后的流错误仍未知。
              // 第一份HTTP事实不可被观察回调抛出的异常覆盖，不保留正文或认证头。
              if(!responseFact && Number.isInteger(response.status) && response.status>=100 && response.status<=599){
                const responseHeaders:Record<string,string>={};
                for(const name of ["retry-after","retry-after-ms"]){
                  const value=response.headers[name];if(typeof value==="string")responseHeaders[name]=value;
                }
                const milliseconds=responseHeaders["retry-after-ms"];
                const parsed=milliseconds!==undefined && /^\d+(?:\.\d+)?$/.test(milliseconds)?Number(milliseconds):undefined;
                responseFact={status:response.status,responseHeaders,...(parsed!==undefined && Number.isFinite(parsed)?{retryAfterMs:parsed}:{})};
              }
              await options?.onResponse?.(response,responseModel);
            }});
          let message:AssistantMessage|undefined;
          const iterator=source[Symbol.asyncIterator]();
          let onAbort:()=>void=()=>{};
          const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(new GenerationFailure("unknown_result","MODEL_CANCELLED"));signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)onAbort();});
          try {
            while(true){
              const next=await Promise.race([iterator.next(),aborted]);
              if(next.done)break;
              const event=next.value;
              signal.throwIfAborted();
              if(event.type==="done"){message=event.message;break;}
              if(event.type==="error"){
                if(!hasOutput && responseFact && responseFact.status>=400 && responseFact.status<=599)throw generationFailure(responseFact,false);
                throw new GenerationFailure("unknown_result","MODEL_STREAM_ERROR");
              }
              hasOutput ||= event.type!=="start";push(event);
            }
          } finally {
            signal.removeEventListener("abort",onAbort);
            void iterator.return?.().catch(()=>{});
          }
          if(!message)throw new Error("MODEL_STREAM_INCOMPLETE");
          canonical=piAssistantToCanonical(message);
          const usage=canonical.usage;
          settling=true;
          const settlement=await deps.call("settleGenerationCall",{callId,status:"settled",providerResult:canonical,usage:{inputTokens:usage.inputTokens.total,outputTokens:usage.outputTokens.total,totalTokens:usage.inputTokens.total!+usage.outputTokens.total!,inputTokenDetails:{noCacheTokens:usage.inputTokens.noCache,cacheReadTokens:usage.inputTokens.cacheRead,cacheWriteTokens:usage.inputTokens.cacheWrite},outputTokenDetails:{textTokens:usage.outputTokens.text,reasoningTokens:usage.outputTokens.reasoning}}});
          const confirmed=z.object({callId:z.string(),status:z.literal("settled")}).parse(settlement);
          if(confirmed.callId!==callId)throw new Error("MODEL_SETTLEMENT_RECEIPT_MISMATCH");
          terminalSettled=true;
        }
        const message=canonicalToPiAssistant(canonical);
        await deps.onSettled(callId,canonical);
        signal.throwIfAborted();
        push({type:"done",reason:message.stopReason as "stop"|"length"|"toolUse",message});resolve(message);
      }catch(error){
        const classified=error instanceof GenerationFailure?error:generationFailure(error,hasOutput);
        failure=settling || terminalSettled || !nativeBegan ? new GenerationFailure("unknown_result","MODEL_RECEIPT_REQUIRES_RECONCILIATION") : classified;
        if(nativeBegan && !terminalSettled && !settling && callId){
          try{
            const status=classified.outcome==="unknown_result"?"unknown":"rejected";
            const receipt=z.object({callId:z.string(),status:z.enum(["unknown","rejected"])}).parse(await deps.call("settleGenerationCall",{callId,status}));
            if(receipt.callId!==callId || receipt.status!==status)throw new Error("MODEL_SETTLEMENT_RECEIPT_MISMATCH");
          }catch{failure=new GenerationFailure("unknown_result","MODEL_SETTLEMENT_RECEIPT_UNKNOWN");}
        }
        try{deps.onFailure?.(failure as GenerationFailure);}catch{/* Observer errors cannot rewrite the persisted call outcome. */}
        reject(failure);
      }finally{finished=true;wake();}
    })();
    return {result:()=>result,async *[Symbol.asyncIterator](){while(true){if(queue.length){yield queue.shift()!;continue;}if(finished){if(failure)throw failure;return;}await new Promise<void>(r=>{wake=r;});}}} as unknown as ReturnType<StreamFunction>;
  }) as StreamFunction;
}
