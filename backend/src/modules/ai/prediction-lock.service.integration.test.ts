import {afterEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createDb,eq,aiTasks,aiTaskResults,executionTasks,executionCalls,predictions,rubrics,rubricVersions,type Db} from '@creatoros/backend';
import type {RequestContext,PredictionLockSource} from '@creatoros/contract';
import {chatToolProviderName,workerStructuredResultSchema,createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createProjectRepository,createProjectsService} from '../projects';
import {createArtifactsService} from '../artifacts';
import {createConfirmedProjectScriptReader} from '../../application/context/confirmed-project-script';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account/platform-account.service';
import {createCalibrationService} from '../calibration/calibration.service';
import {createAiRepository} from './ai.repository';
import {createAiService,type ServiceDeps} from './ai.service';
import {createPredictionLockService,type PredictionLockPorts} from './prediction-lock.service';
import {createCalibrationPositioningAdoptionService} from './calibration-positioning-adoption.service';
import {createChatTurnSubmissionService} from './chat-turn-submission.service';
import {chatHostContextDigest,type ChatHostContext} from './chat-host-context';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionChatToolPorts} from '../execution/execution-chat-tool-ports.service';
import {createExternalChatTurnService} from './external-chat-turn.service';
import {createExternalTaskToolService} from './external-task-tool.service';
import {createExecutionCandidateService} from './execution-candidate.service';
import {buildChatTools,type ChatToolDeps} from '../ai-runtime/chat-tools';
import {createChatHostToolAdapter} from '../ai-runtime/chat-host-tool-adapter';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';
import {resolveSkillForSurface} from '../ai-runtime/chat-surface';
import {createCalibrationDiagnoseBusinessAdapter} from '../ai-runtime/calibration-positioning-business-adapters';
import {createStructuredBusinessExecutionService} from '../ai-runtime/structured-business-execution.service';

