import {setTimeout as delay} from "node:timers/promises";
import {z} from "zod";
import {assetGenerationInputSchema,assetCredentialSchema,assetResultReceiptSchema,workerReservationSchema,workerStartReceiptSchema,providerJobSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {generateImage,generateVideo,type GeneratedAsset} from "../runtime/multimodal-factory";
import {createMinimaxAdapter} from "../runtime/multimodal-minimax";
import {createOpenaiImagesAdapter} from "../runtime/multimodal-openai-images";
import {createOmnihiVideoAdapter} from "../runtime/multimodal-omnihi";
import {classifyLlmError,getRetryAfterMs} from "../runtime/retry-policy";
import {GenerationFailure,generationFailure} from "./generation-error";
type Input=z.infer<typeof assetGenerationInputSchema>;
type Credential=z.infer<typeof assetCredentialSchema>;
const recoverySchema=z.discriminatedUnion("status",[z.object({status:z.literal("committed"),receipt:assetResultReceiptSchema}).strict(),z.object({status:z.enum(["missing","bytes_missing"])}).strict()]);
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
type Generate=(input:Input,spec:Credential,signal:AbortSignal,options:{resumeJobId?:string;idempotencyKey:string;onJobSubmitted:(id:string)=>Promise<void>})=>Promise<GeneratedAsset>;
const generate:Generate=async(input,spec,signal,options)=>{
 const fetchBound:typeof fetch=(url,init)=>{signal.throwIfAborted();return fetch(url,{...init,signal});};
 const sleep=(ms:number)=>delay(ms,undefined,{signal});
 const omnihi=createOmnihiVideoAdapter({fetch:fetchBound,sleep,pollIntervalMs:5000,maxPollAttempts:120,maxTransientAttempts:1});
 const registry={minimax:createMinimaxAdapter({fetch:fetchBound,sleep,pollIntervalMs:5000,maxPollAttempts:120,h3MaxPollAttempts:240}),openai:createOpenaiImagesAdapter({fetch:fetchBound,sleep,maxTransientAttempts:1}),omnihi,seedance:omnihi,seeddance:omnihi};
 const result=await (input.mediaKind==="image"?generateImage(spec,{prompt:input.prompt,aspectRatio:input.aspectRatio,idempotencyKey:options.idempotencyKey},registry):generateVideo(spec,{prompt:input.prompt,aspectRatio:input.aspectRatio,durationSec:input.durationSec,resolution:input.resolution,signal,...options},registry));
 signal.throwIfAborted();return result;
};
/** 恢复先于供应商动作；只使用后端持久化的原调用和原任务号。 */
export async function runAssetInWorker(input:Input,signal:AbortSignal,call:Call,generateAsset:Generate=generate){
 const reservation=workerReservationSchema.parse(await call("reserveAssetCall",{},signal)),callId=reservation.callId;
 let started=false,jobKnown=false;
 try{
  let job:z.infer<typeof providerJobSchema>|null=null;
  if(["started","unknown","settled"].includes(reservation.status)){
   started=true;
   const recovery=recoverySchema.parse(await call("recoverAssetResult",{callId},signal));
   if(recovery.status==="committed")return {callId,text:JSON.stringify(recovery.receipt)};
   const raw=await call("readAssetProviderJob",{callId},signal);job=raw===null?null:providerJobSchema.parse(raw);
   if(!job || input.mediaKind!=="video")throw new GenerationFailure("unknown_result","ASSET_ORIGINAL_RESULT_UNKNOWN");
   jobKnown=true;
   if(job.provider!==input.provider || job.model!==input.model || job.baseUrl!==input.baseUrl || job.serviceId!==input.serviceId)throw new GenerationFailure("unknown_result","ASSET_JOB_IDENTITY_MISMATCH");
  }else if(reservation.status!=="reserved")throw new GenerationFailure("unknown_result","ASSET_CALL_NOT_ADMITTED");
  let spec:Credential;
  try{spec=assetCredentialSchema.parse(await call("resolveAssetCredential",{callId},signal));}catch{throw new GenerationFailure(started?"unknown_result":"waiting_user","ASSET_CREDENTIAL_UNAVAILABLE");}
  if(spec.provider!==input.provider || spec.model!==input.model || spec.baseUrl!==input.baseUrl || spec.serviceId!==input.serviceId || spec.kind!==input.mediaKind)throw new GenerationFailure(started?"unknown_result":"waiting_user","ASSET_CREDENTIAL_IDENTITY_MISMATCH");
  signal.throwIfAborted();
  if(!started){started=true;const receipt=workerStartReceiptSchema.parse(await call("startAssetCall",{callId},signal));if(receipt.callId!==callId)throw new Error("ASSET_START_RECEIPT_INVALID");}
  const result=await generateAsset(input,spec,signal,{resumeJobId:job?.jobId,idempotencyKey:`execution-asset:${callId}`,onJobSubmitted:async jobId=>{
   jobKnown=true;
   await call("recordAssetProviderJob",{callId,job:{schemaVersion:1,provider:input.provider,model:input.model,baseUrl:input.baseUrl,...(input.serviceId?{serviceId:input.serviceId}:{}),jobId}});
  }});
  signal.throwIfAborted();
  try{
   const receipt=assetResultReceiptSchema.parse(await call("saveAssetResult",{callId,bytes:result.assetBytes},signal));
   return {callId,text:JSON.stringify(receipt)};
  }catch(error){
   signal.throwIfAborted();
   const recovered=recoverySchema.parse(await call("recoverAssetResult",{callId},signal));
   if(recovered.status!=="committed")throw error;
   return {callId,text:JSON.stringify(recovered.receipt)};
  }
 }catch(error){
  if(!started)throw error;
  // SEMANTIC_BOUNDARY_ALLOW: 只根据明确提交阶段 HTTP 拒绝执行预算重试，不判断内容语义。
  const e=error as {stage?:string;status?:number;reason?:string;retryAfterMs?:number};
  const rejected=!jobKnown && !signal.aborted && e?.stage==="submit" && typeof e.status==="number" && e.status>=400 && e.status<500 && e.status!==408;
  const classification=classifyLlmError(error);
  const recoverable=jobKnown && !signal.aborted && (e?.stage==="poll" || e?.stage==="download") && (classification.retryable || (typeof e.status!=="number" && (e.reason==="network" || e.reason==="timeout")));
  const retryAfterMs=typeof e?.retryAfterMs==="number" && Number.isFinite(e.retryAfterMs) && e.retryAfterMs>=0?e.retryAfterMs:getRetryAfterMs(error,Date.now,Infinity)??undefined;
  const failure=rejected?generationFailure(error,false):new GenerationFailure("unknown_result",recoverable?"ASSET_RECONCILE_RETRYABLE":"ASSET_RESULT_UNKNOWN",recoverable?retryAfterMs:undefined);
  try{await call("settleAssetCall",{callId,status:rejected?"rejected":"unknown"});}catch{throw new GenerationFailure("unknown_result","ASSET_SETTLEMENT_UNKNOWN");}
  throw failure;
 }
}
