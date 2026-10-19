import {beforeEach,expect,it,vi} from 'vitest';
import {chatWorkerInputSchema,chatToolProviderName,type WorkerPort} from '@creatoros/contract/execution-worker';
const boundaries=vi.hoisted(()=>({native:vi.fn(),read:vi.fn(),textNode:vi.fn(),session:vi.fn(),generation:vi.fn(),close:vi.fn()}));
vi.mock('./codex-native-turn',()=>({runCodexNativeTurn:boundaries.native,recoverCodexNativeTurn:boundaries.read}));
vi.mock('./codex-app-server',async original=>({...await original<typeof import('./codex-app-server')>(),createControlledCodexSession:boundaries.session}));
vi.mock('./chat-generation-worker',()=>({runChatGenerationInWorker:boundaries.generation}));
vi.mock('./chat-text-node-worker',()=>({runChatTextNodeInWorker:boundaries.textNode}));
import {runExternalChatInWorker} from './external-chat-worker-run';
const input=chatWorkerInputSchema.parse({kind:'chat.run' as const,executionEngine:'codex' as const,userId:'fixture',accountId:'account',conversationId:'conversation',sourceMessageId:'source',operationKey:'chat-op',capability:'copilot.assist',system:'原系统',messages:[{role:'user' as const,content:[{type:'text',text:'生成'},{type:'image',image:'data:image/png;base64,AA==',mediaType:'image/png'}]}],maxSteps:6,maxOutputTokens:128,tools:[{name:'topic.enrich',version:'1',execution:'worker.structured-node' as const,effect:'proposal' as const,description:'节点',parameters:{type:'object'}}]});
const output={status:'ok',summary:'真实候选回执',evidence:[],data:{kind:'topic.enrich',draft:{}},error:null,continuation:null,sideEffect:'proposal'};
beforeEach(()=>{vi.clearAllMocks();boundaries.session.mockResolvedValue({authenticated:true,mcpNames:[],rpc:{close:boundaries.close}});boundaries.generation.mockResolvedValue(output);});
it.each([false,true])('原生external根实际回调消费者，工具绑定真实thread/turn后使用原Worker与ordinary ledger；图片回退=%s',async fallback=>{
 if(fallback)boundaries.session.mockRejectedValueOnce(new PreAdmissionCodexError('CODEX_IMAGE_CAPABILITY_UNAVAILABLE'));
 const ports=vi.fn(async(port:WorkerPort,data:any)=>{
  if(port==='reserveExternalChatTurn')return {callId:'external-root',status:'reserved'};
  if(port==='listExternalTaskTools')return {tools:input.tools.map(t=>({name:t.name,version:t.version,description:t.description,inputSchema:t.parameters}))};
  if(port==='prepareExternalChatThread')return {callId:data.callId,status:'reserved',sessionId:data.sessionId};
  if(port==='startExternalChatTurn')return {callId:data.callId,status:'started'};
  if(port==='recordExternalChatProviderTurn')return {callId:data.callId,status:'started',providerTurnId:data.providerTurnId};
  if(port==='bindCodexCall'||port==='recordCodexToolCall')return {};
  if(port==='checkChatToolApproval')return {status:'not-applicable'};
  if(port==='reserveAgenticTool')return {callId:'ordinary',status:'reserved',toolName:chatToolProviderName('topic.enrich'),input:{}};
  if(port==='startAgenticTool')return {callId:data.callId,status:'started'};
  if(port==='settleAgenticTool')return {callId:data.callId,status:data.status};
  if(port==='settleExternalChatTurn')return {callId:data.callId,status:data.status};
  throw Error(`非预期端口${port}`);
 });
 boundaries.native.mockImplementation(async options=>{expect(options.images).toEqual([{url:'data:image/png;base64,AA=='}]);await options.onThread('actual-thread');await options.onAdmission('actual-thread');await options.onTurn('actual-turn');expect(await options.onTool('actual-tool','topic_enrich',{})).toMatchObject({success:true});return {sessionId:'actual-thread',providerTurnId:'actual-turn',text:'最终正文',usage:null};});
 expect(await runExternalChatInWorker(input,new AbortController().signal,ports)).toEqual({callId:'external-root'});
 expect(boundaries.session).toHaveBeenLastCalledWith(expect.anything(),expect.anything(),undefined,!fallback,true);
 expect(ports).toHaveBeenCalledWith('bindCodexCall',{callId:'external-root',threadId:'actual-thread',turnId:'actual-turn'},expect.anything());
 expect(ports).toHaveBeenCalledWith('recordCodexToolCall',{callId:'external-root',toolCallId:'actual-tool',toolName:'topic_enrich',input:'{}'},expect.anything());
 expect(boundaries.generation).toHaveBeenCalledWith('ordinary',expect.anything(),ports);expect(ports.mock.calls.some(([p])=>p==='executeExternalTaskTool')).toBe(false);
 expect(boundaries.close).toHaveBeenCalledTimes(1);
});