// 服务/事务组合验收：供应商输出在账本边界提供确定性中性值；不启动worker/HTTP/模型。
// 来源、创建、冻结、执行映射、候选投影/提交、校准预测和原卡回执均使用生产服务。
const closes:Array<()=>Promise<void>>=[];
const networkSpies:Array<ReturnType<typeof vi.spyOn>>=[];
afterEach(async()=>{try{for(const close of closes.splice(0))await close();for(const spy of networkSpies.splice(0))expect(spy).not.toHaveBeenCalled();}finally{vi.restoreAllMocks();}});
const unavailable=async():Promise<never>=>{throw Error('T1328_BOUNDARY_UNUSED_PORT');};
const budget={maxCalls:20,maxTokens:100000,deadlineMs:600000};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);return {promise,release};}
async function waitGate(promise:Promise<void>){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([promise,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('T1328_CONTROLLED_GATE_EXPIRED')),120000);})]);}finally{clearTimeout(timer);}}
function evidence(name:string,value:unknown){
 const label=process.env.T1328_SERVICE_RUN_LABEL;if(label===undefined)return;
 if(!/^green-[a-zA-Z0-9-]+$/.test(label)||!/^[a-z0-9-]+$/.test(name))throw Error('invalid owned evidence path');
 const folder=new URL('../../../../docs/verification/t1328/service-boundaries/cases/'+label+'/',import.meta.url),file=new URL(name+'.json',folder);
 mkdirSync(folder,{recursive:true});if(existsSync(file))throw Error('original evidence cannot be overwritten');writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
const neutralDiagnosis={dimensions:[{key:'persona',score:3,reason:'仅检查中性文本',suggestion:'保留原意'}],performance:{完播率:null,收藏率:null,评论率:null,转化意向:null},verdict:'仅为协议测试候选',mainIssues:[],priorityFixes:[],confidence:'low' as const};
type ScriptFamily='master'|'reserved'|'empty'|'none';
async function fixture(family:ScriptFamily='master',member=false,childEngine:'pi'|'codex'='pi'){
 const opened=await createDb();closes.push(()=>opened.client.close());const db=opened.db;let n=0,clock=Date.now();
 networkSpies.push(vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('T1328_BOUNDARY_NETWORK_FORBIDDEN');}));
 const now=()=>new Date(clock).toISOString(),nextId=(prefix:string)=>`${prefix}-prediction-boundary-${++n}`;
 const base:RequestContext={userId:'prediction-boundary-user',requestId:'prediction-boundary-request',source:'user'};
 const groups=createAccountGroupService({db,now,nextId});const group=await groups.create(base,{name:'原卡边界中性组',idempotencyKey:'prediction-boundary-group'});
 let ctx:RequestContext={...base,accountId:null,groupId:group.id,groupVersion:group.version};
 if(member){const account=await createPlatformAccountService({db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'中性测试账号',idempotencyKey:'prediction-boundary-account'});const membership=await groups.forAccount(ctx,account.id);ctx={...ctx,accountId:account.id,membershipVersion:membership.version};}
 const deps={now,nextId};
 const projectsFor=(store:Db)=>createProjectsService(createProjectRepository(store),deps);
 const artifactsFor=(store:Db)=>createArtifactsService({db:store,...deps,assertProjectOwned:(c,id)=>projectsFor(store).getProject(c,id),resolveOutputProjectId:(c,id)=>projectsFor(store).getProjectIdByOutput(c,id)});
 const calibrationFor=(store:Db)=>createCalibrationService({db:store,...deps,ingestion:{assertRunExists:unavailable,ensureManualRun:unavailable},learnings:{adjustConfidence:unavailable},assertSubjectOwned:async(c,s)=>{if(s.subjectType!=='content_output')throw Error('unexpected subject');return projectsFor(store).getOutput(c,s.subjectId);}});
 const project=await projectsFor(db).createProject(ctx,{title:'桌面记录',brief:'一只杯子与笔记本的中性操作。'});
 const output=await projectsFor(db).createOutput(ctx,project.id,{title:'原卡作品',contentType:'video',clientRequestId:'prediction-boundary-output'});
 let master:Awaited<ReturnType<ReturnType<typeof artifactsFor>['createArtifact']>>|null=null;
 let saved:Awaited<ReturnType<ReturnType<typeof artifactsFor>['createArtifact']>>|null=null;
 if(family!=='none')master=await artifactsFor(db).createArtifact(ctx,{projectId:project.id,title:'正式母稿',artifactType:'master_script',stage:'script',initialContentText:'先放稳杯子，再移开合上的笔记本。'});
 if(family==='reserved')await artifactsFor(db).createReservedScriptDraftTarget(ctx,{projectId:project.id});
 if(family==='empty'){saved=await artifactsFor(db).createArtifact(ctx,{projectId:project.id,title:'正式脚本',artifactType:'output_script',stage:'script'});await artifactsFor(db).createVersion(ctx,saved.id,{contentText:'',contentData:{},changeSummary:'用户明确保存空稿'});}
 const readConfirmed=(c:RequestContext,id:string,store:Db)=>createConfirmedProjectScriptReader({projectsService:projectsFor(store),artifactsService:artifactsFor(store)})(c,id);
 const snapshot=(c:RequestContext,skillId:string)=>({snapshotVersion:1 as const,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId??null,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'只产候选，用户采纳后落库',skills:[{skillId,baseVersion:'controlled-boundary-1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'中性协议测试',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]});
 const runtime=(c:RequestContext)=>({executionRoute:createExecutionRoute(childEngine,'legacy'),skillSnapshot:snapshot(c,'calibration.diagnose')});
 const aiFor=(store:Db,marker?:Record<string,unknown>,prepared?:Record<string,unknown>)=>createAiService({db:store,...deps,artifacts:{createVersion:unavailable},knowledge:{createKnowledge:unavailable},candidate:{createFromAIResult:unavailable,enrichCard:unavailable},learnings:{createLearning:unavailable},publishing:{createPublicationFromDraft:unavailable},materialLinks:{link:unavailable},positioning:{upsertProfile:unavailable,createStatementVersion:unavailable},calibration:{createDraftPrediction:(c,input)=>calibrationFor(store).createDraftPrediction(c,input)},predictionLockSource:marker,resolveTaskRuntimeData:async c=>prepared??runtime(c)} satisfies ServiceDeps);
 let runtimeReads=0,children=0,rubricEnsures=0;
 const ports:PredictionLockPorts={getOutput:(c,id,store)=>projectsFor(store).getOutput(c,id),readConfirmedScript:readConfirmed,
  ensureRubric:async(c,store)=>{rubricEnsures++;const v=(await calibrationFor(store).ensureDefaultRubric(c)).currentVersion!;return {id:v.id,dimensions:structuredClone(v.dimensions)};},
  getRubric:async(c,id,store)=>{const v=await calibrationFor(store).getRubricVersion(c,id);return {id:v.id,dimensions:structuredClone(v.dimensions)};},getPrediction:(c,id,store)=>calibrationFor(store).getPrediction(c,id),
  prepareRuntime:async c=>{runtimeReads++;return runtime(c);},createChild:async(c,input,attempt,prepared,store)=>{children++;return aiFor(store,input.predictionLockSource as Record<string,unknown>,prepared).createTask(c,{taskType:'calibration.diagnose',inputData:input,attemptId:attempt});}};
 const locks=createPredictionLockService(db,ports,now);
 const repo=(c=ctx,store=db)=>createAiRepository(store,{...deps,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId,membershipVersion:c.membershipVersion});
 const conversation=await repo().createConversation({title:'原稿诊断',projectId:project.id,scope:'project:'+project.id});
 async function source(kind:'tool'|'external_tool'='tool',legacy=false){
  const message=await repo().createMessage(conversation.id,{role:'user',content:'按真实保存稿诊断，仅给候选。',attachments:[],modelMetadata:{}});
  const prototypes=buildChatTools(['calibration.diagnose'],{humanizeError:()=>null,diagnoseContent:async()=>structuredClone(neutralDiagnosis)} as unknown as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{workerStructuredNodes:false});
  const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:'project',functionKey:'calibration.diagnose',projectId:project.id,selection:{kind:'content_output',ids:[output.id]}},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:snapshot(ctx,resolveSkillForSurface('project'))};
  const submitter=createChatTurnSubmissionService(db,{...deps,assertProject:(c,id)=>projectsFor(db).getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'服务边界测试，不访问供应商',messages:[{role:'user',content:message.content}],tools:prepared.definitions,maxSteps:4,maxOutputTokens:2000,hostContext})});
  const submitted=await submitter.submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id,executionEngine:kind==='external_tool'?'codex':'pi'});
  if(legacy){
   // 受控旧持久格式族：当前公开提交必加marker；只删除旧格式不存在的可选marker并重算原host摘要。
   const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));if(!execution)throw Error('missing execution');
   const payload=structuredClone(execution.payload) as Record<string,unknown>,host=payload.hostContext as ChatHostContext;delete host.predictionLockPolicyVersion;
   await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,execution.id));
   const root=await repo().requireTask(submitted.taskId);await db.update(aiTasks).set({inputData:{...root.inputData as Record<string,unknown>,hostContextDigest:chatHostContextDigest(host)}}).where(eq(aiTasks.id,root.id));
  }
  const tasks=createPersistentTaskService(db,{now}),claim=await tasks.claimTask({taskId:submitted.executionTaskId,workerId:nextId('source-worker'),leaseSeconds:120});if(!claim)throw Error('missing source claim');
  const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const tools=await createChatHostToolAdapter(prototypes,async()=>prototypes,{'calibration.diagnose':'proposal'});
  const toolCallId=nextId('diagnosis-tool'),input={title:output.title,script:'先放稳杯子，再移开合上的笔记本。'};
  let callId:string|null=null;
  if(kind==='external_tool'){
   const turns=createExternalChatTurnService(db,{now,budget}),turn=await turns.reserve(ref,{});
   await turns.start(ref,{callId:turn.callId,sessionId:nextId('controlled-acp-session'),protocolKind:'acp',protocolVersion:1});
   await turns.recordProviderTurn(ref,{callId:turn.callId,providerTurnId:nextId('controlled-provider-turn')});
   const external=createExternalTaskToolService(db,{now}),request={turnCallId:turn.callId,toolCallId,toolName:'calibration.diagnose',input};
   // 现役正式目录只允许该能力的worker.structured-node；外部host并不合法。
   // 保留真实parent准备的已有行，拒绝后不新增tool call/绑定/child。
   const before=await rows();await expect(external.execute(ref,request,tools,new AbortController().signal)).rejects.toThrow('外部工具未获当前任务授权');expect(await rows()).toEqual(before);
  }else{
   const ledger=createExecutionCallLedgerService(db,{now,budget});const model=await ledger.reserve(ref,{kind:'model',operationKey:'controlled-source-model',inputDigest:'sha256:'+sha(JSON.stringify(input)),reservedTokens:20});
   await ledger.start(ref,model.id);await ledger.settle(ref,model.id,{status:'settled',usage:{totalTokens:1},providerResult:{content:[{type:'tool-call',toolCallId,toolName:chatToolProviderName('calibration.diagnose'),input:JSON.stringify(input)}],finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
   const ports=createExecutionChatToolPorts(db,{now,budget,tools});await ports.validateTask(ref);const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId});await ports.start(ref,{callId:call.callId});
   expect(await ports.execute(ref,{callId:call.callId})).toMatchObject({status:'ok',sideEffect:'proposal',data:{kind:'calibration.diagnosis'}});callId=call.callId;
  }
  return {requested:{conversationId:conversation.id,sourceMessageId:message.id,toolCallId} satisfies PredictionLockSource,rootId:submitted.taskId,executionId:submitted.executionTaskId,callId};
 }
 const adapter=createCalibrationDiagnoseBusinessAdapter({positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},subject:{get:unavailable},rubric:{current:unavailable},predictionLocks:locks});
 const business=createStructuredBusinessExecutionService(db,{adapters:{'calibration.diagnose':adapter},budget,maxOutputTokens:2000});
 async function prepare(id:string){const mapped=await business.prepare(ctx,id);const tasks=createPersistentTaskService(db,{now}),workerId=nextId('controlled-child-worker');const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId,leaseSeconds:120});if(!claim)throw Error('missing child claim');return {mapped,tasks,workerId,ref:{executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},ledger:createExecutionCallLedgerService(db,{now,budget})};}
 async function candidate(id:string){
  const child=await prepare(id);const frozen=await locks.readFrozen(ctx,await repo().requireTask(id));
  const text=JSON.stringify(workerStructuredResultSchema.parse({object:{...neutralDiagnosis,dimensions:frozen.rubric.dimensions.map(d=>({key:d.key,score:3,reason:'受控候选值，不是实际模型分析',suggestion:''}))},generation:{finishReason:'stop',usage:{inputTokens:1,outputTokens:1,cachedTokens:0,totalTokens:2},attempts:[]}}));
  const call=await child.ledger.reserve(child.ref,{kind:'model',operationKey:'calibration.diagnose/model/1',inputDigest:'sha256:'+sha(text),reservedTokens:20});await child.ledger.start(child.ref,call.id);await child.ledger.settle(child.ref,call.id,{status:'settled',usage:{totalTokens:2},resultText:text});
  const receipt=await createExecutionCandidateService(db,{now,projectCandidate:(_c,input)=>business.projectCandidate(input)}).commitResult(child.ref,{outcome:'succeeded',callId:call.id,text});
  return {...child,receipt};
 }
 function adoption(options:{afterDraft?:()=>Promise<void>;afterLock?:()=>Promise<void>;locks?:typeof locks}={}){
  return createCalibrationPositioningAdoptionService(db,{predictionLocks:options.locks??locks,assertSubject:(c,type,id,tx)=>{if(type!=='content_output')throw Error('unexpected subject');return projectsFor(tx as unknown as Db).getOutput(c,id);},
   createDraftPrediction:async(c,input,tx)=>{const value=await calibrationFor(tx as unknown as Db).createDraftPrediction(c,input);await options.afterDraft?.();return value;},
   lockPrediction:async(c,id,tx)=>{const value=await calibrationFor(tx as unknown as Db).lockPrediction(c,id);await options.afterLock?.();return value;},lockPositioning:unavailable,upsertProfile:unavailable,createStatementVersion:unavailable},now);
 }
 const rows=async()=>({tasks:await db.select().from(aiTasks),results:await db.select().from(aiTaskResults),predictions:await db.select().from(predictions),calls:await db.select().from(executionCalls),executions:await db.select().from(executionTasks),rubrics:await db.select().from(rubrics),rubricVersions:await db.select().from(rubricVersions)});
 return {db,ctx,groups,group,project,output,master,saved,source,locks,ports,repo,readConfirmed,artifactsFor,projectsFor,calibrationFor,aiFor,prepare,candidate,adoption,rows,advance:(ms:number)=>{clock+=ms;},stats:()=>({runtimeReads,children,rubricEnsures})};
}
async function started(f:Awaited<ReturnType<typeof fixture>>,kind:'tool'|'external_tool'='tool'){
 const source=await f.source(kind),available=await f.locks.read(f.ctx,source.requested);if(!available.baselineDigest)throw Error('missing baseline');const state=await f.locks.start(f.ctx,source.requested,available.baselineDigest);if(!state.diagnoseTaskId)throw Error('missing child');return {source,available,state,id:state.diagnoseTaskId};
}

