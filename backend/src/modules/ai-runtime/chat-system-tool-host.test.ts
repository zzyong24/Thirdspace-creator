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


import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {vi} from 'vitest';
import {canonicalJson} from '../ai/canonical-json';
const frozenV1Read=JSON.parse(readFileSync(new URL('../../../../docs/verification/t1086/system-read-v1.definition.json',import.meta.url),'utf8'));
const systemCtx:RequestContext={userId:'fixed-read-user',groupId:'fixed-read-group',accountId:null,source:'user',requestId:'fixed-read-test'};
const systemRef:ExecutionRef={executionTaskId:'fixed-read-task',attempt:1,fenceToken:'fixed-read-fence'};
async function frozenSystemDefinitions(catalog:1|2){
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['system.features','system.read','canvas.create.propose'],{assistantReadCatalogVersion:catalog} as never))).definitions;
 if(catalog===1)definitions[1]=structuredClone(frozenV1Read);
 return definitions;
}
it.each([1,2] as const)('T1086 完整固定 V%s 恢复，旧 schema 拒新 GET 且 owner 调用为0',async catalog=>{
 expect(createHash('sha256').update(canonicalJson(frozenV1Read)).digest('hex')).toBe('0dcaa42c23ff46263e9f45ccf25277a5c9dabc9eda8ea3decc30860993581fea');
 const definitions=await frozenSystemDefinitions(catalog),before=structuredClone(definitions),read=vi.fn(async()=>({kind:'system.read',text:'[]'}));
 const reader={read:async()=>({context:systemCtx,modelInput:{tools:definitions},hostContext:{chatContext:{surface:'project',projectId:'fixed-project'}}})};
 const tools=await createChatSystemToolHost(reader as never,{features:async()=>({kind:'system.features',rows:[]}),read,propose:async()=>{throw Error('禁止候选');},createCanvas:async()=>{throw Error('禁止写入');}} as never)(systemCtx,{} as never,systemRef,new AbortController().signal);
 const scope={execution:systemRef,aiTaskId:'fixed-ai-task',callId:'fixed-read-call',toolCallId:'fixed-tool-call',signal:new AbortController().signal};
 expect(await tools['system.read']!.execute!(systemCtx,{request:{kind:'projects.outputs.list',params:{projectId:'fixed-project'}}},scope)).toMatchObject({status:'ok',sideEffect:'none'});
 read.mockClear();
 const native={request:{kind:'outputs.production.editor.get',params:{outputId:'fixed-output'}}};
 expect(tools['system.read']!.parameters.safeParse(native).success).toBe(catalog===2);
 const outcome=await tools['system.read']!.execute!(systemCtx,native,scope);
 expect(outcome.status).toBe(catalog===2?'ok':'error');expect(read).toHaveBeenCalledTimes(catalog===2?1:0);
 if(catalog===1)expect((await prepareChatToolDefinitions(buildChatTools(['system.read'],{assistantReadCatalogVersion:1} as never))).definitions[0]).toEqual(frozenV1Read);
 expect(definitions).toEqual(before);
},120000);
it.each([1,2] as const)('T1086 V%s schema/描述/版本/副作用/其它系统工具任一漂移仍拒绝整套冻结定义',async catalog=>{
 const original=await frozenSystemDefinitions(catalog);
 const mutations=[
  (defs:typeof original)=>{defs[1]!.description+='漂移';},
  (defs:typeof original)=>{defs[1]!.version+='漂移';},
  (defs:typeof original)=>{defs[1]!.effect='proposal';},
  (defs:typeof original)=>{defs[1]!.parameters={...defs[1]!.parameters,additionalProperties:true};},
  (defs:typeof original)=>{defs[0]!.description+='另一工具漂移';},
  (defs:typeof original)=>{(defs[1]!.parameters as {properties:{request:{oneOf:unknown[]}}}).properties.request.oneOf.push({type:'object',properties:{kind:{const:'unknown.get'}}});},
 ];
 for(const mutate of mutations){
  const definitions=structuredClone(original);mutate(definitions);
  const reader={read:async()=>({context:systemCtx,modelInput:{tools:definitions},hostContext:{chatContext:{surface:'topics'}}})};
  const read=vi.fn(async()=>({kind:'system.read'}));
  await expect(createChatSystemToolHost(reader as never,{read,features:async()=>({}),propose:async()=>({kind:'unused'}),createCanvas:async()=>({kind:'unused'})} as never)(systemCtx,{} as never,systemRef,new AbortController().signal)).rejects.toThrow('系统工具定义与冻结任务不符');
  expect(read).not.toHaveBeenCalled();
 }
},120000);

const historicalAction=JSON.parse(readFileSync(new URL('../../../../docs/verification/t1248/system-action-v1.definition.json',import.meta.url),'utf8'));
it('T1248 真实旧action golden恢复，原冻结完整定义不更新',async()=>{
 const definitions=[structuredClone(historicalAction)],before=structuredClone(definitions);
 const reader={read:async()=>({context:systemCtx,modelInput:{tools:definitions},hostContext:{chatContext:{surface:'topics'}}})};
 const tools=await createChatSystemToolHost(reader as never,{features:vi.fn(),read:vi.fn(),propose:vi.fn(),createCanvas:vi.fn()} as never)(systemCtx,{} as never,systemRef,new AbortController().signal);
 expect((await prepareChatToolDefinitions(buildChatTools(['system.action.propose'],{assistantActionCatalogVersion:1} as never))).definitions).toEqual(definitions);
 expect(tools['system.action.propose']!.version).toBe(historicalAction.version);expect(definitions).toEqual(before);
},120000);

