import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {createDb,type Db} from '../../db';
import {executionTasks,executionCalls,intelligenceItems,intelligenceSources,intelligenceSyncRuns,sourceSnapshots,itemTranscripts} from '../../schema/intelligence';
import {projects,projectSourceReferences} from '../../schema/projects';
import {createProjectsService} from './projects.service';
import {createProjectRepository} from './projects.repository';
import {createProjectPreparationService} from './project-preparation.service';
import {createProjectPreparationGenerationService} from './project-preparation-generation.service';
import {createArtifactsService} from '../artifacts/artifacts.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {runIntelligenceTopicPreviewTask,type TopicPreviewRunnerDeps} from '../intelligence/topic-preview-runner';
import {CapabilityModelRoutingError} from '../ai-runtime/capability-model-routing';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionRoute,codexExecutionSpec,intelligenceRewriteInputSchema,projectPreparationGenerationTargetSchema} from '@creatoros/contract/execution-worker';
import {createIntelligenceGenerationBridge} from '../intelligence/intelligence-generation-bridge';
import {createIntelligenceService} from '../intelligence/intelligence.service';
import {createProjectPreparationApplication} from '../../application/projects/project-preparation';

let db:Db,close:()=>Promise<void>,sequence=0;
const clock={value:'2026-10-21T06:00:00.000Z'},now=()=>clock.value;
const nextId=(prefix:string)=>`${prefix}-fa-${++sequence}`;
const advance=(ms=3000)=>{clock.value=new Date(Date.parse(clock.value)+ms).toISOString();};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);
afterAll(async()=>close?.(),120000);
async function row(id:string){return (await db.select().from(executionTasks).where(eq(executionTasks.id,id)))[0]!;}

async function fixture(continuous=false){
 clock.value='2026-10-21T06:00:00.000Z';
 // Each test owns a separate account; only synthetic records in this in-memory DB are stopped.
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null});
 const ctx={userId:nextId('user'),accountId:nextId('account'),source:'user' as const,requestId:'fa-test'};
 const deps={now,nextId},tasks=createPersistentTaskService(db,deps);
 const project=await createProjectsService(createProjectRepository(db),deps).createProject(ctx,{title:'准备控制回归'});
 if(continuous)await db.update(projects).set({source:'radar'}).where(eq(projects.id,project.id));
 const artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)});
 const text='只用于本次测试的来源正文',hash=`sha256:${createHash('sha256').update(text).digest('hex')}`;
 const source=await artifacts.createArtifact(ctx,{projectId:project.id,title:'来源',stage:'script',artifactType:'output_script',initialContentText:text,initialContentData:{purpose:'project_preparation_source'}});
 const target=projectPreparationGenerationTargetSchema.parse({ownerType:'project',projectId:project.id,source:{kind:'project_artifact',projectId:project.id,artifactId:source.id,artifactVersion:1,contentHash:hash,title:'来源',authorName:null,url:null},generationMode:'rewrite_only',transcript:{text,hash}});
 const generation=createProjectPreparationGenerationService(db,{...deps,tasks});
 const dispatch=vi.fn(async(context:Parameters<typeof generation.reserve>[0],input:Parameters<Parameters<typeof createProjectPreparationService>[1]['dispatch']>[1])=>({status:'child' as const,...await generation.reserve(context,{parentClaim:input.claim,projectId:project.id,referenceId:null,inputRevision:0,target}),businessTaskId:null,shared:false}));
 const preparation=createProjectPreparationService(db,{...deps,tasks,dispatch,collect:(context,input)=>generation.collect(context,project.id,input.childTaskId)});
 const started=await preparation.start(ctx,project.id,{idempotencyKey:nextId('start'),requestedSteps:['source_draft']});
 await preparation.tick({shouldStop:()=>false});
 const parentId=started.preparationTaskId!,childId=(await preparation.get(ctx,project.id)).steps.find(step=>step.name==='source_draft')!.childTaskId!;
 const generate=vi.fn(async()=>{throw new Error('synthetic generation failure');});
 const run=()=>runIntelligenceTopicPreviewTask(ctx,{taskId:childId},{tasks,intelligence:{} as TopicPreviewRunnerDeps['intelligence'],generator:{generate},projectGenerator:{generate},projectPreparation:generation});
 const tick=async()=>{advance();await preparation.tick({shouldStop:()=>false});};
 return {ctx,tasks,preparation,generation,dispatch,generate,run,tick,project,parentId,childId,target};
}

