import {z} from "zod";
import {coverImageReadinessSchema,workerReservationSchema,workerStartReceiptSchema,type structuredGenerationInputSchema,type workerModelSpecSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {getTemplate} from "../prompt/registry";
import {runWithEffectiveSkillSnapshot} from "../prompt/effective-skill-runtime";
import {runStructuredNode} from "../nodes/structured-node";
import {modelFor} from "../runtime/provider-factory";
import {createDurableGenerationModel} from "./durable-generation-model";
import {runAssetInWorker,generateAssetInWorkerRuntime} from "./asset-worker-run";
import {GenerationFailure} from "./generation-error";
/** 文案与图片在同一个持久任务内执行；模型结果与图片字节均先结算再提交候选。 */
export async function runCoverInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 if(!["cover.brief","graphic.card-brief"].includes(input.skillId)||input.capability!=="copy.generate")throw new Error("COVER_TASK_MISMATCH");
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
  reserve:async request=>{try{return workerReservationSchema.parse(await call("reserveCoverModel",JSON.parse(JSON.stringify(request)),signal));}catch{signal.throwIfAborted();throw new GenerationFailure("unknown_result","COVER_MODEL_RESERVATION_UNKNOWN");}},
  start:async callId=>{const result=workerStartReceiptSchema.parse(await call("startCoverModel",{callId},signal));if(result.callId!==callId)throw new GenerationFailure("unknown_result","COVER_START_ACK_UNKNOWN");},
  settle:async(callId,settlement)=>{const result=z.object({callId:z.string(),status:z.string()}).parse(await call("settleCoverModel",{callId,...settlement}));if(result.callId!==callId||result.status!==settlement.status)throw new GenerationFailure("unknown_result","COVER_SETTLEMENT_ACK_UNKNOWN");},
 }});
 // prepare 可以从已结算原模型回执恢复，成功时绝不重跑文案模型。
 const prepare=async()=>{try{return coverImageReadinessSchema.parse(await call("prepareCoverImage",{},signal));}catch{signal.throwIfAborted();throw new GenerationFailure("unknown_result","COVER_IMAGE_PREPARATION_UNKNOWN");}};
 let readiness=await prepare();
 if(readiness.status==="pending"){
  await runWithEffectiveSkillSnapshot(input.skillSnapshot,()=>runStructuredNode({model,template:getTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,signal}));
  readiness=await prepare();
 }
 if(readiness.status!=="prepared")throw new GenerationFailure("unknown_result","COVER_IMAGE_PREPARATION_INCOMPLETE");
 const prepared=readiness.value;
 let imageCallId:string|undefined;
 const imageCall:typeof call=async(port,data,currentSignal)=>{const value=await call(port,data,currentSignal);if(port==="reserveAssetCall")imageCallId=workerReservationSchema.parse(value).callId;return value;};
 return runAssetInWorker(prepared.input,signal,imageCall,async(imageInput,credential,currentSignal,options)=>{
  let referenceImage:{bytes:Uint8Array;mimeType:string}|undefined;
  if(prepared!.reference){
   if(!imageCallId)throw new GenerationFailure("unknown_result","COVER_IMAGE_CALL_MISSING");
   referenceImage=z.object({bytes:z.instanceof(Uint8Array),mimeType:z.string().min(1)}).parse(await call("readCoverReference",{callId:imageCallId},currentSignal));
  }
  return generateAssetInWorkerRuntime(imageInput,credential,currentSignal,{...options,...(referenceImage?{referenceImage}:{})});
 });
}
