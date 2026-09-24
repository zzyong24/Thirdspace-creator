import {ENDPOINTS} from "@creatoros/contract";

/** 一次聊天请求绑定一个持久任务；短暂断线与用户明确停止使用不同控制路径。 */
export function createChatTaskControl(){
 type Turn={response:Promise<Response>;headers:Headers;taskId?:string;cancelKey:string};
 let active:Turn|undefined;
 let currentTaskId:string|undefined;
 const triggerOf=(body:BodyInit|null|undefined)=>{
  if(typeof body!=="string")return undefined;
  try{const parsed=JSON.parse(body) as {trigger?:unknown};return typeof parsed.trigger==="string"?parsed.trigger:undefined;}
  catch{return undefined;}
 };
 return {
  async fetch(input:RequestInfo,init?:RequestInit){
   // 新用户消息开启新的执行轮，不能把上一轮任务回执错绑到本轮；regenerate 属于同轮重连，
   // 即使本次 HTTP 失败也保留之前已收到的真实任务 id。
   if(triggerOf(init?.body)==="submit-message")currentTaskId=undefined;
   const turn:Turn={response:Promise.resolve().then(()=>fetch(input,init)),headers:new Headers(init?.headers),cancelKey:crypto.randomUUID()};
   active=turn;
   const response=await turn.response;
   turn.taskId=response.headers.get("x-execution-task-id")??undefined;
   if(turn.taskId)currentTaskId=turn.taskId;
   return response;
  },
  currentTaskId(){return currentTaskId??null;},
  async cancel(){
   const turn=active;if(!turn)return;
   // 点击停止发生在响应头之前时等待提交回执，不因中断HTTP丢失任务标识。
   const response=await turn.response;
   const taskId=turn.taskId??response.headers.get("x-execution-task-id")??currentTaskId;
   if(!taskId){if(!response.ok)return;throw new Error("CHAT_TASK_RECEIPT_MISSING");}
   const endpoint=ENDPOINTS.commandExecutionTasks;
   const body=endpoint.body!.parse({taskIds:[taskId],command:"cancel",idempotencyKey:`chat-stop:${turn.cancelKey}`});
   const headers=new Headers(turn.headers);headers.set("content-type","application/json");
   const result=await fetch("/api/v1/dispatch",{method:"POST",headers,credentials:"same-origin",body:JSON.stringify({id:endpoint.id,input:{body}})});
   if(!result.ok)throw new Error("CHAT_STOP_NOT_CONFIRMED");
  },
 };
}