import {matchFrozenAssistantReadCatalog,matchFrozenAssistantSystemCatalog} from './chat-system-tool-host';
it.each([[1,1],[1,2],[2,1],[2,2]] as const)('T1248 已知完整read%s/action%s组合与合法子集保持定义、范围与参数严格性',async(readVersion,actionVersion)=>{
 const names=['system.features','system.read','system.action.propose','canvas.create.propose','canvas.generate.propose'];
 const definitions=(await prepareChatToolDefinitions(buildChatTools(names,{assistantReadCatalogVersion:readVersion,assistantActionCatalogVersion:actionVersion} as never))).definitions,before=structuredClone(definitions);
 const read=vi.fn(async()=>({kind:'system.read',text:'[]'})),propose=vi.fn(async()=>({schemaVersion:1,kind:'system.action.proposal',request:{action:{kind:'preferences.update',autosaveEnabled:false}},observations:{}}));
 const reader={read:async()=>({context:systemCtx,modelInput:{tools:definitions},hostContext:{chatContext:{surface:'topics'}}})};
 expect(await matchFrozenAssistantReadCatalog(definitions)).toBe(readVersion);
 expect(await matchFrozenAssistantSystemCatalog(definitions)).toEqual({assistantReadCatalogVersion:readVersion,assistantActionCatalogVersion:actionVersion});
 const host=createChatSystemToolHost(reader as never,{read,propose,features:vi.fn(),createCanvas:vi.fn(),generateCanvas:vi.fn()} as never);
 const tools=await host(systemCtx,{} as never,systemRef,new AbortController().signal),scope={execution:systemRef,aiTaskId:'known-task',callId:'known-call',toolCallId:'known-tool',signal:new AbortController().signal};
 for(const extra of [{unknown:true},...(actionVersion===1?[{assistantExecutionEngine:'codex'},{initializeAssistantExecutionEngine:true}]:[])]){
  const outcome=await tools['system.action.propose']!.execute!(systemCtx,JSON.parse(JSON.stringify({action:{kind:'preferences.update',autosaveEnabled:false,...extra}})),scope);expect(outcome.status).toBe('error');expect(propose).not.toHaveBeenCalled();
 }
 expect(await tools['system.read']!.execute!(systemCtx,{request:{kind:'projects.outputs.list',params:{projectId:'original-project'}}},scope)).toMatchObject({status:'ok',sideEffect:'none'});expect(read).toHaveBeenCalledTimes(1);
 await expect(host({...systemCtx,userId:'foreign'},{} as never,systemRef,scope.signal)).rejects.toThrow('范围');expect(propose).not.toHaveBeenCalled();
 expect(definitions).toEqual(before);
 const actionOnly=definitions.filter(d=>d.name==='system.action.propose');expect((await matchFrozenAssistantSystemCatalog(actionOnly)).assistantActionCatalogVersion).toBe(actionVersion);
 for(const mutate of [
  (d:typeof definitions)=>{d[2]!.description+='tampered';},(d:typeof definitions)=>{d[2]!.version+='tampered';},
  (d:typeof definitions)=>{d[2]!.effect='none';},(d:typeof definitions)=>{d[2]!.execution='worker.web-read';},
  (d:typeof definitions)=>{d[2]!.parameters={...d[2]!.parameters,additionalProperties:true};},
  (d:typeof definitions)=>{d[2]!.name='system.unknown';},(d:typeof definitions)=>{d.push(structuredClone(d[2]!));},
 ]){const changed=structuredClone(definitions);mutate(changed);await expect(matchFrozenAssistantSystemCatalog(changed)).rejects.toThrow('定义');}
},120000);

it('T1248 unknown-only整套显式拒绝，正常non-system空子集仍按原earlyreturn且owner0',async()=>{
 const definition=(await prepareChatToolDefinitions(buildChatTools(['system.read'],{} as never))).definitions[0]!;
 const read=vi.fn(),propose=vi.fn(),features=vi.fn(),createCanvas=vi.fn();
 const ports={read,propose,features,createCanvas};
 const reader=(tools:typeof definition[])=>({read:async()=>({context:systemCtx,modelInput:{tools},hostContext:{chatContext:{surface:'topics'}}})});
 const normal=createChatSystemToolHost(reader([{...definition,name:'context.project.detail'}]) as never,ports as never);
 expect(await normal(systemCtx,{} as never,systemRef,new AbortController().signal)).toEqual({});
 const unknown=createChatSystemToolHost(reader([{...definition,name:'system.unknown'}]) as never,ports as never);
 await expect(unknown(systemCtx,{} as never,systemRef,new AbortController().signal)).rejects.toThrow('定义');
 for(const owner of [read,propose,features,createCanvas])expect(owner).not.toHaveBeenCalled();
},180000);
