import {fork,type ChildProcess} from "node:child_process";
import {randomUUID} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import {buildChildEnv} from "../execution/child-env";
/** 单一复用进程、两条实际在途请求；无业务任务、结果缓存或自动未知重试。 */
export function createRequestIoService(deps:{entryPath:()=>string;extraEnv?:Record<string,string>;timeoutMs?:number;parseInput(input:unknown):unknown;parseResponse(raw:unknown):{type:"ready"}|{type:"result";requestId:string;value:unknown}|{type:"error";requestId:string;message:string}}){
 const timeoutMs=deps.timeoutMs??30000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>2147483647)throw new Error("REQUEST_IO_DEADLINE_INVALID");
 type Request={id:string;input:unknown;sent:boolean;done:boolean;resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;cleanup:()=>void};
 const requests=new Map<string,Request>();let child:ChildProcess|null=null,ready=false,stopped=false,stopping:Promise<void>|null=null;
 function finish(request:Request,error?:Error,value?:unknown){if(request.done)return;request.done=true;clearTimeout(request.timer);request.cleanup();error?request.reject(error):request.resolve(value!);}
 function lose(process:ChildProcess){if(child!==process)return;child=null;ready=false;for(const request of requests.values())finish(request,new Error("REQUEST_IO_UNKNOWN"));requests.clear();}
 function terminate(process:ChildProcess){if(child===process)ready=false;process.kill("SIGKILL");}
 function pump(){
  if(stopped||!requests.size)return;
  if(!child){
   let process:ChildProcess;try{process=fork(deps.entryPath(),[],{serialization:"advanced",env:buildChildEnv(deps.extraEnv),execArgv:[],stdio:["ignore","ignore","ignore","ipc"]});}catch{for(const request of requests.values())finish(request,new Error("REQUEST_IO_UNAVAILABLE"));requests.clear();return;}
   child=process;
   process.on("error",()=>{terminate(process);});process.once("close",()=>lose(process));
   process.on("message",raw=>{
    if(child!==process)return;let message:ReturnType<typeof deps.parseResponse>;try{message=deps.parseResponse(raw);}catch{terminate(process);return;}
    if(message.type==="ready"){ready=true;pump();return;}
    const request=requests.get(message.requestId);if(!request||!request.sent){terminate(process);return;}
    if(message.type==="result")finish(request,undefined,message.value);
    else finish(request,new Error(message.message));
    requests.delete(request.id);pump();
   });
  }
  if(!ready||!child)return;
  let slots=2-[...requests.values()].filter(request=>request.sent).length;
  for(const request of requests.values())if(!request.sent&&!request.done&&slots>0){request.sent=true;slots--;const process=child;process.send(request.input as never,error=>{if(error)terminate(process);});}
 }
 return {
  request(ctx:RequestContext,payload:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>{
   if(stopped)return Promise.reject(new Error("REQUEST_IO_STOPPED"));if(signal?.aborted)return Promise.reject(signal.reason);
   if(!ctx.userId||!ctx.requestId)return Promise.reject(new Error("REQUEST_IO_SCOPE_REQUIRED"));
   const requestId=`${ctx.requestId}:${randomUUID()}`,deadlineAt=Date.now()+timeoutMs;
   const input=deps.parseInput({...payload,requestId,deadlineAt});
   return new Promise((resolve,reject)=>{
    const request:Request={id:requestId,input,sent:false,done:false,resolve,reject,timer:null as never,cleanup:()=>signal?.removeEventListener("abort",cancel)};
    const cancel=()=>{
     finish(request,new Error(signal?.aborted?"REQUEST_IO_CANCELLED":"REQUEST_IO_DEADLINE"));
     if(!request.sent){requests.delete(request.id);pump();return;}
     const process=child;if(process?.connected)process.send({type:"cancel",requestId});
     // 不提前回收真实在途槽；迟到无 ACK 时终止进程，其他在途请求诚实失败。
     setTimeout(()=>{if(requests.get(request.id)===request&&child===process&&process)terminate(process);},1000).unref();
    };
    request.timer=setTimeout(cancel,Math.max(0,deadlineAt-Date.now()));signal?.addEventListener("abort",cancel,{once:true});requests.set(requestId,request);if(signal?.aborted)cancel();else pump();
   });
  },
  stop():Promise<void>{
   if(stopping)return stopping;stopped=true;
   for(const request of requests.values())finish(request,new Error("REQUEST_IO_STOPPED"));
   const process=child;requests.clear();if(!process)return Promise.resolve();
   stopping=new Promise(resolve=>{process.once("close",()=>resolve());terminate(process);});return stopping;
  },
 };
}