async function radarFixture(){
 const f=await fixture(true),{ctx,tasks,project}=f;
 await tasks.command(ctx,{taskIds:[f.parentId],command:'cancel',idempotencyKey:'replace-artifact-fixture'});
 advance(); // 两个合成父任务不能共享同一createdAt，否则“最新准备”查询没有时间顺序。
 const owner={userId:ctx.userId,accountId:ctx.accountId},itemId=nextId('item'),sourceId=nextId('source'),runId=nextId('run'),snapshotId=nextId('snapshot'),referenceId=nextId('reference');
 await db.insert(intelligenceItems).values({...owner,id:itemId,type:'video',platform:'douyin',canonicalUrl:'https://example.test/radar',canonicalUrlHash:itemId,title:'测试雷达来源',capturedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceSources).values({...owner,id:sourceId,type:'rss',platform:'web',displayName:'测试来源',externalKey:sourceId,adapterConfig:{type:'rss',url:'https://example.test/feed'},createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceSyncRuns).values({...owner,id:runId,sourceId,executionTaskId:nextId('sync'),trigger:'manual',status:'succeeded',startedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(sourceSnapshots).values({...owner,id:snapshotId,sourceId,runId,itemId,capturedAt:now(),finalUrl:'https://example.test/radar',title:'测试雷达来源',contentHash:'radar-source'});
 await db.insert(projectSourceReferences).values({id:referenceId,projectId:project.id,sourceKind:'intelligence_item',sourceKey:itemId,itemId,snapshotId,sourceDigest:'radar-source',createdAt:now(),updatedAt:now()});
 await db.insert(itemTranscripts).values({...owner,itemId,status:'done',text:'测试雷达逐字稿正文',completedAt:now(),updatedAt:now()});
 const intelligence=createIntelligenceService(db,{now,nextId,tasks}),forbidden=vi.fn(async()=>{throw Error('不得调用其他准备服务');});
 const {preparation}=createProjectPreparationApplication(db,{now,nextId,tasks,intelligence,submitBrief:forbidden,submitProjectTranscript:forbidden,readBrief:forbidden});
 const started=await preparation.start(ctx,project.id,{idempotencyKey:'radar-preparation',requestedSteps:['source_draft']});
 await preparation.tick({shouldStop:()=>false});
 const parentId=started.preparationTaskId!,childId=(await preparation.get(ctx,project.id)).steps.find(step=>step.name==='source_draft')!.childTaskId!;
 const run=()=>runIntelligenceTopicPreviewTask(ctx,{taskId:childId},{tasks,intelligence,generator:{generate:f.generate}});
 const tick=async()=>{advance();await preparation.tick({shouldStop:()=>false});};
 return {...f,intelligence,preparation,parentId,childId,run,tick};
}

it('fa 真实雷达父子链未登录不自动重发，明确恢复三次耗尽后终态停止',async()=>{
 const f=await radarFixture();f.generate.mockRejectedValue(new CapabilityModelRoutingError('CODEX_LOGIN_REQUIRED','structured:topic.generate'));
 for(let i=0;i<12;i++){await f.run();await f.tick();}
 expect(f.generate).toHaveBeenCalledTimes(1);
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({ownerType:'transform',attempt:1,runtimeStatus:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED'});
 expect(await f.tasks.get(f.ctx,f.parentId)).toMatchObject({runtimeStatus:'waiting_user'});
 for(let attempt=2;attempt<=3;attempt++){
  await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'resume',idempotencyKey:`explicit-login-retry-${attempt}`});await f.tick();await f.run();await f.tick();
  expect((await row(f.childId)).attempt).toBe(attempt);
 }
 for(let i=0;i<6;i++){await f.tasks.recoverExpiredLeases();await f.run();await f.tick();}
 expect(f.generate).toHaveBeenCalledTimes(3);
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:3,status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 expect(await f.tasks.get(f.ctx,f.parentId)).toMatchObject({status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
});

it.each(['resume','recovery'] as const)('fa 真实雷达transform正常最终回执在上限后只读回放 %s',async entry=>{
 const f=await radarFixture(),child=await row(f.childId),target=await f.intelligence.getTopicPreviewForExecution(f.ctx,child.id),operationKey=`intelligence:${child.id}`;
 const skill={skillId:'intelligence.topic-decompose',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'仅生成候选',template:'{{transcript}}',tools:[],requiredFacets:['transcript'],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}};
 const input={kind:'model.structured',operationKey,capability:'topic.generate',skillId:skill.skillId,skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'测试',skills:[skill]},maxOutputTokens:8192,timeoutMs:600000,facets:{mode:'topic_preview',target:JSON.stringify(target)}};
 const stable={generationMode:target.generationMode,transformId:target.transformId,item:{title:target.item.title,authorName:target.item.authorName,platform:target.item.platform,canonicalUrl:target.item.canonicalUrl},positioning:target.positioning,positioningVersionId:target.positioningVersionId,personalizationStatus:target.personalizationStatus,transcript:{hash:target.transcript.hash,text:target.transcript.text}};
 const final={hook:'测试开场',structureSteps:['问题','方法'],coreClaims:['测试观点'],reusablePattern:'测试结构',factRisks:[],title:'测试选题',angle:'测试角度',differentiation:'测试差异',sourceSummary:'测试来源概述',targetAudience:'测试读者',audiencePain:'测试问题',coreConflict:'测试冲突',format:'口播',adaptationStrategy:{keep:['开场'],replace:['案例'],add:['结论'],avoid:['重复']},adaptedDraft:'已落账的雷达候选正文'};
 await db.insert(executionCalls).values({id:nextId('radar-final'),executionTaskId:child.id,sequence:1,operationKey:`${operationKey}/model/1`,kind:'model',status:'settled',inputDigest:'sha256:'+'d'.repeat(64),reservedTokens:0,totalTokens:0,resultText:JSON.stringify({kind:'result',value:final}),providerResult:{fixture:'original-radar-result'},createdAt:now(),updatedAt:now()});
 await db.update(executionTasks).set({attempt:3,status:entry==='resume'?'paused':'running',leaseOwner:entry==='resume'?null:'expired',leaseExpiresAt:entry==='resume'?null:now(),payload:{...child.payload as object,executionRoute:createExecutionRoute('codex'),intelligenceGeneration:{sourceDigest:createHash('sha256').update(JSON.stringify(stable)).digest('hex'),input,identity:{schemaVersion:1,capability:'topic.generate',...codexExecutionSpec()}}}}).where(eq(executionTasks.id,child.id));
 if(entry==='resume'){
  const frozen=(await row(child.id)).payload as Record<string,unknown>;
  for(const field of ['sourceDigest','scope'] as const){
   const changed=structuredClone(frozen) as typeof frozen&{intelligenceGeneration:{sourceDigest:string;input:{skillSnapshot:{userId:string}}}};
   if(field==='sourceDigest')changed.intelligenceGeneration.sourceDigest='changed-source';else changed.intelligenceGeneration.input.skillSnapshot.userId='foreign-user';
   await db.update(executionTasks).set({payload:changed}).where(eq(executionTasks.id,child.id));
   await expect(f.tasks.command(f.ctx,{taskIds:[child.id],command:'resume',idempotencyKey:`reject-${field}`})).rejects.toThrow('重试次数已用尽');
  }
  await db.update(executionTasks).set({payload:frozen}).where(eq(executionTasks.id,child.id));
 }
 const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));
 if(entry==='resume')await f.tasks.command(f.ctx,{taskIds:[child.id],command:'resume',idempotencyKey:'radar-final-only'});else await f.tasks.recoverExpiredLeases({taskId:child.id});
 expect((await row(child.id)).status).toBe('queued');
 const forbidden=vi.fn(async()=>{throw Error('不得新解析模型或启动Worker');}),entryPath=vi.fn(()=>{throw Error('不得启动Worker');});
 const bridge=createIntelligenceGenerationBridge(db,{now,tasks:f.tasks,entryPath,resolveModelSpec:forbidden,resolveSkillSnapshot:forbidden});
 try{await runIntelligenceTopicPreviewTask(f.ctx,{taskId:child.id},{tasks:f.tasks,intelligence:f.intelligence,generator:bridge.topicPreviewGenerator});}finally{await bridge.stop();}
 expect(await f.tasks.get(f.ctx,child.id)).toMatchObject({status:'succeeded'});
 expect((await f.intelligence.readProjectPreparationCandidate(f.ctx,child.id)).text).toBe(final.adaptedDraft);
 expect(forbidden).not.toHaveBeenCalled();expect(entryPath).not.toHaveBeenCalled();
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id))).toEqual(before);
 expect((await row(child.id)).deadlineAt).toBe(child.deadlineAt);
});

