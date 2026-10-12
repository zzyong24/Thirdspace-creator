import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {ENDPOINTS,createClient,type RequestContext} from '@creatoros/contract';
import {createDb,createRuntimeDb,type Db} from '../db';
import {aiTasks,aiTaskSteps,executionTasks,executionCalls,jobRuns,eq} from '../index';
import {createAccountGroupService,createPlatformAccountService} from '../modules/platform-account';
import {createAiService} from '../modules/ai';
import {createSchedulingService,createSchedulingTransport} from '../modules/scheduling';
import {createSchedulingControls} from '../application/scheduling/controls';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask} from '../modules/ai-runtime/effective-skill-snapshot';
import {createScheduledFlywheelExecutionService,type ScheduledFlywheelCollector} from '../modules/ai-runtime/scheduled-flywheel-execution.service';
import {triggerScheduledJob} from '../modules/ai-runtime/scheduled-collection-scheduler';
import {runScheduledCollection} from '../modules/ai-runtime/scheduled-collection-runner';
import {createAutomationHandlerRegistry,runAutomationDriverTick} from '../modules/ai-runtime/automation-driver';
import {createPersistentTaskService} from '../modules/execution';
import {createExecutionScheduledChildService} from '../modules/execution/execution-scheduled-child.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';

// 全部账号、采集计数和异常均来自隔离夹具；不访问用户库、登录态、媒体平台或模型。
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
const budget={maxCalls:4,maxTokens:1000,deadlineMs:120000};
async function open(kind:'pglite'|'postgres'){
 if(kind==='pglite'){const runtime=await createDb();cleanups.push(()=>runtime.client.close());return runtime.db;}
 const url=process.env.CREATOROS_TEST_POSTGRES_URL;if(!url)throw Error('需要显式隔离 PostgreSQL 地址');const parsed=new URL(url);
 assertOwnedPostgresUrl(parsed.toString());
 const name=`t1210_consumption_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());return runtime.db;
}
async function fixture(kind:'pglite'|'postgres'='pglite',sourceKind:'self.metrics'|'comments'='self.metrics'){
 const db=await open(kind);let sequence=0,tick=0;const now=()=>new Date(Date.parse('2026-10-11T02:00:00.000Z')+tick).toISOString(),nextId=(p:string)=>`${p}-t1210-${++sequence}`,deps={db,now,nextId};
 const base:RequestContext={userId:'isolated-consumption-user',requestId:'t1210',source:'user'},groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const group=await groups.create(base,{name:'隔离真实组',idempotencyKey:'group'}),account=await accounts.createAccount({...base,groupId:group.id},{platform:'douyin',accountHandle:'隔离真实成员'});
 const ctx:RequestContext={...base,groupId:group.id,accountId:account.id,groupVersion:group.version,membershipVersion:1,source:'ingestion'};
 const resolve=createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(s=>s.skillId===id)??null,list:()=>listOfficialSkillBases(),platformPolicy:()=>({version:'1',text:'隔离消费验证'})},accountOverlays:{listBySkillIds:async()=>[]},now});
 const forbidden=async():Promise<never>=>{throw Error('隔离采集不写创作实体');};
 const ai=createAiService({...deps,artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},calibration:{createDraftPrediction:forbidden},resolveTaskRuntimeData:async(c,type,input)=>({skillSnapshot:await resolve(c,requiredSkillIdsForTask(type,input??{}))})});
 const flywheel=createScheduledFlywheelExecutionService(db,{entryPath:'/never-start-model-for-consumption-regression',resolveModelSpec:async()=>{throw Error('测试不能启动模型');},budget,now});cleanups.push(()=>flywheel.stop());
 const scheduling=createSchedulingService(deps),tasks=createPersistentTaskService(db,{now}),children=createExecutionScheduledChildService(db,{now});
 const dispatched:Array<Promise<{executionTaskId:string}>>=[];
 const controls=createSchedulingControls({aiService:ai,schedulingService:scheduling,platformAccountService:accounts,dispatchScheduledCollection:async(c,t)=>{const pending=flywheel.prepare(c,t.id);dispatched.push(pending);return pending;},deps,ensureDailyRun:flywheel.ensureRunForTask,ensureCollectionRun:flywheel.ensureRunForTask,ensureCanonicalRubricForAccount:async()=>{},migrateProfile:async()=>{},scheduling:createSchedulingTransport(()=>scheduling)});
 const job=await scheduling.createJob(ctx,{name:'隔离指标采集',sourceKind,schedule:'* * * * *',systemManaged:true,target:{__operationsSync:true,scheduleTimezone:'Asia/Shanghai',__skipHeavyBackfill:true}});
 const driver={ctx:{...base,source:'ingestion' as const},tasks,scheduledChildren:children,registry:createAutomationHandlerRegistry().register('scheduled_collection',async(c,input)=>{const result=await triggerScheduledJob(c,input.job,controls.triggerDeps,{scheduledFor:input.scheduledFor});return result.deduped?flywheel.prepare(c,result.aiTaskId):await result.completion;}).seal(),listRunnableJobs:async()=>[{...job,target:job.target??{},accountId:job.accountId??null}],now,workerId:'isolated-driver',cron:{validate:()=>true},maxClaims:1};
 const schedule=async()=>{
  expect(await runAutomationDriverTick(driver)).toMatchObject({enqueued:1,failed:0});
  const rows=await db.select().from(executionTasks),parent=rows.find(t=>t.kind==='automation_sync')!,child=rows.find(t=>t.kind==='ai_task')!;
  expect(parent.status).toBe('blocked');expect((parent.payload as any).__scheduledChild.executionTaskId).toBe(child.id);
  const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,child.ownerId)),[run]=await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,child.ownerId));
  expect(business).toMatchObject({groupId:group.id,membershipVersion:1,executionTaskId:child.id});
  expect((business!.runtimeData as any).skillSnapshot).toMatchObject({groupId:group.id,groupVersion:group.version,membershipVersion:1});
  return {parent,child,business:business!,run:run!};
 };
 const collect:ScheduledFlywheelCollector=(c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:scheduling,isNotLoggedInError:()=>false,collectors:{[sourceKind]:async(owner,_target,report)=>{expect(owner).toMatchObject({groupId:group.id,accountId:account.id,membershipVersion:1});report?.({stage:'ingest',processed:2,total:2,message:'隔离夹具已核验'});return {itemsNew:2,itemsUpdated:0};}},now});
 return {db,ctx,base,group,groups,account,ai,scheduling,controls,job,tasks,children,driver,flywheel,schedule,collect,now,dispatched,advance:(ms:number)=>{tick+=ms;}};
}

for(const kind of ['pglite','postgres'] as const)for(const sourceKind of ['self.metrics','comments'] as const){
 it.skipIf(kind==='postgres'&&!process.env.CREATOROS_TEST_POSTGRES_URL)(`${kind} ${sourceKind} 真实组公共调度→冻结 Skill→父子绑定→消费→原运行终态`,async()=>{
  const f=await fixture(kind,sourceKind),s=await f.schedule();let called=0;
  expect(await f.flywheel.drain(async(...args)=>{called++;return f.collect(...args);},1)).toBe(1);expect(called).toBe(1);
  expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'succeeded',itemsNew:2,aiTaskId:s.business.id});
  expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'succeeded',attempt:1});
  expect(await f.ai.getTask(f.ctx,s.business.id)).toMatchObject({status:'succeeded'});expect(await f.db.select().from(aiTaskSteps)).toHaveLength(1);
  await runAutomationDriverTick({...f.driver,listRunnableJobs:async()=>[]});expect(await f.tasks.get(f.ctx,s.parent.id)).toMatchObject({status:'succeeded'});
  expect(await f.db.select().from(aiTasks)).toHaveLength(1);expect(await f.db.select().from(jobRuns)).toHaveLength(1);
 },120000);
}

it('首次冻结校验拒绝必须结算原执行与 run，不能空错误 running 等待租约重试',async()=>{
 const f=await fixture(),s=await f.schedule();
 // 此破坏仅复现校验失败的收口缺口，不是安装版根因证明。
 const payload=s.child.payload as any;await f.db.update(executionTasks).set({payload:{...payload,modelInput:{...payload.modelInput,skillSnapshot:{...payload.modelInput.skillSnapshot,groupId:'foreign-isolated-group'}}}}).where(eq(executionTasks.id,s.child.id));
 let entered=0;await f.flywheel.drain(async()=>{entered++;},1).catch(()=>{});expect(entered).toBe(0);
 const child=await f.tasks.get(f.ctx,s.child.id);expect(child.status).toBe('failed');expect(child.errorCode).toBe('FLYWHEEL_ADMISSION_REJECTED');expect(child.errorMessage).toContain('飞轮阶段与原调度任务/账号不符');
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed',aiTaskId:s.business.id});
 await f.children.reconcile();expect(await f.tasks.get(f.ctx,s.parent.id)).toMatchObject({status:'failed'});
});

it('采集进入后冻结输入校验拒绝仍如实结算原错误且不重复采集',async()=>{
 const f=await fixture(),s=await f.schedule();let entered=0;
 await f.flywheel.drain(async(c,t,scope)=>{entered++;await scope.ai.markRunning(c,t.id);await f.db.update(aiTasks).set({inputData:{...(s.business.inputData as Record<string,unknown>),target:{foreignFixture:true}}}).where(eq(aiTasks.id,t.id));await scope.ai.recordStep(c,t.id,{stepNo:1,kind:'collect',text:'应拒绝',toolCalls:[]});},1).catch(()=>{});
 expect(entered).toBe(1);const child=await f.tasks.get(f.ctx,s.child.id);expect(child.status).toBe('failed');expect(child.errorCode).toBe('FLYWHEEL_CONSUMPTION_FAILED');expect(child.errorMessage).toContain('飞轮阶段与原调度任务/账号不符');
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed'});expect(await f.flywheel.drain(f.collect,1)).toBe(0);
});

it.each(['pause','cancel'] as const)('用户%s后的迟到采集异常不改用户控制结果或创建新执行',async command=>{
 const f=await fixture(),s=await f.schedule();
 await f.flywheel.drain(async()=>{await f.tasks.command(f.ctx,{taskIds:[s.child.id],command,idempotencyKey:'stop-during-consumption-'+command});throw Error('隔离迟到异常');},1);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:command==='pause'?'pause_requested':'cancel_requested',attempt:1});
 expect(await f.db.select().from(aiTasks)).toHaveLength(1);expect(await f.db.select().from(jobRuns)).toHaveLength(1);
});

it('过期租约被新 fence 接管后旧采集异常不能覆写新领取或原预算',async()=>{
 const f=await fixture(),s=await f.schedule();let replacement:Awaited<ReturnType<typeof f.tasks.claimTask>>;
 await f.flywheel.drain(async()=>{f.advance(301000);await f.tasks.recoverExpiredLeases();replacement=await f.tasks.claimTask({taskId:s.child.id,workerId:'new-isolated-owner',leaseSeconds:300});expect(replacement).toBeTruthy();throw Error('旧执行迟到错误');},1);
 const [child]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,s.child.id));expect(child).toMatchObject({status:'running',attempt:2,leaseOwner:'new-isolated-owner',fenceToken:replacement!.lease.fenceToken,deadlineAt:s.child.deadlineAt,executionBudget:s.child.executionBudget});
 expect(child!.lastErrorMessage).toBe(s.child.lastErrorMessage);expect(await f.db.select().from(executionTasks)).toHaveLength(2);
});

it('已有未对账调用时原任务进入 unknown_result，不能失败重发或签成功',async()=>{
 const f=await fixture(),s=await f.schedule(),ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget});
 await f.flywheel.drain(async(_c,_t,scope)=>{const call=await ledger.reserve(scope.execution,{operationKey:'isolated-unknown',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:1});await ledger.start(scope.execution,call.id);throw Error('隔离回执未知');},1);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'blocked',runtimeStatus:'unknown_result',attempt:1});expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed'});
 const calls=await f.db.select().from(executionCalls);expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({operationKey:'isolated-unknown',status:'started',reservedTokens:1,executionTaskId:s.child.id});
 expect(await f.flywheel.drain(f.collect,1)).toBe(0);expect(await f.db.select().from(aiTasks)).toHaveLength(1);
});

it('后续绑定拒绝但已有未对账调用时保留 unknown_result 与原调用账本',async()=>{
 const f=await fixture(),s=await f.schedule(),ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget});
 await f.flywheel.drain(async(c,t,scope)=>{const call=await ledger.reserve(scope.execution,{operationKey:'isolated-unknown-binding',kind:'model',inputDigest:'sha256:'+'b'.repeat(64),reservedTokens:1});await ledger.start(scope.execution,call.id);await f.db.update(aiTasks).set({inputData:{...(s.business.inputData as Record<string,unknown>),target:{invalidFixture:true}}}).where(eq(aiTasks.id,t.id));await scope.ai.markSucceeded(c,t.id);},1);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'blocked',runtimeStatus:'unknown_result',attempt:1});expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed'});
 const calls=await f.db.select().from(executionCalls);expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({operationKey:'isolated-unknown-binding',status:'started',reservedTokens:1,executionTaskId:s.child.id});
 expect(await f.flywheel.drain(f.collect,1)).toBe(0);expect(await f.db.select().from(aiTasks)).toHaveLength(1);
});

it('心跳准入拒绝后退出并记录原错误，不能继续挂空 running',async()=>{
 const f=await fixture(),s=await f.schedule();
 await f.flywheel.drain(async(c,t,scope)=>{
  await scope.ai.markRunning(c,t.id);await f.db.update(aiTasks).set({inputData:{...(s.business.inputData as Record<string,unknown>),target:{invalidHeartbeatFixture:true}}}).where(eq(aiTasks.id,t.id));
  await new Promise(resolve=>{if(scope.signal.aborted)resolve(undefined);else scope.signal.addEventListener('abort',()=>resolve(undefined),{once:true});});
  scope.signal.throwIfAborted();
 },1);
 const child=await f.tasks.get(f.ctx,s.child.id);expect(child.status).toBe('failed');expect(child.errorCode).toBe('FLYWHEEL_ADMISSION_REJECTED');expect(child.errorMessage).toContain('飞轮阶段与原调度任务/账号不符');
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed'});
},120000);

it('真实消费期间进度和心跳推进，分批交回后重启仍完成原 ID 和原预算',async()=>{
 const f=await fixture(),s=await f.schedule();
 await f.flywheel.drain(async(c,t,scope)=>{
  await scope.ai.markRunning(c,t.id);const [before]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,s.child.id));
  expect((await f.scheduling.getRun(f.ctx,s.run.id)).progress).toMatchObject({stage:'starting'});
  f.advance(11000);await new Promise(resolve=>setTimeout(resolve,11000));
  const [after]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,s.child.id));expect(after!.heartbeatAt).toBe(f.now());expect(after!.heartbeatAt).not.toBe(before!.heartbeatAt);
  return runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{'self.metrics':async()=>({itemsNew:1,itemsUpdated:0,continueCollection:true})},now:f.now});
 },1);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'queued',attempt:1});
 const [deferred]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,s.child.id));expect(deferred).toMatchObject({deadlineAt:s.child.deadlineAt,executionBudget:s.child.executionBudget});
 await f.flywheel.stop();f.advance(2000);
 const restarted=createScheduledFlywheelExecutionService(f.db,{entryPath:'/never-start-model',resolveModelSpec:async()=>{throw Error('不启动模型');},budget,now:f.now});cleanups.push(()=>restarted.stop());
 await restarted.drain(f.collect,1);expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'succeeded',attempt:2});
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'succeeded',itemsNew:3,aiTaskId:s.business.id});expect(await f.db.select().from(aiTasks)).toHaveLength(1);expect(await f.db.select().from(jobRuns)).toHaveLength(1);
},120000);

it('公共 runNow 同组合法任务可完成，异组或其它用户仍拒绝',async()=>{
 const f=await fixture(),client=createClient(ENDPOINTS,f.controls.schedulingWithRunNow,f.ctx);
 const input={params:{jobId:f.job.id},query:undefined,body:undefined};
 for(const ctx of [{...f.ctx,userId:'foreign-user'},{...f.ctx,groupId:'foreign-group'}])await expect(createClient(ENDPOINTS,f.controls.schedulingWithRunNow,ctx).runScheduledJobNow(input)).rejects.toThrow();
 const result=await client.runScheduledJobNow(input);await Promise.all(f.dispatched);await f.flywheel.drain(f.collect,1);
 expect(await f.scheduling.getRun(f.ctx,result.jobRunId)).toMatchObject({status:'succeeded',aiTaskId:result.aiTaskId});
});

it('坏 modelInput.jobRunId 指向同组其它真实运行时只结算原 AI/run，其它运行不变',async()=>{
 const f=await fixture(),s=await f.schedule();
 const other=await f.scheduling.createRun(f.ctx,{jobId:f.job.id,status:'running'}),before=await f.scheduling.getRun(f.ctx,other.id),payload=s.child.payload as any;
 await f.db.update(executionTasks).set({payload:{...payload,modelInput:{...payload.modelInput,jobRunId:other.id}}}).where(eq(executionTasks.id,s.child.id));
 let entered=0;await f.flywheel.drain(async()=>{entered++;},1);expect(entered).toBe(0);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'failed',errorCode:'FLYWHEEL_ADMISSION_REJECTED'});
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'failed',aiTaskId:s.business.id});expect(await f.ai.getTask(f.ctx,s.business.id)).toMatchObject({status:'failed'});
 expect(await f.scheduling.getRun(f.ctx,other.id)).toEqual(before);
});

it('执行 ownerId 与 payload.aiTaskId 错映射不能修改缺乏执行双向绑定的 AI/run',async()=>{
 const f=await fixture(),s=await f.schedule(),otherJob=await f.scheduling.createJob(f.ctx,{name:'其它真实采集',sourceKind:'self.metrics',schedule:'* * * * *',systemManaged:true});
 const otherAi=await f.ai.createTask(f.ctx,{taskType:'scheduled.self.metrics',attemptId:'isolated-foreign-owner-task',inputData:{jobId:otherJob.id,target:otherJob.target??{},scheduledRun:{version:1,scheduledFor:null}}},{scheduledCollectorJobId:otherJob.id});
 const otherRun=await f.flywheel.ensureRunForTask(f.ctx,otherAi.id),beforeAi=await f.db.select().from(aiTasks),beforeRuns=await f.db.select().from(jobRuns),payload=s.child.payload as any;
 await f.db.update(executionTasks).set({ownerId:otherAi.id,payload:{...payload,aiTaskId:otherAi.id}}).where(eq(executionTasks.id,s.child.id));
 let entered=0;await f.flywheel.drain(async()=>{entered++;},1);expect(entered).toBe(0);
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'blocked',errorCode:'FLYWHEEL_PARENT_BINDING_UNPROVEN'});
 expect(await f.db.select().from(aiTasks)).toEqual(beforeAi);expect(await f.db.select().from(jobRuns)).toEqual(beforeRuns);
 expect(await f.scheduling.getRun(f.ctx,otherRun.id)).toMatchObject({status:'running',aiTaskId:otherAi.id});
});
