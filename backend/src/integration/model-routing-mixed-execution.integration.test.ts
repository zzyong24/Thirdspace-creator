import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecutionCodexCallService} from '../modules/execution/execution-codex-call.service';
import {createExecutionAssetResultService} from '../modules/execution/execution-asset-result.service';
import {frozenNonChatModelBindingForCall} from '../modules/execution/execution-model-identity.service';
import {originalCodexReadBinding} from '../modules/execution/codex-read-recovery';
import {unconfirmedModelCalls} from '../modules/execution/model-call-recovery';
import {createLocalFsObjectStorage} from '../modules/assets/localfs-object-storage';
import {generationRequestDigest} from '@creatoros/ai-worker/chat';
import {canonicalJson} from '../modules/ai/canonical-json';
import {createScheduledFlywheelExecutionService} from '../modules/ai-runtime/scheduled-flywheel-execution.service';
import {createExecutionFlywheelGenerationService} from '../modules/execution/execution-flywheel-generation.service';
import {createEffectiveSkillSnapshotResolver} from '../modules/ai-runtime/effective-skill-snapshot';
import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createSettingsRepository} from '../modules/settings';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {aiTasks,createDb,eq,executionTasks,projects,scheduledJobs,jobRuns} from '@creatoros/backend';
import {executionRouteV2Schema,modelRouteCatalog,createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createExecutionAuthorityService} from '../modules/execution/execution-authority.service';
import {createAiService,type ServiceDeps} from '../modules/ai/ai.service';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionScheduledChildService} from '../modules/execution/execution-scheduled-child.service';
const ctx={userId:'routing-user',accountId:'routing-account',requestId:'routing-integration',source:'user' as const};
const stamp='2026-10-14T00:00:00.000Z';
function fixtureRoute(){return executionRouteV2Schema.parse({schemaVersion:2,orchestrator:{engine:'codex',source:'preference',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},selectionRevision:7,catalogVersion:1,rootRouteDigest:`sha256:${'1'.repeat(64)}`,routes:Object.fromEntries(modelRouteCatalog.map(({family,...entry})=>[entry.routeKey,{...entry,source:family==='image'?'self':family==='audio'?'local':family==='video'||family==='embed'?'official':'codex',readiness:'unavailable',reasonCode:'FIXTURE_NO_MODEL_CALL'}]))});}
describe('T1278 真实公共执行绑定的完整路由（不代签模型调用）',()=>{
 let store:Awaited<ReturnType<typeof createDb>>;
 beforeAll(async()=>{store=await createDb();},180_000);afterAll(async()=>{await store?.client.close();},180_000);
 it('业务根到execution完整复制，后续设置切换不改原映射／ID／deadline',async()=>{
  const route=fixtureRoute();
  await store.db.insert(aiTasks).values({id:'routing-root',userId:ctx.userId,accountId:ctx.accountId,taskType:'script.draft',status:'queued',idempotencyKey:'routing-root',requestedAt:stamp,inputData:{prompt:'正文'},runtimeData:{executionRoute:route}});
  const authority=createExecutionAuthorityService(store.db,{now:()=>stamp});
  const first=await authority.bindAiTask(ctx,'routing-root');
  const [original]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,first.executionTaskId));
  expect((original!.payload as Record<string,unknown>).executionRoute).toEqual(route);
  const settings=createSettingsRepository(store.db,{now:()=>stamp,nextId:p=>`${p}-preference`});
  await settings.patchPreferences(ctx,{assistantExecutionEngine:'pi'});
  await settings.setModelRouting(ctx,{text:'self',vision:'self',image:'official',video:'self',audio:'official',embed:'self'},0);
  expect(await authority.bindAiTask(ctx,'routing-root')).toEqual(first);
  const [replay]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,first.executionTaskId));
  expect(replay!.payload).toEqual(original!.payload);expect(replay!.deadlineAt).toBe(original!.deadlineAt);
 },180_000);
 it('已有映射被压成v1时拒绝，不按新偏好补洞或重建执行',async()=>{
  const [row]=await store.db.select().from(executionTasks).where(eq(executionTasks.ownerId,'routing-root'));
  await store.db.update(executionTasks).set({payload:{...row!.payload as Record<string,unknown>,executionRoute:createExecutionRoute('codex')}}).where(eq(executionTasks.id,row!.id));
  await expect(createExecutionAuthorityService(store.db).bindAiTask(ctx,'routing-root')).rejects.toThrow('完整模型路由');
  const rows=await store.db.select().from(executionTasks).where(eq(executionTasks.ownerId,'routing-root'));expect(rows).toHaveLength(1);
 },180_000);
 it('父工具提交只准备一次Skill，commit继承完整原map，重放保持原任务',async()=>{
  const route=fixtureRoute(),now=()=>stamp,budget={maxCalls:8,maxTokens:100000,deadlineMs:600000};let seq=0;
  const nextId=(p:string)=>`${p}-mixed-commit-${++seq}`;
  const tasks=createPersistentTaskService(store.db,{now,nextId});
  const parent=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'mixed-parent',idempotencyKey:'mixed-parent',executionBudget:budget,payload:{executionRoute:route}});
  const claim=await tasks.claimTask({taskId:parent.id,workerId:'mixed-host'});expect(claim).toBeTruthy();
  const ref={executionTaskId:parent.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(store.db,{now,budget});
  const inputDigest=`sha256:${'3'.repeat(64)}`;
  const call=await ledger.reserve(ref,{operationKey:'mixed-host-submit',kind:'tool',inputDigest,reservedTokens:0});await ledger.start(ref,call.id);
  const resolveTaskRuntimeData=vi.fn(async(_c:unknown,_t:unknown,_i:unknown,trusted?:unknown)=>({skillSnapshot:{revision:'original'},executionRoute:trusted??createExecutionRoute('pi')}));
  const ai=createAiService({db:store.db,now,nextId,resolveTaskRuntimeData} as unknown as ServiceDeps);
  await store.db.insert(projects).values({id:'mixed-project',userId:ctx.userId,accountId:ctx.accountId,title:'父图继承',creationMode:'free',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
  const prepared=await ai.prepareTaskCommit(ctx,{taskType:'planning.thesis',attemptId:'mixed-original-submission-0001',inputData:{projectId:'mixed-project',topic:'冻结输入'}});
  const binding={executionTaskId:parent.id,callId:call.id,inputDigest};
  const child=await store.db.transaction(tx=>prepared.commit(tx,binding));
  expect((await ai.getTaskRuntimeData(ctx,child.id)).executionRoute).toEqual(route);
  expect(resolveTaskRuntimeData).toHaveBeenCalledTimes(1);
  expect(resolveTaskRuntimeData.mock.calls[0]![3]).toEqual(createExecutionRoute('pi','parent'));
  expect((await store.db.transaction(tx=>prepared.commit(tx,binding))).id).toBe(child.id);
 },180_000);
 it('调度attach只核对已入队的v2原图，不把完整map重写成v1或修补损坏图',async()=>{
  const route=fixtureRoute(),tasks=createPersistentTaskService(store.db,{now:()=>stamp});
  await store.db.insert(scheduledJobs).values({id:'mixed-job',userId:ctx.userId,accountId:ctx.accountId,name:'完整路由调度',sourceKind:'topic.daily',schedule:'* * * * *',createdAt:stamp,updatedAt:stamp});
  const parent=await tasks.enqueue(ctx,{kind:'automation_sync',ownerType:'scheduled_job',ownerId:'mixed-job',idempotencyKey:'mixed-scheduled-parent',payload:{job:{id:'mixed-job'},scheduledFor:stamp,executionRoute:route}});
  const claim=await tasks.claimTask({taskId:parent.id,workerId:'mixed-scheduler'});expect(claim).toBeTruthy();
  const ref={executionTaskId:parent.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
  const child=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'mixed-scheduled-ai',idempotencyKey:'mixed-scheduled-child',payload:{aiTaskId:'mixed-scheduled-ai',executionRoute:route,modelInput:{facets:{__dailyTopic:JSON.stringify({jobId:'mixed-job',jobRunId:'mixed-run'})}}}});
  await store.db.insert(aiTasks).values({id:'mixed-scheduled-ai',userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.topic.daily',idempotencyKey:'mixed-scheduled-ai',requestedAt:stamp,executionTaskId:child.id,runtimeData:{executionRoute:route}});
  await store.db.insert(jobRuns).values({id:'mixed-run',userId:ctx.userId,jobId:'mixed-job',aiTaskId:'mixed-scheduled-ai',scheduledFor:stamp,startedAt:stamp});
  const attach=createExecutionScheduledChildService(store.db,{now:()=>stamp});await attach.attach(ref,child.id);
  const [bound]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,child.id));
  expect((bound!.payload as Record<string,unknown>).executionRoute).toEqual(route);
  const [ai]=await store.db.select().from(aiTasks).where(eq(aiTasks.id,'mixed-scheduled-ai'));expect((ai!.runtimeData as Record<string,unknown>).executionRoute).toEqual(route);
  await store.db.update(executionTasks).set({payload:{...bound!.payload as Record<string,unknown>,executionRoute:createExecutionRoute('codex')}}).where(eq(executionTasks.id,child.id));
  await expect(attach.attach(ref,child.id)).rejects.toThrow('完整模型路由');
 },180_000);

 it('后台新根捕获完整图一次，原幂等重放不再读取当前设置或改期限',async()=>{
  const original=fixtureRoute(),capture=vi.fn(async()=>original),tasks=createPersistentTaskService(store.db,{now:()=>stamp,resolveRootExecutionRoute:capture});
  const input={kind:'transcribe' as const,ownerType:'item' as const,ownerId:'background-item',idempotencyKey:'background-root-map',payload:{sourceId:'source',awemeId:'123'}};
  const first=await tasks.enqueue(ctx,input);expect(capture).toHaveBeenCalledTimes(1);
  const [row]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,first.id));expect((row!.payload as Record<string,unknown>).executionRoute).toEqual(original);
  capture.mockClear();capture.mockImplementation(async()=>{throw Error('重放不得捕获新图');});
  const replay=await tasks.enqueue(ctx,input);expect(replay.id).toBe(first.id);expect(capture).not.toHaveBeenCalled();
  const [again]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,first.id));expect(again!.payload).toEqual(row!.payload);expect(again!.deadlineAt).toBe(row!.deadlineAt);
 },180_000);

 it.each(['wrong-item','share-not-authorized','deadline'] as const)('可信父证明仍需具体作品、转录授权与原期限 %s',async variant=>{
  const tasks=createPersistentTaskService(store.db,{now:()=>stamp}),share=variant==='share-not-authorized';
  const parent=await tasks.enqueue(ctx,{kind:share?'share_import':'radar_project_upgrade',ownerType:share?'item_import':'item',ownerId:share?'original-share':'original-item',idempotencyKey:`parent-proof-${variant}`,payload:share?{shareInput:'原授权分享',transcribeAfterImport:false,executionRoute:fixtureRoute()}:{itemId:'original-item',executionRoute:fixtureRoute()}});
  const claim=await tasks.claimTask({taskId:parent.id,workerId:'original-parent-worker'});expect(claim).toBeTruthy();
  if(variant==='deadline')await store.db.update(executionTasks).set({deadlineAt:'2026-10-13T23:59:59.000Z'}).where(eq(executionTasks.id,parent.id));
  const item=variant==='wrong-item'?'different-item':'original-item';
  await expect(tasks.enqueue(ctx,{kind:'transcribe',ownerType:'item',ownerId:item,idempotencyKey:`child-proof-${variant}`,modelRouteParent:{taskId:parent.id,workerId:claim!.lease.workerId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken},payload:{itemId:item}})).rejects.toThrow();
  expect(await store.db.select().from(executionTasks).where(eq(executionTasks.idempotencyKey,`child-proof-${variant}`))).toHaveLength(0);
 },180_000);

 it('真实飞轮配置入口消费自己的structured路由，不借主Codex；传原ref且不启动Worker',async()=>{
  const route=fixtureRoute(),id='routing-flywheel-main-codex',jobId='routing-flywheel-job',runId='routing-flywheel-run',now=()=>stamp;
  route.routes['structured:benchmark.teardown']={routeKey:'structured:benchmark.teardown',mode:'structured',capability:'benchmark.teardown',source:'self',readiness:'configured',identity:{provider:'openai',apiFormat:'openai_chat',authStyle:'bearer',model:'frozen-benchmark-api',endpoint:'https://fixture.invalid/v1',settings:{},configuration:{kind:'row',id:'benchmark-row',capability:'benchmark.teardown'},configIdentityDigest:`sha256:${'4'.repeat(64)}`}};
  const skillSnapshot=await createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(base=>base.skillId===id)??null,list:listOfficialSkillBases,platformPolicy:()=>({version:'fixture',text:'只验证冻结配置，禁止模型调用'})},accountOverlays:{listBySkillIds:async()=>[]},now})(ctx,['benchmark.teardown']);
  await store.db.insert(scheduledJobs).values({id:jobId,userId:ctx.userId,accountId:ctx.accountId,name:'原飞轮用途',sourceKind:'benchmark',schedule:'* * * * *',target:{},createdAt:stamp,updatedAt:stamp});
  await store.db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.benchmark',status:'queued',idempotencyKey:id,requestedAt:stamp,inputData:{jobId,jobRunId:runId,target:{}},runtimeData:{executionRoute:route,skillSnapshot}});
  await store.db.insert(jobRuns).values({id:runId,jobId,userId:ctx.userId,aiTaskId:id,status:'running',startedAt:stamp});
  const spec={apiFormat:'openai_chat' as const,baseUrl:'https://fixture.invalid/v1',model:'frozen-benchmark-api',token:'controlled-private'};
  const resolveModelSpec=vi.fn(async()=>spec),deps={entryPath:'/never-launch-worker',resolveModelSpec,budget:{maxCalls:8,maxTokens:100000,deadlineMs:600000},now};
  const scheduled=createScheduledFlywheelExecutionService(store.db,deps);
  try{
   const prepared=await scheduled.prepare(ctx,id),tasks=createPersistentTaskService(store.db,{now});
   const claim=await tasks.claimTask({taskId:prepared.executionTaskId,workerId:'original-flywheel-worker'});expect(claim).toBeTruthy();
   const ref={executionTaskId:prepared.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
   expect(await createExecutionFlywheelGenerationService(store.db,deps).assertConfiguration(ref,'benchmark.teardown')).toEqual(spec);
   expect(resolveModelSpec).toHaveBeenLastCalledWith(expect.objectContaining({userId:ctx.userId,accountId:ctx.accountId}),'benchmark.teardown',{ref,mode:'structured'});
  }finally{await scheduled.stop();}
 },180_000);

});

