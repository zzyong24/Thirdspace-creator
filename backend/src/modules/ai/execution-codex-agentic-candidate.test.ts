import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {z} from 'zod';
import {aiTasks,aiTaskResults,executionTasks,executionCalls,knowledgeItems,createDb,eq,type Db} from '@creatoros/backend';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionCheckpointService} from '../execution/execution-checkpoint.service';
import {createExecutionAgenticToolPorts} from '../execution/execution-agentic-tool-ports.service';
import {createAgenticProposalStagingService} from './agentic-proposal-staging.service';
import {createExecutionResearchEvidenceService} from '../execution/execution-research-evidence.service';
import {createExecutionAgenticCandidateService} from './execution-agentic-candidate.service';
import {createExecutionRoute,workerProviderReceiptSchema} from '@creatoros/contract/execution-worker';
const ctx={userId:'codex-agent-u',accountId:'codex-agent-a',requestId:'test',source:'user' as const};
const stamp='2026-10-11T08:00:00.000Z',now=()=>stamp,budget={maxCalls:8,maxTokens:10000,deadlineMs:120000};
describe('Codex原生Agent公共工具与候选链',()=>{
 let db:Db,close:()=>Promise<void>;
 beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
 async function fixture(id:string,engine:'pi'|'codex'='codex'){
  await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'exec.agentic.research',idempotencyKey:id,requestedAt:stamp});
  const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id),tasks=createPersistentTaskService(db,{now});
  const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:'test-worker'});if(!claim)throw Error('claim missing');
  const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const modelInput={kind:'agentic.run',operationKey:'codex-agent',taskType:'agentic.research',goal:'产出候选',systemPrompt:'只用工具',capability:'research',maxOutputTokens:100,dryRun:true,tools:[{name:'knowledge.write',version:'1',label:'候选',description:'候选',parameters:{type:'object'},effect:'proposal'}]};
  const payload:{modelInput:unknown;executionRoute:unknown;codexCalls?:unknown}={modelInput,executionRoute:createExecutionRoute(engine)};
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,mapped.executionTaskId));
  const ledger=createExecutionCallLedgerService(db,{now,budget}),model=await ledger.reserve(ref,{operationKey:'native-turn',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,model.id);
  const fact={toolCallId:'native-tool',toolName:'knowledge.write',input:'{"title":"真实候选"}'};
  payload.codexCalls={[model.id]:{threadId:'native-thread',turnId:'native-turn',tools:{'native-tool':fact}}};
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,mapped.executionTaskId));
  const tools={'knowledge.write':{version:'1',effect:'proposal' as const,parameters:z.object({title:z.string()})}},ports=createExecutionAgenticToolPorts(db,{now,budget,tools});
  return {ref,ledger,model,payload,ports,fact,mapped,service:createExecutionAgenticCandidateService(db,{now})};
 }
 async function completed(id:string){
  const f=await fixture(id),reserved=await f.ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'native-tool'});await f.ports.start(f.ref,{callId:reserved.callId});
  await f.ports.settle(f.ref,{callId:reserved.callId,status:'settled',output:{status:'ok',summary:'预演',evidence:[],data:{plan:{toolName:'knowledge.write',input:{title:'真实候选'}}},error:null,continuation:null,sideEffect:'none'}});
  const receipt=workerProviderReceiptSchema.parse({content:[{type:'tool-call',...f.fact},{type:'text',text:'原生回合总结'}],finishReason:{unified:'tool-calls',raw:'completed'},usage:{inputTokens:{total:3},outputTokens:{total:4}},warnings:[],providerMetadata:{codex:{threadId:'native-thread',turnId:'native-turn',model:'actual-model',modelProvider:'openai',completionStatus:'completed',projection:'native-turn-v1'}}});
  await f.ledger.settle(f.ref,f.model.id,{status:'settled',providerResult:receipt,usage:{totalTokens:7}});
  await createExecutionCheckpointService(db,{now}).save(f.ref,{expectedRevision:0,expectedLedgerSequence:2,messages:[{role:'assistant',callId:f.model.id},{role:'tool',callId:reserved.callId}]});
  return {...f,receipt,tool:reserved,commit:{actualEngine:'codex' as const,summary:'不能信任的Worker总结',stopReason:'completed' as const,lastModelCallId:f.model.id,toolCallIds:[reserved.callId]}};
 }
 it('native started工具可以预留启动结算，同键回读不重复执行',async()=>{
  const f=await fixture('native-started'),reserved=await f.ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'native-tool'});
  expect(await f.ports.start(f.ref,{callId:reserved.callId})).toMatchObject({status:'started'});
  await f.ports.settle(f.ref,{callId:reserved.callId,status:'settled',output:{status:'ok',summary:'已保存预演',evidence:[],data:{plan:{}},error:null,continuation:null,sideEffect:'none'}});
  expect(await f.ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'native-tool'})).toMatchObject({callId:reserved.callId,status:'settled'});
 });
 it('Pi未结算模型不能用伪Codex绑定绕过原来源门',async()=>{
  const f=await fixture('pi-forgery','pi');await expect(f.ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'native-tool'})).rejects.toThrow();
 });
 it('原native模型和工具回执闭合后候选结果保存真实Codex身份',async()=>{
  const f=await completed('native-commit'),saved=await f.service.commitAgenticResult(f.ref,f.commit);
  const [row]=await db.select().from(aiTaskResults).where(eq(aiTaskResults.id,saved.resultId));
  expect(row?.resultData).toMatchObject({summary:'原生回合总结',meta:{engine:'codex',actualEngine:'codex',model:'actual-model',modelProvider:'openai',threadId:'native-thread',turnId:'native-turn'}});
  expect(await f.service.commitAgenticResult(f.ref,f.commit)).toEqual(saved);
 });
 it('原生模型线程回执与任务绑定不符，不能提交候选',async()=>{
  const f=await completed('native-wrong-thread');await db.update(executionCalls).set({providerResult:{...f.receipt,providerMetadata:{codex:{threadId:'foreign',turnId:'native-turn',completionStatus:'completed',projection:'native-turn-v1'}}}}).where(eq(executionCalls.id,f.model.id));
  await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();
 });
 it('Worker自报Pi不能替换冻结Codex身份',async()=>{
  const f=await completed('native-wrong-engine');await expect(f.service.commitAgenticResult(f.ref,{...f.commit,actualEngine:'pi'})).rejects.toThrow();
 });
 it('native工具事实与原模型工具参数不符，拒绝伪造来源',async()=>{
  const f=await completed('native-wrong-tool');await db.update(executionTasks).set({payload:{...f.payload,codexCalls:{[f.model.id]:{threadId:'native-thread',turnId:'native-turn',tools:{'native-tool':{...f.fact,input:'{"title":"伪造候选"}'}}}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));
  await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();
 });
 it('native长回合先读后写形成真实知识候选，采纳前不写知识库',async()=>{
  const f=await fixture('native-knowledge'),payload=f.payload as {modelInput:any;executionRoute:unknown;codexCalls:any};
  payload.modelInput.dryRun=false;payload.modelInput.tools.unshift({name:'web.read',version:'1',label:'阅读',description:'阅读',parameters:{type:'object'},effect:'none'});
  const readFact={toolCallId:'read-tool',toolName:'web.read',input:'{"url":"https://example.com"}'};
  payload.codexCalls[f.model.id].tools={'read-tool':readFact};
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
  const tools={'web.read':{version:'1',effect:'none' as const,parameters:z.object({url:z.string(),offset:z.number().default(0)})},'knowledge.write':{version:'1',effect:'proposal' as const,parameters:z.object({title:z.string(),note:z.string(),sourceNote:z.string(),evidenceRefs:z.array(z.string())})}};
  const ports=createExecutionAgenticToolPorts(db,{now,budget,tools}),read=await ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'read-tool'});await ports.start(f.ref,{callId:read.callId});
  const observed=await createExecutionResearchEvidenceService(db,{now,budget,tools}).settleRead(f.ref,{callId:read.callId,observation:{sourceUrl:'https://example.com',title:'真实来源',fullText:'完整真实正文'}});
  const params={title:'知识标题',note:'知识正文',sourceNote:'https://example.com',evidenceRefs:[(observed.data as {evidenceRef:string}).evidenceRef]},writeFact={toolCallId:'write-tool',toolName:'knowledge.write',input:JSON.stringify(params)};
  payload.codexCalls[f.model.id].tools['write-tool']=writeFact;await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
  const write=await ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:'write-tool'});await ports.start(f.ref,{callId:write.callId});
  const staging=createAgenticProposalStagingService(db,{now,resolveLease:()=>{throw Error('old entry');},prepareAssets:async()=>[]});
  const proposal=await staging.stageForExecution(f.ref,{kind:'knowledge.create',toolCallId:'write-tool',...params},new AbortController().signal);
  await ports.settle(f.ref,{callId:write.callId,status:'settled',output:{status:'ok',summary:'候选',evidence:[],data:{proposal},error:null,continuation:null,sideEffect:'proposal'}});
  const receipt=workerProviderReceiptSchema.parse({content:[{type:'tool-call',...readFact},{type:'tool-call',...writeFact},{type:'text',text:'完成知识研究'}],finishReason:{unified:'tool-calls',raw:'completed'},usage:{inputTokens:{total:3},outputTokens:{total:4}},warnings:[],providerMetadata:{codex:{threadId:'native-thread',turnId:'native-turn',model:'actual-model',modelProvider:'openai',completionStatus:'completed',projection:'native-turn-v1'}}});
  await f.ledger.settle(f.ref,f.model.id,{status:'settled',providerResult:receipt,usage:{totalTokens:7}});
  await createExecutionCheckpointService(db,{now}).save(f.ref,{expectedRevision:0,expectedLedgerSequence:3,messages:[{role:'assistant',callId:f.model.id},{role:'tool',callId:read.callId},{role:'tool',callId:write.callId}]});
  const saved=await f.service.commitAgenticResult(f.ref,{actualEngine:'codex',summary:'Worker总结',stopReason:'completed',lastModelCallId:f.model.id,toolCallIds:[read.callId,write.callId]});
  expect((await db.select().from(aiTaskResults).where(eq(aiTaskResults.id,saved.resultId)))[0]).toMatchObject({resultType:'agentic_proposals',resultData:{proposals:[proposal],meta:{engine:'codex'}}});
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,'native-knowledge')))[0]?.status).toBe('awaiting_confirmation');expect(await db.select().from(knowledgeItems)).toHaveLength(0);
 });

});