it('unknown原生聊天只读原thread/turn前消费宿主已审原hooks/draft名单，不重发根prompt',async()=>{
 const order:string[]=[],ports=vi.fn(async(port:WorkerPort,data:any)=>{
  order.push(`${port}:${data.callId??''}`);
  if(port==='reserveExternalChatTurn')return {callId:'original-root',status:'unknown',protocolKind:'codex-app-server',protocolVersion:1,sessionId:'original-thread',providerTurnId:'original-turn'};
  if(port==='readCodexCall')return {threadId:'original-thread',turnId:'original-turn',modelFacts:{model:'original-model',modelProvider:'original-provider'}};
  if(port==='readCheckpoint')return {resumableToolCallIds:['original-hooks'],replayableScriptDraftToolCallIds:['original-draft'],pendingCalls:[{callId:'other-unknown',status:'unknown'}]};
  if(port==='restoreChatHooks'||port==='restoreChatScriptDraft')return {callId:data.callId,status:'started'};
  if(port==='bindCodexCall')return {};
  if(port==='settleExternalChatTurn')return {callId:data.callId,status:data.status};
  throw Error(port);
 });
 boundaries.textNode.mockImplementation(async(id,_model,_signal,_call,node)=>{order.push(`${node}:${id}`);return output;});
 boundaries.read.mockImplementation(async(_rpc,thread,turn)=>{expect([thread,turn]).toEqual(['original-thread','original-turn']);order.push('原thread/read');return {sessionId:thread,providerTurnId:turn,text:'原已完成回合',usage:null};});
 expect(await runExternalChatInWorker(input,new AbortController().signal,ports)).toEqual({callId:'original-root'});
 expect(boundaries.native).not.toHaveBeenCalled();expect(order.slice(0,8)).toEqual(['reserveExternalChatTurn:','readCodexCall:original-root','readCheckpoint:','restoreChatHooks:original-hooks','restoreChatScriptDraft:original-draft','hooks:original-hooks','script-draft:original-draft','原thread/read']);
 expect(ports.mock.calls.find(([port])=>port==='bindCodexCall')?.[1]).toMatchObject({modelFacts:{model:'original-model',modelProvider:'original-provider'}});
});