it('fa 用户一次retry只恢复原子一次，父轮询attempt增长不能再次授权',async()=>{
 const f=await fixture(true);
 await f.run();await f.tick();
 await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'retry',idempotencyKey:'one-explicit-retry'});
 await f.tick();await f.run();await f.tick();
 for(let i=0;i<8;i++){await f.run();await f.tick();}
 expect(f.generate).toHaveBeenCalledTimes(2);
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({id:f.childId,attempt:2,status:'failed'});
 expect((await row(f.parentId)).status).toBe('blocked');
 expect(f.dispatch).toHaveBeenCalledTimes(1);
});

it.each([false,true])('fa Codex持续未登录停止自动重发，保原父子期限 continuous=%s',async continuous=>{
 const f=await fixture(continuous),parentDeadline=(await row(f.parentId)).deadlineAt,childDeadline=(await row(f.childId)).deadlineAt;
 f.generate.mockRejectedValue(new CapabilityModelRoutingError('CODEX_LOGIN_REQUIRED','text:topic.generate'));
 await f.run();await f.tick();
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:1,runtimeStatus:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED',errorMessage:expect.stringContaining('设置中登录 Codex')});
 expect((await row(f.parentId)).status).toBe('waiting_user');
 for(let i=0;i<12;i++){await f.tasks.recoverExpiredLeases();await f.run();await f.tick();}
 expect(f.generate).toHaveBeenCalledTimes(1);expect(f.dispatch).toHaveBeenCalledTimes(1);
 expect((await row(f.childId)).deadlineAt).toBe(childDeadline);expect((await row(f.parentId)).deadlineAt).toBe(parentDeadline);
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId))).toEqual([]);
});

