import {beforeEach,describe,expect,it,vi} from 'vitest';
import {chatWorkerInputSchema,chatToolProviderName,codexExecutionSpec,type WorkerPort} from '@creatoros/contract/execution-worker';
import type {LanguageModelV4} from '@ai-sdk/provider';
const fixture=vi.hoisted(()=>({model:vi.fn(),session:vi.fn()}));
// 保留真实 SDK、durable model、节点、原生回合与恢复函数；只替换外部 provider/session。
vi.mock('../runtime/provider-factory',async original=>({...await original<typeof import('../runtime/provider-factory')>(),modelFor:fixture.model}));
vi.mock('./codex-app-server',async original=>({...await original<typeof import('./codex-app-server')>(),createControlledCodexSession:fixture.session}));
import {markStructuredOutputMode} from '../runtime/provider-factory';
import {codexProcessArguments} from './codex-app-server';
import {codexCallAuthority} from './codex-call-context';
import {createExternalChatToolConsumer} from './external-chat-tools';
import {runChatInWorker} from './chat-worker-run';
import {runExternalChatInWorker} from './external-chat-worker-run';
import {generateCodexImage} from './codex-image-generation';

// SEMANTIC_BOUNDARY_ALLOW: 受控模型仅返回协议字节；测试真实路由、callId、原生参数和不重发边界，不判断内容质量。
const api={apiFormat:'openai_chat' as const,authStyle:'bearer' as const,baseUrl:'https://fixture.invalid/v1',model:'own-api-node',token:'private-fixture',structuredOutputs:false};
const codex={...codexExecutionSpec(),requestedModel:'own-codex-node'};
const outcome={status:'ok',summary:'受控候选',evidence:[],data:{kind:'fixture'},error:null,continuation:null,sideEffect:'proposal'};
const prepared={node:{capability:'topic.enrich',facets:{title:'原题'},candidateId:'candidate-original'},maxOutputTokens:128,operationKey:'structured:parent-original',skillSnapshot:{snapshotVersion:1,userId:'fixture-u',accountId:'fixture-a',resolvedAt:'fixed',platformPolicyVersion:'1',platformPolicy:'受控协议',skills:[{skillId:'topic.enrich',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'候选',template:'{{title}}',tools:[],requiredFacets:['title'],contextRequirements:[],outputSchema:{type:'object',properties:{oneLiner:{type:'string'}},required:['oneLiner']},completionPolicy:null,completionPolicyAdapter:null}}]}};
const usage={inputTokens:{total:2,noCache:2,cacheRead:0,cacheWrite:0},outputTokens:{total:3,text:3,reasoning:0}};
const textReceipt=(text:string)=>({content:[{type:'text' as const,text}],finishReason:{unified:'stop' as const,raw:'fixture'},usage,warnings:[]});
type ToolName='script.hooks'|'script.draft'|'topic.enrich';
const nodeExecution=(name:ToolName)=>name==='script.hooks'?'worker.script-hooks' as const:name==='script.draft'?'worker.script-draft' as const:'worker.structured-node' as const;
function chatInput(engine:'pi'|'codex',name?:ToolName,v2=true){
 return chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:engine,userId:'fixture-u',accountId:'fixture-a',conversationId:'conversation-original',sourceMessageId:'source-original',operationKey:'chat:source-original',capability:'copilot.assist',system:'系统',messages:[{role:'user',content:[{type:'text',text:'原问题'},{type:'image',image:'data:image/png;base64,AA==',mediaType:'image/png'}]}],maxSteps:4,maxOutputTokens:128,
  ...(v2?{modelRoutingVersion:2,...(engine==='codex'?{requestedModel:'root-codex-vision',codexNativeImageGeneration:false}:{})}:{}),
  tools:name?[{name,version:'1',execution:nodeExecution(name),effect:name==='script.draft'?'committed':'proposal',description:'原节点',parameters:{type:'object',properties:{},additionalProperties:false}}]:[]});
}
function controlledModel(spec:typeof api|typeof codex,text:string){
 const modelId='engine' in spec?spec.requestedModel:spec.model;
 const doGenerate=vi.fn(async()=>textReceipt(text));
 const model:LanguageModelV4={specificationVersion:'v4',provider:'engine' in spec?'codex-app-server':'creatoros-custom.chat',modelId,supportedUrls:{},doGenerate,doStream:async()=>{throw Error('不得启动主模型流');}};
 return {model:markStructuredOutputMode(model,'text'),doGenerate};
}
function nodePorts(name:ToolName,spec:typeof api|typeof codex,options:{recover?:boolean;complete?:()=>void}={}){
 const parent='parent-original',child='child-original';
 const call=vi.fn(async(port:WorkerPort,data:any,_signal?:AbortSignal)=>{
  if(port==='recordCodexToolCall')return {};
  if(port==='checkChatToolApproval')return {status:'not-applicable'};
  if(port==='reserveAgenticTool')return {callId:parent,status:'reserved',toolName:chatToolProviderName(name),input:{}};
  if(port==='startAgenticTool'||port==='settleAgenticTool')return {callId:data.callId,status:port==='startAgenticTool'?'started':data.status};
  if(port==='resolveChatGenerationCredential'){expect(data).toEqual({callId:parent});return spec;}
  if(port==='prepareChatHooks'||port==='prepareChatScriptDraft')return {system:'原系统',prompt:'原内容',operationKey:`text:${parent}`,maxOutputTokens:128};
  if(port==='prepareChatGeneration')return structuredClone(prepared);
  if(port==='reserveChatHooksModel'||port==='reserveChatScriptDraftModel'||port==='reserveChatGenerationModel'){
   expect(data.callId).toBe(parent);return {callId:child,status:options.recover?'unknown':'reserved'};
  }
  if(port==='startChatHooksModel'||port==='startChatScriptDraftModel'||port==='startChatGenerationModel')return {callId:data.callId,status:'started'};
  if(port==='settleChatHooksModel'||port==='settleChatScriptDraftModel'||port==='settleChatGenerationModel')return {callId:data.callId,status:data.status};
  if(port==='completeChatHooks'||port==='completeChatScriptDraft'||port==='completeChatGeneration'){options.complete?.();return outcome;}
  if(port==='restoreChatHooks'||port==='restoreChatScriptDraft'||port==='restoreChatGeneration')return {callId:data.callId,status:'started'};
  throw Error(`非预期端口 ${port}`);
 });return {call,parent,child};
}
beforeEach(()=>{vi.clearAllMocks();});
describe('T1278 实际聊天节点消费者',()=>{
 it.each(['script.hooks','script.draft','topic.enrich'] as const)('Codex 主回合的 %s 实际调用自己的 API provider',async name=>{
  const model=controlledModel(api,name==='topic.enrich'?'{"oneLiner":"候选"}':'候选正文');
  fixture.model.mockImplementation(spec=>{expect(spec).toEqual(api);return model.model;});
  const f=nodePorts(name,api),consumer=createExternalChatToolConsumer(chatInput('codex',name),'root-original',AbortSignal.timeout(120_000),f.call);
  try{expect((await consumer.run('provider-tool-original',name,{})).callId).toBe(f.parent);}finally{await consumer.close();}
  expect(model.doGenerate).toHaveBeenCalledTimes(1);
  const request=f.call.mock.calls.find(([port])=>['reserveChatHooksModel','reserveChatScriptDraftModel','reserveChatGenerationModel'].includes(port))![1];
  expect(request.request).toMatchObject({modelId:api.model,provider:'creatoros-custom.chat'});
  expect(f.call).toHaveBeenCalledWith('recordCodexToolCall',{callId:'root-original',toolCallId:'provider-tool-original',toolName:chatToolProviderName(name),input:'{}'},expect.anything());
  expect(f.call.mock.calls.find(([port])=>port==='startChatHooksModel'||port==='startChatScriptDraftModel'||port==='startChatGenerationModel')?.[1]).toEqual({callId:f.child});
 },180_000);
 it('已准备的 noModel draft 直接完成，不为冻结路由新增凭据或模型调用',async()=>{
  const f=nodePorts('script.draft',api),call=vi.fn(async(port:WorkerPort,data:unknown,signal?:AbortSignal)=>port==='prepareChatScriptDraft'?{system:'原系统',prompt:'已持久正文',operationKey:'draft:original',maxOutputTokens:128,noModel:true}:f.call(port,data,signal));
  const consumer=createExternalChatToolConsumer(chatInput('codex','script.draft'),'root-original',AbortSignal.timeout(120_000),call);
  try{expect((await consumer.run('provider-tool-original','script.draft',{})).callId).toBe(f.parent);}finally{await consumer.close();}
  expect(fixture.model).not.toHaveBeenCalled();
  expect(call.mock.calls.some(([port])=>port==='resolveChatGenerationCredential'||port==='reserveChatScriptDraftModel')).toBe(false);
 },180_000);

 it.each(['script.hooks','script.draft','topic.enrich'] as const)('Pi vision 主回合恢复 %s 时实际按本子 call 读 Codex，不启动主流',async name=>{
  const controller=new AbortController(),stop=Error('FIXTURE_STOP_AFTER_REAL_CHILD');
  const model=controlledModel(codex,name==='topic.enrich'?'{"oneLiner":"原候选"}':'原正文');
  model.doGenerate.mockImplementation(async()=>{expect(codexCallAuthority.getStore()).toEqual({callId:'child-original',recover:true});return textReceipt(name==='topic.enrich'?'{"oneLiner":"原候选"}':'原正文');});
  fixture.model.mockImplementation(spec=>{expect(spec).toEqual(codex);return model.model;});
  const f=nodePorts(name,codex,{recover:true,complete:()=>controller.abort(stop)});
  const list=name==='script.hooks'?'resumableToolCallIds':name==='script.draft'?'replayableScriptDraftToolCallIds':'replayableGenerationToolCallIds';
  const call=vi.fn(async(port:WorkerPort,data:unknown,signal?:AbortSignal)=>port==='readCheckpoint'?{revision:0,ledgerSequence:3,messages:[],uncheckpointedReceipts:[],pendingCalls:[{callId:f.child,status:'unknown'}],childCalls:[{callId:f.child,parentCallId:f.parent,status:'unknown'}],[list]:[f.parent],recovery:'requires_reconciliation'}:f.call(port,data,signal));
  await expect(runChatInWorker(chatInput('pi',name),{...api,model:'main-vision-api'},controller.signal,{call,approve:async()=> 'approved'})).rejects.toBeDefined();
  expect(model.doGenerate).toHaveBeenCalledTimes(1);
  expect(controller.signal.reason).toBe(stop);
  expect(call.mock.calls.some(([port])=>port==='reserveGenerationCall')).toBe(false);
  expect(f.call.mock.calls.some(([port])=>port==='startChatHooksModel'||port==='startChatScriptDraftModel'||port==='startChatGenerationModel')).toBe(false);
 },180_000);
 it('原 image unknown 只读原 thread/turn，即使当前输入有另一个 requestedModel 也不重发',async()=>{
  const rpc=rpcFixture(true),call=vi.fn(async(port:WorkerPort)=>{
   if(port==='readCodexCall')return {threadId:'thread-original',turnId:'turn-original'};
   if(port==='bindCodexCall')return {};
   throw Error(port);
  });
  const result=await generateCodexImage({prompt:'原提示词',requestedModel:'current-model-is-not-original'},'image-call-original',AbortSignal.timeout(120_000),call,true);
  expect(result.native).toMatchObject({threadId:'thread-original',turnId:'turn-original',itemId:'image-original'});
  expect(rpc.request.mock.calls.map(([method]:[string])=>method)).toEqual(['thread/read']);
 },180_000);
});

