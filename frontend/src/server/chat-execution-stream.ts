import {humanizeAiError} from '@/lib/ai-error-humanize';
import type {RequestContext} from '@creatoros/contract';
import type {ChatRuntime} from './persistence-client';

/** 将既有持久事件传给 useChat；HTTP 只拥有订阅，不拥有持久任务。 */
export function chatExecutionResponse(runtime:ChatRuntime['durable'],ctx:RequestContext,
 input:{executionTaskId:string;sourceMessageId:string;conversationId:string},requestSignal:AbortSignal){
 const subscription=new AbortController(),encoder=new TextEncoder();
 let ended=false,approvalPending=false,controller:ReadableStreamDefaultController<Uint8Array>;
 async function* chunks(){
  try{
   if(subscription.signal.aborted)return;
   yield {type:'start',messageId:`chat:${input.sourceMessageId}`};
   // 迭代器只在 pull 中推进；暂停读取时最多持有当前有限事件页。
   for await(const page of runtime.subscribe(ctx,input.executionTaskId,subscription.signal)){
    for(const event of page.events){
     if(subscription.signal.aborted)return;
     if((event.chunk as {type?:string}).type==='tool-approval-request')approvalPending=true;
     yield event.chunk;
    }
    if(page.hasMore)continue;
    // SDK 原有 metadata 通道传递持久状态；错误文案不能表达资源的释放归属。
    yield {type:'message-metadata',messageMetadata:{execution:{executionTaskId:input.executionTaskId,status:page.status}}};
    if(['waiting_user','paused','unknown_result','blocked'].includes(page.status)){
     if(page.status==='waiting_user'&&!approvalPending){
      const task=await runtime.get(ctx,input.executionTaskId);
      if(subscription.signal.aborted)return;
      yield {type:'error',errorText:humanizeAiError(new Error([task.errorCode,task.errorMessage].filter(Boolean).join(': ')))?.message??'本次执行需要你处理权限、登录或模型配置，处理后再继续。'};
     }
     if(page.status==='unknown_result'){
      const task=await runtime.get(ctx,input.executionTaskId);
      if(subscription.signal.aborted)return;
      yield {type:'error',errorText:task?.errorCode==='MODEL_RESULT_UNKNOWN'?'CHAT_MODEL_RESPONSE_INTERRUPTED':'CHAT_RESULT_UNCONFIRMED'};
     }else if(page.status!=='waiting_user')yield {type:'error',errorText:'本次对话已停止，已完成内容已保留。'};
     break;
    }
    if(page.status==='failed'){
     const task=await runtime.get(ctx,input.executionTaskId);
     if(subscription.signal.aborted)return;
     yield {type:'error',errorText:humanizeAiError(new Error([task.errorCode,task.errorMessage].filter(Boolean).join(': ')))?.message??'本次执行未完成，请检查模型配置后重试。'};
    }
    if(page.status==='cancelled')yield {type:'abort'};
   }
   if(!subscription.signal.aborted)yield '[DONE]';
  }catch{
   if(!subscription.signal.aborted)yield {type:'error',errorText:'聊天事件连接中断，已完成内容仍保存在原任务中。'};
  }finally{subscription.abort();}
 }
 const iterator=chunks();
 const finish=(close:boolean)=>{
  if(ended)return;
  ended=true;requestSignal.removeEventListener('abort',detach);subscription.abort();
  // 已发出的读取可能尚未返回；先结束连接，退出迭代器在其原读取返回后完成。
  void iterator.return(undefined).catch(()=>{});
  if(close)controller.close();
 };
 const detach=()=>finish(true);
 const body=new ReadableStream<Uint8Array>({
  start(c){controller=c;requestSignal.addEventListener('abort',detach,{once:true});if(requestSignal.aborted)detach();},
  async pull(c){
   const next=await iterator.next();
   if(ended)return;
   if(next.done){finish(true);return;}
   c.enqueue(encoder.encode(next.value==='[DONE]'?'data: [DONE]\n\n':`data: ${JSON.stringify(next.value)}\n\n`));
  },
  cancel(){finish(false);},
 },{highWaterMark:0});
 return new Response(body,{headers:{'content-type':'text/event-stream','cache-control':'no-cache','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':input.conversationId,'x-execution-task-id':input.executionTaskId}});
}