it('fa 连续准备的生成重试受原maxAttempts限制，耗尽后父子failed且不再领取',async()=>{
 const f=await fixture(true);
 f.generate.mockRejectedValue(new Error('network unavailable'));
 for(let i=0;i<10;i++){await f.run();await f.tick();}
 expect(f.generate).toHaveBeenCalledTimes(3);
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:3,status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 expect(await f.tasks.get(f.ctx,f.parentId)).toMatchObject({status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 expect((await f.preparation.get(f.ctx,f.project.id)).availableActions).not.toContain('retry');
 expect(await f.tasks.claimTask({taskId:f.childId,workerId:'must-not-run'})).toBeNull();
});

it('fa 普通已知失败经三次明确尝试耗尽后不再提供假retry',async()=>{
 const f=await fixture(true);
 for(let i=0;i<3;i++){
  if(i){await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'retry',idempotencyKey:`explicit-${i}`});await f.tick();}
  await f.run();await f.tick();
 }
 expect(f.generate).toHaveBeenCalledTimes(3);
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:3,status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 expect(await f.tasks.get(f.ctx,f.parentId)).toMatchObject({status:'failed'});
 expect((await f.preparation.get(f.ctx,f.project.id)).availableActions).not.toContain('retry');
});

it.each(['resume','recovery'] as const)('fa 已有最终结果即使达到次数上限仍能只读恢复 %s',async entry=>{
 const f=await fixture(true),child=await row(f.childId),callId=nextId('settled'),operationKey='original-model';
 await db.insert(executionCalls).values({id:callId,executionTaskId:child.id,sequence:1,operationKey,kind:'model',status:'settled',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:0,resultText:JSON.stringify({kind:'result',value:{generationMode:'rewrite_only',adaptedDraft:'原调用已生成的候选'}}),providerResult:{fixture:'known-original-result'},createdAt:now(),updatedAt:now()});
 await db.update(executionTasks).set({attempt:3,status:entry==='resume'?'paused':'running',leaseOwner:entry==='resume'?null:'expired-worker',leaseExpiresAt:entry==='resume'?null:now(),payload:{...child.payload as object,generationReadRecovery:{schemaVersion:1,callIds:[callId],operationKeys:[operationKey]}}}).where(eq(executionTasks.id,child.id));
 const originalCalls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));
 if(entry==='resume')await f.tasks.command(f.ctx,{taskIds:[child.id],command:'resume',idempotencyKey:'read-final-only'});
 else await f.tasks.recoverExpiredLeases({taskId:child.id});
 expect((await row(child.id)).status).toBe('queued');
 expect(await f.tasks.claimTask({taskId:child.id,workerId:'read-final'})).not.toBeNull();
 expect((await row(child.id)).deadlineAt).toBe(child.deadlineAt);
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id))).toEqual(originalCalls);
 expect(f.generate).not.toHaveBeenCalled();
});