it('tool真实来源→首次并发start只有一个child/attempt/冻结意图，GET纯读',async()=>{
 const f=await fixture(),source=await f.source('tool'),before=await f.rows(),available=await f.locks.read(f.ctx,source.requested);expect(await f.rows()).toEqual(before);expect(f.stats().rubricEnsures).toBe(0);
 const ready=gate(),both=gate();let entered=0;const ports={...f.ports,prepareRuntime:async(c:RequestContext)=>{const value=await f.ports.prepareRuntime(c);if(++entered===2)ready.release();await both.promise;return value;}};
 const locks=createPredictionLockService(f.db,ports),first=locks.start(f.ctx,source.requested,available.baselineDigest!),second=locks.start(f.ctx,source.requested,available.baselineDigest!);let result:Awaited<typeof first>[];
 try{await waitGate(ready.promise);both.release();result=await Promise.all([first,second]);}finally{both.release();await Promise.allSettled([first,second]);}
 expect(result[0]).toEqual(result[1]);expect(f.stats()).toEqual({runtimeReads:2,children:1,rubricEnsures:1});
 const tasks=await f.db.select().from(aiTasks);expect(tasks.filter(t=>t.taskType==='calibration.diagnose')).toHaveLength(1);
 const child=await f.repo().requireTask(result[0]!.diagnoseTaskId!);expect(child.inputData).toMatchObject({projectId:f.project.id,subjectId:f.output.id,predictionLockSource:{rootTaskId:source.rootId,toolCallId:source.requested.toolCallId}});
 const prior=await f.rows();expect(await locks.start(f.ctx,source.requested,available.baselineDigest!)).toEqual(result[0]);expect(await f.rows()).toEqual(prior);expect(f.stats().runtimeReads).toBe(2);
});

