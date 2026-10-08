// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {chatExecutionResponse} from './chat-execution-stream';
import {humanizeAiErrorMessage} from '@/lib/ai-error-humanize';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createDb,eq,executionTasks} from '@creatoros/backend';
import {ENDPOINTS} from '@creatoros/contract';
import {getLiveChatSession,acquireLiveChatSession} from '../features/copilot/live-chat-session';
import {createPersistentTaskService} from '../../../backend/src/modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../../../backend/src/modules/execution/execution-call-ledger.service';
import {createExecutionStreamService,subscribeExecutionStream} from '../../../backend/src/modules/execution/execution-stream.service';
import {DefaultChatTransport,readUIMessageStream} from 'ai';

const context={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
const input={executionTaskId:'original',sourceMessageId:'message',conversationId:'conversation'};
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

it('没有消费者时不读取事件页，慢消费者按需求推进且事件不重不丢',async()=>{
 let pages=0,released=false;
 const runtime={subscribe:async function*(){try{for(let i=0;i<100;i++){pages++;yield {events:[{chunk:{type:'text-delta',id:'text',delta:String(i)}}],hasMore:i<99,status:'succeeded'};}}finally{released=true;}},get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const response=chatExecutionResponse(runtime,context,input,new AbortController().signal);
 await turn();expect(pages).toBe(0);
 const reader=response.body!.getReader();
 expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"start"');
 await turn();expect(pages).toBe(0);
 const chunks:string[]=[];
 for(let i=0;i<100;i++){
  chunks.push(new TextDecoder().decode((await reader.read()).value));
  if(i===2){await turn();expect(pages).toBe(3);}
 }
 expect(chunks.map(s=>JSON.parse(s.slice(6)).delta)).toEqual(Array.from({length:100},(_,i)=>String(i)));
 expect(new TextDecoder().decode((await reader.read()).value)).toContain('"status":"succeeded"');
 expect(new TextDecoder().decode((await reader.read()).value)).toContain('[DONE]');
 expect((await reader.read()).done).toBe(true);expect(released).toBe(true);
});

it('读取中断或请求abort释放订阅，不提交原持久任务取消',async()=>{
 for(const abortRequest of [false,true]){
  let signal:AbortSignal|undefined,released=false;
  const request=new AbortController();
  const runtime={subscribe:async function*(_ctx:unknown,_id:string,s:AbortSignal){signal=s;try{yield {events:[{chunk:{type:'text-delta',id:'text',delta:'已保存'}}],hasMore:true,status:'running'};await new Promise<void>(resolve=>s.addEventListener('abort',()=>resolve(),{once:true}));}finally{released=true;}},get:vi.fn(),command:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
  const reader=chatExecutionResponse(runtime,context,input,request.signal).body!.getReader();
  await reader.read();await reader.read();
  if(abortRequest){const pending=reader.read();request.abort();await pending;}else await reader.cancel();
  await turn();expect(signal?.aborted).toBe(true);expect(released).toBe(true);
  expect((runtime as unknown as {command:ReturnType<typeof vi.fn>}).command).not.toHaveBeenCalled();
 }
});

it('进入前已abort不读页；已发送存储读取迟到不向断开的响应回写',async()=>{
 const early=new AbortController();early.abort();
 const empty={subscribe:vi.fn(),get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 expect(await chatExecutionResponse(empty,context,input,early.signal).text()).toBe('');expect(empty.subscribe).not.toHaveBeenCalled();
 const request=new AbortController();let release!:()=>void,released=false;
 const storage=new Promise<void>(resolve=>{release=resolve;});
 const runtime={subscribe:async function*(){try{await storage;yield {events:[{chunk:{type:'text-delta',id:'text',delta:'迟到'}}],hasMore:false,status:'succeeded'};}finally{released=true;}},get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const reader=chatExecutionResponse(runtime,context,input,request.signal).body!.getReader();
 await reader.read();const pending=reader.read();await turn();request.abort();
 expect((await pending).done).toBe(true);release();await turn();expect(released).toBe(true);
});

it.each(['waiting_user','paused','blocked','failed','cancelled'] as const)('保留%s终态与审批客户端协议',async(status)=>{
 const runtime={subscribe:async function*(){yield {events:[],hasMore:false,status};},get:async()=>({errorMessage:'供应商连接失败'})} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const body=await chatExecutionResponse(runtime,context,input,new AbortController().signal).text();
 expect(body).toContain(status==='cancelled'?'"type":"abort"':'"type":"error"');expect(body).toContain('[DONE]');
});

it('等待审批保留审批卡，不额外产生配置错误',async()=>{
 const runtime={subscribe:async function*(){yield {events:[{chunk:{type:'tool-approval-request',approvalId:'approval',toolCallId:'call'}}],hasMore:false,status:'waiting_user'};},get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const body=await chatExecutionResponse(runtime,context,input,new AbortController().signal).text();expect(body).toContain('tool-approval-request');expect(body).not.toContain('"type":"error"');expect(runtime.get).not.toHaveBeenCalled();
});

it('实际聊天SDK传输与消息消费仍还原同一assistant正文',async()=>{
 const runtime={subscribe:async function*(){yield {events:[{chunk:{type:'text-start',id:'text'}},{chunk:{type:'text-delta',id:'text',delta:'第一段'}},{chunk:{type:'text-delta',id:'text',delta:'第二段'}},{chunk:{type:'text-end',id:'text'}},{chunk:{type:'finish'}}],hasMore:false,status:'succeeded'};},get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const response=chatExecutionResponse(runtime,context,input,new AbortController().signal);
 const transport=new DefaultChatTransport({fetch:async()=>response});
 const stream=(await transport.reconnectToStream({chatId:'conversation'}))!;
 let result;for await(const message of readUIMessageStream({stream,terminateOnError:true}))result=message;
 expect(result).toMatchObject({id:'chat:message',role:'assistant',parts:[{type:'text',text:'第一段第二段'}]});
});

it.each(['waiting_user','unknown_result','paused','blocked','succeeded','failed','cancelled'] as const)('实际SDK在%s结束前取得原任务的结构化状态，无审批卡也可区分待处理与终态',async(status)=>{
 const runtime={subscribe:async function*(){yield {events:[{chunk:{type:'text-start',id:'text'}},{chunk:{type:'text-delta',id:'text',delta:'已保存正文'}},{chunk:{type:'text-end',id:'text'}}],hasMore:false,status};},get:async()=>({errorMessage:'需要处理',errorCode:'MODEL_RESULT_UNKNOWN'})} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const transport=new DefaultChatTransport({fetch:async()=>chatExecutionResponse(runtime,context,input,new AbortController().signal)});
 const stream=(await transport.reconnectToStream({chatId:'conversation'}))!;
 let result;for await(const message of readUIMessageStream({stream,onError:()=>{}}))result=message;
 expect(result).toMatchObject({id:'chat:message',role:'assistant',parts:[{type:'text',text:'已保存正文'}],metadata:{execution:{executionTaskId:'original',status}}});
});

it('实际SDK从暂时无事件的running继续到成功，覆盖旧状态并保留finish metadata',async()=>{
 const runtime={subscribe:async function*(){
  yield {events:[{chunk:{type:'text-start',id:'text'}},{chunk:{type:'text-delta',id:'text',delta:'完整正文'}}],hasMore:false,status:'running'};
  yield {events:[{chunk:{type:'text-end',id:'text'}},{chunk:{type:'finish',messageMetadata:{chatTaskId:'same-chat-task',actualEngine:'configured-engine',usage:{totalTokens:7}}}}],hasMore:false,status:'succeeded'};
 },get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const stream=(await new DefaultChatTransport({fetch:async()=>chatExecutionResponse(runtime,context,input,new AbortController().signal)}).reconnectToStream({chatId:'conversation'}))!;
 const messages=[];for await(const message of readUIMessageStream({stream,terminateOnError:true}))messages.push(structuredClone(message));
 expect(messages.some(message=>(message.metadata as {execution?:{status?:string}})?.execution?.status==='running')).toBe(true);
 expect(messages.at(-1)).toMatchObject({parts:[{type:'text',text:'完整正文'}],metadata:{chatTaskId:'same-chat-task',actualEngine:'configured-engine',usage:{totalTokens:7},execution:{executionTaskId:'original',status:'succeeded'}}});
});

it('真实本地HTTP慢读取按持久事件游标停读、恢复完整传输、断连接不取消任务',async()=>{
 const connection=await createDb(),db=connection.db;
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(context,{kind:'ai_task',ownerType:'ai_task',ownerId:'http-stream',idempotencyKey:'http-stream',payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'http-test'}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:5,maxTokens:1000,deadlineMs:120000}});
 const call=await ledger.reserve(ref,{operationKey:'http-stream',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const service=createExecutionStreamService(db),count=512;
 for(let i=0;i<count;i+=16)await service.append(ref,{callId:call.id,startIndex:i,chunks:Array.from({length:16},(_,j)=>({type:'text-delta',id:'text',delta:`${i+j}:`+'x'.repeat(65536)}))});
 // 合成事件由实际 append 落库；终态是隔离夹具，不冒充模型回执。
 await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,task.id));
 let reads=0,released=0;
 const runtime={get:(ctx:typeof context,id:string)=>tasks.get(ctx,id),subscribe:async function*(ctx:typeof context,id:string,signal:AbortSignal){try{yield* subscribeExecutionStream({read:async(c,t,q)=>{reads++;return service.read(c,t,{afterSequence:(q as {afterSequence:number}).afterSequence,limit:8});}},ctx,id,{signal});}finally{released++;}}} as Parameters<typeof chatExecutionResponse>[0];
 const server=createServer(async(_req,res)=>{
  const abort=new AbortController();res.once('close',()=>abort.abort());
  const response=chatExecutionResponse(runtime,context,{...input,executionTaskId:task.id},abort.signal);
  res.writeHead(200,Object.fromEntries(response.headers));res.flushHeaders();
  const reader=response.body!.getReader();
  try{while(!res.destroyed){const next=await reader.read();if(next.done)break;if(!res.write(next.value))await once(res,'drain',{signal:abort.signal});}if(!res.destroyed)res.end();}catch{await reader.cancel();}
 });
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}/chat`;
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
  await new Promise(resolve=>setTimeout(resolve,300));
  const paused=reads;expect(paused).toBeLessThan(count/8);
  await new Promise(resolve=>setTimeout(resolve,100));expect(reads).toBe(paused);
  const text=await response.text(),deltas=text.split('\n').filter(s=>s.startsWith('data: {')).map(s=>JSON.parse(s.slice(6))).filter(c=>c.type==='text-delta');
  expect(deltas.map(c=>Number(c.delta.split(':')[0]))).toEqual(Array.from({length:count},(_,i)=>i));expect(text).toContain('[DONE]');
  expect(released).toBe(1);
  const disconnected=await fetch(url,{signal:AbortSignal.timeout(120000)});await disconnected.body!.cancel();
  const deadline=Date.now()+120000;while(released<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  expect(released).toBe(2);expect((await tasks.get(context,task.id)).status).toBe('succeeded');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await connection.client.close();}
});

it('未知执行结果保留原回执并向页面发稳定状态码，不伪装失败重试',async()=>{
 const subscribe=vi.fn(async function*(_ctx:unknown,_taskId:string,_signal:AbortSignal){yield {events:[],hasMore:false,status:'unknown_result'};});
 const runtime={subscribe,get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const response=chatExecutionResponse(runtime,{userId:'u',accountId:'a',requestId:'r',source:'user'},
 {executionTaskId:'original-execution',sourceMessageId:'original-message',conversationId:'original-conversation'},new AbortController().signal);
 const body=await response.text();
 expect(subscribe).toHaveBeenCalledOnce();
 expect(subscribe.mock.calls[0]?.[1]).toBe('original-execution');
 expect(response.headers.get('x-execution-task-id')).toBe('original-execution');
 const error=body.split('\n').filter(s=>s.startsWith('data: {')).map(s=>JSON.parse(s.slice(6))).find(s=>s.type==='error');
 expect(humanizeAiErrorMessage(error.errorText)?.code).toBe('result_unconfirmed');
 expect(body).toContain('[DONE]');
 expect(body).not.toContain('请重试');
});

it('旧模型断流状态保留原任务并由界面自动恢复，不要求用户刷新后台任务',async()=>{
 const runtime={subscribe:async function*(){yield {events:[],hasMore:false,status:'unknown_result'};},get:async()=>({errorCode:'MODEL_RESULT_UNKNOWN'})} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const body=await chatExecutionResponse(runtime,{userId:'u',accountId:'a',requestId:'r',source:'user'},
 {executionTaskId:'original',sourceMessageId:'message',conversationId:'conversation'},new AbortController().signal).text();
 expect(body).toContain('CHAT_MODEL_RESPONSE_INTERRUPTED');
 const human=humanizeAiErrorMessage('CHAT_MODEL_RESPONSE_INTERRUPTED');
 expect(human?.message).toContain('自动恢复');expect(human?.message).not.toMatch(/核对|刷新|任务中心|已停止/);
});

it('实际持久事件→响应流→SDK→缓存：无审批等待跨页受保护，同原任务成功后可回收',async()=>{
 const connection=await createDb(),tasks=createPersistentTaskService(connection.db);
 const task=await tasks.enqueue(context,{kind:'ai_task',ownerType:'ai_task',ownerId:'cache-stream',idempotencyKey:'cache-stream',payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'cache-stream'}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(connection.db,{budget:{maxCalls:5,maxTokens:1000,deadlineMs:120000}});
 const call=await ledger.reserve(ref,{operationKey:'cache-stream',kind:'model',inputDigest:'sha256:'+'b'.repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const service=createExecutionStreamService(connection.db);
 await service.append(ref,{callId:call.id,startIndex:0,chunks:[{type:'text-start',id:'text'},{type:'text-delta',id:'text',delta:'已保存的原回复'},{type:'text-end',id:'text'}]});
 const runtime={get:(ctx:typeof context,id:string)=>tasks.get(ctx,id),subscribe:(ctx:typeof context,id:string,signal:AbortSignal)=>subscribeExecutionStream(service,ctx,id,{signal})} as Parameters<typeof chatExecutionResponse>[0];
 vi.stubGlobal('window',{});
 const key='integrated-waiting-scope',session=getLiveChatSession(key),release=acquireLiveChatSession(key,session);
 let requests=0;
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{requests++;return chatExecutionResponse(runtime,context,{...input,executionTaskId:task.id},init.signal!);}));
 session.transport=new DefaultChatTransport({fetch:(url,init)=>session.control.fetch(url as RequestInfo,init)});
 try{
  // 持久终态为隔离回执夹具；事件仍由实际 append/read/subscribe 消费。
  await connection.db.update(executionTasks).set({status:'waiting_user'}).where(eq(executionTasks.id,task.id));
  await session.chat.sendMessage({text:'合成请求'});
  expect(session.chat.status).toBe('error');expect(session.control.executionTaskId).toBe(task.id);
  expect(session.chat.messages.at(-1)?.metadata).toMatchObject({execution:{executionTaskId:task.id,status:'waiting_user'}});
  release();await turn();for(let i=0;i<100;i++)getLiveChatSession(`integrated-waiting-pressure-${i}`);
  expect(getLiveChatSession(key)).toBe(session);expect(session.transport).toBeDefined();expect(requests).toBe(1);
  const other=getLiveChatSession('integrated-other-group');expect(other.chat.messages).toEqual([]);
  await connection.db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,task.id));
  await session.chat.regenerate();expect(requests).toBe(2);expect(session.chat.status).toBe('ready');
  expect(session.chat.messages.at(-1)?.metadata).toMatchObject({execution:{executionTaskId:task.id,status:'succeeded'}});
  for(let i=0;i<100;i++)getLiveChatSession(`integrated-completed-pressure-${i}`);
  expect(getLiveChatSession(key)).not.toBe(session);expect(session.transport).toBeUndefined();
  expect((await tasks.get(context,task.id)).id).toBe(task.id);expect((await tasks.get(context,task.id)).status).toBe('succeeded');
 }finally{release();await session.chat.stop();vi.unstubAllGlobals();await connection.client.close();}
});

it('实际服务接受原任务cancel_requested后本地停止可回收，SDK断连不伪造持久cancelled',async()=>{
 const connection=await createDb(),tasks=createPersistentTaskService(connection.db);
 const task=await tasks.enqueue(context,{kind:'ai_task',ownerType:'ai_task',ownerId:'cache-stop',idempotencyKey:'cache-stop',payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'cache-stop'}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(connection.db,{budget:{maxCalls:5,maxTokens:1000,deadlineMs:120000}});
 const call=await ledger.reserve(ref,{operationKey:'cache-stop',kind:'model',inputDigest:'sha256:'+'c'.repeat(64),reservedTokens:100});await ledger.start(ref,call.id);
 const service=createExecutionStreamService(connection.db);
 await service.append(ref,{callId:call.id,startIndex:0,chunks:[{type:'text-start',id:'text'},{type:'text-delta',id:'text',delta:'停止前已保存的回复'}]});
 let released=0,submissions=0,commands=0;
 const runtime={get:(ctx:typeof context,id:string)=>tasks.get(ctx,id),subscribe:async function*(ctx:typeof context,id:string,signal:AbortSignal){try{yield* subscribeExecutionStream(service,ctx,id,{signal});}finally{released++;}}} as Parameters<typeof chatExecutionResponse>[0];
 vi.stubGlobal('window',{});
 const key='integrated-explicit-stop',session=getLiveChatSession(key),release=acquireLiveChatSession(key,session);
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo,init:RequestInit)=>{
  if(url==='/api/v1/dispatch'){
   commands++;const request=JSON.parse(init.body as string);expect(request.id).toBe(ENDPOINTS.commandExecutionTasks.id);
   const body=ENDPOINTS.commandExecutionTasks.body!.parse(request.input.body);expect(body.taskIds).toEqual([task.id]);
   const rows=await tasks.command(context,body);expect(rows[0]?.status).toBe('cancel_requested');
   return Response.json(ENDPOINTS.commandExecutionTasks.response.parse({tasks:rows}));
  }
  submissions++;return chatExecutionResponse(runtime,context,{...input,executionTaskId:task.id},init.signal!);
 }));
 session.transport=new DefaultChatTransport({fetch:(url,init)=>session.control.fetch(url as RequestInfo,init)});
 const sending=session.chat.sendMessage({text:'合成请求'});
 try{
  await vi.waitFor(()=>expect(session.chat.messages.at(-1)?.metadata).toMatchObject({execution:{executionTaskId:task.id,status:'running'}}),{timeout:120000,interval:10});
  expect(await session.control.cancel()).toBe(true);await session.chat.stop();await sending;
  await vi.waitFor(()=>expect(released).toBe(1),{timeout:120000,interval:10});
  expect(session.chat.status).toBe('ready');expect((session.chat.messages.at(-1)?.metadata as {execution?:{status?:string}})?.execution?.status).not.toBe('cancelled');
  expect((await tasks.get(context,task.id)).status).toBe('cancel_requested');expect(submissions).toBe(1);expect(commands).toBe(1);
  release();await turn();for(let i=0;i<100;i++)getLiveChatSession(`integrated-stop-pressure-${i}`);
  expect(getLiveChatSession(key)).not.toBe(session);expect(session.transport).toBeUndefined();
  await tasks.acknowledgeControl({taskId:task.id,workerId:'cache-stop',attempt:claim.lease.attempt});
  expect((await tasks.get(context,task.id)).status).toBe('cancelled');
 }finally{release();await session.chat.stop();await sending;vi.unstubAllGlobals();await connection.client.close();}
});