it('原生聊天真实imageGeneration item字节走原素材端口后再结算，无独立API模型',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),ports=vi.fn(async(port:WorkerPort,data:any)=>{
  if(port==='reserveExternalChatTurn')return {callId:'image-root',status:'reserved'};if(port==='listExternalTaskTools')return {tools:[]};
  if(port==='prepareExternalChatThread')return {callId:data.callId,status:'reserved',sessionId:data.sessionId};if(port==='startExternalChatTurn')return {callId:data.callId,status:'started'};if(port==='recordExternalChatProviderTurn')return {callId:data.callId,status:'started',providerTurnId:data.providerTurnId};if(port==='bindCodexCall')return {};
  if(port==='recoverExternalChatImage')return {status:'reserved'};
  if(port==='saveExternalChatImage')return {status:'committed',receipt:{toolCallId:data.toolCallId,imageIndex:0,nativeSource:data.nativeSource,assetId:'pending-image',fileId:'actual-file',assetType:'image',name:'原生图片',checksum:data.nativeSource.checksum,byteLength:data.bytes.length,committedAt:'2026-10-11T00:00:00Z'}};
  if(port==='settleExternalChatTurn')return {callId:data.callId,status:data.status};throw Error(port);
 });
 boundaries.native.mockImplementation(async options=>{await options.onThread('image-thread');await options.onAdmission('image-thread');await options.onTurn('image-turn');return {sessionId:'image-thread',providerTurnId:'image-turn',text:'',model:'actual-runtime-model',modelProvider:'actual-provider',images:[{id:'actual-image-item',base64:bytes.toString('base64')}],usage:null};});
 expect(await runExternalChatInWorker({...input,tools:[]},new AbortController().signal,ports)).toEqual({callId:'image-root'});
 const saved=ports.mock.calls.find(([port])=>port==='saveExternalChatImage')![1];expect(saved).toMatchObject({callId:'image-root',sessionId:'image-thread',toolCallId:'actual-image-item',imageIndex:0,nativeSource:{providerTurnId:'image-turn',itemId:'actual-image-item'}});expect(Buffer.from(saved.bytes)).toEqual(bytes);
 expect(ports.mock.calls.find(([port,data])=>port==='settleExternalChatTurn'&&data.status==='settled')?.[1].receipt).toMatchObject({images:[{assetId:'pending-image'}]});expect(boundaries.session).toHaveBeenCalledWith(expect.anything(),expect.anything(),undefined,true,true);
});

// T1294：运行真实external-chat入口，只替换非付费宿主/会话边界；禁止真CLI/turn。
import {GenerationFailure as PreAdmissionFailure} from './generation-error';
import {CodexHostError as PreAdmissionCodexError} from './codex-app-server-protocol';
function preAdmissionFixture(options:{reservation?:unknown;reserveError?:unknown;credential?:unknown;credentialError?:unknown;ack?:unknown;settleError?:unknown;v2?:boolean}={}){
 boundaries.native.mockReset();boundaries.read.mockReset();boundaries.session.mockReset();boundaries.close.mockReset();
 boundaries.close.mockResolvedValue(undefined);
 boundaries.session.mockRejectedValue(new PreAdmissionCodexError('CODEX_RPC_REJECTED'));
 const source=chatWorkerInputSchema.parse({...input,tools:[],messages:[{role:'user',content:'仅受控握手fixture'}],...(options.v2?{modelRoutingVersion:2,codexNativeImageGeneration:false,requestedModel:'fixture-real-default'}:{})});
 const ports=vi.fn(async(port:WorkerPort,data:any)=>{
  if(port==='reserveExternalChatTurn'){if(options.reserveError)throw options.reserveError;return 'reservation' in options?options.reservation:{callId:'precheck-original-call',status:'reserved'};}
  if(port==='resolveModelCredential'){if(options.credentialError)throw options.credentialError;return options.credential??{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'fixture-real-default'};}
  if(port==='settleExternalChatTurn'){if(options.settleError)throw options.settleError;return 'ack' in options?options.ack:{callId:data.callId,status:data.status};}
  if(port==='prepareExternalChatThread')return {callId:data.callId,status:'reserved',sessionId:data.sessionId};
  if(port==='startExternalChatTurn')throw Error('FIXTURE_ADMISSION_ACK_LOST');
  if(port==='listExternalTaskTools')return {tools:[]};
  throw Error(`UNEXPECTED_FIXTURE_PORT:${port}`);
 });
 const settleCalls=()=>ports.mock.calls.filter(([port])=>port==='settleExternalChatTurn');
 return {source,ports,settleCalls};
}
async function preAdmissionError(task:Promise<unknown>){return task.then(()=>{throw Error('EXPECTED_PRE_ADMISSION_FAILURE');},error=>error);}
function expectNoNewTurn(){expect(boundaries.native).not.toHaveBeenCalled();expect(boundaries.read).not.toHaveBeenCalled();}

