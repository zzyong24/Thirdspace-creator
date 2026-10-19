import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {AsyncLocalStorage} from 'node:async_hooks';
import {afterEach,expect,it,vi} from 'vitest';
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
import {createCollectionExecution} from '../application/scheduling/collection-execution';
import {createSelfCollector} from '../application/collection/self';
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
 const name=`t1213_consumption_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());return runtime.db;
}
async function fixture(kind:'pglite'|'postgres'='pglite',sourceKind:'self.metrics'|'comments'='self.metrics'){
 const db=await open(kind);let sequence=0,tick=0;const now=()=>new Date(Date.parse('2026-10-11T02:00:00.000Z')+tick).toISOString(),nextId=(p:string)=>`${p}-t1213-${++sequence}`,deps={db,now,nextId};
 const base:RequestContext={userId:'isolated-consumption-user',requestId:'t1213',source:'user'},groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const group=await groups.create(base,{name:'隔离真实组',idempotencyKey:'group'}),account=await accounts.createAccount({...base,groupId:group.id},{platform:'douyin',accountHandle:'隔离真实成员'});
 const ctx:RequestContext={...base,groupId:group.id,accountId:account.id,groupVersion:group.version,membershipVersion:1,source:'ingestion'};
 const resolve=createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(s=>s.skillId===id)??null,list:()=>listOfficialSkillBases(),platformPolicy:()=>({version:'1',text:'隔离消费验证'})},accountOverlays:{listBySkillIds:async()=>[]},now});
 const forbidden=async():Promise<never>=>{throw Error('隔离采集不写创作实体');};
 const ai=createAiService({...deps,artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},calibration:{createDraftPrediction:forbidden},resolveTaskRuntimeData:async(c,type,input)=>({skillSnapshot:await resolve(c,requiredSkillIdsForTask(type,input??{}))})});
 const flywheel=createScheduledFlywheelExecutionService(db,{entryPath:'/never-start-model-for-consumption-regression',resolveModelSpec:async()=>{throw Error('测试不能启动模型');},budget,now});cleanups.push(()=>flywheel.stop());
 const scheduling=createSchedulingService(deps),tasks=createPersistentTaskService(db,{now}),children=createExecutionScheduledChildService(db,{now});
 const dispatched:Array<Promise<{executionTaskId:string}>>=[];
 const controls=createSchedulingControls({aiService:ai,schedulingService:scheduling,platformAccountService:accounts,dispatchScheduledCollection:async(c,t)=>{const pending=flywheel.prepare(c,t.id);dispatched.push(pending);return pending;},deps,ensureDailyRun:flywheel.ensureRunForTask,ensureCollectionRun:flywheel.ensureRunForTask,ensureDefaultRubric:async()=>{},migrateProfile:async()=>{},scheduling:createSchedulingTransport(()=>scheduling)});
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


for(const kind of ['pglite','postgres'] as const){
 it.skipIf(kind==='postgres'&&!process.env.CREATOROS_TEST_POSTGRES_URL)(`${kind} T1213 当前租约写进度、旧fence/错误run/ctx/父停止拒绝，终态仍成功`,async()=>{
  const f=await fixture(kind),s=await f.schedule();
  await f.flywheel.drain(async(c,t,scope)=>{
   const write=(scope as unknown as {writeProgress:(c:RequestContext,id:string,p:Record<string,unknown>)=>Promise<unknown>}).writeProgress;expect(typeof write).toBe('function');
   await write(c,s.run.id,{stage:'export_browser',processed:0,total:null,message:'等待采集浏览器与账号会话'});
   const before=await f.scheduling.getRun(c,s.run.id);expect(before.progress).toMatchObject({stage:'export_browser'});
   for(const wrong of [{...c,userId:'foreign-user'},{...c,accountId:'foreign-account'},{...c,groupId:'foreign-group'}])await expect(write(wrong,s.run.id,{stage:'invalid'})).rejects.toThrow();
   await expect(write(c,'foreign-run',{stage:'invalid'})).rejects.toThrow();
   f.advance(301000);await f.tasks.recoverExpiredLeases();const newer=await f.tasks.claimTask({taskId:s.child.id,workerId:'new-progress-owner',leaseSeconds:300});expect(newer).toBeTruthy();expect(scope.signal.aborted).toBe(false);
   await expect(write(c,s.run.id,{stage:'old-fence'})).rejects.toThrow();expect(await f.scheduling.getRun(c,s.run.id)).toEqual(before);
  },1);
  expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'running',attempt:2});expect(await f.db.select().from(jobRuns)).toHaveLength(1);
 },120000);
}

function executionFor(f:Awaited<ReturnType<typeof fixture>>,collector:Parameters<typeof createCollectionExecution>[0]['scheduledCollectors'][string]){
 return createCollectionExecution({scheduledCollectors:{'self.metrics':collector},scheduledSignals:new AsyncLocalStorage<AbortSignal>(),flywheelSourceKinds:new Set(['self.metrics']),scheduledFlywheel:f.flywheel,schedulingService:f.scheduling,aiService:f.ai,deps:{now:f.now},wakeScheduledFlywheel:()=>{},prepareDailyTopic:async()=>{throw Error('unexpected daily')},runTaskWithEffectiveSkillSnapshot:async()=>{throw Error('unexpected legacy')},isNotLoggedInError:()=>false}).collectFlywheel;
}
it('postgres 默认节流真实装配self子阶段依次落原run，ai终态清lease后仍成功',async()=>{
 const f=await fixture('postgres'),s=await f.schedule();let notify:((phase:any)=>void)|undefined,release!:()=>void;const hold=new Promise<void>(r=>release=r);
 const self=createSelfCollector({ingestionService:{ensureDouyinSource:async()=> 'isolated-source',ingestApprovedDouyinBatch:async()=>({recordsWritten:0})},publishingService:{getRecentPublicationsWithTitle:async()=>[]},readMetrics:async()=>({records:[],identity:{}}),readExport:async(_c:unknown,onProgress:any)=>{notify=onProgress;onProgress('prepare');onProgress('browser');await hold;return new Uint8Array([80,75,3,4]);},parseDouyinWorkListXlsx:async()=>[],now:f.now,checkScheduledSignal:()=>{},configuration:{}} as never);
 const emitted:string[]=[];const collect=executionFor(f,self);const pending=f.flywheel.drain((c,t,scope)=>collect(c,t,{...scope,writeProgress:async(...args)=>{emitted.push(String(args[2]?.stage));return scope.writeProgress(...args);}}),1);
 try{await vi.waitFor(()=>expect(notify).toBeTypeOf('function'));await vi.waitFor(async()=>expect((await f.scheduling.getRun(f.ctx,s.run.id)).progress).toMatchObject({stage:'export_browser'}));
  expect(emitted).toContain('export_prepare');expect(emitted).toContain('export_browser');
  for(const phase of ['navigate','download_finish','close']){notify!(phase);await vi.waitFor(async()=>expect((await f.scheduling.getRun(f.ctx,s.run.id)).progress).toMatchObject({stage:`export_${phase}`}));}
 }finally{release();await pending;}
 expect(await f.scheduling.getRun(f.ctx,s.run.id)).toMatchObject({status:'succeeded',itemsNew:0,itemsUpdated:0,progress:null,aiTaskId:s.business.id});expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'succeeded',attempt:1});expect(await f.db.select().from(jobRuns)).toHaveLength(1);
},120000);

it.each(['immediate','queued'] as const)('postgres %s 旧report经真实runner装配在新fence/旧心跳前不能反写',async mode=>{
 const f=await fixture('postgres'),s=await f.schedule();let report:((p:any)=>void)|undefined,release!:()=>void;const hold=new Promise<void>(r=>release=r),cleanupAbort=new AbortController();let unblock!:()=>void;const gate=new Promise<void>(r=>unblock=r);let blocked=false,rejected=0;
 const collect=executionFor(f,async(_c,_t,notify)=>{report=notify;await hold;cleanupAbort.signal.throwIfAborted();return {itemsNew:0,itemsUpdated:0};});
 const original=f.scheduling.updateRun.bind(f.scheduling);
 // 仅延迟进度端口调用，不改本系统实现/租约；旧源码走scheduling，修复后走scope.writeProgress。
 f.scheduling.updateRun=async(...args)=>{if(Object.keys(args[2]).length===1&&(args[2] as {progress?:unknown}).progress){blocked=true;await gate;}const result=await original(...args);if(Object.keys(args[2]).length===1)console.info('ISOLATED_LEGACY_PROGRESS_WRITE', {stage:(args[2] as {progress?:{stage?:string}}).progress?.stage});return result;};
 const pending=f.flywheel.drain((c,t,scope)=>collect(c,t,{...scope,signal:AbortSignal.any([scope.signal,cleanupAbort.signal]),writeProgress:async(...args)=>{blocked=true;await gate;try{return await scope.writeProgress(...args);}catch(e){rejected++;throw e;}}}),1);
 try{await vi.waitFor(()=>expect(report).toBeTypeOf('function'));const before=await f.scheduling.getRun(f.ctx,s.run.id);
  if(mode==='queued'){report!({stage:'export_browser',processed:0,total:null,message:'隔离旧排队进度'});await vi.waitFor(()=>expect(blocked).toBe(true));}
  f.advance(301000);await f.tasks.recoverExpiredLeases();const newer=await f.tasks.claimTask({taskId:s.child.id,workerId:'new-isolated-progress-owner',leaseSeconds:300});expect(newer).toBeTruthy();
  if(mode==='immediate')report!({stage:'export_browser',processed:0,total:null,message:'隔离旧迟到进度'});
  unblock();await vi.waitFor(()=>expect(rejected).toBe(1));expect((await f.scheduling.getRun(f.ctx,s.run.id)).progress).toEqual(before.progress);
  const current=await f.tasks.get(f.ctx,s.child.id);expect(current).toMatchObject({status:'running',attempt:2});
 }finally{unblock();cleanupAbort.abort();release();await pending;}
 expect(await f.tasks.get(f.ctx,s.child.id)).toMatchObject({status:'running',attempt:2});expect(await f.db.select().from(jobRuns)).toHaveLength(1);
},120000);

it.each(['pause','cancel'] as const)('postgres 父%s立即拒绝旧进度且不改变原控制或已有快照',async command=>{
 const f=await fixture('postgres'),s=await f.schedule();
 await f.flywheel.drain(async(c,_t,scope)=>{await scope.writeProgress(c,s.run.id,{stage:'export_browser',processed:0,total:null});const before=await f.scheduling.getRun(c,s.run.id);await f.tasks.command(f.ctx,{taskIds:[s.parent.id],command,idempotencyKey:`parent-${command}`});await expect(scope.writeProgress(c,s.run.id,{stage:'export_late'})).rejects.toThrow();expect((await f.scheduling.getRun(c,s.run.id)).progress).toEqual(before.progress);},1);
 expect((await f.tasks.get(f.ctx,s.parent.id)).status).toBe(command==='pause'?'pause_requested':'cancel_requested');
},120000);
