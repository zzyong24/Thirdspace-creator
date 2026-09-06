import {agenticToolOutcomeSchema,chatResearchPreparationSchema,chatResearchObservationSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import type {ResearchToolExecutor} from "./research-worker-tools";
/** 只将原始搜索观察交回宿主；卡片格式与结算由宿主根据真实父调用确定。 */
export async function runChatResearchInWorker(callId:string,signal:AbortSignal,call:(port:WorkerPort,input:unknown,signal?:AbortSignal)=>Promise<unknown>,research:ResearchToolExecutor){
 const prepared=chatResearchPreparationSchema.parse(await call("prepareChatResearch",{callId},signal));signal.throwIfAborted();
 const output=!prepared.available?{status:"error",summary:"应用的浏览器搜索能力未接入",error:{code:"no_evidence",retryable:false,recovery:"当前任务没有搜索端口，可基于已有资料继续"}}:!prepared.query?{status:"ok",data:{results:[]},error:null}:await research.execute("web.search",{query:prepared.query,count:prepared.count},{callId,signal});
 signal.throwIfAborted();
 const observation=chatResearchObservationSchema.parse(output.status==="ok"?{status:"ok",results:(output as {data?:{results?:unknown}}).data?.results}:{status:output.status,summary:output.summary,error:output.error,...((output as {data?:{recoveryState?:unknown}}).data?.recoveryState==="browser_runtime_unavailable"?{recoveryState:"browser_runtime_unavailable"}:{})});
 // 回执丢失只重发同一结算，不重复搜索；宿主回读第一次保存的结果。
 return agenticToolOutcomeSchema.parse(await call("settleChatResearch",{callId,observation}).catch(()=>call("settleChatResearch",{callId,observation})));
}

const resources=new Set<{close():Promise<void>}>();
export async function createChatResearchResources(signal:AbortSignal,call:(port:WorkerPort,input:unknown,signal?:AbortSignal)=>Promise<unknown>){
 signal.throwIfAborted();const {createResearchWorkerTools}=await import("./research-worker-tools");signal.throwIfAborted();
 const executor=createResearchWorkerTools({signal,call});resources.add(executor);
 const searches=new Map<string,Promise<Awaited<ReturnType<ResearchToolExecutor["execute"]>>>>();
 return {...executor,async execute(name:string,input:unknown,scope:{callId:string;signal:AbortSignal}){
  if(name!=="web.search")return executor.execute(name,input,scope);
  scope.signal.throwIfAborted();signal.throwIfAborted();
  const key=JSON.stringify(input);let pending=searches.get(key);
  if(!pending){pending=executor.execute(name,input,scope);searches.set(key,pending);}
  try{const output=await pending;scope.signal.throwIfAborted();if(output.status!=="ok")searches.delete(key);return structuredClone(output);}
  catch(error){searches.delete(key);throw error;}
 },async close(){try{await executor.close();}finally{searches.clear();resources.delete(executor);}}};
}
export async function closeChatResearchResources(){await Promise.all([...resources].map(resource=>resource.close()));resources.clear();}
