import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import type {AiService,CreateTaskInput} from "./ai.service";
import {AttemptPayloadMismatchError} from "./ai.errors";
import {canonicalJson} from "./canonical-json";

type Task=Awaited<ReturnType<AiService["createTask"]>>;
const jsonObject=(value:unknown)=>z.record(z.string(),z.json()).parse(JSON.parse(JSON.stringify(value)));
/** 同一宿主提交复用首次快照和原派发链；不自动重试网络或供应商失败。 */
export function createAiTaskSubmissionService(deps:{
 findTaskByAttempt:AiService["findTaskByAttempt"];
 submit:AiService["createTask"];
}){
 return {async submit(ctx:RequestContext,request:CreateTaskInput & {attemptId:string},options:{
  snapshotKeys?:readonly string[];
  prepareSnapshot?:(context:RequestContext,inputData:Readonly<Record<string,unknown>>)=>Promise<Record<string,unknown>>;
  signal?:AbortSignal;
 }={}){
  const context=structuredClone(ctx),body={...structuredClone(request),inputData:jsonObject(request.inputData??{})};
  const snapshotKeys=new Set(options.snapshotKeys??[]),signal=options.signal,prepareSnapshot=options.prepareSnapshot;
  if(Object.keys(body.inputData).some(key=>snapshotKeys.has(key)))throw new Error("提交意图字段不能同时属于动态快照");
  const lookup=()=>deps.findTaskByAttempt(context,body.taskType,body.attemptId);
  const replay=(task:Task)=>{
   // SEMANTIC_BOUNDARY_ALLOW:仅验证相同提交键的明确输入，不做内容理解或创作选择。
   const stable=Object.fromEntries(Object.entries(task.inputData??{}).filter(([key])=>!snapshotKeys.has(key)));
   if(task.taskType!==body.taskType || task.attemptId!==body.attemptId || (task.retryOfTaskId??null)!==(body.retryOfTaskId??null) || canonicalJson(stable)!==canonicalJson(body.inputData))throw new AttemptPayloadMismatchError(task.id);
   signal?.throwIfAborted();
   // 仍经过原提交/派发入口，恢复首次建任务后尚未派发的窗口；同键全输入仍由 AI service 核对。
   return deps.submit(context,{...body,inputData:structuredClone(task.inputData??{})});
  };
  signal?.throwIfAborted();
  const previous=await lookup();
  signal?.throwIfAborted();
  if(previous)return replay(previous);
  const snapshot=jsonObject(await prepareSnapshot?.(structuredClone(context),structuredClone(body.inputData))??{});
  if(Object.keys(snapshot).some(key=>!snapshotKeys.has(key)))throw new Error("提交准备返回了未声明的快照字段");
  signal?.throwIfAborted();
  try{return await deps.submit(context,{...body,inputData:{...body.inputData,...snapshot}});}
  catch(error){
   // 只处理并发首次提交的确定性指纹冲突；回读赢家后继续相同任务，未知响应原样交给调用方。
   if(!(error instanceof AttemptPayloadMismatchError))throw error;
   signal?.throwIfAborted();
   const winner=await lookup();
   if(!winner)throw error;
   return replay(winner);
  }
 }};
}