it('clean reserved本地握手拒绝只结算原call，严格ACK后投预检查阶段，零turn且不重reserve',async()=>{
 const f=preAdmissionFixture();
 const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error).toMatchObject({outcome:'waiting_user',errorCode:'CODEX_SESSION_PRECHECK_REJECTED'});
 expect(f.settleCalls()).toHaveLength(1);expect(f.settleCalls()[0]![1]).toEqual({callId:'precheck-original-call',status:'rejected',rejectionCode:'CODEX_RPC_REJECTED'});
 expect(f.ports.mock.calls.filter(([p])=>p==='reserveExternalChatTurn')).toHaveLength(1);expectNoNewTurn();
});

it.each(['MODEL_AUTHORITY_CHANGED','MODEL_CREDENTIAL_UNAVAILABLE'] as const)('v2 typed %s保原安全码，不误报本地Codex预检查',async code=>{
 const f=preAdmissionFixture({v2:true,credentialError:new PreAdmissionFailure('waiting_user',code)});
 expect(await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports))).toMatchObject({outcome:'waiting_user',errorCode:code});
 expect(f.settleCalls()).toHaveLength(1);expect(f.settleCalls()[0]![1]).toEqual({callId:'precheck-original-call',status:'rejected',rejectionCode:code});
 expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it('v2冻结真实模型身份不符保原拒绝码，不能换模型或创建session',async()=>{
 const f=preAdmissionFixture({v2:true,credential:{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'different-real-model'}});
 expect(await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports))).toMatchObject({outcome:'waiting_user',errorCode:'MODEL_ROUTE_IDENTITY_CHANGED'});
 expect(f.settleCalls()).toHaveLength(1);expect(f.settleCalls()[0]![1]).toMatchObject({callId:'precheck-original-call',status:'rejected',rejectionCode:'MODEL_ROUTE_IDENTITY_CHANGED'});
 expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it.each(['HOST_PORT_REJECTED','HOST_PORT_TIMEOUT','LEASE_FENCE_MISMATCH'])('v2宿主%s不按字符串猜配置，不伪造rejected',async code=>{
 const f=preAdmissionFixture({v2:true,credentialError:new Error(code)});
 const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);
 expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it.each([
 {name:'reserve通讯失败',reserveError:new Error('HOST_PORT_TIMEOUT')},
 {name:'reserve无回执',reservation:undefined},
 {name:'reserve无callId',reservation:{status:'reserved'}},
 {name:'reserve空callId',reservation:{callId:'',status:'reserved'}},
])('$name无可信原call，不结算也不再reserve',async options=>{
 const f=preAdmissionFixture(options);const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(f.settleCalls()).toHaveLength(0);
 expect(f.ports.mock.calls.filter(([p])=>p==='reserveExternalChatTurn')).toHaveLength(1);expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it.each([
 {name:'结算抛错',settleError:new Error('ACK_LOST')},
 {name:'丢结算ACK',ack:undefined},
 {name:'错callId',ack:{callId:'other-call',status:'rejected'}},
 {name:'错status',ack:{callId:'precheck-original-call',status:'started'}},
 {name:'畸形ACK',ack:{callId:'precheck-original-call'}},
])('本地拒绝但$name只保unknown，一次原结算不冒waiting_user',async options=>{
 const f=preAdmissionFixture(options);const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(error.errorCode).not.toBe('CODEX_SESSION_PRECHECK_REJECTED');
 expect(f.settleCalls()).toHaveLength(1);expect(f.settleCalls()[0]![1]).toMatchObject({callId:'precheck-original-call',status:'rejected'});expectNoNewTurn();
});

it('进入前已取消：原AbortError，不reserve、不创建会话、不结算rejected',async()=>{
 const f=preAdmissionFixture(),controller=new AbortController();controller.abort();
 expect(await preAdmissionError(runExternalChatInWorker(f.source,controller.signal,f.ports))).toMatchObject({name:'AbortError'});
 expect(f.ports).not.toHaveBeenCalled();expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it.each(['resolve','session'] as const)('%s期间取消优先于typed/本地拒绝，不制造拒绝账本',async phase=>{
 const controller=new AbortController();const f=preAdmissionFixture({v2:true});
 if(phase==='session')boundaries.session.mockImplementation(async()=>{controller.abort();throw new PreAdmissionCodexError('CODEX_RPC_REJECTED');});
 else f.ports.mockImplementation(async(port:WorkerPort)=>{if(port==='reserveExternalChatTurn')return {callId:'precheck-original-call',status:'reserved'};if(port==='resolveModelCredential'){controller.abort();throw new PreAdmissionFailure('waiting_user','MODEL_AUTHORITY_CHANGED');}throw Error('UNEXPECTED_FIXTURE_PORT');});
 expect(await preAdmissionError(runExternalChatInWorker(f.source,controller.signal,f.ports))).toMatchObject({name:'AbortError'});
 expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);expectNoNewTurn();
});

it('会话返回AbortError即取消，不把无显式signal标记的取消冒能力失败',async()=>{
 const f=preAdmissionFixture();boundaries.session.mockRejectedValue(new DOMException('fixture cancellation','AbortError'));
 expect(await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports))).toMatchObject({name:'AbortError'});
 expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);expectNoNewTurn();
});

it.each(['started','unknown'] as const)('进入即%s的旧回合，握手失败仍保原thread/turn，绝不按局部admission=false拒绝',async status=>{
 const f=preAdmissionFixture({reservation:{callId:'precheck-original-call',status,protocolKind:'codex-app-server',protocolVersion:1,sessionId:'original-thread',providerTurnId:'original-turn'}});
 const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);expectNoNewTurn();
 expect(f.ports.mock.calls.some(([p])=>p==='startExternalChatTurn'||p==='prepareExternalChatThread')).toBe(false);
});

