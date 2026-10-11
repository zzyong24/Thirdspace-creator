import {createServer} from 'node:http';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {workerSkillSnapshotSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {generateStructuredInWorker} from './structured-worker-generation';
import {getOfficialSkillBase} from '../index';
import {codexCallAuthority,codexWorkerPorts} from './codex-call-context';
const native=vi.hoisted(()=>({turn:vi.fn(),recover:vi.fn(),close:vi.fn()}));
vi.mock('./codex-app-server',async original=>({...await original<typeof import('./codex-app-server')>(),createControlledCodexSession:vi.fn(async()=>({authenticated:true,mcpNames:[],rpc:{close:native.close}}))}));
vi.mock('./codex-native-turn',async original=>({...await original<typeof import('./codex-native-turn')>(),runCodexNativeTurn:native.turn,recoverCodexNativeTurn:native.recover}));
const outputs={
 'knowledge.classify':{knowledgeType:'note',title:'实际归类',tags:['知识'],summary:'原文摘要'},
 'knowledge.distill':{atoms:[{type:'claim',title:'原文观点',note:'',sourceNote:''}],suggestedTags:['原文']},
 'knowledge.relate':{candidates:[{sourceId:'k1',targetId:'k2',relationType:'supports',reason:'真实支撑'}]},
 'comment.qa-sift':{candidates:[{title:'真实问题',note:'',sourceNote:'',signalIds:['s1']}]},
};
type Skill=keyof typeof outputs;
function input(skill:Skill):Parameters<typeof generateStructuredInWorker>[0]{const base=getOfficialSkillBase(skill)!;
 const skillSnapshot=workerSkillSnapshotSchema.parse({snapshotVersion:1,userId:'u',accountId:'a',resolvedAt:new Date().toISOString(),platformPolicyVersion:'1',platformPolicy:'候选必须经用户采纳',skills:[{skillId:skill,baseVersion:base.baseVersion,overlayRevision:null,overlayVersion:null,effective:{methodSystem:base.methodSystem,template:base.template,tools:base.tools,requiredFacets:base.requiredFacets,contextRequirements:base.contextRequirements,outputSchema:base.outputSchema,completionPolicy:base.completionPolicy,completionPolicyAdapter:base.completionPolicyAdapter}}]});
 return {kind:'model.structured' as const,operationKey:skill,capability:skill,skillId:skill,maxOutputTokens:2000,skillSnapshot,facets:skill==='knowledge.distill'?{__knowledgeDistill:JSON.stringify({chunks:['首段原文','后段原文'],coverage:{inputChars:8,processedChars:8,truncatedChars:0,chunkCount:2}})}:skill==='knowledge.classify'?{content:'原文'}:skill==='knowledge.relate'?{atoms:'[k1] 观点\n[k2] 证据'}:{comments:'[s1] 原始问题'}};
}
function ledger(){const rows=new Map<string,Record<string,any>>(),events:string[]=[],saved:string[]=[];
 const call=async(port:WorkerPort,raw:unknown)=>{const data=raw as Record<string,any>;events.push(port);
  if(port==='reserveGenerationCall'){let row=rows.get(data.operationKey);if(!row){row={callId:`call-${rows.size+1}`,status:'reserved'};rows.set(data.operationKey,row);}return {callId:row.callId,status:row.status,...(row.providerResult?{providerResult:row.providerResult}:{})};}
  const row=[...rows.values()].find(row=>row.callId===data.callId)!;
  if(port==='startCall'){row.status='started';return {callId:row.callId,status:row.status};}
  if(port==='settleGenerationCall'){Object.assign(row,data);return {callId:row.callId,status:row.status};}
  if(port==='bindCodexCall'){Object.assign(row,data);return {};}
  if(port==='readCodexCall')return row;
  if(port==='saveGenerationResult'){saved.push(data.text);return {};}
  throw Error(`unexpected ${port}`);
 };return {call,rows,events,saved};
}
beforeEach(()=>{native.turn.mockReset();native.recover.mockReset();native.close.mockReset();});
describe('T-1238 知识通过原Structured Worker模型预约',()=>{
 it.each(Object.keys(outputs) as Skill[])('Codex %s 不解析文本API；ALS中启动/绑定/结算真实预约，重放不再发模型',{timeout:120_000,retry:0},async skill=>{
  const l=ledger(),signal=new AbortController().signal;
  native.turn.mockImplementation(async request=>{expect(codexWorkerPorts.getStore()).toBe(l.call);const authority=codexCallAuthority.getStore()!;expect(authority.recover).toBe(false);expect([...l.rows.values()].find(row=>row.callId===authority.callId)?.status).toBe('started');expect(request.outputSchema).toMatchObject({type:'object'});await request.onThread('native-thread');await request.onTurn(`native-turn-${native.turn.mock.calls.length}`);return {text:JSON.stringify(outputs[skill]),sessionId:'native-thread',providerTurnId:`native-turn-${native.turn.mock.calls.length}`,model:'real-native-model',modelProvider:'openai',usage:{inputTokens:5,outputTokens:7}};});
  const run=()=>codexWorkerPorts.run(l.call,()=>generateStructuredInWorker(input(skill),{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},signal,l.call));
  const first=await run(),count=skill==='knowledge.distill'?2:1;expect(native.turn).toHaveBeenCalledTimes(count);expect([...l.rows.values()]).toHaveLength(count);expect([...l.rows.values()].every(row=>row.status==='settled'&&row.threadId==='native-thread'&&row.turnId)).toBe(true);
  expect(JSON.parse(first.text).object).toEqual(skill==='knowledge.distill'?{parts:[outputs[skill],outputs[skill]]}:outputs[skill]);expect(l.saved).toEqual([first.text]);
  expect((await run()).text).toBe(first.text);expect(native.turn).toHaveBeenCalledTimes(count);expect(native.close).toHaveBeenCalledTimes(count);
 });
 it('Codex旧started调用只读取原thread/turn，不创建新turn',{timeout:120_000,retry:0},async()=>{
  const l=ledger();l.rows.set('knowledge.classify/model/1',{callId:'original-call',status:'started',threadId:'original-thread',turnId:'original-turn'});
  native.recover.mockResolvedValue({text:JSON.stringify(outputs['knowledge.classify']),sessionId:'original-thread',providerTurnId:'original-turn',model:'real',usage:{inputTokens:5,outputTokens:7}});
  await codexWorkerPorts.run(l.call,()=>generateStructuredInWorker(input('knowledge.classify'),{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},new AbortController().signal,l.call));
  expect(native.turn).not.toHaveBeenCalled();expect(native.recover).toHaveBeenCalledWith(expect.anything(),'original-thread','original-turn');expect(l.events).not.toContain('startCall');expect(l.rows.get('knowledge.classify/model/1')?.status).toBe('settled');
 });
 it('全文蒸馏共享原父信号；第一块完成后原任务取消，不预约第二块或交付伪完整候选',{timeout:120_000,retry:0},async()=>{
  const l=ledger(),controller=new AbortController();native.turn.mockImplementation(async request=>{await request.onThread('thread');await request.onTurn('turn');return {text:JSON.stringify(outputs['knowledge.distill']),sessionId:'thread',providerTurnId:'turn'};});
  const call=async(port:WorkerPort,data:unknown)=>{const result=await l.call(port,data);if(port==='settleGenerationCall')controller.abort(new Error('original-task-deadline-exhausted'));return result;};
  await expect(codexWorkerPorts.run(call,()=>generateStructuredInWorker(input('knowledge.distill'),{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},controller.signal,call))).rejects.toThrow('original-task-deadline-exhausted');
  expect(native.turn).toHaveBeenCalledTimes(1);expect(l.rows.size).toBe(1);expect(l.saved).toEqual([]);
 });
 it('蒸馏第二块提交未知保留前一块原回执，不交付半篇；恢复只读原turn',{timeout:120_000,retry:0},async()=>{
  const l=ledger();native.turn.mockImplementation(async request=>{await request.onThread('original-thread');await request.onTurn(`turn-${native.turn.mock.calls.length}`);if(native.turn.mock.calls.length===2)throw Error('fixture-provider-disconnect');return {text:JSON.stringify(outputs['knowledge.distill']),sessionId:'original-thread',providerTurnId:'turn-1'};});
  const run=()=>codexWorkerPorts.run(l.call,()=>generateStructuredInWorker(input('knowledge.distill'),{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},new AbortController().signal,l.call));
  await expect(run()).rejects.toMatchObject({outcome:'unknown_result'});expect([...l.rows.values()].map(row=>row.status)).toEqual(['settled','unknown']);expect(l.saved).toEqual([]);
  native.recover.mockResolvedValue({text:JSON.stringify(outputs['knowledge.distill']),sessionId:'original-thread',providerTurnId:'turn-2'});
  const complete=await run();expect(native.turn).toHaveBeenCalledTimes(2);expect(native.recover).toHaveBeenCalledWith(expect.anything(),'original-thread','turn-2');expect(JSON.parse(complete.text).object.parts).toHaveLength(2);expect([...l.rows.values()].every(row=>row.status==='settled')).toBe(true);
 });
 it('coverage与实际分块不符在首次模型预约前拒绝',{timeout:120_000,retry:0},async()=>{
  const l=ledger(),bad=input('knowledge.distill');bad.facets.__knowledgeDistill=JSON.stringify({chunks:['完整原文'],coverage:{inputChars:99,processedChars:99,truncatedChars:0,chunkCount:1}});
  await expect(generateStructuredInWorker(bad,{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},new AbortController().signal,l.call)).rejects.toMatchObject({outcome:'failed',errorCode:'KNOWLEDGE_CHUNKS_INVALID'});expect(l.events).toEqual([]);expect(native.turn).not.toHaveBeenCalled();
 });
 it.each(Object.keys(outputs) as Skill[])('旧Pi %s 继续通过原durable调用本地HTTP配置，不隐式切Codex',{timeout:120_000,retry:0},async skill=>{
  let requests=0;const server=createServer(async(req,res)=>{for await(const _chunk of req){}requests++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:'pi-fixture',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(outputs[skill])},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const l=ledger();
  try{const result=await generateStructuredInWorker(input(skill),{apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'pi-fixture',token:'fixture',structuredOutputs:true},new AbortController().signal,l.call);expect(requests).toBe(skill==='knowledge.distill'?2:1);expect([...l.rows.values()].every(row=>row.status==='settled')).toBe(true);expect(l.saved).toEqual([result.text]);expect(native.turn).not.toHaveBeenCalled();}
  finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
});
