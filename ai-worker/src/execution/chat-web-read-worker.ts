import {z} from "zod";
import {agenticToolOutcomeSchema,chatWebReadObservationSchema,chatWebReadFailureSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {acquireWebDocument,type WebReadWorkflowPorts} from "../runtime/browser/web-read-workflow";
import type {ReadResult} from "../runtime/browser/web-reader";
import {BrowserRuntimeUnavailableError} from "../runtime/browser/browser-launch";
import {UrlBlockedError} from "../runtime/browser/url-guard";
import {ResearchReadBlockedError} from "./research-worker-tools";
import {GenerationFailure} from "./generation-error";
const preparation=z.object({url:z.string().url(),observation:chatWebReadObservationSchema.nullable(),evidenceRef:z.string().nullable(),output:agenticToolOutcomeSchema.optional()}).strict();
const cacheResult=z.discriminatedUnion("status",[z.object({status:z.literal("miss")}).strict(),z.object({status:z.literal("hit"),output:agenticToolOutcomeSchema}).strict()]);
interface Dependencies {
 call(port:WorkerPort,input:unknown,signal?:AbortSignal):Promise<unknown>;
 readDocument(url:string,scope:{callId:string;signal:AbortSignal}):Promise<ReadResult>;
 searchers:WebReadWorkflowPorts["searchers"];
 hasSession:WebReadWorkflowPorts["hasSession"];
}
/** Worker 只读取事实；缓存、素材与最终卡片仍由真实父调用的宿主端口确认。 */
export async function runChatWebReadInWorker(callId:string,signal:AbortSignal,deps:Dependencies){
 const host=async(port:WorkerPort,input:unknown,requestSignal?:AbortSignal)=>{
  try{return await deps.call(port,input,requestSignal);}catch{requestSignal?.throwIfAborted();throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RECEIPT_UNKNOWN");}
 };
 const settle=async(port:"completeChatWebRead"|"failChatWebRead",input:unknown)=>{
  // 只重投同一结算，绝不重新访问网页；再次未知交给执行账本处理。
  const result=await host(port,input).catch(()=>host(port,input));
  return agenticToolOutcomeSchema.parse(result);
 };
 signal.throwIfAborted();
 const prepared=preparation.parse(await host("prepareChatWebRead",{callId},signal));signal.throwIfAborted();
 const reconcile=async(expected?:ReturnType<typeof chatWebReadObservationSchema.parse>)=>{
  // 回执未知只查原父调用一次；没有对应事实时不重复网页、缓存或观察写入。
  signal.throwIfAborted();
  let confirmed:ReturnType<typeof preparation.parse>;
  try{confirmed=preparation.parse(await host("prepareChatWebRead",{callId},signal));}
  catch{signal.throwIfAborted();throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RECONCILIATION_UNKNOWN");}
  signal.throwIfAborted();
  if(confirmed.url!==prepared.url)throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RECONCILIATION_MISMATCH");
  if(confirmed.output)return confirmed.output;
  // SEMANTIC_BOUNDARY_ALLOW: 比较同 schema 的完整协议事实，仅防止对账接受另一份观察，不判断内容语义。
  if(!expected || !confirmed.evidenceRef || !confirmed.observation || JSON.stringify(confirmed.observation)!==JSON.stringify(expected))throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RECONCILIATION_MISMATCH");
  return settle("completeChatWebRead",{callId});
 };
 if(prepared.output)return prepared.output;
 if(prepared.observation){
  await host("restoreChatWebRead",{callId},signal);signal.throwIfAborted();
  return settle("completeChatWebRead",{callId});
 }
 let cached:ReturnType<typeof cacheResult.parse>;
 try{cached=cacheResult.parse(await host("readChatWebReadCache",{callId},signal));}
 catch{signal.throwIfAborted();return reconcile();}
 signal.throwIfAborted();
 if(cached.status==="hit")return cached.output;
 let acquired:Awaited<ReturnType<typeof acquireWebDocument>>;
 try{
  acquired=await acquireWebDocument({url:prepared.url,signal},{read:(url)=>deps.readDocument(url,{callId,signal}),searchers:deps.searchers,hasSession:deps.hasSession,rethrowError:error=>error instanceof GenerationFailure});
 }catch(error){
  signal.throwIfAborted();if(error instanceof GenerationFailure)throw error;
  const blocked=error instanceof ResearchReadBlockedError?error.outcome:null;
  if(blocked?.sideEffect==="unknown" || blocked?.error?.code==="unknown_commit")throw new GenerationFailure("unknown_result","CHAT_WEB_READ_RESULT_UNKNOWN");
  const runtime=error instanceof BrowserRuntimeUnavailableError || (blocked?.data as {recoveryState?:unknown}|undefined)?.recoveryState==="browser_runtime_unavailable";
  const failure=runtime?{kind:"browser_runtime_unavailable"}:(blocked?.error?.code==="needs_login" || blocked?.error?.code==="captcha")?{kind:"needs_login"}:{kind:"read_error",code:error instanceof UrlBlockedError || blocked?.error?.code==="permission"?"permission":blocked?.error?.code==="no_evidence"?"no_evidence":"transient",message:blocked?.summary??(error instanceof Error?error.message:String(error))};
  return settle("failChatWebRead",chatWebReadFailureSchema.parse({callId,failure}));
 }
 signal.throwIfAborted();
 if("needLogin" in acquired)return settle("failChatWebRead",{callId,failure:{kind:"needs_login"}});
 if("blocked" in acquired)return settle("failChatWebRead",chatWebReadFailureSchema.parse({callId,failure:{kind:"http_blocked",status:acquired.status,message:acquired.message,alternates:acquired.alternates}}));
 const parsed=chatWebReadObservationSchema.safeParse(acquired.read);
 if(!parsed.success)return settle("failChatWebRead",{callId,failure:{kind:"read_error",code:"no_evidence",message:"网页正文或抽取诊断不符合读取约束"}});
 const observation=parsed.data;
 try{await host("observeChatWebRead",{callId,observation},signal);}
 catch{signal.throwIfAborted();return reconcile(observation);}
 signal.throwIfAborted();
 return settle("completeChatWebRead",{callId});
}
