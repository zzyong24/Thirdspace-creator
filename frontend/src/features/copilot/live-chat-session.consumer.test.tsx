import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AICopilotContent} from './ai-copilot-content';
import {getLiveChatSession as getLiveChatSessionWithFactory} from './live-chat-session';
import {Chat} from '@ai-sdk/react';
import type {ChatTransport,UIMessage} from 'ai';
import {readStoredConversationId,writeStoredConversationId} from './conversation-persistence';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
import {ENDPOINTS,executionTaskResourceV2} from '@creatoros/contract';
// 测试沿产品原 factory 端口注入真实 SDK；现有会话仍按原 key 复用，断言不变。
function getLiveChatSession(key: string) {
 return getLiveChatSessionWithFactory<Chat<UIMessage>,ChatTransport<UIMessage>,UIMessage>(key, session => new Chat<UIMessage>({
  id: key,
  transport: {
   sendMessages: options => {if (!session.transport) throw new Error("聊天连接尚未就绪");return session.transport.sendMessages(options);},
   reconnectToStream: options => {if (!session.transport) throw new Error("聊天连接尚未就绪");return session.transport.reconnectToStream(options);},
  },
  sendAutomaticallyWhen: input => session.shouldResume?.(input) ?? false,
 }));
}

const query='copilot=open&selKind=project&selId=revisit';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(query),useRouter:()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()})}));
const api=vi.hoisted(()=>({listAITasks:vi.fn(async()=>[]),listConversations:vi.fn(async()=>[]),listMessages:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
afterEach(cleanup);
it('真实Copilot取得/释放观察者，淘汰回访恢复服务端历史且切账号组不串内容',async()=>{
 api.listMessages.mockImplementation(async({params}:{params:{conversationId:string}})=>[{id:'history',role:'assistant',content:params.conversationId==='original-a'?'原账号的历史回复':'新账号组的历史回复'}]);
 localStorage.setItem(CURRENT_GROUP_KEY,'group-a');
 writeStoredConversationId('project:revisit','original-a','group:group-a');
 const mounted=render(<AICopilotContent/>);
 await screen.findByText('原账号的历史回复');
 const original=getLiveChatSession(JSON.stringify(['group:group-a','project:revisit']));
 expect(original.observers).toBe(1);
 mounted.unmount();await act(async()=>{await Promise.resolve();});
 expect(original.observers).toBe(0);
 for(let i=0;i<100;i++)getLiveChatSession(JSON.stringify(['group:group-a',`project:other-${i}`]));
 expect(original.transport).toBeUndefined();
 const revisit=render(<AICopilotContent/>);
 await screen.findByText('原账号的历史回复');
 expect(api.listMessages).toHaveBeenCalledTimes(2);
 expect(getLiveChatSession(JSON.stringify(['group:group-a','project:revisit']))).not.toBe(original);
 localStorage.setItem(CURRENT_GROUP_KEY,'group-b');
 writeStoredConversationId('project:revisit','original-b','group:group-b');
 await act(async()=>{window.dispatchEvent(new Event('creatoros:accounts-changed'));});
 await screen.findByText('新账号组的历史回复');
 await waitFor(()=>expect(screen.queryByText('原账号的历史回复')).toBeNull());
 revisit.unmount();
});

function frames(status:string,metadataId='original-execution'){
 const prefix=[{type:'start',messageId:'original-assistant'},{type:'text-start',id:'answer'},{type:'text-delta',id:'answer',delta:'等待前已完成的回复'},{type:'text-end',id:'answer'}];
 return [...prefix,{type:'message-metadata',messageMetadata:{execution:{executionTaskId:metadataId,status}}},status==='succeeded'?{type:'finish'}:status==='cancelled'?{type:'abort'}:{type:'error',errorText:'合成错误回执'}];
}
function sseResponse(status:string,headerId:string|undefined='original-execution',metadataId='original-execution'){
 return new Response(frames(status,metadataId).map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':'original-conversation',...(headerId?{'x-execution-task-id':headerId}:{})}});
}
async function startConsumer(group:string){
 localStorage.setItem(CURRENT_GROUP_KEY,group);
 api.listConversations.mockResolvedValue([]);api.listMessages.mockResolvedValue([]);
 api.listAITasks.mockResolvedValue([]);
 const mounted=render(<AICopilotContent/>);
 await act(async()=>{await Promise.resolve();});
 const textarea=screen.getByLabelText('我能帮你做什么');
 fireEvent.change(textarea,{target:{value:'合成测试请求'}});
 fireEvent.submit(mounted.container.querySelector('[data-slot="prompt-form"]')!);
 const key=JSON.stringify([`group:${group}`,'project:revisit']);
 return {mounted,key,original:getLiveChatSession(key)};
}
function pressure(prefix:string){for(let i=0;i<100;i++)getLiveChatSession(`${prefix}-${i}`);}
it.each(['waiting_user','unknown_result','paused'])('实际metadata %s关联原回执，纯text+error离开后仍保护',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>sseResponse(status)));
 const {mounted,key,original}=await startConsumer(`metadata-${status}`);
 await waitFor(()=>expect(original.chat.status).toBe('error'));
 expect(original.chat.messages.at(-1)?.parts).toEqual([{type:'text',text:'等待前已完成的回复',state:'done'}]);
 expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status}});
 mounted.unmount();await act(async()=>{await Promise.resolve();});
 pressure(status);
 expect(getLiveChatSession(key)).toBe(original);
 expect(original.transport).toBeDefined();
});
it.each(['succeeded','failed','cancelled'])('实际metadata %s终态不把错误会话长期保护',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>sseResponse(status)));
 const {mounted,key,original}=await startConsumer(`terminal-${status}`);
 await waitFor(()=>expect(['ready','error']).toContain(original.chat.status));
 await waitFor(()=>expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status}}));
 mounted.unmount();await act(async()=>{await Promise.resolve();});pressure(`terminal-${status}`);
 expect(getLiveChatSession(key)).not.toBe(original);expect(original.transport).toBeUndefined();
});
it.each(['missing','mismatch'])('metadata等待状态但%s控制回执不冒充可靠任务关联',async kind=>{
 vi.stubGlobal('fetch',vi.fn(async()=>sseResponse('waiting_user',kind==='missing'?'':'original-execution',kind==='mismatch'?'foreign-execution':'original-execution')));
 const {mounted,key,original}=await startConsumer(`receipt-${kind}`);
 await waitFor(()=>expect(original.chat.status).toBe('error'));
 mounted.unmount();await act(async()=>{await Promise.resolve();});pressure(`receipt-${kind}`);
 expect(getLiveChatSession(key)).not.toBe(original);
});
it('卸载/切scope后迟到waiting metadata只保护原会话，不改新scope',async()=>{
 let controller!:ReadableStreamDefaultController<Uint8Array>;
 const stream=new ReadableStream<Uint8Array>({start(value){controller=value;}});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(stream,{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':'original-conversation','x-execution-task-id':'original-execution'}})));
 const {mounted,key,original}=await startConsumer('late-metadata-a');
 await waitFor(()=>expect(original.chat.status).toBe('submitted'));
 const encoder=new TextEncoder();
 await act(async()=>{controller.enqueue(encoder.encode(frames('waiting_user').slice(0,4).map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join('')));});
 await waitFor(()=>expect(original.chat.status).toBe('streaming'));
 localStorage.setItem(CURRENT_GROUP_KEY,'late-metadata-b');
 await act(async()=>{window.dispatchEvent(new Event('creatoros:accounts-changed'));});
 const nextKey=JSON.stringify(['group:late-metadata-b','project:revisit']);
 const next=getLiveChatSession(nextKey);
 expect(next).not.toBe(original);
 mounted.unmount();await act(async()=>{await Promise.resolve();});
 await act(async()=>{controller.enqueue(encoder.encode(frames('waiting_user').slice(4).map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join('')+'data: [DONE]\n\n'));controller.close();});
 await waitFor(()=>expect(original.chat.status).toBe('error'));
 expect(next.chat.messages).toEqual([]);pressure('late-metadata');
 expect(getLiveChatSession(key)).toBe(original);
 expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status:'waiting_user'}});
});
it('同消息原ID显式resume waiting→succeeded后解除保护，不自动重建任务',async()=>{
 let submissions=0;
 const request=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>sseResponse(++submissions===5?'succeeded':'waiting_user'));
 vi.stubGlobal('fetch',request);
 const {mounted,key,original}=await startConsumer('resume-metadata');
 await waitFor(()=>expect(original.chat.status).toBe('error'));
 expect(request).toHaveBeenCalledTimes(1);
 expect(screen.getByText('自动恢复中')).toBeInTheDocument();
 // main 原流程自动恢复至三次上限，再由用户沿同消息/任务明确继续。
 const continueButton=await screen.findByRole('button',{name:'继续恢复'},{timeout:120000});
 expect(request).toHaveBeenCalledTimes(4);
 expect(original.chat.status).toBe('error');
 expect(original.control.currentTaskId()).toBe('original-execution');
 fireEvent.click(continueButton);
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(5),{timeout:120000});
 await waitFor(()=>expect(original.chat.status).toBe('ready'),{timeout:120000});
 const initial=JSON.parse(request.mock.calls[0]![1]?.body as string) as {messages:UIMessage[]};
 const sourceId=initial.messages.findLast(message=>message.role==='user')?.id;
 expect(sourceId).toBeTruthy();
 for(const [,init] of request.mock.calls.slice(1)){
  const body=JSON.parse(init?.body as string) as {trigger:string;conversationId:string;messages:UIMessage[]};
  expect(body.trigger).toBe('regenerate-message');expect(body.conversationId).toBe('original-conversation');
  expect(body.messages.findLast(message=>message.role==='user')?.id).toBe(sourceId);
 }
 expect(original.control.currentTaskId()).toBe('original-execution');
 expect(original.chat.messages.at(-1)?.id).toBe('original-assistant');
 expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status:'succeeded'}});
 mounted.unmount();await act(async()=>{await Promise.resolve();});pressure('resume-metadata');
 expect(getLiveChatSession(key)).not.toBe(original);
});

