import {ENDPOINTS} from "@creatoros/contract";

/** 一次聊天请求绑定一个持久任务；短暂断线与用户明确停止使用不同控制路径。 */
export function createChatTaskControl(){
 type Turn={response:Promise<Response>;headers:Headers;taskId?:string;cancelKey:string};
 let active:Turn|undefined;
 return {
  get executionTaskId(){return active?.taskId;},
  get turnKey(){return active?.cancelKey;},
  release(){active=undefined;},
  async fetch(input:RequestInfo,init?:RequestInit){
   const turn:Turn={response:Promise.resolve().then(()=>fetch(input,init)),headers:new Headers(init?.headers),cancelKey:crypto.randomUUID()};
   active=turn;
   const response=await turn.response;
   turn.taskId=response.headers.get("x-execution-task-id")??undefined;
   return response;
  },
  async cancel(){
   const turn=active;if(!turn)return false;
   // 点击停止发生在响应头之前时等待提交回执，不因中断HTTP丢失任务标识。
   const response=await turn.response;
   const taskId=turn.taskId??response.headers.get("x-execution-task-id");
   if(!taskId){if(!response.ok)return false;throw new Error("CHAT_TASK_RECEIPT_MISSING");}
   const endpoint=ENDPOINTS.commandExecutionTasks;
   const body=endpoint.body!.parse({taskIds:[taskId],command:"cancel",idempotencyKey:`chat-stop:${turn.cancelKey}`});
   const headers=new Headers(turn.headers);headers.set("content-type","application/json");
   const result=await fetch("/api/v1/dispatch",{method:"POST",headers,credentials:"same-origin",body:JSON.stringify({id:endpoint.id,input:{body}})});
   if(!result.ok)throw new Error("CHAT_STOP_NOT_CONFIRMED");
   // 只放弃明确停止的本轮观察归属，不把 accepted/cancel_requested 写成服务端终态。
   if(active!==turn)return false;
   active=undefined;
   return true;
  },
 };
}
