import {afterEach,expect,it,vi} from 'vitest';
import * as sessions from './live-chat-session';
afterEach(()=>vi.resetModules());
it('T-1073 100个已完成闲置scope数量和消息容量有界，淘汰解除回调且不删服务端指针',()=>{
 const originals=[];
 for(let i=0;i<100;i++){
  const session=sessions.getLiveChatSession(`bounded-${i}`);
  session.chat.messages=[{id:`m-${i}`,role:'assistant',parts:[{type:'text',text:'x'.repeat(65536)}]}];
  session.transport={} as typeof session.transport;
  session.shouldResume=()=>false;
  originals.push(session);
 }
 const old=sessions.getLiveChatSession('bounded-0');
 expect(old).not.toBe(originals[0]);
 expect(originals[0]?.transport).toBeUndefined();
 expect(originals[0]?.shouldResume).toBeUndefined();
 const retained=originals.filter(s=>s.chat.messages.length);
 const estimatedMessageBytes=retained.reduce((sum,s)=>sum+JSON.stringify(s.chat.messages).length*2,0);
 expect(retained.length).toBeLessThanOrEqual(16);
 expect(estimatedMessageBytes).toBeLessThanOrEqual(4*1024*1024);
 console.log(JSON.stringify({case:'live-session-pressure',createdScopes:100,retainedOriginalMessageScopes:retained.length,estimatedSerializedMessageBytes:estimatedMessageBytes,callbacksReleased:originals.filter(s=>!s.disposeListeners).length}));
});

it('挂载和等待审批的会话不因容量淘汰；单个大合法回复在离开后才释放',async()=>{
 const mounted=sessions.getLiveChatSession('mounted-large');
 const release=sessions.acquireLiveChatSession('mounted-large',mounted);
 mounted.chat.messages=[{id:'large',role:'assistant',parts:[{type:'text',text:'x'.repeat(5*1024*1024)}]}];
 const approval=sessions.getLiveChatSession('approval-protected');
 approval.chat.messages=[{id:'approval',role:'assistant',parts:[{type:'dynamic-tool',toolName:'local.read',toolCallId:'original',state:'approval-requested',input:{},approval:{id:'approval-original'}}]}];
 for(let i=0;i<100;i++)sessions.getLiveChatSession(`pressure-${i}`);
 expect(sessions.getLiveChatSession('mounted-large')).toBe(mounted);
 expect(sessions.getLiveChatSession('approval-protected')).toBe(approval);
 expect(mounted.chat.messages[0]?.parts[0]).toMatchObject({text:expect.any(String)});
 release();await Promise.resolve();
 expect(mounted.transport).toBeUndefined();
 expect(mounted.chat.messages).toEqual([]);
});

it('真实Chat流离开后仍推进原回复，完成后恢复为可淘汰会话',async()=>{
 const active=sessions.getLiveChatSession('stream-protected');
 let controller!:ReadableStreamDefaultController;
 const stream=new ReadableStream({start(value){controller=value;}});
 active.transport={sendMessages:async()=>stream,reconnectToStream:async()=>null} as typeof active.transport;
 const sending=active.chat.sendMessage({text:'合成消息'});
 await Promise.resolve();
 for(let i=0;i<100;i++)sessions.getLiveChatSession(`stream-pressure-${i}`);
 expect(sessions.getLiveChatSession('stream-protected')).toBe(active);
 controller.enqueue({type:'start',messageId:'synthetic-answer'});
 controller.enqueue({type:'text-start',id:'text'});
 controller.enqueue({type:'text-delta',id:'text',delta:'完整原回复'});
 controller.enqueue({type:'text-end',id:'text'});
 controller.enqueue({type:'finish'});controller.close();
 await sending;
 expect(active.chat.messages.at(-1)?.parts[0]).toMatchObject({text:'完整原回复'});
 expect(active.chat.status).toBe('ready');
});
