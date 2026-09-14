import {humanizeAiError} from '@/lib/ai-error-humanize';
import type {RequestContext} from '@creatoros/contract';
import type {ChatRuntime} from './persistence-client';

/** 将既有持久事件传给 useChat，不在 HTTP 生命周期执行模型或另写 assistant。 */
export function chatExecutionResponse(runtime:ChatRuntime['durable'],ctx:RequestContext,
 input:{executionTaskId:string;sourceMessageId:string;conversationId:string},requestSignal:AbortSignal){
 const subscription=new AbortController(),encoder=new TextEncoder();
 let ended=false,approvalPending=false;
 // 订阅断开只释放事件连接；任务停止由显式命令提交。
 const detach=()=>subscription.abort();
 requestSignal.addEventListener('abort',detach,{once:true});
 const body=new ReadableStream<Uint8Array>({
  async start(controller){
   const send=(chunk:unknown)=>{if(!ended)controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));};
   try{
    if(requestSignal.aborted){detach();return;}
    send({type:'start',messageId:`chat:${input.sourceMessageId}`});
    for await(const page of runtime.subscribe(ctx,input.executionTaskId,subscription.signal)){
     for(const event of page.events){
      if((event.chunk as {type?:string}).type==='tool-approval-request')approvalPending=true;
      send(event.chunk);
     }
     if(page.hasMore)continue;
     if(['waiting_user','paused','unknown_result','blocked'].includes(page.status)){
      if(page.status==='waiting_user'&&!approvalPending){
       const task=await runtime.get(ctx,input.executionTaskId);
       send({type:'error',errorText:humanizeAiError(new Error(task.errorMessage??task.errorCode??''))?.message??'本次执行需要你处理权限、登录或模型配置，处理后再继续。'});
      }
      if(page.status==='unknown_result'){
       const task=await runtime.get(ctx,input.executionTaskId);
       // 模型未返回完整回复与外部操作回执未知不同；不让用户到任务中心查账。
       send({type:'error',errorText:task?.errorCode==='MODEL_RESULT_UNKNOWN'?'CHAT_MODEL_RESPONSE_INTERRUPTED':'CHAT_RESULT_UNCONFIRMED'});
      }else if(page.status!=='waiting_user')send({type:'error',errorText:'本次对话已停止，已完成内容已保留。'});
      break;
     }
     if(page.status==='failed'){
      const task=await runtime.get(ctx,input.executionTaskId);
      send({type:'error',errorText:humanizeAiError(new Error(task.errorMessage??task.errorCode??''))?.message??'本次执行未完成，请检查模型配置后重试。'});
     }
     if(page.status==='cancelled')send({type:'abort'});
    }
    if(!ended)controller.enqueue(encoder.encode('data: [DONE]\n\n'));
   }catch{
    if(!subscription.signal.aborted)send({type:'error',errorText:'聊天事件连接中断，已完成内容仍保存在原任务中。'});
   }finally{
    requestSignal.removeEventListener('abort',detach);subscription.abort();
    if(!ended){ended=true;controller.close();}
   }
  },
  cancel(){ended=true;detach();requestSignal.removeEventListener('abort',detach);},
 });
 return new Response(body,{headers:{'content-type':'text/event-stream','cache-control':'no-cache','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':input.conversationId,'x-execution-task-id':input.executionTaskId}});
}
