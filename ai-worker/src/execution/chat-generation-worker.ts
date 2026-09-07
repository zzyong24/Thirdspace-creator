import {z} from "zod";
import {chatGenerationPreparationSchema,workerModelSpecSchema,workerReservationSchema,workerStartReceiptSchema,agenticToolOutcomeSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {getTemplate} from "../prompt/registry";
import {runWithEffectiveSkillSnapshot} from "../prompt/effective-skill-runtime";
import {runStructuredNode} from "../nodes/structured-node";
import {modelFor} from "../runtime/provider-factory";
import {createDurableGenerationModel} from "./durable-generation-model";
import {generationFailure} from "./generation-error";
import {DurableToolSuspension} from "./durable-agentic-tool";
/** Worker 运行原结构化节点；最终候选只接受宿主依据真实回执生成的结果。 */
export async function runChatGenerationInWorker(callId:string,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 const spec=workerModelSpecSchema.parse(await call("resolveChatGenerationCredential",{callId},signal));
 const prepared=chatGenerationPreparationSchema.parse(await call("prepareChatGeneration",{callId},signal));
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:prepared.operationKey,signal,ports:{
  // 模型请求是 JSON 契约；advanced IPC 会保留 SDK 的可选 undefined，必须在边界规范化。
  reserve:async input=>workerReservationSchema.parse(await call("reserveChatGenerationModel",JSON.parse(JSON.stringify({...input,callId,...(prepared.retryOfCallId && input.operationKey===prepared.retryOperationKey?{retryOfCallId:prepared.retryOfCallId}:{})})),signal)),
  start:async childId=>{const saved=workerStartReceiptSchema.parse(await call("startChatGenerationModel",{callId:childId},signal));if(saved.callId!==childId)throw new Error("生成启动回执不符");},
  settle:async(childId,input)=>{const saved=z.object({callId:z.string(),status:z.string()}).parse(await call("settleChatGenerationModel",{callId:childId,...input}));if(saved.callId!==childId || saved.status!==input.status)throw new Error("生成结算回执不符");},
 }});
 const complete=async()=>agenticToolOutcomeSchema.parse(await call("completeChatGeneration",{callId},signal));
 try{
  await runWithEffectiveSkillSnapshot(prepared.skillSnapshot,()=>runStructuredNode({model,template:getTemplate(prepared.node.capability),facets:prepared.node.facets,maxOutputTokens:prepared.maxOutputTokens,signal}));
 }catch(error){
  signal.throwIfAborted();
  // 已确认坏结构或结算 ACK 丢失可由宿主重建成功/失败；此处不会重发模型。
  try{return await complete();}catch{/* 有未确认调用时交给原任务停止语义。 */}
  const failure=generationFailure(error,false);
  if(failure.outcome==="unknown_result")throw failure;
  const report={callId,outcome:failure.outcome,errorCode:failure.errorCode,retryAfterMs:failure.retryAfterMs};
  const saved=z.object({status:z.enum(["retry_wait","waiting_user","failed"])}).parse(await call("failChatGeneration",report).catch(()=>call("failChatGeneration",report)));
  throw new DurableToolSuspension(saved.status,failure.errorCode,failure.retryAfterMs);
 }
 return complete();
}
