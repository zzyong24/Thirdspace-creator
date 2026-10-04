import {afterEach, expect, it, vi} from 'vitest';
import type {SessionNotification} from '@agentclientprotocol/sdk';
import type {WorkerPort} from '@creatoros/contract/execution-worker';

const boundaries = vi.hoisted(() => ({host:vi.fn(),bridge:vi.fn(),directory:vi.fn(),prompt:vi.fn()}));
vi.mock('./codex-acp-host',() => ({createCodexAcpHost:boundaries.host}));
vi.mock('./external-task-mcp-bridge',() => ({startExternalTaskMcpBridge:boundaries.bridge}));
// 原 helper 模块回引本 runner；替换宿主边界，避免测试触发另一条 native 执行路径。
vi.mock('./external-chat-worker-run',() => ({externalAgentWorkingDirectory:boundaries.directory,externalChatPrompt:boundaries.prompt}));
import {runCodexAcpInWorker} from './codex-acp-worker-run';
import {CodexHostError} from './codex-app-server';
import {GenerationFailure} from './generation-error';

type Input = Parameters<typeof runCodexAcpInWorker>[0];
type Call = Parameters<typeof runCodexAcpInWorker>[2];
type PortHandler = (data:Record<string,unknown>,signal?:AbortSignal)=>unknown|Promise<unknown>;
const input = {userId:'user',accountId:'account',sourceMessageId:'source',system:'任务',messages:[]} as unknown as Input;
const callId = 'turn-call-actual';
const sessionId = 'thread-actual';
const providerTurnId = 'native-turn-actual';
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(error:unknown)=>void;
  const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function record(value:unknown):Record<string,unknown> {
  return value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function imageReceipt(toolCallId='image-tool') {
  return {toolCallId,imageIndex:0,assetId:'asset-actual',fileId:'file-actual',assetType:'image' as const,
    name:'正文配图',checksum:'a'.repeat(64),byteLength:png.length,committedAt:'2026-10-04T00:00:00Z'};
}
function fixture() {
  for (const boundary of Object.values(boundaries)) boundary.mockReset();
  const controller = new AbortController();
  const events:string[] = [];
  let notify:((notification:SessionNotification)=>void)|undefined;
  const emit = (update:unknown,thread=sessionId) => {
    if(!notify)throw Error('测试客户端尚未建立');
    notify({sessionId:thread,update} as SessionNotification);
  };
  const client = {waitForSessionUpdatesIdle:vi.fn(async()=>{}),createSession:vi.fn(async()=>({sessionId})),
    prompt:vi.fn(async(..._args:unknown[])=>{
      events.push('prompt');emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'已完成正文'}});
      return {stopReason:'end_turn',_meta:{creatoros:{codex:{threadId:sessionId,turnId:providerTurnId,status:'completed'}}}};
    }),cancel:vi.fn(async(_session:string)=>{}),close:vi.fn(async()=>{})};
  const bridge = {configuration:{type:'http',name:'creatoros-task-fixture',url:'http://127.0.0.1:1/mcp',headers:[]},close:vi.fn(async()=>{})};
  boundaries.directory.mockResolvedValue('/tmp/t1060-protocol-fixture');
  boundaries.prompt.mockReturnValue('已冻结的提示');
  boundaries.bridge.mockResolvedValue(bridge);
  boundaries.host.mockImplementation(async(_cwd:unknown,_signal:unknown,_servers:unknown,_tools:unknown,onUpdate:(notification:SessionNotification)=>void)=>{
    notify=onUpdate;return {client,protocolVersion:1,loginStatus:'authenticated'};
  });
  const ports:Partial<Record<WorkerPort,PortHandler>> = {
    reserveExternalChatTurn:()=>({callId,status:'reserved'}),
    listExternalTaskTools:()=>({tools:[{name:'read_project',version:'1',description:'读取项目',inputSchema:{type:'object'}}]}),
    startExternalChatTurn:()=>({callId,status:'started',sessionId}),
    recordExternalChatProviderTurn:data=>({callId,status:'started',sessionId,providerTurnId:data.providerTurnId}),
    recoverExternalChatImage:()=>({status:'missing'}),
    saveExternalChatImage:data=>({status:'committed',receipt:imageReceipt(String(data.toolCallId))}),
    settleExternalChatTurn:data=>({callId,status:data.status,...(data.receipt?{receipt:data.receipt}:{})}),
  };
  const call = vi.fn(async(port:WorkerPort,data:unknown,signal?:AbortSignal):Promise<unknown>=>{
    events.push(port);const handler=ports[port];if(!handler)throw Error(`未替换端口 ${port}`);
    return await handler(record(data),signal);
  });
  const run = (onText?:(text:string)=>void|Promise<void>)=>runCodexAcpInWorker(input,controller.signal,call as Call,onText);
  const called = (port:WorkerPort)=>call.mock.calls.filter(([name])=>name===port);
  const settlements = ()=>called('settleExternalChatTurn').map(([,data])=>record(data));
  return {controller,events,emit,client,bridge,ports,call,run,called,settlements};
}
afterEach(()=>{vi.resetAllMocks();});

