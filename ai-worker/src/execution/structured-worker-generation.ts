import { StructuredOutputError } from "../nodes/structured-node";
import { findStructuredOutputError } from "../nodes/structured-output-error";
import { findGenerationFailure } from "./generation-error";
import {generateText} from "ai";
import {parseClassification,classificationSchema} from "../prompt/templates/asset-processing";
import {runTopicWorkerPipeline} from "./topic-worker-pipeline";
import {createTopicWorkerReads} from "./topic-worker-reads";
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


export async function generateStructuredInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>,image?:{bytes:Uint8Array;mimeType:string}){
  let lastCallId:string|undefined;
  const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
    async reserve(request){
      // JSON IPC 的序列化形式也是后端摘要输入；不携带 undefined 或进程对象。
      let raw:unknown;
      try{raw=await call("reserveGenerationCall",JSON.parse(JSON.stringify(request,(_key,value)=>value instanceof Uint8Array?Buffer.from(value).toString("base64"):value)),signal);}
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
    let businessSchema: ReturnType<typeof resolveStructuredBusinessSchema>;
    // 同步输入解析尚未预留或启动模型；供应商/节点/结算异常不进入此边界。
    try {
      businessSchema=resolveStructuredBusinessSchema(input);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        throw new GenerationFailure("failed", "STRUCTURED_INPUT_INVALID");
      throw error;
    }
    const runClassification=async()=>{
      if(!image)throw new Error("CLASSIFICATION_IMAGE_MISSING");
      const template=getEffectiveTemplate('asset.classify');
      const result=await generateText({model,abortSignal:signal,maxRetries:0,maxOutputTokens:input.maxOutputTokens,messages:[{role:'user',content:[{type:'image',image:Buffer.from(image.bytes).toString('base64'),mediaType:image.mimeType},{type:'text',text:template.system}]}]});
      let object:z.infer<typeof classificationSchema>;
      try{object=classificationSchema.parse(parseClassification(result.text));}
      catch(error){throw new StructuredOutputError("结构化节点:分类输出不合法",{cause:error});}
      const usage={inputTokens:result.usage.inputTokens??null,outputTokens:result.usage.outputTokens??null,cachedTokens:result.usage.inputTokenDetails?.cacheReadTokens??null,totalTokens:result.usage.totalTokens??null};
      return {object,generation:{finishReason:result.finishReason,usage,attempts:[{finishReason:result.finishReason,usage,kind:'initial' as const}]}};
    };
    const runTopic=async()=>{const reads=createTopicWorkerReads({signal,call});try{return await runTopicWorkerPipeline(JSON.parse(input.facets.__topicGenerate??"null"),{model,signal,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,read:reads.read});}finally{await reads.close();}};
    const result=await runWithEffectiveSkillSnapshot<{object:unknown;generation:WorkerStructuredResult["generation"];validation?:WorkerStructuredResult["validation"]}>(input.skillSnapshot,()=>input.skillId==="asset.classify" ? runClassification() : input.skillId==="topic.generate" ? runTopic() : input.skillId==="script.draft" ? runScriptWorkerPipeline(JSON.parse(input.facets.__scriptDraft ?? "null"),{model,signal,maxOutputTokens:input.maxOutputTokens,onVoiceover:async value=>{
      if(!lastCallId)throw new GenerationFailure("unknown_result","SCRIPT_VOICEOVER_CALL_MISSING");
      try{await call("saveScriptVoiceover",{callId:lastCallId,...value},signal);}
      catch{throw new GenerationFailure("unknown_result","SCRIPT_VOICEOVER_RECEIPT_UNKNOWN");}
    }}) : runStructuredNode<unknown>({model,template:getEffectiveTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,signal,...reviewOptions,...(businessSchema?{outputSchema:businessSchema}:{})}));
    signal.throwIfAborted();
    if((input.skillId==="script.review" || input.skillId==="copilot.assist" || (input.skillId==="topic.generate" && input.facets.__dailyTopic!==undefined)) && result.validation?.status==="partial")throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
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
    const knownFailure=findGenerationFailure(error);
    if(knownFailure)throw knownFailure;
    if(findStructuredOutputError(error))throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    throw generationFailure(error,false);
  }
}