function rpcFixture(images=false){
 const items=images?[{type:'imageGeneration',id:'image-original',status:'completed',result:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')}]:[{type:'agentMessage',id:'message-original',phase:'final_answer',text:'原结果'}];
 const rpc:any={close:vi.fn(async()=>{}),request:vi.fn(async(method:string,_params:unknown)=>{
  if(method==='thread/start')return {thread:{id:'thread-original'},model:'provider-observed-model',modelProvider:'fixture'};
  if(method==='mcpServerStatus/list')return {data:[]};
  if(method==='turn/start'){
   setTimeout(()=>{void rpc.onNotification?.('turn/completed',{threadId:'thread-original',turn:{id:'turn-original',status:'completed',items}});},0);
   return {turn:{id:'turn-original'}};
  }
  if(method==='thread/read')return {thread:{id:'thread-original',turns:[{id:'turn-original',status:'completed',items}]}};
  throw Error(`非预期RPC ${method}`);
 })};fixture.session.mockResolvedValue({authenticated:true,mcpNames:[],rpc});return rpc;
}
function externalPorts(unknown=false){return vi.fn(async(port:WorkerPort,data:any)=>{
 if(port==='reserveExternalChatTurn')return unknown?{callId:'root-original',status:'unknown',protocolKind:'codex-app-server',protocolVersion:1,sessionId:'thread-original',providerTurnId:'turn-original'}:{callId:'root-original',status:'reserved'};
 if(port==='resolveModelCredential')return {...codex,requestedModel:'root-codex-vision'};
 if(port==='listExternalTaskTools')return {tools:[]};
 if(port==='readCodexCall')return {threadId:'thread-original',turnId:'turn-original',modelFacts:{model:'original-observed-model',modelProvider:'fixture'}};
 if(port==='readCheckpoint')return {};
 if(port==='bindCodexCall')return {};
 if(port==='prepareExternalChatThread')return {callId:data.callId,status:'reserved',sessionId:data.sessionId};
 if(port==='startExternalChatTurn'||port==='recordExternalChatProviderTurn')return {callId:data.callId,status:'started',...(data.providerTurnId?{providerTurnId:data.providerTurnId}:{})};
 if(port==='settleExternalChatTurn')return {callId:data.callId,status:data.status};
 throw Error(`非预期端口 ${port}`);
});}
describe('T1278 真实原生协议消费者（没有 CLI / 网络）',()=>{
 it('v2 聊天将 frozen requestedModel 传 thread/start 并关闭原生图；v1 保留原参数',async()=>{
  for(const v2 of [true,false]){
   fixture.session.mockClear();const rpc=rpcFixture(),call=externalPorts();
   expect(await runExternalChatInWorker(chatInput('codex',undefined,v2),AbortSignal.timeout(120_000),call)).toEqual({callId:'root-original'});
   expect(fixture.session.mock.calls[0]![3]).toBe(!v2);
   expect(codexProcessArguments([],fixture.session.mock.calls[0]![3])).toContain(`features.image_generation=${!v2}`);
   const start=rpc.request.mock.calls.find(([method]:[string])=>method==='thread/start')![1];
   if(v2)expect(start.model).toBe('root-codex-vision');else expect(start).not.toHaveProperty('model');
   expect(call.mock.calls.filter(([port])=>port==='resolveModelCredential')).toHaveLength(v2?1:0);
   expect(rpc.close).toHaveBeenCalledTimes(1);
  }
 },180_000);
 it.each([true,false])('原 unknown v2=%s 只读同 thread/turn，不再发根 prompt 或领取根凭据',async v2=>{
  const rpc=rpcFixture(),call=externalPorts(true);
  expect(await runExternalChatInWorker(chatInput('codex',undefined,v2),AbortSignal.timeout(120_000),call)).toEqual({callId:'root-original'});
  expect(rpc.request.mock.calls.map(([method]:[string])=>method)).toEqual(['thread/read']);
  expect(rpc.request).toHaveBeenCalledWith('thread/read',{threadId:'thread-original',includeTurns:true});
  expect(call.mock.calls.some(([port])=>port==='resolveModelCredential'||port==='startExternalChatTurn')).toBe(false);
 },180_000);
 it.each([true,false])('generateCodexImage 实际 thread/start 消费 frozen ID，v1不填默认；v2=%s',async v2=>{
  const rpc=rpcFixture(true),call=vi.fn(async(port:WorkerPort)=>{if(port==='bindCodexCall')return {};throw Error(port);});
  const result=await generateCodexImage({prompt:'受控图',...(v2?{requestedModel:'frozen-image-model'}:{})},'image-call-original',AbortSignal.timeout(120_000),call);
  const start=rpc.request.mock.calls.find(([method]:[string])=>method==='thread/start')![1];
  if(v2)expect(start.model).toBe('frozen-image-model');else expect(start).not.toHaveProperty('model');
  expect(result.native).toMatchObject({threadId:'thread-original',turnId:'turn-original',itemId:'image-original'});
  expect(Buffer.from(result.assetBytes)).toEqual(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));
  expect(call.mock.calls.some(([port])=>port==='bindCodexCall')).toBe(true);
  expect(rpc.close).toHaveBeenCalledTimes(1);
 },180_000);
});
