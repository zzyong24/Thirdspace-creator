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
it('原生external根实际回调消费者，工具绑定真实thread/turn后使用原Worker与ordinary ledger',async()=>{
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
 expect(ports.mock.calls.find(([port,data])=>port==='settleExternalChatTurn'&&data.status==='settled')?.[1].receipt).toMatchObject({images:[{assetId:'pending-image'}]});expect(boundaries.session).toHaveBeenCalledWith(expect.anything(),expect.anything(),undefined,true);
});
