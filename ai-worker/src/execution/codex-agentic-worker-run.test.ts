import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkerPort} from '@creatoros/contract/execution-worker';
const native=vi.hoisted(()=>({start:vi.fn(),recover:vi.fn(),session:vi.fn(),close:vi.fn()}));
vi.mock('./codex-native-turn',()=>({runCodexNativeTurn:native.start,recoverCodexNativeTurn:native.recover}));
vi.mock('./codex-app-server',async original=>({...await original<typeof import('./codex-app-server')>(),createControlledCodexSession:native.session}));
import {runCodexAgenticInWorker} from './codex-agentic-worker-run';
const input={kind:'agentic.run' as const,operationKey:'agent',taskType:'agentic.research' as const,goal:'读取资料再形成建议',systemPrompt:'使用真实工具',capability:'research',maxOutputTokens:100,dryRun:false,tools:[{name:'web.read',version:'1',label:'读取',description:'读取',parameters:{type:'object',properties:{url:{type:'string'}},required:['url']},effect:'none' as const}]};
const spec={engine:'codex' as const,protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const};
const result={sessionId:'thread-1',providerTurnId:'turn-1',text:'真实总结',model:'actual-codex-model',modelProvider:'openai',usage:{inputTokens:3,outputTokens:4,totalTokens:7,cachedReadTokens:1,thoughtTokens:2}};
function ports(status='reserved',binding:unknown=null){
 let state=status,providerResult:unknown,revision=0,maxTokens=5000,messages:Array<{role:string;callId:string}>=[];
 const toolRows:Array<{callId:string;status:string;receipt?:unknown}>=[];const mutations:string[]=[];
 const call=vi.fn(async(port:WorkerPort,raw:unknown)=>{
  const data=raw as Record<string,any>;
  if(port==='reserveAgenticModel')return {callId:'model-1',status:state,...(providerResult?{providerResult}:{})};
  if(port==='readCodexCall')return binding;
  if(port==='bindCodexCall'){binding={...binding as object,...data};return binding;}
  if(port==='recordCodexToolCall'){binding={...binding as object,tools:{'tool-1':data}};return binding;}
  if(port==='readCheckpoint')return {revision,ledgerSequence:1+toolRows.length,messages,uncheckpointedReceipts:[...(state==='settled'?[{callId:'model-1',kind:'model',sequence:1,providerResult}]:[]),...toolRows.filter(t=>t.status==='settled').map((t,i)=>({callId:t.callId,kind:'tool',sequence:i+2,resultText:JSON.stringify(t.receipt)}))],recovery:'ready',budget:{maxCalls:8,maxTokens},knownSpentTokens:0,acknowledgedBlockedCallIds:[]};
  if(port==='saveCheckpoint'){messages=data.messages;return {revision:++revision};}
  if(port==='startCall'){mutations.push(port);state='started';return {callId:'model-1',status:state};}
  if(port==='settleGenerationCall'){mutations.push(port);state=data.status;providerResult=data.providerResult;return {callId:'model-1',status:state};}
  if(port==='reserveAgenticTool'){let row=toolRows[0];if(!row){row={callId:'host-tool-1',status:'reserved'};toolRows.push(row);}return {...row,toolName:'web.read',input:{url:'https://example.com'}};}
  if(port==='startAgenticTool'){toolRows[0]!.status='started';return {callId:'host-tool-1',status:'started'};}
  if(port==='executeAgenticTool')return {status:'ok',summary:'已读',evidence:[],data:{text:'真实来源'},error:null,continuation:null,sideEffect:'none'};
  if(port==='settleAgenticTool'){const row=toolRows[0]!;row.status=data.status;row.receipt={schemaVersion:1,kind:'tool',toolCallId:'tool-1',toolName:'web.read',output:data.output};return {callId:row.callId,status:row.status};}
  throw Error('unexpected '+port);
 });
 return {call,mutations,toolRows,get providerResult(){return providerResult;},set providerResult(value){providerResult=value;},get messages(){return messages;},set maxTokens(value:number){maxTokens=value;}};
}
beforeEach(()=>{vi.clearAllMocks();native.session.mockResolvedValue({rpc:{close:native.close},authenticated:true,mcpNames:[]});native.start.mockResolvedValue(result);native.recover.mockResolvedValue(result);});
describe('Codex原生Agent持久闭环',()=>{
 it.each(['started','unknown'])('缺少原线程绑定的%s不能发送新提示词',async status=>{
  const f=ports(status);await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'unknown_result'});
  expect(native.start).not.toHaveBeenCalled();expect(native.recover).not.toHaveBeenCalled();
 });
 it('已结算原回执回放不启动Codex或改写真实usage',async()=>{
  const f=ports('settled');f.providerResult={content:[{type:'text',text:'原总结'}],finishReason:{unified:'stop',raw:'completed'},usage:{inputTokens:{total:3},outputTokens:{total:4}},warnings:[],providerMetadata:{codex:{threadId:'thread-1',turnId:'turn-1',model:'actual-codex-model'}}};
  expect(await runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).toMatchObject({summary:'原总结',actualEngine:'codex'});
  expect(native.session).not.toHaveBeenCalled();expect(f.mutations).toEqual([]);expect(f.messages).toEqual([{role:'assistant',callId:'model-1'}]);
 });
 it('真实native工具经原Host执行并保存模型来源与完整检查点',async()=>{
  const f=ports();native.start.mockImplementation(async options=>{await options.onThread('thread-1');await options.onTurn('turn-1');expect(options.tools).toEqual([{name:'web_read',description:input.tools[0]!.description,inputSchema:input.tools[0]!.parameters}]);await options.onTool('tool-1','web_read',{url:'https://example.com'});return result;});
  const output=await runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call);
  expect(output.toolCallIds).toEqual(['host-tool-1']);expect(f.providerResult).toMatchObject({content:expect.arrayContaining([{type:'tool-call',toolCallId:'tool-1',toolName:'web.read',input:'{"url":"https://example.com"}'}]),providerMetadata:{codex:{threadId:'thread-1',turnId:'turn-1',model:'actual-codex-model'}}});
  expect(f.messages).toEqual([{role:'assistant',callId:'model-1'},{role:'tool',callId:'host-tool-1'}]);
 });
 it('unknown只核对原turn并恢复已完成工具引用',async()=>{
  const f=ports('unknown',{threadId:'thread-1',turnId:'turn-1',tools:{'tool-1':{toolCallId:'tool-1',toolName:'web.read',input:'{"url":"https://example.com"}'}}});
  f.toolRows.push({callId:'host-tool-1',status:'settled',receipt:{schemaVersion:1,kind:'tool',toolCallId:'tool-1',toolName:'web.read',output:{status:'ok',summary:'已读取',evidence:[],error:null,continuation:null,sideEffect:'none'}}});
  native.recover.mockResolvedValue({...result,usage:null});
  await runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call);
  expect(native.start).not.toHaveBeenCalled();expect(native.recover).toHaveBeenCalledWith(expect.anything(),'thread-1','turn-1',expect.any(AbortSignal));
  expect(f.providerResult).toMatchObject({content:expect.arrayContaining([expect.objectContaining({type:'tool-call',toolCallId:'tool-1'})])});
 });
 it('观察到真实usage越过原预算即停止，保留unknown且不发送第二回合',async()=>{
  const f=ports();f.maxTokens=5;
  native.start.mockImplementation(async options=>{await options.onThread('thread-1');await options.onTurn('turn-1');await options.onUsage(result.usage);expect(options.signal.aborted).toBe(true);throw Error('cancelled');});
  await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_TOKEN_BUDGET_EXHAUSTED'});
  expect(native.start).toHaveBeenCalledTimes(1);expect(f.call).toHaveBeenCalledWith('bindCodexCall',{callId:'model-1',observedUsage:{inputTokens:3,outputTokens:4,totalTokens:7}});expect(f.call).toHaveBeenCalledWith('settleGenerationCall',{callId:'model-1',status:'unknown'});
 });
 it('外来回合完成结果不能覆盖当前原调用',async()=>{
  const f=ports();native.start.mockImplementation(async options=>{await options.onThread('thread-1');await options.onTurn('turn-1');return {...result,providerTurnId:'foreign-turn'};});
  await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_AGENT_RESULT_SCOPE_MISMATCH'});expect(f.providerResult).toBeUndefined();
 });
 it('native恢复中未完成的原工具不能伪装成功检查点',async()=>{
  const f=ports('unknown',{threadId:'thread-1',turnId:'turn-1',tools:{'tool-1':{toolCallId:'tool-1',toolName:'web.read',input:'{}'}}});
  await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_AGENT_TOOL_RECEIPT_MISSING'});expect(f.messages).toEqual([]);expect(native.start).not.toHaveBeenCalled();
 });
 it('首次登录失败保留原预约而不进行模型回合',async()=>{
  const f=ports();native.session.mockResolvedValue({rpc:{close:native.close},authenticated:false,mcpNames:[]});
  await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED'});expect(native.start).not.toHaveBeenCalled();
 });

 it('T1329编码碰撞在任何Host端口或模型预约之前拒绝',async()=>{
  const f=ports();const collision={...input,tools:[input.tools[0]!,{...input.tools[0]!,name:'web_read'}]};
  await expect(runCodexAgenticInWorker(collision,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'failed',errorCode:'CODEX_TOOL_NAME_COLLISION'});
  expect(f.call).not.toHaveBeenCalled();expect(native.session).not.toHaveBeenCalled();expect(native.start).not.toHaveBeenCalled();
 });
 it.each(['foreign_tool','web.read'])('T1329未声明provider名%s不记工具或执行业务',async providerName=>{
  const f=ports();native.start.mockImplementation(async options=>{await options.onThread('thread-1');await options.onTurn('turn-1');await options.onTool('foreign-call',providerName,{url:'https://example.com'});return result;});
  await expect(runCodexAgenticInWorker(input,spec,new AbortController().signal,f.call)).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_TOOL_UNAVAILABLE'});
  expect(f.call.mock.calls.filter(([port])=>['recordCodexToolCall','reserveAgenticTool','startAgenticTool','executeAgenticTool','settleAgenticTool'].includes(port))).toEqual([]);
  expect(f.call).toHaveBeenCalledWith('settleGenerationCall',{callId:'model-1',status:'unknown'});expect(native.start).toHaveBeenCalledTimes(1);
 });
 it('T1329普通名字原样保留，多个工具声明顺序与完整schema不变',async()=>{
  const f=ports();const many={...input,tools:[input.tools[0]!,{...input.tools[0]!,name:'safe_tool-name',description:'完整第二说明',parameters:{type:'object',properties:{nested:{type:'object',properties:{value:{type:'string',enum:['a','b']}}}},required:['nested'],additionalProperties:false}}]};
  native.start.mockImplementation(async options=>{expect(options.tools).toEqual(many.tools.map(tool=>({name:tool.name==='web.read'?'web_read':tool.name,description:tool.description,inputSchema:tool.parameters})));await options.onThread('thread-1');await options.onTurn('turn-1');return result;});
  await runCodexAgenticInWorker(many,spec,new AbortController().signal,f.call);expect(native.session.mock.calls[0]).toHaveLength(6);expect(native.session).toHaveBeenCalledWith(expect.any(String),expect.any(AbortSignal),undefined,false,true,true);
  expect(native.start.mock.calls[0]![0].prompt).toBe(JSON.stringify({system:many.systemPrompt,goal:many.goal}));
  expect(f.call.mock.calls.find(([port])=>port==='reserveAgenticModel')?.[1]).toMatchObject({request:{tools:expect.arrayContaining([expect.objectContaining({name:'web.read'}),expect.objectContaining({name:'safe_tool-name'})])}});
 });

});