it('原 Worker 等待后台持久入场确认后才 prompt，客户端观察写请求不能替代确认',async()=>{
  const f=fixture(),ack=deferred<unknown>();f.ports.startExternalChatTurn=()=>ack.promise;
  const running=f.run();
  await vi.waitFor(()=>expect(f.called('startExternalChatTurn')).toHaveLength(1));
  expect(f.client.prompt).not.toHaveBeenCalled();expect(f.settlements()).toEqual([]);
  expect(f.called('startExternalChatTurn')[0]?.[1]).toEqual({callId,sessionId,protocolKind:'acp',protocolVersion:1});
  ack.resolve({callId,status:'started',sessionId});
  expect(await running).toEqual({callId});
  expect(f.events.indexOf('startExternalChatTurn')).toBeLessThan(f.events.indexOf('prompt'));
  expect(f.client.prompt).toHaveBeenCalledWith(sessionId,'已冻结的提示',undefined,undefined,expect.any(Function),{signal:f.controller.signal});
});

it('入场确认异常或返回非 started 都不 prompt，按原账本标未知且关闭宿主和桥',async()=>{
  for(const start of [async()=>{throw Error('入场写入回执未返回');},async()=>({callId,status:'reserved',sessionId}),
    async()=>({callId:'other-call',status:'started',sessionId}),async()=>({callId,status:'started',sessionId:'other-thread'})]){
    const f=fixture();f.ports.startExternalChatTurn=start;
    await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});
    expect(f.client.prompt).not.toHaveBeenCalled();
    expect(f.settlements()).toEqual([{callId,status:'unknown'}]);
    expect(f.client.close).toHaveBeenCalledTimes(1);expect(f.bridge.close).toHaveBeenCalledTimes(1);
  }
});

it('unknown 或 started reservation 不启动宿主、不重发，已结算直接复用原 callId',async()=>{
  for(const state of [{callId,status:'unknown',sessionId,providerTurnId},{callId,status:'started',sessionId},
    {callId,status:'reserved',sessionId}]){
    const f=fixture();f.ports.reserveExternalChatTurn=()=>state;
    await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION'});
    await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});
    expect(boundaries.host).not.toHaveBeenCalled();expect(boundaries.bridge).not.toHaveBeenCalled();
    expect(boundaries.directory).not.toHaveBeenCalled();expect(f.client.prompt).not.toHaveBeenCalled();
    expect(f.call.mock.calls.map(([port])=>port)).toEqual(['reserveExternalChatTurn','reserveExternalChatTurn']);
  }
  const f=fixture();f.ports.reserveExternalChatTurn=()=>({callId,status:'settled'});
  expect(await f.run()).toEqual({callId});expect(boundaries.host).not.toHaveBeenCalled();
});