it('external_host诊断被正式目录拒绝，0新tool call/0原卡绑定/0child，不冒阳性覆盖',async()=>{
 const f=await fixture(),source=await f.source('external_tool');expect(source.callId).toBeNull();
 const before=await f.rows();expect(before.calls).toHaveLength(1);expect(before.calls[0]).toMatchObject({kind:'external_agent',status:'started'});expect(before.tasks.filter(t=>t.taskType==='calibration.diagnose')).toHaveLength(0);
 expect((await f.repo().requireTask(source.rootId)).runtimeData).not.toHaveProperty('predictionLocks');await expect(f.locks.read(f.ctx,source.requested)).rejects.toThrow('原卡工具回执不存在');expect(await f.rows()).toEqual(before);expect(f.stats()).toEqual({runtimeReads:0,children:0,rubricEnsures:0});
});

it.each(['master','reserved','empty','none'] as const)('%s 真保存族在start/readFrozen保持精确正文/ref/空hash，不回填',async family=>{
 const f=await fixture(family),s=await started(f),actual=await f.readConfirmed(f.ctx,f.project.id,f.db),frozen=await f.locks.readFrozen(f.ctx,await f.repo().requireTask(s.id));
 expect(s.state.baseline).toEqual(actual?{artifactId:actual.artifactId,versionId:actual.versionId,sha256:actual.sha256}:null);expect(frozen.subject.scriptText).toBe(actual?.fullText??'');
 if(family==='reserved')expect(actual?.artifactId).toBe(f.master!.id);
 if(family==='empty'){expect(actual?.artifactId).toBe(f.saved!.id);expect(actual?.fullText).toBe('');expect(actual?.sha256).toBe(sha(''));}
 if(family==='none'){expect(actual).toBeNull();expect(s.state.baseline).toBeNull();}
 expect(frozen.rubric.dimensions.length).toBeGreaterThan(0);expect(frozen.rubric.dimensions.every(d=>typeof d.weight==='number')).toBe(true);
});

