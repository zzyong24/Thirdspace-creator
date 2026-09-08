import {z} from "zod";
import {videoFrozenSchema,workerModelSpecSchema,workerReservationSchema,workerStartReceiptSchema,workerStructuredResultSchema,type structuredGenerationInputSchema,type WorkerPort,type WorkerStructuredResult} from "@creatoros/contract/execution-worker";
import {runVideoDecisions,type VideoDecisionsDeps,type BrollAssetRef,type StoryboardSectionRef} from "../runtime/video-decisions-runner";
import {modelFor} from "../runtime/provider-factory";
import {runStructuredNode} from "../nodes/structured-node";
import {getEffectiveTemplate,runWithEffectiveSkillSnapshot} from "../prompt/effective-skill-runtime";
import {createDurableGenerationModel} from "./durable-generation-model";
import {GenerationFailure} from "./generation-error";
export async function runVideoDecisionsInWorker(input:z.infer<typeof structuredGenerationInputSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 const frozen=videoFrozenSchema.parse(JSON.parse(input.facets.__videoDecisions??"null"));
 const context={userId:input.skillSnapshot.userId,accountId:input.skillSnapshot.accountId,requestId:`video:${frozen.task.id}`,source:"ai" as const};
 const counts=new Map<string,number>(),generations:WorkerStructuredResult["generation"][]=[];
 let candidate:Record<string,unknown>|undefined,failure:string|undefined;
 const deps:VideoDecisionsDeps={
  ai:{async markRunning(){return {};},async recordStep(_ctx,_id,step){signal.throwIfAborted();return call("recordVideoStep",step,signal);},async recordCandidate(_ctx,id,result){signal.throwIfAborted();if(id!==frozen.task.id||result.resultType!=="video_decisions")throw new Error("VIDEO_CANDIDATE_OWNER_MISMATCH");candidate=result.resultData;return {};},async cancelTask(_ctx,_id,error){failure=error??"VIDEO_DECISIONS_FAILED";return {};},async getTaskRuntimeData(_ctx,id){if(id!==frozen.task.retryOfTaskId)throw new Error("VIDEO_RETRY_OWNER_MISMATCH");return frozen.retryRuntime;},async putVideoDecisionsCheckpoint(_ctx,id,checkpoint){if(id!==frozen.task.id)throw new Error("VIDEO_CHECKPOINT_OWNER_MISMATCH");await call("saveVideoCheckpoint",{checkpoint},signal);}},
  async resolveModelSpec(){throw new Error("VIDEO_UNSCOPED_MODEL_FORBIDDEN");},
  async listBrollInventory(){signal.throwIfAborted();return frozen.inventory as unknown as BrollAssetRef[];},
  async readStoryboard(){signal.throwIfAborted();return frozen.storyboard as unknown as StoryboardSectionRef[];},
  async callStructured(node){
   signal.throwIfAborted();const index=(counts.get(node.skillId)??0)+1;counts.set(node.skillId,index);
   const spec=workerModelSpecSchema.parse(await call("resolveVideoModel",{skillId:node.skillId},signal));
   const model=createDurableGenerationModel({model:modelFor(spec),operationKey:`${input.operationKey}/video/${node.skillId}/${index}`,signal,ports:{
    async reserve(request){return workerReservationSchema.parse(await call("reserveVideoModel",{skillId:node.skillId,...JSON.parse(JSON.stringify(request))},signal));},
    async start(callId){const receipt=workerStartReceiptSchema.parse(await call("startCall",{callId},signal));if(receipt.callId!==callId)throw new Error("VIDEO_START_RECEIPT_MISMATCH");},
    async settle(callId,settlement){await call("settleGenerationCall",{callId,...settlement});},
   }});
   const result=await runStructuredNode({model,template:getEffectiveTemplate(node.skillId),facets:node.facets,outputSchema:node.outputSchema,normalizeObject:node.normalizeObject,timeoutMs:node.timeoutMs,signal,maxOutputTokens:input.maxOutputTokens});
   generations.push(result.generation);return result.object;
  },
 };
 await runWithEffectiveSkillSnapshot(input.skillSnapshot,()=>runVideoDecisions(context,frozen.task,deps));
 signal.throwIfAborted();if(!candidate)throw new GenerationFailure("failed",failure?"VIDEO_DECISIONS_FAILED":"VIDEO_CANDIDATE_MISSING");
 const keys=["inputTokens","outputTokens","cachedTokens","totalTokens"] as const;
 const usage=Object.fromEntries(keys.map(key=>[key,generations.some(value=>value.usage[key]===null)?null:generations.reduce((sum,value)=>sum+(value.usage[key]??0),0)]));
 const text=JSON.stringify(workerStructuredResultSchema.parse({object:candidate,generation:{finishReason:generations.at(-1)?.finishReason??"no_model_required",usage,attempts:generations.flatMap(value=>value.attempts)}}));
 const saved=z.object({callId:z.string().min(1)}).parse(await call("saveVideoResult",{text},signal));
 return {callId:saved.callId,text};
}