it.each(['resume','recovery'] as const)('fa 无恢复标记的正常最终回执在次数耗尽后经真实bridge回放 %s',async entry=>{
 const f=await fixture(true),child=await row(f.childId),callId=nextId('final'),operationKey=`intelligence:${child.id}`;
 const skill={skillId:'intelligence.topic-adapted-draft',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'仅生成候选',template:'{{transcript}}',tools:[],requiredFacets:['transcript'],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}};
 const input=intelligenceRewriteInputSchema.parse({kind:'model.structured',intelligenceText:'rewrite_only',operationKey,capability:'topic.generate',skillId:skill.skillId,skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'测试',skills:[skill]},maxOutputTokens:8192,timeoutMs:600000,facets:{mode:'topic_preview',target:JSON.stringify(f.target)}});
 const final={generationMode:'rewrite_only',adaptedDraft:'已经生成的原候选'};
 await db.insert(executionCalls).values({id:callId,executionTaskId:child.id,sequence:1,operationKey:`${operationKey}/model/1`,kind:'model',status:'settled',inputDigest:'sha256:'+'c'.repeat(64),reservedTokens:0,totalTokens:0,resultText:JSON.stringify({kind:'result',value:final}),providerResult:{fixture:'original-result'},createdAt:now(),updatedAt:now()});
 await db.update(executionTasks).set({attempt:3,status:entry==='resume'?'paused':'running',leaseOwner:entry==='resume'?null:'expired',leaseExpiresAt:entry==='resume'?null:now(),payload:{...child.payload as object,executionRoute:createExecutionRoute('codex'),intelligenceGeneration:{sourceDigest:createHash('sha256').update(JSON.stringify(f.target)).digest('hex'),input,identity:{schemaVersion:1,capability:'topic.generate',...codexExecutionSpec()}}}}).where(eq(executionTasks.id,child.id));
 const before=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));
 if(entry==='resume')await f.tasks.command(f.ctx,{taskIds:[child.id],command:'resume',idempotencyKey:'final-without-marker'});
 else await f.tasks.recoverExpiredLeases({taskId:child.id});
 const claim=await f.tasks.claimTask({taskId:child.id,workerId:'replay-only'});expect(claim).not.toBeNull();
 const forbidden=vi.fn(async()=>{throw Error('不得新解析模型或启动Worker');});
 const entryPath=vi.fn(()=>{throw Error('不得启动Worker');});
 const bridge=createIntelligenceGenerationBridge(db,{now,tasks:f.tasks,entryPath,resolveModelSpec:forbidden,resolveSkillSnapshot:forbidden});
 try{expect(await bridge.topicPreviewGenerator.generate(f.ctx,f.target,async()=>{},claim!)).toEqual(final);}finally{await bridge.stop();}
 expect(forbidden).not.toHaveBeenCalled();expect(entryPath).not.toHaveBeenCalled();
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id))).toEqual(before);
 expect((await row(child.id)).deadlineAt).toBe(child.deadlineAt);
});

it('fa Worker拒绝回执自动重试也在原次数耗尽时停止父子',async()=>{
 const f=await fixture(true),ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:20,maxTokens:100000,deadlineMs:1800000}}),outcomes=createExecutionWorkerOutcomeService(db,{now,random:()=>0,allowedKinds:['topic_preview']});
 for(let i=0;i<3;i++){
  const claim=(await f.tasks.claimTask({taskId:f.childId,workerId:'fake-worker'}))!;
  expect(claim).not.toBeNull();const ref={executionTaskId:f.childId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const retryOfCallId=(await row(f.childId)).retryOfCallId??undefined;
  const call=await ledger.reserve(ref,{operationKey:'original-operation',kind:'model',inputDigest:'sha256:'+'b'.repeat(64),reservedTokens:1,retryOfCallId});
  await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:'rejected'});
  await outcomes.recordFailure(ref,{outcome:'retry_wait',errorCode:'NETWORK'});advance(60000);await f.tick();
 }
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:3,status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 expect((await row(f.parentId)).status).toBe('failed');
 expect(await f.tasks.claimTask({taskId:f.childId,workerId:'forbidden-fourth'})).toBeNull();
});

