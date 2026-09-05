import { workerStructuredResultSchema,workerReservationSchema,workerStartReceiptSchema,type WorkerPort, type structuredGenerationInputSchema,type workerModelSpecSchema } from "@creatoros/contract/execution-worker";
import type { z } from "zod";
import { modelFor } from "../runtime/provider-factory";
import { runStructuredNode } from "../nodes/structured-node";
import { getEffectiveTemplate,runWithEffectiveSkillSnapshot } from "../prompt/effective-skill-runtime";
import { createDurableGenerationModel } from "./durable-generation-model";
import { GenerationFailure,generationFailure } from "./generation-error";
import { scriptReviewSchema, normalizeScriptReviewOutput, isCompleteRawScriptReview } from "../prompt/templates/script-review";

import { reviewInsightsSchema } from "../prompt/templates/review-insights";
import { contractSchema, PLANNING_CONTRACT_SLOTS } from "../prompt/templates/planning-contract";

// SEMANTIC_BOUNDARY_ALLOW: 仅保证后端投影至少能取出一项，不判断经验或合同内容质量。
const reviewCandidateSchema=reviewInsightsSchema.refine(value=>value.learnings.some(item=>item.title.trim()),"至少需要一条非空标题经验");
const contractCandidateSchema=contractSchema.refine(value=>PLANNING_CONTRACT_SLOTS.some(slot=>value[slot.title]?.trim() || value[slot.id]?.trim()),"至少需要一个已知合同槽正文");

export async function generateStructuredInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
  let lastCallId:string|undefined;
  const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
    async reserve(request){
      // JSON IPC 的序列化形式也是后端摘要输入；不携带 undefined 或进程对象。
      const receipt=workerReservationSchema.parse(await call("reserveGenerationCall",JSON.parse(JSON.stringify(request)),signal));
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
    const businessSchema=input.skillId==="review.insights" ? reviewCandidateSchema : input.skillId==="planning.contract" ? contractCandidateSchema : undefined;
    const result=await runWithEffectiveSkillSnapshot(input.skillSnapshot,()=>runStructuredNode<unknown>({model,template:getEffectiveTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,signal,...reviewOptions,...(businessSchema?{outputSchema:businessSchema}:{})}));
    signal.throwIfAborted();
    if(input.skillId==="script.review" && result.validation?.status==="partial")throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    // 即使未来节点新增恢复路径，业务协议也必须在保存结果之前满足。
    if(businessSchema && !businessSchema.safeParse(result.object).success)throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    if(!lastCallId)throw new Error("STRUCTURED_CALL_MISSING");
    // 原生结构化成功不走节点的文本normalizer；在已通过固定协议的报告上统一补描述字段。
    const object=input.skillId==="script.review"?scriptReviewSchema.parse(normalizeScriptReviewOutput(result.object)):result.object;
    const text=JSON.stringify(workerStructuredResultSchema.parse({...result,object,modelLabel:spec.model}));
    try{await call("saveGenerationResult",{callId:lastCallId,text},signal);}
    catch{throw new GenerationFailure("unknown_result","STRUCTURED_RESULT_RECEIPT_UNKNOWN");}
    return {callId:lastCallId,text};
  }catch(error){
    if(error instanceof GenerationFailure)throw error;
    const failure=generationFailure(error,false);
    // 结构化节点校验失败不代表供应商提交未知；账本已持久化真实调用事实。
    if(failure.outcome==="unknown_result")throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
    throw failure;
  }
}
