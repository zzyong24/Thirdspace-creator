import { resolveStructuredBusinessSchema } from "./structured-business-schema";
import {runScriptWorkerPipeline} from "./script-worker-pipeline";
import { workerStructuredResultSchema,workerReservationSchema,workerStartReceiptSchema,type WorkerStructuredResult,type WorkerPort, type structuredGenerationInputSchema,type workerModelSpecSchema } from "@creatoros/contract/execution-worker";
import { z } from "zod";
import { modelFor } from "../runtime/provider-factory";
import { runStructuredNode } from "../nodes/structured-node";
import { getEffectiveTemplate,runWithEffectiveSkillSnapshot } from "../prompt/effective-skill-runtime";
import { createDurableGenerationModel } from "./durable-generation-model";
import { GenerationFailure,generationFailure } from "./generation-error";
import { scriptReviewSchema, normalizeScriptReviewOutput, isCompleteRawScriptReview } from "../prompt/templates/script-review";


export async function generateStructuredInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
  let lastCallId:string|undefined;
  const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
    async reserve(request){
      // JSON IPC 的序列化形式也是后端摘要输入；不携带 undefined 或进程对象。
      let raw:unknown;
      try{raw=await call("reserveGenerationCall",JSON.parse(JSON.stringify(request)),signal);}
      catch(error){if(error instanceof GenerationFailure)throw error;const code=error instanceof Error?error.message:"HOST_PORT_REJECTED";throw new GenerationFailure(["HOST_PORT_TIMEOUT","WORKER_DISCONNECTED"].includes(code)?"unknown_result":"failed","MODEL_RESERVATION_REJECTED");}
      let receipt;
      try{receipt=workerReservationSchema.parse(raw);}catch{throw new GenerationFailure("unknown_result","MODEL_RESERVATION_RECEIPT_INVALID");}
      lastCallId=receipt.callId;
      return receipt;
    },
    async start(callId){const receipt=workerStartReceiptSchema.parse(await call("startCall",{callId},signal));if(receipt.callId!==callId)throw new Error("CALL_RECEIPT_MISMATCH");},
    async settle(callId,settlement){await call("settleGenerationCall",{callId,...settlement});},
  }});
  try{
    // 审核是固定业务协议，Skill快照仍控制提示词，但不能用旧/宽松schema把空对象当报告。
    const reviewOptions=input.skillId==="script.review"?{
      outputSchema:scriptReviewSchema.refine(isCompleteRawScriptReview,"审核原始报告不完整"),
      normalizeObject:(raw:unknown)=>{
        if(!isCompleteRawScriptReview(raw))throw new Error("审核原始报告不完整");
        return normalizeScriptReviewOutput(raw);
      },
      reasoningFallback:{acceptRaw:isCompleteRawScriptReview},
    }:{};
    const businessSchema=resolveStructuredBusinessSchema(input);
    const result=await runWithEffectiveSkillSnapshot<{object:unknown;generation:WorkerStructuredResult["generation"];validation?:WorkerStructuredResult["validation"]}>(input.skillSnapshot,()=>input.skillId==="script.draft" ? runScriptWorkerPipeline(JSON.parse(input.facets.__scriptDraft ?? "null"),{model,signal,maxOutputTokens:input.maxOutputTokens,onVoiceover:async value=>{
      if(!lastCallId)throw new GenerationFailure("unknown_result","SCRIPT_VOICEOVER_CALL_MISSING");
      try{await call("saveScriptVoiceover",{callId:lastCallId,...value},signal);}
      catch{throw new GenerationFailure("unknown_result","SCRIPT_VOICEOVER_RECEIPT_UNKNOWN");}
    }}) : runStructuredNode<unknown>({model,template:getEffectiveTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,signal,...reviewOptions,...(businessSchema?{outputSchema:businessSchema}:{})}));
    signal.throwIfAborted();
    if(input.skillId==="script.review" && result.validation?.status==="partial")throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    // 即使未来节点新增恢复路径，业务协议也必须在保存结果之前满足。
    if(businessSchema && !businessSchema.safeParse(result.object).success)throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");

    // 原生结构化成功不走节点的文本normalizer；在已通过固定协议的报告上统一补描述字段。
    const object=input.skillId==="script.review"?scriptReviewSchema.parse(normalizeScriptReviewOutput(result.object)):result.object;
    const text=JSON.stringify(workerStructuredResultSchema.parse({...result,object,modelLabel:spec.model}));
    if(!lastCallId){
      if(input.skillId!=="script.draft")throw new Error("STRUCTURED_CALL_MISSING");
      try{const receipt=await call("saveScriptFallback",{text},signal) as {callId?:unknown;text?:unknown};if(typeof receipt.callId!=="string" || !receipt.callId || typeof receipt.text!=="string")throw new Error("CALL_RECEIPT_MISMATCH");const saved=workerStructuredResultSchema.parse(JSON.parse(receipt.text));const shotsSchema=z.object({shots:z.array(z.object({口播:z.string()})).min(1)});if(saved.generation.finishReason!=="deterministic_fallback" || saved.validation?.status!=="partial" || shotsSchema.parse(saved.object).shots.map(s=>s.口播).join("")!==shotsSchema.parse(object).shots.map(s=>s.口播).join(""))throw new Error("CALL_RECEIPT_MISMATCH");return {callId:receipt.callId,text:receipt.text};}
      catch{throw new GenerationFailure("unknown_result","SCRIPT_FALLBACK_RECEIPT_UNKNOWN");}
    }
    try{await call("saveGenerationResult",{callId:lastCallId,text},signal);}
    catch{throw new GenerationFailure("unknown_result","STRUCTURED_RESULT_RECEIPT_UNKNOWN");}
    return {callId:lastCallId,text};
  }catch(error){
    signal.throwIfAborted();
    if(error instanceof GenerationFailure)throw error;
    const failure=generationFailure(error,false);
    // 结构化节点校验失败不代表供应商提交未知；账本已持久化真实调用事实。
    if(failure.outcome==="unknown_result")throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    throw failure;
  }
}