// T1278 追加测试：真实公开 submission / lease / ledger / 原生工具证明。
import {createHash as mixedHash} from 'node:crypto';
import {z as mixedZ} from 'zod';
import {executionCalls as mixedCalls} from '@creatoros/backend';
import {chatToolProviderName as mixedProviderName,codexExecutionSpec as mixedCodexSpec} from '@creatoros/contract/execution-worker';
import {freezeSelectedModelRoutes as mixedFreeze} from '../modules/ai-runtime/capability-model-routing';
import {createAiRepository as mixedAiRepository} from '../modules/ai/ai.repository';
import {createChatTurnSubmissionService as mixedSubmission} from '../modules/ai/chat-turn-submission.service';
import {createExternalChatTurnService as mixedExternal} from '../modules/ai/external-chat-turn.service';
import {createAgenticToolBinding as mixedBinding,type AgenticBackendTool as MixedTool} from '../modules/execution/agentic-tool-binding';
import {createExecutionModelIdentityService as mixedRootIdentity} from '../modules/execution/execution-model-identity.service';
import {createExecutionChatModelIdentityService as mixedChildIdentity} from '../modules/execution/execution-chat-model-identity.service';
import {createExecutionCodexCallService as mixedCodexCalls} from '../modules/execution/execution-codex-call.service';
import {originalCodexReadBinding as mixedOriginalRead} from '../modules/execution/codex-read-recovery';
import {unconfirmedModelCalls as mixedUnconfirmedApi} from '../modules/execution/model-call-recovery';

