import type {RequestContext} from '@creatoros/contract';
import type {ChatRuntime} from './persistence-client';

/** 将既有持久事件传给 useChat，不在 HTTP 生命周期执行模型或另写 assistant。 */
export function chatExecutionResponse(runtime:ChatRuntime['durable'],ctx:RequestContext,
 input:{executionTaskId:string;sourceMessageId:string;conversationId:string},requestSignal:AbortSignal){
 const subscription=new AbortController(),encoder=new TextEncoder();
 let ended=false;
 const cancelTask=()=>{subscription.abort();void runtime.command(ctx,input.executionTaskId,'cancel').catch(()=>{});};
 requestSignal.addEventListener('abort',cancelTask,{once:true});
 const body=new ReadableStream<Uint8Array>({
  async start(controller){
   const send=(chunk:unknown)=>{if(!ended)controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));};
   try{
    if(requestSignal.aborted){cancelTask();return;}
    send({type:'start',messageId:`chat:${input.sourceMessageId}`});
    for await(const page of runtime.subscribe(ctx,input.executionTaskId,subscription.signal)){
     for(const event of page.events)send(event.chunk);
     if(page.hasMore)continue;
     if(['waiting_user','paused','unknown_result','blocked'].includes(page.status)){
      if(page.status!=='waiting_user')send({type:'error',errorText:page.status==='unknown_result'?'本次执行结果尚未确认，请在任务中心核对原任务，避免重复操作。':'本次执行已暂停，请在任务中心继续。'});
      break;
     }
     if(page.status==='failed')send({type:'error',errorText:'本次执行未完成，请在任务中心查看原因后重试。'});
     if(page.status==='cancelled')send({type:'abort'});
    }
    if(!ended)controller.enqueue(encoder.encode('data: [DONE]\n\n'));
   }catch{
    if(!subscription.signal.aborted)send({type:'error',errorText:'聊天事件连接中断，已完成内容仍保存在原任务中。'});
   }finally{
    requestSignal.removeEventListener('abort',cancelTask);subscription.abort();
    if(!ended){ended=true;controller.close();}
   }
  },
  cancel(){ended=true;cancelTask();requestSignal.removeEventListener('abort',cancelTask);},
 });
 return new Response(body,{headers:{'content-type':'text/event-stream','cache-control':'no-cache','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':input.conversationId,'x-execution-task-id':input.executionTaskId}});
}