it.each(['draft','lock'] as const)('confirm在真实%s落库后抛错，整tx回滚，原child/result/root/pred不变',async phase=>{
 const f=await fixture(),s=await started(f);await f.candidate(s.id);const before=await f.rows();let reached=0;
 const fail=async()=>{reached++;throw Error('T1328_CONTROLLED_CONFIRM_ROLLBACK');};
 await expect(f.adoption(phase==='draft'?{afterDraft:fail}:{afterLock:fail}).confirmTask(f.ctx,s.id)).rejects.toThrow('T1328_CONTROLLED_CONFIRM_ROLLBACK');expect(reached).toBe(1);expect(await f.rows()).toEqual(before);
 expect((await f.locks.read(f.ctx,s.source.requested)).status).toBe('awaiting_confirmation');
 await f.adoption().confirmTask(f.ctx,s.id);const locked=await f.locks.read(f.ctx,s.source.requested);expect(locked.status).toBe('locked');expect(locked.diagnoseTaskId).toBe(s.id);expect((await f.rows()).predictions).toHaveLength(1);
 const after=await f.rows();await f.adoption().confirmTask(f.ctx,s.id);expect(await f.rows()).toEqual(after);
});

it('正式默认rubric指针真实升版后，原source仍准备/采纳冻结旧版，不跟随新版',async()=>{
 const f=await fixture(),s=await started(f),child=await f.repo().requireTask(s.id),frozen=await f.locks.readFrozen(f.ctx,child);
 const old=await f.calibrationFor(f.db).getRubricVersion(f.ctx,frozen.rubric.rubricVersionId);
 const next=await f.calibrationFor(f.db).bumpRubricVersion(f.ctx,old.rubricId,{dimensions:old.dimensions.map(d=>({...d,label:d.label+'（后续新版）'})),changeSummary:'真实默认规则升版'});
 expect(next.id).not.toBe(old.id);expect((await f.calibrationFor(f.db).ensureDefaultRubric(f.ctx)).currentVersion!.id).toBe(next.id);
 expect(await f.locks.readFrozen(f.ctx,child)).toEqual(frozen);await f.candidate(s.id);await f.adoption().confirmTask(f.ctx,s.id);
 const locked=await f.locks.read(f.ctx,s.source.requested);expect(locked.status).toBe('locked');expect((await f.calibrationFor(f.db).getPrediction(f.ctx,locked.predictionId!)).rubricVersionId).toBe(old.id);
});