function openRunning(init:RequestInit,id='original-execution'){
 let controller!:ReadableStreamDefaultController<Uint8Array>,ended=false,aborted=false;
 const stream=new ReadableStream<Uint8Array>({start(value){controller=value;},cancel(){ended=true;}});
 const send=(chunks:unknown[],done=false)=>{if(ended)return;controller.enqueue(new TextEncoder().encode(chunks.map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join('')+(done?'data: [DONE]\n\n':'')));if(done){ended=true;controller.close();}};
 init.signal?.addEventListener('abort',()=>{aborted=true;if(!ended){ended=true;controller.error(new DOMException('合成HTTP观察已中断','AbortError'));}},{once:true});
 send(frames('running',id).slice(0,5));
 return {response:new Response(stream,{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1','x-conversation-id':'original-conversation','x-execution-task-id':id}}),send,get aborted(){return aborted;}};
}
function cancelResponse(status='cancel_requested',httpStatus=200,groupId='stop-group'){
 const task=executionTaskResourceV2.parse({id:'original-execution',userId:'synthetic',groupId,accountId:null,kind:'ai_task',ownerType:'ai_task',ownerId:'original-ai-task',status,priority:1,idempotencyKey:'original',checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:0,maxAttempts:3,errorCode:null,errorMessage:null,costEstimate:null,createdAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:00Z'});
 return new Response(JSON.stringify({data:{tasks:[task]},meta:{requestId:'synthetic-cancel'}}),{status:httpStatus});
}
it('实际停止按钮接受cancel_requested只放弃本地观察，退出后可回收且不伪写终态',async()=>{
 let running!:ReturnType<typeof openRunning>;
 const commands:Array<{id:string;input:{body:{taskIds:string[];command:string}}}>=[];
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo,init:RequestInit)=>{
  if(url==='/api/v1/dispatch'){commands.push(JSON.parse(init.body as string));return cancelResponse();}
  running=openRunning(init);return running.response;
 }));
 const {mounted,key,original}=await startConsumer('stop-group');
 await waitFor(()=>expect(original.chat.status).toBe('streaming'));
 await waitFor(()=>expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status:'running'}}));
 fireEvent.click(screen.getByTestId('stop-button'));
 await waitFor(()=>expect(original.chat.status).toBe('ready'));
 expect(running.aborted).toBe(true);
 expect(commands).toHaveLength(1);expect(commands[0]).toMatchObject({id:ENDPOINTS.commandExecutionTasks.id,input:{body:{taskIds:['original-execution'],command:'cancel'}}});
 expect(original.control.executionTaskId).toBeUndefined();expect(original.control.currentTaskId()).toBe('original-execution');
 expect(original.chat.messages.at(-1)?.metadata).toEqual({execution:{executionTaskId:'original-execution',status:'running'}});
 mounted.unmount();await act(async()=>{await Promise.resolve();});pressure('explicit-stop');
 expect(getLiveChatSession(key)).not.toBe(original);expect(original.transport).toBeUndefined();
 expect(readStoredConversationId('project:revisit','group:stop-group')).toBe('original-conversation');
});
it.each([403,500])('停止command HTTP %s不释放/不中断，仍保护原运行会话',async status=>{
 let running!:ReturnType<typeof openRunning>;
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo,init:RequestInit)=>{if(url==='/api/v1/dispatch')return cancelResponse('cancel_requested',status,`stop-failure-${status}`);running=openRunning(init);return running.response;}));
 const {mounted,key,original}=await startConsumer(`stop-failure-${status}`);
 await waitFor(()=>expect(original.chat.status).toBe('streaming'));
 fireEvent.click(screen.getByTestId('stop-button'));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.getByTestId('stop-button')).toBeEnabled());
 expect(running.aborted).toBe(false);expect(original.control.executionTaskId).toBe('original-execution');
 mounted.unmount();await act(async()=>{await Promise.resolve();});pressure(`stop-failure-${status}`);
 expect(getLiveChatSession(key)).toBe(original);
 await act(async()=>{running.send(frames('waiting_user').slice(4),true);});
});
it.each(['turn','scope'])('迟到旧stop不停止新的%s流，也不覆盖其观察归属',async change=>{
 const streams:Array<ReturnType<typeof openRunning>>=[];
 const commandGroups:Array<string|null>=[];
 let release!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo,init:RequestInit)=>{
  if(url==='/api/v1/dispatch'){commandGroups.push(new Headers(init.headers).get('x-group-id'));return new Promise<Response>(resolve=>{release=resolve;});}
  const running=openRunning(init,streams.length?'new-execution':'original-execution');streams.push(running);return running.response;
 }));
 const {mounted,original}=await startConsumer(`late-stop-${change}-a`);
 await waitFor(()=>expect(original.chat.status).toBe('streaming'));
 fireEvent.click(screen.getByTestId('stop-button'));
 await waitFor(()=>expect(release).toBeDefined());
 let current=original;
 if(change==='turn'){
  await act(async()=>{streams[0]!.send(frames('succeeded').slice(4),true);});
  await waitFor(()=>expect(original.chat.status).toBe('ready'));
 }else{
  localStorage.setItem(CURRENT_GROUP_KEY,'late-stop-scope-b');
  await act(async()=>{window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  current=getLiveChatSession(JSON.stringify(['group:late-stop-scope-b','project:revisit']));
 }
 fireEvent.change(screen.getByLabelText('我能帮你做什么'),{target:{value:'新的独立回合'}});
 fireEvent.submit(mounted.container.querySelector('[data-slot="prompt-form"]')!);
 await waitFor(()=>expect(current.chat.status).toBe('streaming'));
 await waitFor(()=>expect(streams).toHaveLength(2));
 expect(screen.getByTestId('stop-button')).toBeEnabled();
 await act(async()=>{release(cancelResponse(change==='turn'?'succeeded':'cancel_requested',200,`late-stop-${change}-a`));});
 expect(streams[1]!.aborted).toBe(false);expect(current.chat.status).toBe('streaming');
 expect(current.control.executionTaskId).toBe('new-execution');
 expect(commandGroups).toEqual([`late-stop-${change}-a`]);
 mounted.unmount();await act(async()=>{await Promise.resolve();});
 await act(async()=>{streams[1]!.send(frames('succeeded','new-execution').slice(4),true);});
 if(change==='scope'&&!streams[0]!.aborted)await act(async()=>{streams[0]!.send(frames('succeeded').slice(4),true);});
});