describe('T1278 原工具事实下的聊天双向逐 call 路由',()=>{
 let mixedStore:Awaited<ReturnType<typeof createDb>>,mixedSeq=0;
 const mixedNow=()=>stamp,mixedBudget={maxCalls:20,maxTokens:100_000,deadlineMs:600_000};
 const ownApi={apiFormat:'openai_chat' as const,authStyle:'bearer' as const,baseUrl:'https://fixture.invalid/v1',model:'own-api-node',token:'private-child-fixture',structuredOutputs:false};
 const ownCodex={...mixedCodexSpec(),requestedModel:'own-codex-node'};
 beforeAll(async()=>{mixedStore=await createDb();},180_000);
 afterAll(async()=>{await mixedStore?.client.close();},180_000);
 type MixedName='script.hooks'|'script.draft'|'topic.enrich';
 const execution=(name:MixedName)=>name==='script.hooks'?'worker.script-hooks' as const:name==='script.draft'?'worker.script-draft' as const:'worker.structured-node' as const;
 async function fixture(main:'self'|'codex',name:MixedName){
  const own=main==='codex'?'self':'codex',id=`mixed-own-call-${++mixedSeq}`;
  const scope={userId:'mixed-chat-user',accountId:`mixed-chat-account-${mixedSeq}`,requestId:id,source:'user' as const};
  const tools:Record<string,MixedTool>={[name]:{version:'1',parameters:mixedZ.object({}).strict(),effect:name==='script.draft'?'committed':'proposal',execution:execution(name)}};
  // SEMANTIC_BOUNDARY_ALLOW: 受控配置读端只提供公开配置身份；不代签、不领取 token、不调用模型。
  const route=await mixedFreeze({choices:{text:own,vision:main,image:'self',video:'self',audio:'local',embed:'self'},revision:1,main:{mode:'vision',capability:'copilot.assist'},read:async(entry,source)=>{
   if(!['text','structured','vision'].includes(entry.mode))return {status:'unavailable',reasonCode:'FIXTURE_UNUSED_CAPABILITY'};
   if(source==='codex')return {status:'ready',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:entry.mode==='vision'?'main-codex-vision':'own-codex-node'}};
   return {status:'ready',identity:{provider:'openai',apiFormat:'openai_chat',authStyle:'bearer',endpoint:ownApi.baseUrl,model:entry.mode==='vision'?'main-vision-api':'own-api-node',settings:{structuredOutputs:false},configuration:{kind:'row',id:`fixture-row-${entry.routeKey}`,capability:entry.capability},configIdentityDigest:`sha256:${'0'.repeat(64)}`}};
  }});
  const repo=mixedAiRepository(mixedStore.db,{userId:scope.userId,accountId:scope.accountId,now:mixedNow,nextId:p=>`${id}-${p}-${++mixedSeq}`});
  const conversation=await repo.createConversation({title:'真实持久会话夹具',projectId:null,scope:'global'});
  const source=await repo.createMessage(conversation.id,{role:'user',content:'原带图问题',attachments:[],modelMetadata:{}});
  const frozenContent=mixedZ.json().parse([{type:'text',text:'原带图问题'},{type:'image',image:'data:image/png;base64,AA==',mediaType:'image/png'}]);
  const submission=await mixedSubmission(mixedStore.db,{now:mixedNow,nextId:p=>`${id}-${p}-${++mixedSeq}`,assemble:async()=>({executionRoute:route,chatModelMode:'vision',executionEngine:main==='codex'?'codex':'pi',capability:'copilot.assist',system:'受控系统',messages:[{role:'user',content:frozenContent}],maxSteps:4,maxOutputTokens:128,tools:[{name,version:'1',execution:execution(name),effect:name==='script.draft'?'committed':'proposal',description:'原节点',parameters:{type:'object',properties:{},additionalProperties:false}}]})}).submit(scope,{conversationId:conversation.id,sourceMessageId:source.id});
  const tasks=createPersistentTaskService(mixedStore.db,{now:mixedNow}),claim=await tasks.claimTask({taskId:submission.executionTaskId,workerId:id});expect(claim).toBeTruthy();
  const ref={executionTaskId:submission.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(mixedStore.db,{now:mixedNow,budget:mixedBudget}),native=mixedCodexCalls(mixedStore.db,{now:mixedNow});
  const mainSpec=main==='codex'?{...mixedCodexSpec(),requestedModel:'main-codex-vision'}:{...ownApi,model:'main-vision-api',token:'private-main-fixture'};
  await mixedRootIdentity(mixedStore.db,{now:mixedNow}).pin(ref,'copilot.assist',mainSpec);
  let rootId:string;
  if(main==='codex'){
   // 真实外部根；普通工具事实来自已绑定的原 thread/turn，不能伪造额外 model 根。
   const external=mixedExternal(mixedStore.db,{now:mixedNow,budget:mixedBudget}),root=await external.reserve(ref,{});rootId=root.callId;
   await external.prepareThread(ref,{callId:rootId,sessionId:`${id}-root-thread`,protocolKind:'codex-app-server',protocolVersion:1});
   await external.start(ref,{callId:rootId,sessionId:`${id}-root-thread`,protocolKind:'codex-app-server',protocolVersion:1});
   await external.recordProviderTurn(ref,{callId:rootId,providerTurnId:`${id}-root-turn`});
   await native.invoke(ref,'bindCodexCall',{callId:rootId,threadId:`${id}-root-thread`,turnId:`${id}-root-turn`});
   await native.invoke(ref,'recordCodexToolCall',{callId:rootId,toolCallId:`${id}-provider-tool`,toolName:mixedProviderName(name),input:'{}'});
  }else{
   const root=await ledger.reserve(ref,{kind:'model',operationKey:`chat:${source.id}/model/1`,inputDigest:`sha256:${mixedHash('sha256').update(id).digest('hex')}`,reservedTokens:100});rootId=root.id;
   await ledger.start(ref,rootId);
   await ledger.settle(ref,rootId,{status:'settled',usage:{},providerResult:{content:[{type:'tool-call',toolCallId:`${id}-provider-tool`,toolName:mixedProviderName(name),input:'{}'}],finishReason:{unified:'tool-calls',raw:'fixture'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  }
  const row=async()=>(await mixedStore.db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]!;
  const state=await ledger.inspect(ref),bound=mixedBinding(tools).bind(await row(),state.calls,{modelCallId:rootId,toolCallId:`${id}-provider-tool`});
  expect(bound.validationOutcome).toBeUndefined();
  const parent=await ledger.reserve(ref,{kind:'tool',operationKey:bound.operationKey,inputDigest:bound.inputDigest,reservedTokens:100});await ledger.start(ref,parent.id);
  return {id,scope,ref,ledger,native,rootId,parent,bound,row,tasks,service:mixedChildIdentity(mixedStore.db,{now:mixedNow,tools}),own};
 }
 const cases=(['self','codex'] as const).flatMap(main=>(['script.hooks','script.draft','topic.enrich'] as const).map(name=>({main,name})));
 it.each(cases)('主 vision=$main，$name 按本用途身份、真正父工具及原子 call 入场',async({main,name})=>{
  const f=await fixture(main,name),mode=name==='topic.enrich'?'structured':'text',spec=f.own==='codex'?ownCodex:ownApi;
  if(name!=='topic.enrich')await f.service.pinPrimary(f.ref,f.parent.id);
  expect(await f.service.pin(f.ref,f.parent.id,spec)).toEqual(spec);
  expect(await f.service.read(f.ref,f.parent.id)).toMatchObject({capability:name,...(f.own==='codex'?{engine:'codex',requestedModel:'own-codex-node'}:{model:'own-api-node'})});
  const payload=(await f.row()).payload as Record<string,any>,entry=payload.chatModelIdentities[f.parent.id];
  expect(entry).toMatchObject({inputDigest:f.bound.inputDigest,routeKey:`${mode}:${name}`});
  expect(payload.modelIdentity).toMatchObject(main==='codex'?{capability:'copilot.assist',requestedModel:'main-codex-vision'}:{capability:'copilot.assist',model:'main-vision-api'});
  expect(JSON.stringify(payload)).not.toContain('private-child-fixture');expect(JSON.stringify(payload)).not.toContain('private-main-fixture');
  await expect(f.service.pin(f.ref,f.rootId,spec)).rejects.toThrow();
  await expect(f.service.pin({...f.ref,fenceToken:'wrong-fence'},f.parent.id,spec)).rejects.toThrow();
  await expect(f.service.pin(f.ref,f.parent.id,f.own==='codex'?{...spec,requestedModel:'switched'}:{...spec,model:'switched'})).rejects.toThrow();
  const child=await f.ledger.reserve(f.ref,{kind:'model',operationKey:`${f.bound.operationKey}/model/1`,parentCallId:f.parent.id,inputDigest:`sha256:${mixedHash('sha256').update(JSON.stringify({parent:f.parent.id,capability:name})).digest('hex')}`,reservedTokens:100});
  await f.ledger.start(f.ref,child.id);
  if(f.own==='codex'){
   await f.native.invoke(f.ref,'bindCodexCall',{callId:child.id,threadId:`${f.id}-child-thread`,turnId:`${f.id}-child-turn`});
  }else{
   await expect(f.native.invoke(f.ref,'bindCodexCall',{callId:child.id,threadId:'forbidden-api-thread',turnId:'forbidden-api-turn'})).rejects.toThrow();
  }
  await f.ledger.settle(f.ref,child.id,{status:'unknown'});
  const [originalChild]=await mixedStore.db.select().from(mixedCalls).where(eq(mixedCalls.id,child.id));
  const binding=mixedOriginalRead(await f.row(),originalChild!);
  if(f.own==='codex')expect(binding).toMatchObject({threadId:`${f.id}-child-thread`,turnId:`${f.id}-child-turn`});else expect(binding).toBeNull();
  const apiPending=mixedUnconfirmedApi(await f.row(),(await f.ledger.inspect(f.ref)).calls);
  expect(apiPending.map(call=>call.id)).toEqual(f.own==='codex'?[]:[child.id]);
  // 同一个租约、父工具与子 call 重放，不能额外预留模型或换期限。
  const before=await f.row(),again=await f.ledger.reserve(f.ref,{kind:'model',operationKey:child.operationKey,parentCallId:f.parent.id,inputDigest:child.inputDigest,reservedTokens:100});
  expect(again.id).toBe(child.id);expect(again.status).toBe('unknown');expect((await f.row()).deadlineAt).toBe(before.deadlineAt);
 },180_000);
});

// 候选：追加到已准入 backend/src/integration/model-routing-mixed-execution.integration.test.ts。
// 此文件没有执行。Root先应用测试，在原source实际RED，再串行应用production diff。
// 需要追加imports（勿重复已有）：
// import {createHash} from 'node:crypto';
// import {mkdtemp,rm} from 'node:fs/promises';
// import {tmpdir} from 'node:os';
// import {join} from 'node:path';
// import {createExecutionCodexCallService} from '../modules/execution/execution-codex-call.service';
// import {createExecutionAssetResultService} from '../modules/execution/execution-asset-result.service';
// import {createExecutionModelIdentityService,frozenNonChatModelBindingForCall} from '../modules/execution/execution-model-identity.service';
// import {originalCodexReadBinding} from '../modules/execution/codex-read-recovery';
// import {unconfirmedModelCalls} from '../modules/execution/model-call-recovery';
// import {createLocalFsObjectStorage} from '../modules/assets/localfs-object-storage';
// import {generationRequestDigest} from '@creatoros/ai-worker/chat';
// import {canonicalJson} from '../modules/ai/canonical-json';

// PNG真实字节；只有本次mkdtemp storage，清理归本fixture，不读取用户媒体。
const genericMixedPng=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=','base64'));
function genericMixedRoute(main:'pi'|'codex'='pi',image:'codex'|'self'='codex'){
 const original=fixtureRoute();
 const identity={provider:'openai',model:'api-original',apiFormat:'openai_chat',authStyle:'bearer',endpoint:'https://fixture.invalid/v1',settings:{},configIdentityDigest:`sha256:${'4'.repeat(64)}`,configuration:{kind:'row',id:'original-self-row',capability:'topic.generate'}};
 return executionRouteV2Schema.parse({...original,orchestrator:{engine:main,source:'preference',protocolKind:main==='codex'?'codex-app-server':'pi',...(main==='codex'?{runtimeVersion:'0.159.3'}:{})},routes:{...original.routes,
  'text:topic.generate':{routeKey:'text:topic.generate',mode:'text',capability:'topic.generate',source:main==='pi'?'self':'codex',readiness:'configured',identity:main==='pi'?identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default'}},
  'image:image.generate':{routeKey:'image:image.generate',mode:'image',capability:'image.generate',source:image,readiness:'configured',identity:image==='codex'?{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default'}:{...identity,configuration:{kind:'row',id:'image-original-row',capability:'image.generate'}}},
 }});
}
describe('T1278 nonchat真实call按原能力route（无模型/网络）',()=>{
 let local:Awaited<ReturnType<typeof createDb>>,dir:string,seq=0;
 beforeAll(async()=>{local=await createDb();dir=await mkdtemp(join(tmpdir(),'t1278-generic-native-'));},180_000);
 afterAll(async()=>{await local?.client.close();if(dir)await rm(dir,{recursive:true,force:true});},180_000);
 async function image(main:'pi'|'codex'='pi',imageSource:'codex'|'self'='codex'){
  const id=`generic-image-${++seq}`,route=genericMixedRoute(main,imageSource),c={...ctx,userId:id,accountId:id},now=()=>stamp;
  const input={kind:'asset.generate' as const,operationKey:`asset:${id}`,mediaKind:'image' as const,capability:'image.generate' as const,prompt:'原图',mode:'text_to_image' as const,engine:'codex' as const,protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,requestedModel:'actual-default'};
  await local.db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:'asset.generate',idempotencyKey:id,inputData:{kind:'image',prompt:input.prompt,mode:input.mode},requestedAt:stamp,runtimeData:{executionRoute:route}});
  const bound=await createExecutionAuthorityService(local.db,{now}).bindAiTask(c,id);
  await local.db.update(executionTasks).set({payload:{aiTaskId:id,executionRoute:route,modelInput:input}}).where(eq(executionTasks.id,bound.executionTaskId));
  const tasks=createPersistentTaskService(local.db,{now}),claim=(await tasks.claimTask({taskId:bound.executionTaskId,workerId:'generic-host'}))!;
  const ref={executionTaskId:bound.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},budget={maxCalls:6,maxTokens:100000,deadlineMs:600000};
  const storage=createLocalFsObjectStorage({rootPath:join(dir,id),publicBaseUrl:'/fixture-blob'},{nextKey:()=> 'unused'});
  const assets=createExecutionAssetResultService({db:local.db,now,budget,objectStorageForCtx:async()=>storage}),codex=createExecutionCodexCallService(local.db,{now});
  return {id,c,ref,route,input,tasks,budget,assets,codex};
 }
 it('Pi文本根的Codex image原call可绑定原turn并保存真实字节，requestedModel不丢',async()=>{
  const f=await image();const call=await f.assets.reserve(f.ref,128);await f.assets.start(f.ref,call.id);
  await f.codex.invoke(f.ref,'bindCodexCall',{callId:call.id,threadId:'original-thread',turnId:'original-turn',nativeResult:{itemId:'original-item',checksum:`sha256:${createHash('sha256').update(genericMixedPng).digest('hex')}`,model:'actual-default',usage:null}});
  const receipt=await f.assets.save(f.ref,call.id,genericMixedPng);expect(receipt.assetType).toBe('image');expect(await f.assets.recover(f.ref,call.id)).toEqual({status:'committed',receipt});
  const [row]=await local.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect((row!.payload as any).modelInput.requestedModel).toBe('actual-default');expect((row!.payload as any).executionRoute.orchestrator.engine).toBe('pi');
  const state=await createExecutionCallLedgerService(local.db,{now:()=>stamp,budget:f.budget}).inspect(f.ref);expect(state.calls).toHaveLength(1);expect(state.calls[0]!.status).toBe('settled');
 },180_000);
 it('Codex主根不能为显式API image伪造native权；model漂移拒绝',async()=>{
  const f=await image('codex','self');
  // 输入错误地为Codex而原image source为self：专用真实reserve入口须先拒绝，不能造call。
  await expect(f.assets.reserve(f.ref,128)).rejects.toThrow();
  const g=await image();const [task]=await local.db.select().from(executionTasks).where(eq(executionTasks.id,g.ref.executionTaskId));
  await local.db.update(executionTasks).set({payload:{...task!.payload as any,modelInput:{...g.input,requestedModel:'foreign-default'}}}).where(eq(executionTasks.id,g.ref.executionTaskId));
  await expect(g.assets.reserve(g.ref,128)).rejects.toThrow();
 },180_000);
 it('原Codex image unknown只读原thread/turn；错键/摘要拒绝，零安全重发许可',async()=>{
  const f=await image(),call=await f.assets.reserve(f.ref,128);await f.assets.start(f.ref,call.id);
  await f.codex.invoke(f.ref,'bindCodexCall',{callId:call.id,threadId:'original-thread',turnId:'original-turn'});
  const ledger=createExecutionCallLedgerService(local.db,{now:()=>stamp,budget:f.budget});await ledger.settle(f.ref,call.id,{status:'unknown'});
  const [task]=await local.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)),state=await ledger.inspect(f.ref),original=state.calls[0]!;
  expect(originalCodexReadBinding(task!,original as never)).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
  expect(unconfirmedModelCalls(task!,state.calls as never)).toEqual([]);
  expect(originalCodexReadBinding(task!,{...original,operationKey:'foreign'} as never)).toBeNull();expect(originalCodexReadBinding(task!,{...original,inputDigest:'sha256:'+'0'.repeat(64)} as never)).toBeNull();
  await expect(f.codex.invoke({...f.ref,fenceToken:'wrong'},'readCodexCall',{callId:call.id})).rejects.toThrow();
  expect((await ledger.inspect(f.ref)).calls).toHaveLength(1);
 },180_000);
});

// 同域补充纯恢复/身份判定族：不代签真实模型或真实cover builder。
// 这些case用严格存档input/identity构造原事实，actual call/database/storage主族见上文。
it.each(['intelligence','flywheel','postprocess','video','cover'] as const)('nonchat %s 从唯一实际存档stage读取Codex ownroute且拒绝异key/identity',family=>{
 const uid='generic-u',aid='generic-a',tid='generic-task',capability=family==='postprocess'?'video.subtitles':family==='video'?'video.scenes':family==='flywheel'?'benchmark.teardown':'topic.generate';
 const identity={schemaVersion:1,capability,engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default'};
 const snapshot={snapshotVersion:1,userId:uid,accountId:aid,resolvedAt:stamp,platformPolicyVersion:'1',platformPolicy:'原策略',skills:[{skillId:'original-skill',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'原策略',template:'{{title}}',tools:[],requiredFacets:['title'],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]};
 const stageInput={kind:'model.structured',operationKey:family==='intelligence'?`intelligence:${tid}`:'original-stage',capability,skillId:'original-skill',skillSnapshot:snapshot,facets:{title:'原题'},maxOutputTokens:2048};
 const raw=genericMixedRoute();
 const route=executionRouteV2Schema.parse({...raw,routes:{...raw.routes,[`structured:${capability}`]:{routeKey:`structured:${capability}`,mode:'structured',capability,source:'codex',readiness:'configured',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default'}}}});
 let payload:any={aiTaskId:'owner',executionRoute:route,modelInput:stageInput,modelIdentity:identity},kind='ai_task',ownerType='ai_task',operationKey=`${stageInput.operationKey}/model/1`;
 if(family==='intelligence'){kind='topic_preview';ownerType='transform';payload={executionRoute:route,intelligenceGeneration:{input:stageInput,identity}};}
 if(family==='flywheel'){const stageKey='benchmark:original-resource';stageInput.operationKey=`flywheel:${createHash('sha256').update(JSON.stringify(stageKey)).digest('hex')}`;operationKey=`${stageInput.operationKey}/model/1`;payload={...payload,modelInput:{kind:'scheduled.flywheel',jobId:'original-job',jobRunId:'original-run',target:{},sourceKind:'benchmark',skillSnapshot:snapshot},flywheelStages:{[stageKey]:{input:stageInput,identity}}};}
 if(family==='postprocess'){payload={...payload,modelInput:{kind:'transcribe.douyin',awemeIds:['original'],language:'zh',configuration:{kind:'audio',provider:'whisper-local',model:'small',baseUrl:null}},transcribePostprocess:{original:{plan:{schemaVersion:1,sourceDigest:`sha256:${'1'.repeat(64)}`,transcript:'原文',templateVersion:'1',templateDigest:`sha256:${'2'.repeat(64)}`,maxOutputTokens:2048,identity,operationKey:'original-stage'}}}};}
 if(family==='postprocess'){const body=payload.transcribePostprocess.original.plan;const {operationKey:_old,...snapshotBody}=body;body.operationKey=`transcribe:original/postprocess:${generationRequestDigest(snapshotBody).slice(7)}`;operationKey=`${body.operationKey}/model/1`;}
 if(family==='video'){payload={...payload,modelInput:{...stageInput,facets:{__videoDecisions:JSON.stringify({task:{id:'owner',projectId:'project',retryOfTaskId:null,inputData:{}},inventory:[],storyboard:[],retryRuntime:{},modelIdentities:{[capability]:identity}})}}};operationKey=`${stageInput.operationKey}/video/${capability}/1/model/1`;}
 if(family==='cover'){
  const input={...stageInput,skillId:'cover.brief',capability:'copy.generate',operationKey:'cover-original'};
  input.skillSnapshot={...snapshot,skills:[{...snapshot.skills[0]!,skillId:'cover.brief'}]};
  const imageInput={kind:'asset.generate',operationKey:`${input.operationKey}/image`,mediaKind:'image',capability:'image.generate',prompt:'原图',engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default'};
  payload={...payload,modelInput:input,coverImage:{sourceDigest:generationRequestDigest({input}),value:{input:imageInput,reference:null,resultData:{prompt:'原图'}}}};operationKey=imageInput.operationKey;
 }
 const task={id:tid,kind,ownerType,ownerId:'owner',userId:uid,accountId:aid,groupId:null,attempt:2,payload} as any;
 const asset=family==='cover'?payload.coverImage.value.input:null;
 const call={id:'generic-original-call',executionTaskId:tid,kind:'model',parentCallId:null,operationKey,inputDigest:asset?`sha256:${createHash('sha256').update(canonicalJson(asset)).digest('hex')}`:`sha256:${'3'.repeat(64)}`,toolExecutionClaimId:null,status:'unknown',startedAttempt:1,providerJob:null,providerResult:null} as any;
 const binding=frozenNonChatModelBindingForCall(task,call);expect(binding?.route.source).toBe('codex');expect(binding?.route).toMatchObject({identity:{requestedModel:'actual-default'}});
 expect(frozenNonChatModelBindingForCall(task,{...call,operationKey:'foreign/model/1'})).toBeNull();
 payload.codexCalls={[call.id]:{threadId:'original-thread',turnId:'original-turn'}};
 expect(originalCodexReadBinding(task,call)).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
 if(family==='postprocess'){
  // 旧strict原文/plan没有group字段；group拒绝由下方actual owner/lease负族证明。
  expect(payload.modelInput).not.toHaveProperty('groupId');expect(payload.transcribePostprocess.original.plan).not.toHaveProperty('groupId');
 }else expect(originalCodexReadBinding({...task,groupId:'foreign'},call)).toBeNull();
 expect(unconfirmedModelCalls(task,[call])).toEqual([]);
},180_000);

it('postprocess原group归属由实际business映射与原lease证明，旧strict input不补scope字段',async()=>{
 const opened=await createDb();const {createExecutionLeaseService}=await import('../modules/execution/execution-lease.service');const {bindTranscribeExecution}=await import('../modules/execution/transcribe-execution-binding');
 const c={userId:'postprocess-scope-proof-user',accountId:'postprocess-scope-proof-account',requestId:'actual-scope-proof',source:'user' as const},now=()=>stamp;
 const input={kind:'transcribe.douyin' as const,awemeIds:['original'],language:'zh',configuration:{kind:'audio' as const,provider:'whisper-local',model:'small',baseUrl:null}};
 try{
  const aiId='postprocess-scope-proof-ai';
  await opened.db.insert(aiTasks).values({id:aiId,userId:c.userId,accountId:c.accountId,groupId:null,taskType:'transcribe.douyin',idempotencyKey:aiId,inputData:{awemeIds:['original']},requestedAt:stamp});
  const tasks=createPersistentTaskService(opened.db,{now}),task=await tasks.enqueue(c,{kind:'ai_task',ownerType:'ai_task',ownerId:aiId,idempotencyKey:'postprocess-scope-proof-execution',payload:{aiTaskId:aiId,modelInput:input}});
  await opened.db.update(aiTasks).set({executionTaskId:task.id}).where(eq(aiTasks.id,aiId));
  const claim=(await tasks.claimTask({taskId:task.id,workerId:'postprocess-scope-proof-worker'}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const leases=createExecutionLeaseService(opened.db,{now});
  const read=(current=ref)=>leases.withLease(current,'settlement',scope=>bindTranscribeExecution(scope,'original'));
  expect((await read()).business.id).toBe(aiId);
  await expect(read({...ref,fenceToken:'foreign-fence'})).rejects.toThrow();
  await opened.db.update(aiTasks).set({groupId:'foreign-group'}).where(eq(aiTasks.id,aiId));
  await expect(read()).rejects.toThrow('转写输入与原任务作品不符');
  await opened.db.update(aiTasks).set({groupId:null}).where(eq(aiTasks.id,aiId));
  await opened.db.update(executionTasks).set({groupId:'foreign-group'}).where(eq(executionTasks.id,task.id));
  await expect(read()).rejects.toThrow('转写输入与原任务作品不符');
  await opened.db.update(executionTasks).set({groupId:null}).where(eq(executionTasks.id,task.id));
  expect((await read()).business.id).toBe(aiId);
  const [original]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));expect((original!.payload as any).modelInput).toEqual(input);expect((original!.payload as any).modelInput).not.toHaveProperty('groupId');
 }finally{await opened.client.close();}
},180_000);

// T1278：Agent 原Model ports/原business owner/原lease，只核宿主账本，不启动Worker/Codex/HTTP。
import {createExecutionAgenticModelPorts} from '../modules/execution/execution-agentic-model-ports.service';
import {createExecutionModelIdentityService} from '../modules/execution/execution-model-identity.service';
import {executionTaskSpec} from '@creatoros/contract';
import {normalizePiContext} from '@creatoros/ai-worker/durable-pi-stream';

describe('T1278 Agentic call按原text route与原未知回合恢复',()=>{
 let agenticStore:Awaited<ReturnType<typeof createDb>>,agenticSequence=0;
 beforeAll(async()=>{agenticStore=await createDb();},180_000);
 afterAll(async()=>{await agenticStore?.client.close();},180_000);
 async function agenticFixture(family:'agentic.collect'|'agentic.material'|'agentic.research',source:'codex'|'self'='codex'){
  const id=`agentic-mixed-${++agenticSequence}`,c={...ctx,userId:id,accountId:id},now=()=>stamp;
  const spec=executionTaskSpec.parse({taskType:family,goal:'原明确目标',inputs:[],params:{},constraints:{timeoutSec:600,network:'deny',maxOutputMB:512}});
  const input={kind:'agentic.run' as const,runtimeVersion:'intent-v1' as const,taskType:family,goal:spec.goal,
   operationKey:`agentic:${createHash('sha256').update(JSON.stringify(spec)).digest('hex')}`,systemPrompt:'原已冻结方法',capability:family,
   maxOutputTokens:100,dryRun:false,tools:[{name:'material.search',version:'1',label:'搜索',description:'原方法工具',parameters:{type:'object'},effect:'none' as const}]};
  const initial=fixtureRoute(),key=`text:${family}`,apiIdentity={provider:'openai',model:'api-original',apiFormat:'openai_chat',authStyle:'bearer',endpoint:'https://fixture.invalid/v1',settings:{},configIdentityDigest:`sha256:${'8'.repeat(64)}`,configuration:{kind:'row',id:'agentic-original-api-row',capability:family}};
  const route=executionRouteV2Schema.parse({...initial,orchestrator:{engine:source==='codex'?'pi':'codex',source:'preference',protocolKind:source==='codex'?'pi':'codex-app-server',...(source==='codex'?{}:{runtimeVersion:'0.159.3'})},routes:{...initial.routes,[key]:{routeKey:key,mode:'text',capability:family,source,readiness:'configured',identity:source==='codex'?{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'agentic-original-model'}:apiIdentity}}});
  const fingerprint=`sha256:${'9'.repeat(64)}`,budget={maxCalls:6,maxTokens:100000,deadlineMs:600000};
  await agenticStore.db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId,taskType:`exec.${family}`,idempotencyKey:id,requestedAt:stamp,requestFingerprint:fingerprint,inputData:{spec},runtimeData:{executionRoute:route}});
  const bound=await createExecutionAuthorityService(agenticStore.db,{now}).bindAiTask(c,id,{requestFingerprint:fingerprint,modelInput:input,budget});
  const tasks=createPersistentTaskService(agenticStore.db,{now}),claim=(await tasks.claimTask({taskId:bound.executionTaskId,workerId:'agentic-original-worker'}))!;
  const ref={executionTaskId:bound.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const identityPort=createExecutionModelIdentityService(agenticStore.db,{now});
  await identityPort.pin(ref,family,source==='codex'?{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'agentic-original-model'}:{apiFormat:'openai_chat',authStyle:'bearer',model:'api-original',token:'fixture-never-requested',baseUrl:'https://fixture.invalid/v1'});
  const context={systemPrompt:input.systemPrompt,messages:[{role:'user',content:[{type:'text',text:input.goal}],timestamp:0}],tools:input.tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters}))};
  const request={request:normalizePiContext(context as Parameters<typeof normalizePiContext>[0]),maxOutputTokens:100};
  const ports=createExecutionAgenticModelPorts(agenticStore.db,{now,budget}),reserved=await ports.reserve(ref,request);
  const ledger=createExecutionCallLedgerService(agenticStore.db,{now,budget});await ledger.start(ref,reserved.callId);
  const codex=createExecutionCodexCallService(agenticStore.db,{now});
  const read=async()=>{const [task]=await agenticStore.db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));const call=(await ledger.inspect(ref)).calls.find(call=>call.id===reserved.callId)!;return{task:task!,call};};
  return{id,c,ref,input,request,route,tasks,ports,ledger,codex,reserved,read,identityPort};
 }
 it.each(['agentic.collect','agentic.material','agentic.research'] as const)('%s：Pi主的Codex文本原call可绑定并只读同thread/turn',async family=>{
  const f=await agenticFixture(family),before=await f.read();
  expect(before.call.operationKey).toBe(`agentic-model:${createHash('sha256').update(JSON.stringify([f.input.operationKey,before.call.inputDigest])).digest('hex')}`);
  expect(frozenNonChatModelBindingForCall(before.task,before.call)?.route).toMatchObject({source:'codex',mode:'text',capability:family,identity:{requestedModel:'agentic-original-model'}});
  await f.codex.invoke(f.ref,'bindCodexCall',{callId:f.reserved.callId,threadId:`${f.id}-thread`,turnId:`${f.id}-turn`});
  await f.ledger.settle(f.ref,f.reserved.callId,{status:'unknown'});
  const original=await f.read();
  expect(originalCodexReadBinding(original.task,original.call)).toMatchObject({threadId:`${f.id}-thread`,turnId:`${f.id}-turn`});
  expect(unconfirmedModelCalls(original.task,[original.call])).toEqual([]);
  expect((await f.ports.reserve(f.ref,f.request)).callId).toBe(f.reserved.callId);
  const after=await f.read();expect(after.task.deadlineAt).toBe(before.task.deadlineAt);
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
  for(const changed of [{...after.call,parentCallId:'other-parent'},{...after.call,executionTaskId:'other-task'},
   {...after.call,operationKey:'agentic-model:wrong'}, {...after.call,inputDigest:`sha256:${'7'.repeat(64)}`}])
   expect(frozenNonChatModelBindingForCall(after.task,changed)).toBeNull();
 },180_000);
 it('Codex主的API文本不借native权，未知也不能进入通用重新计费族',async()=>{
  const f=await agenticFixture('agentic.material','self');
  const before=await f.read();expect(frozenNonChatModelBindingForCall(before.task,before.call)?.route.source).toBe('self');
  await expect(f.codex.invoke(f.ref,'bindCodexCall',{callId:f.reserved.callId,threadId:'forged-thread',turnId:'forged-turn'})).rejects.toThrow('原call未冻结Codex执行权');
  await f.ledger.settle(f.ref,f.reserved.callId,{status:'unknown'});const state=await f.read();
  expect(originalCodexReadBinding(state.task,state.call)).toBeNull();expect(unconfirmedModelCalls(state.task,[state.call])).toEqual([]);
  expect((await f.ports.reserve(f.ref,f.request)).callId).toBe(f.reserved.callId);
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
 },180_000);
 it('旧strict Agent输入无group字段，真实business owner/lease仍拒绝跨组与错误fence',async()=>{
  const f=await agenticFixture('agentic.collect');
  await f.codex.invoke(f.ref,'bindCodexCall',{callId:f.reserved.callId,threadId:'original-thread',turnId:'original-turn'});
  const read=()=>f.codex.invoke(f.ref,'readCodexCall',{callId:f.reserved.callId});
  expect(await read()).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
  await expect(f.codex.invoke({...f.ref,fenceToken:'foreign-fence'},'readCodexCall',{callId:f.reserved.callId})).rejects.toThrow();
  await agenticStore.db.update(aiTasks).set({groupId:'foreign-group'}).where(eq(aiTasks.id,f.id));
  await expect(read()).rejects.toThrow('Agent执行与原业务owner或冻结输入不符');
  await agenticStore.db.update(aiTasks).set({groupId:null}).where(eq(aiTasks.id,f.id));
  await agenticStore.db.update(executionTasks).set({groupId:'foreign-group'}).where(eq(executionTasks.id,f.ref.executionTaskId));
  await expect(read()).rejects.toThrow('Agent执行与原业务owner或冻结输入不符');
  await agenticStore.db.update(executionTasks).set({groupId:null}).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect(await read()).toMatchObject({threadId:'original-thread',turnId:'original-turn'});
  const state=await f.read();expect((state.task.payload as Record<string,unknown>).modelInput).not.toHaveProperty('groupId');
 },180_000);
});
