import {ENDPOINTS} from "@creatoros/contract";

/** 一次聊天请求绑定一个持久任务；短暂断线与用户明确停止使用不同控制路径。 */
export function createChatTaskControl(){
 type Turn={response:Promise<Response>;headers:Headers;taskId?:string;cancelKey:string;controller:AbortController;headersReady:boolean};
 let active:Turn|undefined;
 let currentTaskId:string|undefined;
 let observationReleased=false;
 let stopOutcome:"waiting_stopped"|"cancel_requested"|undefined;
 const triggerOf=(body:BodyInit|null|undefined)=>{
  if(typeof body!=="string")return undefined;
  try{const parsed=JSON.parse(body) as {trigger?:unknown};return typeof parsed.trigger==="string"?parsed.trigger:undefined;}
  catch{return undefined;}
 };
 return {
  get executionTaskId(){return active?.taskId??(observationReleased?undefined:currentTaskId);},
  get stopOutcome(){return stopOutcome;},
  get waitingForHeaders(){return !!active&&!active.headersReady;},
  get turnKey(){return active?.cancelKey;},
  release(){active=undefined;currentTaskId=undefined;observationReleased=false;stopOutcome=undefined;},
  async fetch(input:RequestInfo,init?:RequestInit){
   // 新用户消息开启新的执行轮，不能把上一轮任务回执错绑到本轮；regenerate 属于同轮重连，
   // 即使本次 HTTP 失败也保留之前已收到的真实任务 id。
   if(triggerOf(init?.body)==="submit-message")currentTaskId=undefined;
   const controller=new AbortController();
   const signal=init?.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal;
   const turn:Turn={response:Promise.resolve().then(()=>fetch(input,{...init,signal})),headers:new Headers(init?.headers),cancelKey:crypto.randomUUID(),controller,headersReady:false};
   active=turn;observationReleased=false;stopOutcome=undefined;
   const response=await turn.response;
   if(active!==turn||controller.signal.aborted)throw new DOMException("原请求观察已结束，提交结果请核对原任务","AbortError");
   turn.headersReady=true;
   turn.taskId=response.headers.get("x-execution-task-id")??undefined;
   if(active===turn&&turn.taskId)currentTaskId=turn.taskId;
   return response;
  },
  currentTaskId(){return currentTaskId??null;},
  async cancel(){
   const turn=active;if(!turn)return false;
   // 无回执时只停止本轮HTTP观察；服务端提交结果未知，不能猜任务ID或发重复取消。
   if(!turn.headersReady){
    active=undefined;observationReleased=true;stopOutcome="waiting_stopped";turn.controller.abort();return true;
   }
   const response=await turn.response;
   const taskId=turn.taskId??response.headers.get("x-execution-task-id")??currentTaskId;
   if(!taskId){if(!response.ok)return false;throw new Error("CHAT_TASK_RECEIPT_MISSING");}
   const endpoint=ENDPOINTS.commandExecutionTasks;
   const body=endpoint.body!.parse({taskIds:[taskId],command:"cancel",idempotencyKey:`chat-stop:${turn.cancelKey}`});
   const headers=new Headers(turn.headers);headers.set("content-type","application/json");
   const result=await fetch("/api/v1/dispatch",{method:"POST",headers,credentials:"same-origin",body:JSON.stringify({id:endpoint.id,input:{body}})});
   if(!result.ok)throw new Error("CHAT_STOP_NOT_CONFIRMED");
   // 只放弃明确停止的本轮观察归属，不把 accepted/cancel_requested 写成服务端终态。
   if(active!==turn)return false;
   active=undefined;observationReleased=true;stopOutcome="cancel_requested";
   return true;
  },
 };
}