it('reserved已有thread保持原reconciliation guard，不建立新会话/turn',async()=>{
 const f=preAdmissionFixture({reservation:{callId:'precheck-original-call',status:'reserved',sessionId:'original-thread'}});
 expect(await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports))).toMatchObject({outcome:'waiting_user',errorCode:'CODEX_PREPARED_THREAD_REQUIRES_RECONCILIATION'});
 expect(f.settleCalls()).toHaveLength(0);expect(boundaries.session).not.toHaveBeenCalled();expectNoNewTurn();
});

it('reserved只有既有providerTurnId也不是clean，不能拒绝原回合或开新turn',async()=>{
 const f=preAdmissionFixture({reservation:{callId:'precheck-original-call',status:'reserved',providerTurnId:'original-turn'}});
 const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);expectNoNewTurn();
});

it('已尝试admission且ACK丢失：保unknown，不能因尚未收到turn回执而结算rejected',async()=>{
 const f=preAdmissionFixture();boundaries.session.mockResolvedValue({authenticated:true,mcpNames:[],rpc:{close:boundaries.close}});
 boundaries.native.mockImplementation(async options=>{await options.onThread('new-thread');await options.onAdmission('new-thread');throw Error('UNREACHABLE_AFTER_ADMISSION_ACK_LOST');});
 const error=await preAdmissionError(runExternalChatInWorker(f.source,new AbortController().signal,f.ports));
 expect(error).toBeInstanceOf(PreAdmissionFailure);expect(error.outcome).toBe('unknown_result');expect(f.settleCalls().some(([,d])=>d.status==='rejected')).toBe(false);
 expect(boundaries.native).toHaveBeenCalledTimes(1);expect(f.ports.mock.calls.filter(([p])=>p==='startExternalChatTurn')).toHaveLength(1);expect(boundaries.close).toHaveBeenCalledTimes(1);
});
