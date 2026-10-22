import {z} from "zod";
import {chatGenerationPreparationSchema,executionModelSpecSchema,workerReservationSchema,workerStartReceiptSchema,agenticToolOutcomeSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {runChatStructuredSequence} from "./chat-structured-sequence";
import {runWithEffectiveSkillSnapshot} from "../prompt/effective-skill-runtime";
import {modelFor} from "../runtime/provider-factory";
import {createDurableGenerationModel} from "./durable-generation-model";
import {findGenerationFailure,generationFailure} from "./generation-error";
import {DurableToolSuspension} from "./durable-agentic-tool";
/** Worker 运行原结构化节点；最终候选只接受宿主依据真实回执生成的结果。 */
export async function runChatGenerationInWorker(callId:string,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 const spec=executionModelSpecSchema.parse(await call("resolveChatGenerationCredential",{callId},signal));
 const prepared=chatGenerationPreparationSchema.parse(await call("prepareChatGeneration",{callId},signal));
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:prepared.operationKey,signal,allowUnconfirmedModelRetry:true,ports:{
  // 模型请求是 JSON 契约；advanced IPC 会保留 SDK 的可选 undefined，必须在边界规范化。
  reserve:async input=>workerReservationSchema.parse(await call("reserveChatGenerationModel",JSON.parse(JSON.stringify({...input,callId,...(prepared.retryOfCallId && input.operationKey===prepared.retryOperationKey?{retryOfCallId:prepared.retryOfCallId}:{})})),signal)),
  start:async childId=>{const saved=workerStartReceiptSchema.parse(await call("startChatGenerationModel",{callId:childId},signal));if(saved.callId!==childId)throw new Error("生成启动回执不符");},
  settle:async(childId,input)=>{const saved=z.object({callId:z.string(),status:z.string()}).parse(await call("settleChatGenerationModel",{callId:childId,...input}));if(saved.callId!==childId || saved.status!==input.status)throw new Error("生成结算回执不符");},
 }});
 const complete=async()=>agenticToolOutcomeSchema.parse(await call("completeChatGeneration",{callId},signal));
 try{
  await runWithEffectiveSkillSnapshot(prepared.skillSnapshot,()=>runChatStructuredSequence(prepared.node,model,prepared.maxOutputTokens,signal));
 }catch(error){
  signal.throwIfAborted();
  // 已确认坏结构或结算 ACK 丢失可由宿主重建成功/失败；此处不会重发模型。
  const failure=findGenerationFailure(error)??generationFailure(error,false);
  // 已结算的发送前失败没有可回放的供应商回执，直接报告真实原因。
  if(failure.errorCode!=="MODEL_REQUEST_BUILD_FAILED"){
   try{return await complete();}catch{/* 有未确认调用时交给原任务停止语义。 */}
  }
  if(failure.outcome==="unknown_result")throw failure;
  const report={callId,outcome:failure.outcome,errorCode:failure.errorCode,retryAfterMs:failure.retryAfterMs};
  const saved=z.object({status:z.enum(["retry_wait","waiting_user","failed"])}).parse(await call("failChatGeneration",report).catch(()=>call("failChatGeneration",report)));
  throw new DurableToolSuspension(saved.status,failure.errorCode,failure.retryAfterMs,failure.errorMessage);
 }
 return complete();
}