it('真实文字处理与图片保存 flush 全部完成后才记录回合和结算，跨会话事件被忽略',async()=>{
  const f=fixture(),textGate=deferred<void>(),imageGate=deferred<unknown>();
  const onText=vi.fn<(text:string)=>Promise<void>>().mockImplementationOnce(async()=>{await textGate.promise;f.events.push('text-flushed');}).mockResolvedValue(undefined);
  f.ports.saveExternalChatImage=async()=>{const result=await imageGate.promise;f.events.push('image-committed');return result;};
  f.client.prompt.mockImplementationOnce(async()=>{
    f.emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'污染'}},'other-thread');
    f.emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'正文甲'}});
    f.emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'正文乙'}});
    f.emit({sessionUpdate:'tool_call_update',toolCallId:'image-tool',status:'completed',content:[{type:'content',content:{type:'image',mimeType:'image/png',data:png.toString('base64')}}]});
    return {stopReason:'end_turn',_meta:{creatoros:{codex:{threadId:sessionId,turnId:providerTurnId,status:'completed'}}}};
  });
  const running=f.run(onText);
  await vi.waitFor(()=>expect(f.called('saveExternalChatImage')).toHaveLength(1));
  expect(onText).toHaveBeenCalledWith('正文甲');expect(f.settlements()).toEqual([]);
  textGate.resolve();await vi.waitFor(()=>expect(onText).toHaveBeenCalledTimes(2));
  expect(f.settlements()).toEqual([]);expect(f.called('recordExternalChatProviderTurn')).toHaveLength(0);
  imageGate.resolve({status:'committed',receipt:imageReceipt()});
  expect(await running).toEqual({callId});
  const saved=f.settlements()[0];
  expect(saved).toMatchObject({callId,status:'settled',receipt:{schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,
    sessionId,turnId:callId,providerTurnId,text:'正文甲正文乙',images:[imageReceipt()],imageFailures:[],usage:null}});
  expect(f.events.indexOf('text-flushed')).toBeLessThan(f.events.indexOf('settleExternalChatTurn'));
  expect(f.events.indexOf('image-committed')).toBeLessThan(f.events.indexOf('settleExternalChatTurn'));
  expect(f.called('saveExternalChatImage')).toHaveLength(1);
  expect(f.called('recordExternalChatProviderTurn')[0]?.[1]).toEqual({callId,providerTurnId});
});

it('PromptResponse 没有真实元数据或属于另一线程时 providerTurnId 留空，不拿会话或 callId 填充',async()=>{
  for(const meta of [undefined,{creatoros:{codex:{threadId:'other-thread',turnId:'other-turn',status:'completed'}}},
    {creatoros:{codex:{threadId:sessionId,turnId:'',status:'completed'}}}]){
    const f=fixture();f.client.prompt.mockImplementationOnce(async()=>{
      f.emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'合法正文'}});
      return {stopReason:'end_turn',_meta:meta} as never;
    });
    expect(await f.run()).toEqual({callId});
    expect(f.called('recordExternalChatProviderTurn')).toHaveLength(0);
    expect(record(f.settlements()[0]?.receipt)).not.toHaveProperty('providerTurnId');
  }
});

it('原标准 started 通知可得真实 provider turn 时先存原回执，随后断流保留 unknown，不重发',async()=>{
  const f=fixture(),completion=deferred<never>();
  f.client.prompt.mockImplementationOnce(async()=>{
    f.emit({sessionUpdate:'session_info_update',_meta:{creatoros:{codex:{threadId:sessionId,turnId:providerTurnId,status:'inProgress'}}}});
    return await completion.promise;
  });
  const running=f.run();const caught=running.catch(error=>error);
  try{
    await vi.waitFor(()=>expect(f.called('recordExternalChatProviderTurn')).toHaveLength(1));
    expect(f.called('recordExternalChatProviderTurn')[0]?.[1]).toEqual({callId,providerTurnId});
  }finally{completion.reject(Error('真实回合后连接断开'));await caught;}
  expect(await caught).toMatchObject({outcome:'unknown_result'});
  expect(f.settlements()).toEqual([{callId,status:'unknown'}]);expect(f.client.prompt).toHaveBeenCalledTimes(1);
});

it('取消同一真实会话调用 cancel，并关闭原客户端与桥；结算未知不再使用已取消的 signal',async()=>{
  const f=fixture();
  f.client.prompt.mockImplementationOnce(async(...args:unknown[])=>{
    const signal=record(args[5]).signal as AbortSignal;
    return await new Promise<never>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('用户取消')),{once:true}));
  });
  const running=f.run();const caught=running.catch(error=>error);
  await vi.waitFor(()=>expect(f.client.prompt).toHaveBeenCalledTimes(1));
  f.controller.abort();expect(await caught).toMatchObject({outcome:'unknown_result'});
  expect(f.client.cancel).toHaveBeenCalledExactlyOnceWith(sessionId);
  expect(f.client.close).toHaveBeenCalledTimes(1);expect(f.bridge.close).toHaveBeenCalledTimes(1);
  expect(f.settlements()).toEqual([{callId,status:'unknown'}]);
  expect(f.called('settleExternalChatTurn')[0]?.[2]).toBeUndefined();
});

