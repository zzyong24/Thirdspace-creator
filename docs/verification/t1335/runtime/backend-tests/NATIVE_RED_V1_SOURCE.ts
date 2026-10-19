import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {z} from 'zod';
import {aiTasks,aiTaskResults,executionTasks,executionCalls,knowledgeItems,knowledgeRevisions,knowledgeAdoptions,executionEvidence,createDb,eq,type Db} from '@creatoros/backend';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionCheckpointService} from '../execution/execution-checkpoint.service';
import {createExecutionAgenticToolPorts} from '../execution/execution-agentic-tool-ports.service';
import {createAgenticProposalStagingService} from './agentic-proposal-staging.service';
import {createExecutionResearchEvidenceService} from '../execution/execution-research-evidence.service';
import {createExecutionAgenticCandidateService} from './execution-agentic-candidate.service';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createExecutionCodexCallService} from '../execution/execution-codex-call.service';
import {createAgenticProposalAdoptionService} from './agentic-proposal-adoption.service';
import {createKnowledgeProposalAdoptionService} from '../knowledge';
import {createAiService} from './ai.service';
import {createExecutionRoute,workerProviderReceiptSchema} from '@creatoros/contract/execution-worker';
const ctx={userId:'codex-agent-u',accountId:'codex-agent-a',requestId:'test',source:'user' as const};
const stamp='2026-10-11T08:00:00.000Z',now=()=>stamp,budget={maxCalls:8,maxTokens:10000,deadlineMs:120000};
describe('Codex原生Agent公共工具与候选链',()=>{
 let db:Db,close:()=>Promise<void>;
 beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
 async function fixture(id:string,engine:'pi'|'codex'='codex',scope:RequestContext=ctx){
  await db.insert(aiTasks).values({id,userId:scope.userId,accountId:scope.accountId,groupId:scope.groupId??null,groupVersion:scope.groupVersion??null,taskType:'exec.agentic.research',idempotencyKey:id,requestedAt:stamp});
  const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(scope,id),tasks=createPersistentTaskService(db,{now});
  const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:'test-worker'});if(!claim)throw Error('claim missing');
  const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const modelInput={kind:'agentic.run',operationKey:'codex-agent',taskType:'agentic.research',goal:'产出候选',systemPrompt:'只用工具',capability:'research',maxOutputTokens:100,dryRun:true,tools:[{name:'knowledge.write',version:'1',label:'候选',description:'候选',parameters:{type:'object'},effect:'proposal'}]};
  const payload:{modelInput:unknown;executionRoute:unknown;codexCalls?:unknown}={modelInput,executionRoute:createExecutionRoute(engine)};
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,mapped.executionTaskId));
  const ledger=createExecutionCallLedgerService(db,{now,budget}),model=await ledger.reserve(ref,{operationKey:'native-turn',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,model.id);
  const fact={toolCallId:'native-tool',toolName:'knowledge.write',input:'{"title":"真实候选"}'};
  const native=createExecutionCodexCallService(db,{now});
  if(engine==='codex'){
   await native.invoke(ref,'bindCodexCall',{callId:model.id,threadId:'native-thread',turnId:'native-turn'});
   payload.codexCalls={[model.id]:await native.invoke(ref,'recordCodexToolCall',{callId:model.id,...fact})};
  }else{
   // 故意手种伪native绑定，仅用于原Pi拒绝族，不能当真实record正例。
   payload.codexCalls={[model.id]:{threadId:'native-thread',turnId:'native-turn',tools:{'native-tool':fact}}};
   await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,mapped.executionTaskId));
  }
  const tools={'knowledge.write':{version:'1',effect:'proposal' as const,parameters:z.object({title:z.string()})}},ports=createExecutionAgenticToolPorts(db,{now,budget,tools});
  return {ref,ledger,model,payload,ports,fact,mapped,native,scope,service:createExecutionAgenticCandidateService(db,{now})};
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
 // 以下是服务组合边界；模型receipt仅为外部I/O合成数据，不冒真实供应商执行。
 // 与公开worker链共用真实record/证据/staging/ledger/checkpoint/commit/confirm服务。
 type Fact={toolCallId:string;toolName:string;input:string};
 type Binding={threadId:string;turnId:string;tools:Record<string,Fact&{callId?:unknown}>};
 async function knowledgeFixture(id:string,legacy=false){
  const userId=id+'-user',group=await createAccountGroupService({db,now,nextId:prefix=>prefix+'-'+id}).create({userId,accountId:null,requestId:id,source:'user'},{name:'原生知识边界',idempotencyKey:id});
  const scope:RequestContext={userId,accountId:null,groupId:group.id,groupVersion:group.version,requestId:id,source:'user'};
  const f=await fixture(id,'codex',scope),payload=f.payload as {modelInput:{dryRun:boolean;tools:Array<{name:string;version:string;label:string;description:string;parameters:{type:string};effect:string}>};executionRoute:unknown;codexCalls:Record<string,Binding>};
  payload.modelInput.dryRun=false;payload.modelInput.tools.unshift({name:'web.read',version:'1',label:'阅读',description:'阅读',parameters:{type:'object'},effect:'none'});
  const binding=payload.codexCalls[f.model.id];if(!binding)throw Error('原model绑定缺失');binding.tools={};
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
  const record=async(fact:Fact)=>{
   if(legacy){ // 明示旧无callId历史形状兼容；不当成当前真实record覆盖。
    binding.tools[fact.toolCallId]={...fact};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
   }else{
    const value=await f.native.invoke(f.ref,'recordCodexToolCall',{callId:f.model.id,...fact});
    const parsed=value as Binding;expect(parsed.tools[fact.toolCallId]).toEqual({callId:f.model.id,...fact});
    payload.codexCalls[f.model.id]=parsed;
   }
  };
  const readFact={toolCallId:'read-tool',toolName:'web.read',input:'{"url":"https://example.com"}'};await record(readFact);
  const tools={'web.read':{version:'1',effect:'none' as const,parameters:z.object({url:z.string(),offset:z.number().default(0)})},'knowledge.write':{version:'1',effect:'proposal' as const,parameters:z.object({title:z.string(),note:z.string(),sourceNote:z.string(),evidenceRefs:z.array(z.string())})}};
  const ports=createExecutionAgenticToolPorts(db,{now,budget,tools}),read=await ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:readFact.toolCallId});await ports.start(f.ref,{callId:read.callId});
  const observed=await createExecutionResearchEvidenceService(db,{now,budget,tools}).settleRead(f.ref,{callId:read.callId,observation:{sourceUrl:'https://example.com',title:'真实来源',fullText:'完整真实正文'}});
  const params={title:'知识标题',note:'知识正文',sourceNote:'https://example.com',evidenceRefs:[(observed.data as {evidenceRef:string}).evidenceRef]},writeFact={toolCallId:'write-tool',toolName:'knowledge.write',input:JSON.stringify(params)};await record(writeFact);
  const write=await ports.reserve(f.ref,{modelCallId:f.model.id,toolCallId:writeFact.toolCallId});await ports.start(f.ref,{callId:write.callId});
  const staging=createAgenticProposalStagingService(db,{now,resolveLease:()=>{throw Error('old entry');},prepareAssets:async()=>[]});
  const input={kind:'knowledge.create' as const,toolCallId:writeFact.toolCallId,...params};
  const proposal=await staging.stageForExecution(f.ref,input,new AbortController().signal);
  if(proposal.kind!=='knowledge.create')throw Error('知识工具未产生知识候选');
  expect(await staging.stageForExecution(f.ref,input,new AbortController().signal)).toEqual(proposal);
  await ports.settle(f.ref,{callId:write.callId,status:'settled',output:{status:'ok',summary:'候选',evidence:[],data:{proposal},error:null,continuation:null,sideEffect:'proposal'}});
  return {...f,payload,read,write,readFact,writeFact,staging,input,proposal,legacy};
 }
 type KnowledgeFixture=Awaited<ReturnType<typeof knowledgeFixture>>;
 async function settleKnowledge(f:KnowledgeFixture,options:{canonical?:Record<string,unknown>;duplicate?:boolean;checkpoint?:boolean}={}){
  // 与生产worker:82相同的显式四字段投影；内部record.callId不被塞进canonical。
  const part=(fact:Fact)=>({type:'tool-call',toolCallId:fact.toolCallId,toolName:fact.toolName,input:fact.input});
  const write={...part(f.writeFact),...options.canonical};
  const receipt=workerProviderReceiptSchema.parse({content:[part(f.readFact),write,...(options.duplicate?[write]:[]),{type:'text',text:'完成知识研究'}],finishReason:{unified:'tool-calls',raw:'completed'},usage:{inputTokens:{total:3},outputTokens:{total:4}},warnings:[],providerMetadata:{codex:{threadId:'native-thread',turnId:'native-turn',model:'actual-model',modelProvider:'openai',completionStatus:'completed',projection:'native-turn-v1'}}});
  await f.ledger.settle(f.ref,f.model.id,{status:'settled',providerResult:receipt,usage:{totalTokens:7}});
  if(options.checkpoint!==false)await createExecutionCheckpointService(db,{now}).save(f.ref,{expectedRevision:0,expectedLedgerSequence:3,messages:[{role:'assistant',callId:f.model.id},{role:'tool',callId:f.read.callId},{role:'tool',callId:f.write.callId}]});
  return {receipt,commit:{actualEngine:'codex' as const,summary:'Worker总结',stopReason:'completed' as const,lastModelCallId:f.model.id,toolCallIds:[f.read.callId,f.write.callId]}};
 }
 const domainSnapshot=async()=>({results:await db.select().from(aiTaskResults),knowledge:await db.select().from(knowledgeItems),revisions:await db.select().from(knowledgeRevisions),adoptions:await db.select().from(knowledgeAdoptions)});
 async function mutateBinding(f:KnowledgeFixture,mutate:(binding:Binding)=>void){
  const binding=f.payload.codexCalls[f.model.id];if(!binding)throw Error('原绑定缺失');mutate(binding);
  // 明确的owned DB故障注入；仅用于拒绝非法持久形状，不冒公开端口可产生该状态。
  await db.update(executionTasks).set({payload:f.payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 }
 async function expectStageRejectedWithoutWrite(f:KnowledgeFixture){const before=await domainSnapshot();await expect(f.staging.stageForExecution(f.ref,f.input,new AbortController().signal)).rejects.toThrow();expect(await domainSnapshot()).toEqual(before);}
 it.each([false,true])('native长回合真实record/旧缺省=%s，正式候选并发采纳与原回执幂等',async legacy=>{
  const f=await knowledgeFixture('native-knowledge-'+(legacy?'legacy':'current'),legacy),before=await domainSnapshot(),{commit}=await settleKnowledge(f);
  expect(await f.staging.stageForExecution(f.ref,f.input,new AbortController().signal)).toEqual(f.proposal);
  const saved=await f.service.commitAgenticResult(f.ref,commit);expect(await f.service.commitAgenticResult(f.ref,commit)).toEqual(saved);
  const rows=await db.select().from(aiTaskResults).where(eq(aiTaskResults.id,saved.resultId));expect(rows[0]).toMatchObject({resultType:'agentic_proposals',resultData:{proposals:[f.proposal],meta:{engine:'codex'}}});
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,'native-knowledge-'+(legacy?'legacy':'current'))))[0]?.status).toBe('awaiting_confirmation');
  expect(await db.select().from(knowledgeItems)).toEqual(before.knowledge);expect(await db.select().from(knowledgeRevisions)).toEqual(before.revisions);
  const knowledge=createKnowledgeProposalAdoptionService(db,now),adoption=createAgenticProposalAdoptionService(db,{knowledge:(c,p,tx)=>knowledge.adopt(c,p,tx),assetTagsBatch:async()=>{throw Error('UNEXPECTED_ASSET_ADOPTION');}},now);
  const notUsed=async():Promise<never>=>{throw Error('UNEXPECTED_OTHER_BUSINESS_PORT');};let serial=0;
  const ai=createAiService({db,now,nextId:prefix=>prefix+'-native-'+(++serial),agenticProposals:adoption,artifacts:{createVersion:notUsed},knowledge:{createKnowledge:notUsed},candidate:{createFromAIResult:notUsed,enrichCard:notUsed},learnings:{createLearning:notUsed},publishing:{createPublicationFromDraft:notUsed},materialLinks:{link:notUsed},positioning:{upsertProfile:notUsed,createStatementVersion:notUsed},calibration:{createDraftPrediction:notUsed}});
  const taskId=f.proposal.source.taskId,confirmed=await Promise.all([ai.confirmTask(f.scope,taskId),ai.confirmTask(f.scope,taskId)]);expect(confirmed.map(t=>t.status)).toEqual(['succeeded','succeeded']);
  const adopted=await domainSnapshot();expect(adopted.knowledge).toHaveLength(before.knowledge.length+1);expect(adopted.revisions).toHaveLength(before.revisions.length+1);expect(adopted.adoptions).toHaveLength(before.adoptions.length+1);
  const item=adopted.knowledge.find(k=>k.id===f.proposal.target.knowledgeId);if(!item)throw Error('知识未产生');
  expect(item).toMatchObject({title:f.proposal.content.title,sourceNote:f.proposal.content.sourceNote,sourceMetadata:{proposalId:f.proposal.proposalId,...f.proposal.source},groupId:f.scope.groupId,accountId:null});
  expect(adopted.revisions.find(r=>r.id===item.currentRevisionId)?.content).toBe(f.proposal.content.note);
  expect((await ai.confirmTask(f.scope,taskId)).status).toBe('succeeded');expect(await domainSnapshot()).toEqual(adopted);expect(await f.service.commitAgenticResult(f.ref,commit)).toEqual(saved);expect(await domainSnapshot()).toEqual(adopted);
  const binding=f.payload.codexCalls[f.model.id];if(!binding)throw Error('绑定缺失');expect(Object.hasOwn(binding.tools['write-tool']??{},'callId')).toBe(!legacy);
 });
 const invalidOwners=[{label:'foreign',value:'foreign-model'},{label:'null',value:null},{label:'number',value:7},{label:'object',value:{id:'foreign'}},{label:'empty',value:''}];
 it.each(invalidOwners.flatMap(owner=>['started','settled'].map(state=>({...owner,state}))))('record callId $label/$state不得通过四字段投影绕过',async({label,value,state})=>{
  const f=await knowledgeFixture('record-'+label+'-'+state);if(state==='settled')await settleKnowledge(f);
  await mutateBinding(f,b=>{const fact=b.tools['write-tool'];if(!fact)throw Error('write缺失');fact.callId=value;});await expectStageRejectedWithoutWrite(f);
 });
 it.each(invalidOwners)('canonical callId $label声明不符必须拒绝',async({label,value})=>{const f=await knowledgeFixture('canonical-'+label);await settleKnowledge(f,{canonical:{callId:value}});await expectStageRejectedWithoutWrite(f);});
 it('canonical显式相同callId是合法来源，四字段相等仍可提交',async()=>{const f=await knowledgeFixture('canonical-owned');const {commit}=await settleKnowledge(f,{canonical:{callId:f.model.id}});expect(await f.staging.stageForExecution(f.ref,f.input,new AbortController().signal)).toEqual(f.proposal);expect((await f.service.commitAgenticResult(f.ref,commit)).aiTaskId).toBe(f.proposal.source.taskId);});
 it.each(['map-key','tool-id','tool-name','input-bytes'] as const)('record受控故障%s不产生新回执',async mode=>{
  const f=await knowledgeFixture('record-fault-'+mode);await settleKnowledge(f);
  await mutateBinding(f,b=>{const fact=b.tools['write-tool'];if(!fact)throw Error('write缺失');if(mode==='map-key'){delete b.tools['write-tool'];b.tools.alias=fact;}if(mode==='tool-id')fact.toolCallId='alias';if(mode==='tool-name')fact.toolName='other.write';if(mode==='input-bytes')fact.input=' '+fact.input;});await expectStageRejectedWithoutWrite(f);
 });
 it.each(['duplicate','name','input-bytes'] as const)('canonical工具%s差异不产生新回执',async mode=>{const f=await knowledgeFixture('canonical-fault-'+mode);await settleKnowledge(f,{checkpoint:false,duplicate:mode==='duplicate',canonical:mode==='name'?{toolName:'other.write'}:mode==='input-bytes'?{input:' '+f.writeFact.input}:{}});await expectStageRejectedWithoutWrite(f);});
 it.each(['unsettled-read','future-read','foreign-evidence'] as const)('原native证据%s仍按原来源门拒绝',async mode=>{
  const f=await knowledgeFixture('native-evidence-'+mode);await settleKnowledge(f);
  if(mode==='unsettled-read')await db.update(executionCalls).set({status:'started'}).where(eq(executionCalls.id,f.read.callId));
  if(mode==='future-read')await db.update(executionCalls).set({sequence:9}).where(eq(executionCalls.id,f.read.callId));
  if(mode==='foreign-evidence'){const evidenceId=f.input.evidenceRefs[0];if(!evidenceId)throw Error('原evidenceRef缺失');await db.update(executionEvidence).set({executionTaskId:'foreign-owned-execution'}).where(eq(executionEvidence.id,evidenceId));}
  await expectStageRejectedWithoutWrite(f);
 });
});