it.each(['deleted','corrupt'] as const)('冻结rubric版本%s受控损坏后，confirm拒绝且不半写/不替换版本',async damage=>{
 const f=await fixture(),s=await started(f),frozen=await f.locks.readFrozen(f.ctx,await f.repo().requireTask(s.id));await f.candidate(s.id);
 // 明确的持久数据损坏负族；不是合法用户编辑，亦不伪造成供应商或迁移写入。
 if(damage==='deleted')await f.db.delete(rubricVersions).where(eq(rubricVersions.id,frozen.rubric.rubricVersionId));
 else await f.db.update(rubricVersions).set({dimensions:frozen.rubric.dimensions.map(d=>({...d,label:d.label+'（原版本被非法改写）'}))}).where(eq(rubricVersions.id,frozen.rubric.rubricVersionId));
 const before=await f.rows();await expect(f.adoption().confirmTask(f.ctx,s.id)).rejects.toThrow();expect(await f.rows()).toEqual(before);expect((await f.rows()).predictions).toHaveLength(0);expect((await f.repo().requireTask(s.id)).status).toBe('awaiting_confirmation');
});

it('真实保存先完成：旧baseline start及confirm均拒绝且不新建任务/预测',async()=>{
 const f=await fixture(),s=await started(f);await f.candidate(s.id);await f.artifactsFor(f.db).createVersion(f.ctx,f.master!.id,{contentText:'用户新保存的另一版正文',changeSummary:'真实版本变化'});const before=await f.rows();
 await expect(f.locks.start(f.ctx,s.source.requested,s.available.baselineDigest!)).rejects.toThrow('原稿已变化');await expect(f.adoption().confirmTask(f.ctx,s.id)).rejects.toThrow('原稿已变化');expect(await f.rows()).toEqual(before);
 const next=await started(f);expect(next.id).not.toBe(s.id);expect(next.state.baseline?.versionId).not.toBe(s.state.baseline?.versionId);
});