it('宿主或会话创建在入场前失败落 rejected，不能记录 started 或启动 prompt',async()=>{
  const f=fixture();boundaries.host.mockRejectedValueOnce(new CodexHostError('CODEX_LOGIN_REQUIRED'));
  await expect(f.run()).rejects.toMatchObject({outcome:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED'});
  expect(f.settlements()).toEqual([{callId,status:'rejected',rejectionCode:'CODEX_LOGIN_REQUIRED'}]);
  expect(f.called('startExternalChatTurn')).toHaveLength(0);expect(f.client.prompt).not.toHaveBeenCalled();expect(f.bridge.close).toHaveBeenCalledTimes(1);
  const g=fixture();g.client.createSession.mockRejectedValueOnce(Error('会话预备失败'));
  await expect(g.run()).rejects.toMatchObject({outcome:'waiting_user'});
  expect(g.settlements()).toEqual([{callId,status:'rejected',rejectionCode:'CODEX_ACP_HOST_FAILED'}]);
  expect(g.called('startExternalChatTurn')).toHaveLength(0);expect(g.client.prompt).not.toHaveBeenCalled();
  expect(g.client.close).toHaveBeenCalledTimes(1);expect(g.bridge.close).toHaveBeenCalledTimes(1);
});

it('已 reserve 的工作目录或提示预备失败也在原 callId 落 rejected，不能遗留 reserved',async()=>{
  const f=fixture();boundaries.directory.mockRejectedValueOnce(new GenerationFailure('waiting_user','CODEX_WORKSPACE_UNSAFE'));
  await expect(f.run()).rejects.toMatchObject({outcome:'waiting_user'});
  expect(f.settlements()).toEqual([{callId,status:'rejected',rejectionCode:'CODEX_WORKSPACE_UNSAFE'}]);
  expect(boundaries.host).not.toHaveBeenCalled();expect(f.client.prompt).not.toHaveBeenCalled();
  const g=fixture();boundaries.prompt.mockImplementationOnce(()=>{throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');});
  await expect(g.run()).rejects.toMatchObject({outcome:'waiting_user'});
  expect(g.settlements()).toEqual([{callId,status:'rejected',rejectionCode:'CODEX_INPUT_MODALITY_UNSUPPORTED'}]);
  expect(boundaries.host).not.toHaveBeenCalled();
});

it('真实 provider turn 或最终保存回执不一致均保留 unknown，不能再次 prompt',async()=>{
  const f=fixture();f.ports.recordExternalChatProviderTurn=()=>({callId,status:'started',sessionId,providerTurnId:'wrong-turn'});
  await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_TURN_RECEIPT_UNKNOWN'});
  expect(f.settlements()).toEqual([{callId,status:'unknown'}]);expect(f.client.prompt).toHaveBeenCalledTimes(1);
  const h=fixture();h.ports.recordExternalChatProviderTurn=()=>({callId:'other-call',status:'started',sessionId,providerTurnId});
  await expect(h.run()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_TURN_RECEIPT_UNKNOWN'});
  expect(h.settlements()).toEqual([{callId,status:'unknown'}]);expect(h.client.prompt).toHaveBeenCalledTimes(1);
  const g=fixture();g.ports.settleExternalChatTurn=data=>data.status==='settled'?{callId,status:'unknown'}:{callId,status:data.status};
  await expect(g.run()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_SETTLEMENT_RECEIPT_UNKNOWN'});
  expect(g.settlements().map(data=>data.status)).toEqual(['settled','unknown']);expect(g.client.prompt).toHaveBeenCalledTimes(1);
});

it('客户端关闭失败仍关闭桥，不能覆盖已结算成功或原 unknown 故障',async()=>{
  const f=fixture();f.client.close.mockRejectedValueOnce(Error('客户端清理失败'));
  expect(await f.run()).toEqual({callId});
  expect(f.settlements().map(data=>data.status)).toEqual(['settled']);
  expect(f.client.close).toHaveBeenCalledTimes(1);expect(f.bridge.close).toHaveBeenCalledTimes(1);
  const g=fixture();g.client.prompt.mockRejectedValueOnce(Error('入场后断开'));
  g.client.close.mockRejectedValueOnce(Error('客户端清理失败'));g.bridge.close.mockRejectedValueOnce(Error('桥清理失败'));
  await expect(g.run()).rejects.toMatchObject({outcome:'unknown_result',errorCode:'CODEX_ACP_HOST_FAILED'});
  expect(g.settlements()).toEqual([{callId,status:'unknown'}]);
  expect(g.client.close).toHaveBeenCalledTimes(1);expect(g.bridge.close).toHaveBeenCalledTimes(1);
});
