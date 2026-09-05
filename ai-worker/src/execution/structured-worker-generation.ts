import { workerStructuredResultSchema,workerReservationSchema,workerStartReceiptSchema,type WorkerPort, type structuredGenerationInputSchema,type workerModelSpecSchema } from "@creatoros/contract/execution-worker";
import type { z } from "zod";
import { modelFor } from "../runtime/provider-factory";
import { runStructuredNode } from "../nodes/structured-node";
import { getEffectiveTemplate,runWithEffectiveSkillSnapshot } from "../prompt/effective-skill-runtime";
import { createDurableGenerationModel } from "./durable-generation-model";
import { GenerationFailure,generationFailure } from "./generation-error";

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
    const result=await runWithEffectiveSkillSnapshot(input.skillSnapshot,()=>runStructuredNode({model,template:getEffectiveTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,signal}));
    signal.throwIfAborted();
    if(!lastCallId)throw new Error("STRUCTURED_CALL_MISSING");
    const text=JSON.stringify(workerStructuredResultSchema.parse(result));
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