it('fa 旧continuous子无显式预算次数也按原maxAttempts结算，resume不能重置',async()=>{
 const f=await fixture(true),child=await row(f.childId);
 await db.update(executionTasks).set({executionBudget:{policy:'continuous',maxCalls:null,maxTokens:null,deadlineMs:null},attempt:2}).where(eq(executionTasks.id,f.childId));
 f.generate.mockRejectedValue(new CapabilityModelRoutingError('CODEX_RUNTIME_UNAVAILABLE','text:topic.generate'));
 await f.run();await f.tick();
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({attempt:3,status:'failed',errorCode:'GENERATION_RECOVERY_EXHAUSTED'});
 await expect(f.tasks.command(f.ctx,{taskIds:[f.childId],command:'resume',idempotencyKey:'cannot-renew'})).rejects.toThrow();
 expect((await row(f.childId)).deadlineAt).toBe(child.deadlineAt);
});

it('fa 新尝试queued/running与成功不携带上次错误或重试动作',async()=>{
 const f=await fixture();await f.run();await f.tick();
 expect((await f.preparation.get(f.ctx,f.project.id)).lastError).not.toBeNull();
 await f.preparation.start(f.ctx,f.project.id,{idempotencyKey:'retry-clear',requestedSteps:['source_draft']});await f.tick();
 for(const expected of ['queued','running','done']){
  if(expected==='running')await f.tasks.claimTask({taskId:f.childId,workerId:'fake-active'});
  if(expected==='done'){
   const child=await row(f.childId);
   await f.generation.finish(f.ctx,{task:await f.tasks.get(f.ctx,child.id),payload:child.payload as Record<string,unknown>,lease:{workerId:child.leaseOwner!,attempt:child.attempt,fenceToken:child.fenceToken!}},{generationMode:'rewrite_only',adaptedDraft:'候选正文'});
   await f.tasks.finish({taskId:child.id,workerId:child.leaseOwner!,attempt:child.attempt,status:'succeeded'});
  }
  await f.tick();const resource=await f.preparation.get(f.ctx,f.project.id),step=resource.steps.find(value=>value.name==='source_draft')!;
  expect(step.status).toBe(expected==='done'?'candidate_ready':expected);expect(step.lastError).toBeNull();expect(resource.lastError).toBeNull();
  expect(step.availableActions).not.toContain('retry');expect(step.availableActions).not.toContain('resume');
 }
});

it('fa blocked父公布实际可执行的pause并保留子失败记录',async()=>{
 const f=await fixture();await f.run();await f.tick();
 expect((await f.preparation.get(f.ctx,f.project.id)).availableActions).toContain('pause');
 await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'pause',idempotencyKey:'pause-blocked'});
 expect((await row(f.parentId)).status).toBe('paused');expect((await row(f.childId)).status).toBe('failed');
});

it('fa cancelled父拒绝resume且用户错误不泄露attempt/status',async()=>{
 const f=await fixture();await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'cancel',idempotencyKey:'cancel-parent'});
 await db.update(executionTasks).set({attempt:4}).where(eq(executionTasks.id,f.parentId));const before=await row(f.parentId);
 const error=await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'resume',idempotencyKey:'resume-cancelled'}).catch(value=>value);
 expect(error).toBeInstanceOf(Error);expect(error.message).toContain('已取消');expect(error.message).not.toMatch(/attempt|status=|4\/3/);
 expect(await row(f.parentId)).toEqual(before);
});