it('confirm持有真实artifact锁时保存竞争排队；锁定原版本完成后保存新稿且不改回执',async()=>{
 const f=await fixture(),s=await started(f);await f.candidate(s.id);const entered=gate(),release=gate();
 const ports={...f.ports,getRubric:async(...args:Parameters<PredictionLockPorts['getRubric']>)=>{const rubric=await f.ports.getRubric(...args);entered.release();await release.promise;return rubric;}};
 const locks=createPredictionLockService(f.db,ports),confirm=f.adoption({locks}).confirmTask(f.ctx,s.id);
 let version:Awaited<ReturnType<ReturnType<typeof f.artifactsFor>['createVersion']>>;
 try{await waitGate(entered.promise);let saved=false;const saving=f.artifactsFor(f.db).createVersion(f.ctx,f.master!.id,{contentText:'并发用户新稿',changeSummary:'真实保存竞争'}).then(v=>{saved=true;return v;});try{await new Promise<void>(r=>setImmediate(r));expect(saved).toBe(false);}finally{release.release();}await expect(confirm).resolves.toBeUndefined();version=await saving;}finally{release.release();await Promise.allSettled([confirm]);}
 const locked=await f.locks.read(f.ctx,s.source.requested);expect(locked.status).toBe('locked');expect(locked.baseline).toEqual(s.state.baseline);expect((await f.artifactsFor(f.db).getArtifact(f.ctx,f.master!.id)).currentVersionId).toBe(version.id);expect((await f.rows()).predictions).toHaveLength(1);
});

it('旧无marker来源GET纯legacy_unknown/POST拒绝；同项目新来源独立可锁',async()=>{
 const f=await fixture(),old=await f.source('tool',true),before=await f.rows();expect((await f.locks.read(f.ctx,old.requested)).status).toBe('legacy_unknown');expect(await f.rows()).toEqual(before);expect(f.stats()).toEqual({runtimeReads:0,children:0,rubricEnsures:0});
 await expect(f.locks.start(f.ctx,old.requested,'sha256:old')).rejects.toThrow('历史锁定来源');expect(await f.rows()).toEqual(before);
 const next=await started(f);expect(next.source.requested.conversationId).toBe(old.requested.conversationId);expect(next.source.requested.sourceMessageId).not.toBe(old.requested.sourceMessageId);expect(next.state.status).toBe('running');expect((await f.locks.read(f.ctx,old.requested)).status).toBe('legacy_unknown');
});

it.each(['user','group','account','membership','archived'] as const)('%s归属/成员校验失败不写原任务/预测',async mode=>{
 const f=await fixture('master',true),s=await started(f);await f.candidate(s.id);
 let ctx=f.ctx;if(mode==='user')ctx={...ctx,userId:'foreign-user'};if(mode==='group')ctx={...ctx,groupId:'foreign-group'};if(mode==='account')ctx={...ctx,accountId:'foreign-account'};if(mode==='membership')ctx={...ctx,membershipVersion:(ctx.membershipVersion??0)+1};if(mode==='archived')await f.groups.archive(f.ctx,f.group.id,f.group.version);
 const before=await f.rows();await expect(f.locks.start(ctx,s.source.requested,s.available.baselineDigest!)).rejects.toThrow();await expect(f.adoption().confirmTask(ctx,s.id)).rejects.toThrow();expect(await f.rows()).toEqual(before);
});

