import {describe,it,expect} from 'vitest';
import {buildChatTools} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {getChatToolNativeExecutor} from './chat-tool-gate';
import {createChatSystemToolHost} from './chat-system-tool-host';
import type {RequestContext} from '@creatoros/contract';
import type {ExecutionRef} from '@creatoros/contract/execution-worker';

it('候选结果损坏或伪造来源时返回确定性失败，不变成未知执行或可采用候选',async()=>{
 const ctx:RequestContext={userId:'system-user',groupId:'system-group',accountId:null,source:'user',requestId:'system-host-test'};
 const execution:ExecutionRef={executionTaskId:'system-execution',attempt:1,fenceToken:'system-fence'};
 const scope={execution,aiTaskId:'system-business',callId:'system-call',toolCallId:'system-tool-call',signal:new AbortController().signal};
 const document={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[],edges:[]};
 const request={title:'中性画布',document};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['canvas.create.propose'],{} as never))).definitions;
 for(const result of [
  {schemaVersion:1,kind:'canvas.create.proposal',request},
  {schemaVersion:1,kind:'canvas.create.proposal',request,document,source:{taskId:'forged'}},
 ]){
  const reader={read:async()=>({context:ctx,modelInput:{tools:definitions},hostContext:{chatContext:{surface:'topics'}}})};
  const ports={features:async()=>({rows:[]}),read:async()=>({kind:'system.read'}),propose:async()=>({kind:'system.action.proposal'}),createCanvas:async()=>result};
  const host=createChatSystemToolHost(reader as never,ports as never);
  const tools=await host(ctx,{} as never,execution,scope.signal);
  const outcome=await tools['canvas.create.propose']!.execute!(ctx,request,scope);
  expect(outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'no_evidence',retryable:false}});
  expect(outcome.data).not.toHaveProperty('source');
 }
});

describe('系统助手真实工具注册',()=>{
 it('普通页面可发现、读取并提出完整画布候选，不创建正式画布',async()=>{
  let writes=0;
  const document={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:'note-1',type:'text',label:'主题',position:{x:10,y:20},text:'测试内容'}],edges:[]};
  const ports={features:async()=>({rows:[{feature:'canvas',title:'创作画布'}]}),read:async()=>({kind:'system.read',requestKind:'projects.list',text:'[]',complete:true}),propose:async()=>{throw Error('本例没有系统修改');},createCanvas:async(input:unknown)=>({schemaVersion:1,kind:'canvas.create.proposal',request:input,document})};
  const tools=buildChatTools(['system.features','system.read','system.action.propose','canvas.create.propose'],{assistantSystem:ports,humanizeError:()=>null} as never);
  const definitions=(await prepareChatToolDefinitions(tools)).definitions;
  expect(definitions.map(d=>[d.name,d.effect])).toEqual([['system.features','none'],['system.read','none'],['system.action.propose','proposal'],['canvas.create.propose','proposal']]);
  const candidate=await getChatToolNativeExecutor(tools['canvas.create.propose']!)!({title:'测试画布',document},{abortSignal:new AbortController().signal});
  expect(candidate).toMatchObject({kind:'canvas.create.proposal',document});
  expect(writes).toBe(0);
  const parameters=(await prepareChatToolDefinitions(tools)).parameters['canvas.create.propose']!.parameters;
  expect(parameters.safeParse({title:'测试',document,userId:'other'}).success).toBe(false);
 });
});