it.each(['missing','active'] as const)('fa 父cancel传至子，按原租约结算且不夺活执行权 lease=%s',async lease=>{
 const f=await fixture(),claim=(await f.tasks.claimTask({taskId:f.childId,workerId:'active-child',leaseSeconds:120}))!;
 if(lease==='missing')await db.update(executionTasks).set({leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null}).where(eq(executionTasks.id,f.childId));
 await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'cancel',idempotencyKey:'cancel-cascade'});
 expect((await row(f.parentId)).status).toBe('cancelled');
 await f.tasks.recoverExpiredLeases({taskId:f.childId});
 if(lease==='active'){
  expect((await row(f.childId)).status).toBe('cancel_requested');
  advance(119999);await f.tasks.recoverExpiredLeases({taskId:f.childId});expect((await row(f.childId)).status).toBe('cancel_requested');
  advance(1);await f.tasks.recoverExpiredLeases({taskId:f.childId});
 }
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({status:'cancelled',attempt:claim.lease.attempt});
 await expect(f.tasks.saveCheckpoint({taskId:f.childId,...claim.lease,checkpoint:{late:true}})).rejects.toThrow();
});

it('fa Worker已知登录拒绝的持久错误给出登录引导',async()=>{
 const f=await fixture(),claim=(await f.tasks.claimTask({taskId:f.childId,workerId:'worker'}))!;
 await createExecutionWorkerOutcomeService(db,{now,allowedKinds:['topic_preview']}).recordFailure({executionTaskId:f.childId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},{outcome:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED'});
 expect(await f.tasks.get(f.ctx,f.childId)).toMatchObject({runtimeStatus:'waiting_user',errorCode:'CODEX_LOGIN_REQUIRED',errorMessage:expect.stringContaining('设置中登录 Codex')});
});

it('fa 清除已运行步骤旧错时仍保留另一等待步骤的真实提示',async()=>{
 const f=await fixture(),parent=await row(f.parentId),cp=parent.checkpoint as {steps:Array<{name:string;status:string;lastError:unknown}>;lastError:unknown};
 const old={code:'EXECUTION_FAILED',message:'上次生成失败'},current={code:'CONFIGURATION_REQUIRED',message:'请补充来源正文'};
 Object.assign(cp.steps.find(step=>step.name==='source_draft')!,{status:'running',lastError:old});
 Object.assign(cp.steps.find(step=>step.name==='transcript')!,{status:'waiting_user',lastError:current});cp.lastError=old;
 await db.update(executionTasks).set({checkpoint:cp}).where(eq(executionTasks.id,parent.id));
 const resource=await f.preparation.get(f.ctx,f.project.id);
 expect(resource.lastError).toEqual(current);expect(resource.steps.find(step=>step.name==='source_draft')!.lastError).toBeNull();
 expect(resource.steps.find(step=>step.name==='transcript')!.lastError).toEqual(current);
});

it('fa 转写失败显式重试后queued/running不残留手工补充动作',async()=>{
 const f=await radarFixture(),itemId=(await row(f.childId)).ownerId;
 await f.tasks.command(f.ctx,{taskIds:[f.parentId],command:'cancel',idempotencyKey:'cancel-draft-fixture'});
 advance();
 await db.update(itemTranscripts).set({status:'failed',text:null}).where(eq(itemTranscripts.itemId,itemId));
 const parentId=(await f.preparation.start(f.ctx,f.project.id,{idempotencyKey:'transcript-controls',requestedSteps:['transcript']})).preparationTaskId!;
 await f.preparation.tick({shouldStop:()=>false});
 const childId=(await f.preparation.get(f.ctx,f.project.id)).steps.find(step=>step.name==='transcript')!.childTaskId!;
 expect(childId).toBeTruthy();const claim=(await f.tasks.claimTask({taskId:childId,workerId:'fake-transcript'}))!;
 await f.tasks.finish({taskId:childId,...claim.lease,status:'failed',errorCode:'TRANSCRIPT_FAILED',errorMessage:'测试转写失败'});await f.tick();
 expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(step=>step.name==='transcript')!.availableActions).toContain('provide_transcript');
 await f.tasks.command(f.ctx,{taskIds:[parentId],command:'retry',idempotencyKey:'retry-transcript'});await f.tick();
 for(const status of ['queued','running']){
  if(status==='running'){await f.tasks.claimTask({taskId:childId,workerId:'fake-transcript-retry'});await f.tick();}
  expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(step=>step.name==='transcript')).toMatchObject({status,availableActions:[]});
 }
});