it('取消原child后read/start保原ID及cancelled，不再解析路由/创建child',async()=>{
 const f=await fixture(),s=await started(f),child=await f.prepare(s.id);await f.aiFor(f.db).cancelTask(f.ctx,s.id);const before=await f.rows(),stats=f.stats();
 const pending=await f.locks.start(f.ctx,s.source.requested,s.available.baselineDigest!);evidence('cancel-requested',{childId:s.id,workerId:child.workerId,ref:child.ref,state:pending,rows:before,stats});
 expect(pending).toMatchObject({status:'running',diagnoseTaskId:s.id,task:{status:'running',runtimeStatus:'cancel_requested'}});expect(await f.rows()).toEqual(before);expect(f.stats()).toEqual(stats);
 const acknowledged=await child.tasks.acknowledgeControl({taskId:child.mapped.executionTaskId,workerId:child.workerId,attempt:child.ref.attempt});
 const after=await f.rows(),state=await f.locks.start(f.ctx,s.source.requested,s.available.baselineDigest!);evidence('cancel-acknowledged',{acknowledged,state,rows:after,stats:f.stats()});
 expect(state).toMatchObject({status:'failed',diagnoseTaskId:s.id,task:{status:'cancelled',runtimeStatus:'cancelled',executionTaskId:child.mapped.executionTaskId}});expect(await f.rows()).toEqual(after);expect(f.stats()).toEqual(stats);expect(after.tasks.map(t=>t.id)).toEqual(before.tasks.map(t=>t.id));expect(after.calls).toEqual(before.calls);expect(after.results).toEqual(before.results);expect(after.predictions).toEqual(before.predictions);
});

it('原模型调用unknown经真实过期租约恢复；read/start保原child/execution/call而不重发',async()=>{
 // 只此case在首次click前提供当前配置的Codex-v1冻结路由；原聊天来源仍Pi。
 // 没有provider I/O，也不补造thread/turn；未知原call不能套Pi纯文本安全恢复许可。
 const f=await fixture('master',false,'codex'),s=await started(f),child=await f.prepare(s.id);const initial=await f.rows();
 expect((await f.repo().requireTask(s.id)).runtimeData).toMatchObject({executionRoute:createExecutionRoute('codex','legacy')});
 const call=await child.ledger.reserve(child.ref,{kind:'model',operationKey:'calibration.diagnose/model/1',inputDigest:'sha256:'+sha('unknown-output'),reservedTokens:20});await child.ledger.start(child.ref,call.id);await child.ledger.settle(child.ref,call.id,{status:'unknown'});
 evidence('unknown-before-recovery',{childId:s.id,ref:child.ref,callId:call.id,rows:await f.rows()});f.advance(121000);
 const recovery=await child.tasks.recoverExpiredLeases({taskId:child.mapped.executionTaskId});evidence('unknown-recovery-report',{recovery,rows:await f.rows()});expect(recovery).toMatchObject({unknownResult:1,requeued:0});const before=await f.rows(),stats=f.stats();const state=await f.locks.start(f.ctx,s.source.requested,s.available.baselineDigest!);
 evidence('unknown-original-source-replay',{state,stats:f.stats(),rows:await f.rows()});expect(state).toMatchObject({status:'unknown',diagnoseTaskId:s.id,task:{executionTaskId:child.mapped.executionTaskId,runtimeStatus:'unknown_result'}});expect(await f.rows()).toEqual(before);expect(f.stats()).toEqual(stats);expect(before.tasks.map(t=>t.id)).toEqual(initial.tasks.map(t=>t.id));expect(before.calls.filter(c=>c.executionTaskId===child.mapped.executionTaskId)).toMatchObject([{id:call.id,status:'unknown'}]);expect(before.executions.find(e=>e.id===child.mapped.executionTaskId)?.payload).not.toHaveProperty('codexCalls');
});
