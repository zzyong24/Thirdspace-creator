// @vitest-environment node
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import {aiTasks, aiTaskResults, candidates, executionTasks, executionCalls, eq, jobRuns, scheduledJobs, sql, type Db} from '@creatoros/backend';
import {accountGroups, accountGroupMemberships} from '../../../../backend/src/schema/account-groups';
import {createDailyTopicCompletionService} from '../../../../backend/src/modules/ai/daily-topic-completion.service';
import {createPersistentTaskService, createExecutionCallLedgerService,createExecutionAuthorityService} from '@creatoros/backend/modules/execution';
import type {DailyTopicCompletionPorts} from '../../../../backend/src/modules/ai/daily-topic-completion.service';
import {canonicalDataset} from '@/fixtures/canonical';

const owned=vi.hoisted(()=>({media:'',db:null as Db|null,ports:null as DailyTopicCompletionPorts|null}));
vi.mock('@creatoros/backend/modules/assets',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/assets')>();
 return {...actual,migrateStorageRoot:async()=>{throw Error('测试禁止迁移用户媒体目录');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:owned.media},args[1])};
});
vi.mock('@/server/activation/client-config.server',async original=>{
 const actual=await original<typeof import('@/server/activation/client-config.server')>();
 return {...actual,readChannelModelAuthority:vi.fn(async()=>({authority:'local'}))};
});
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
 return {...actual,composeChatProduction:(...args:Parameters<typeof actual.composeChatProduction>)=>({...actual.composeChatProduction(...args),start:()=>{}})};
});
vi.mock('@creatoros/backend/modules/execution',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/execution')>();
 return {...actual,createModelWorkerDispatcher:(...args:Parameters<typeof actual.createModelWorkerDispatcher>)=>{
  owned.db=args[0];owned.ports=args[1].dailyTopicPorts??null;
  // 只抑制自动启动；保留真实dispatcher/drainOnce与实际生产daily端口。
  return {...actual.createModelWorkerDispatcher(...args),start:()=>{}};
 }};
});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';

let root='';
let serial=0;
const user:RequestContext={userId:canonicalDataset.user.id,requestId:'t1309-owned-composition',source:'user'};
async function call(endpoint:Endpoint,ctx:RequestContext,body?:unknown,params?:unknown,query?:unknown):Promise<any>{
 return (await compositeTransport.request(endpoint,{params,body,query} as never,ctx) as {data:unknown}).data;
}
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'t1309-owned-composition-'));owned.media=join(root,'media');
 vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_STORAGE','local');
 vi.stubEnv('CREATOROS_CLIENT_CONFIG_PULL_ENABLED','0');vi.stubEnv('CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH','/nonexistent/t1309-fixture');
 vi.stubEnv('CREATOROS_TOPIC_DAILY_LIMIT','1');__resetPersistenceForTests();
},180000);
afterEach(async()=>{
 await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
 __resetPersistenceForTests();owned.db=null;owned.ports=null;vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});
},180000);
async function prepare(mode:'model'|'quota'|'model_unconfigured',scope?:RequestContext,seedQuota=true){
 const group=scope?.groupId?await call(ENDPOINTS.getAccountGroup,scope,undefined,{groupId:scope.groupId}):await call(ENDPOINTS.createAccountGroup,user,{name:`T1309 ${mode}`,idempotencyKey:`t1309-group-${mode}-${++serial}`});
 const ctx=scope??{...user,groupId:group.id,accountId:null};
 if(mode==='model'){
  await call(ENDPOINTS.putModel,ctx,{provider:'openai',modelName:'t1309-controlled',apiFormat:'openai_chat',baseUrl:'https://t1309.invalid/v1',secret:'controlled-fixture-only',settings:{structuredOutputs:true}},{capability:'default'});
  const routing=await call(ENDPOINTS.getModelRouting,ctx);
  await call(ENDPOINTS.putModelRouting,ctx,{schemaVersion:1,choices:{text:'self',vision:'official',image:'official',video:'official',audio:'local',embed:'official'},expectedRevision:routing.revision});
  await call(ENDPOINTS.upsertProfile,ctx,{persona:'工具创作者',field:'AI实操',audience:'创作者',differentiation:'真实证据',capabilities:[]});
  await call(ENDPOINTS.createStatement,ctx,{oneLiner:'教创作者用真实证据完成工具实操',keywords:['创作','工具','实操']});
 }
 if(mode==='quota'&&seedQuota)await call(ENDPOINTS.createCandidate,ctx,{title:'本UTC日已确认候选',angle:'真实公开新增',source:'idea'});
 const job=await call(ENDPOINTS.createScheduledJob,ctx,{name:`T1309 ${mode}`,sourceKind:'topic.daily',schedule:'0 0 * * *',enabled:false});
 // 作业临时启用后原公开runNow；完成后finally由本owned DB整体销毁。
 await call(ENDPOINTS.setScheduledJobEnabled,ctx,{enabled:true},{jobId:job.id});
 const run=await call(ENDPOINTS.runScheduledJobNow,ctx,undefined,{jobId:job.id});
 const runtime=await getChatRuntime();
 await vi.waitFor(async()=>expect((await runtime.ai.getTask(ctx,run.aiTaskId)).executionTaskId).toBeTruthy(),{timeout:120000,interval:50});
 const business=await runtime.ai.getTask(ctx,run.aiTaskId), db=owned.db!;
 expect(owned.ports).toBeTruthy();expect(business).toMatchObject({groupId:group.id,taskType:'scheduled.topic.daily'});
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId!));
 const [businessRow]=await db.select().from(aiTasks).where(eq(aiTasks.id,business.id));
 expect(execution).toMatchObject({groupId:group.id,accountId:businessRow!.accountId,ownerId:business.id});
 if(!scope?.accountId)expect(execution!.accountId).toBeNull();
 const frozen=JSON.parse((execution!.payload as any).modelInput.facets.__dailyTopic);
 expect(frozen).toMatchObject({jobId:job.id,jobRunId:run.jobRunId,dailyLimit:1});
 expect(frozen.skipReason??'model').toBe(mode);
 const claim=await createPersistentTaskService(db).claimTask({taskId:execution!.id,workerId:'t1309-controlled-completion'});
 expect(claim).toBeTruthy();
 const ref={executionTaskId:execution!.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
 const service=createDailyTopicCompletionService(db,{ports:owned.ports!});
 let commit:undefined|{outcome:'succeeded';callId:string;text:string};
 if(mode==='model'){
  // 受控provider回执：真实账本reserve/start/settle；本用例不fork、不发送HTTP或真实模型请求。
  const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:8,maxTokens:100000,deadlineMs:120000}});
  const modelCall=await ledger.reserve(ref,{kind:'model',operationKey:'t1309/model/1',inputDigest:`sha256:${'a'.repeat(64)}`,reservedTokens:100});
  await ledger.start(ref,modelCall.id);
  const object={topics:[{title:'T1309受控每日选题',angle:'真实组合完成',source:'demand',predictedScore:80}]};
  const text=JSON.stringify({object,generation:{finishReason:'stop',usage:{inputTokens:2,outputTokens:3,cachedTokens:0,totalTokens:5},attempts:[]}});
  await ledger.settle(ref,modelCall.id,{status:'settled',usage:{totalTokens:5},resultText:text,providerResult:{content:[{type:'text',text:JSON.stringify(object)}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  commit={outcome:'succeeded',callId:modelCall.id,text};
 }
 const complete=()=>commit?service.commitResult(ref,commit):service.completeDailyTopicSkip(ref);
 return {db,ctx,group,job,run,business,execution:execution!,frozen,ref,commit,service,complete};
}
async function scenario(mode:'model'|'quota'|'model_unconfigured'){
 const {db,ctx,group,job,run,business,ref,complete}=await prepare(mode);
 const receipt=await complete();
 expect(receipt).toMatchObject({aiTaskId:business.id});
 expect((await db.select().from(jobRuns).where(eq(jobRuns.id,run.jobRunId)))[0]).toMatchObject({status:'succeeded',itemsNew:mode==='model'?1:0,itemsUpdated:0,finishedAt:expect.any(String)});
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,business.id)))[0]!.status).toBe('succeeded');
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId)))[0]!.status).toBe('succeeded');
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,business.id))).toHaveLength(1);
 expect((await db.select().from(candidates)).filter(c=>c.groupId===group.id)).toHaveLength(mode==='model'||mode==='quota'?1:0);
 await call(ENDPOINTS.setScheduledJobEnabled,ctx,{enabled:false},{jobId:job.id});
}
it('生产组合：纯组真实公开作业与原租约账本模型完成',()=>scenario('model'),180000);
it('生产组合：纯组真实公开作业quota零调用skip',()=>scenario('quota'),180000);
it('生产组合：纯组真实公开作业未配置零调用skip',()=>scenario('model_unconfigured'),180000);

it('生产组合：同组两平台筛选共用公开作业及组额度，另一组隔离，重命名不废弃冻结执行',async()=>{
 const group=await call(ENDPOINTS.createAccountGroup,user,{name:'两账号共额度',idempotencyKey:'two-accounts'});
 const scope={...user,groupId:group.id};
 const a=await call(ENDPOINTS.createAccount,scope,{platform:'bilibili',accountHandle:'@t1309-a',followerBaseline:0});
 const b=await call(ENDPOINTS.createAccount,scope,{platform:'bilibili',accountHandle:'@t1309-b',followerBaseline:0});
 const first=await prepare('model',{...scope,accountId:a.id});
 const sameJob=await call(ENDPOINTS.createScheduledJob,{...scope,accountId:b.id},{name:'另一平台筛选',sourceKind:'topic.daily',schedule:'0 0 * * *',enabled:false});
 expect(sameJob.id).toBe(first.job.id);
 const deduped=await call(ENDPOINTS.runScheduledJobNow,{...scope,accountId:b.id},undefined,{jobId:sameJob.id});
 expect(deduped).toMatchObject({aiTaskId:first.business.id,jobRunId:first.run.jobRunId,deduped:true});
 await call(ENDPOINTS.updateAccountGroup,user,{name:'已重命名但仍可写',expectedVersion:group.version},{groupId:group.id});
 await first.complete();
 const second=await prepare('quota',{...scope,accountId:b.id},false);await second.complete();
 expect((await first.db.select().from(candidates)).filter(c=>c.groupId===group.id)).toHaveLength(1);
 expect(second.frozen).toMatchObject({skipReason:'quota',observedCount:1});
 expect((await first.db.select().from(aiTaskResults)).filter(r=>[first.business.id,second.business.id].includes(r.aiTaskId))).toHaveLength(2);
 const other=await prepare('model');await other.complete();
 expect((await first.db.select().from(candidates)).filter(c=>c.groupId===other.group.id)).toHaveLength(1);
},180000);

it('生产组合：真实savepoint提交、run写后receipt触发器失败全回滚；原任务随后可完成',async()=>{
 const p=await prepare('model');
 await p.db.execute(sql`CREATE FUNCTION t1309_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'T1309_RECEIPT_ROLLBACK'; END $$`);
 await p.db.execute(sql`CREATE TRIGGER t1309_fail_receipt BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION t1309_fail_receipt()`);
 await expect(p.complete()).rejects.toThrow('T1309_RECEIPT_ROLLBACK');
 expect(await p.db.select().from(candidates)).toHaveLength(0);expect(await p.db.select().from(aiTaskResults)).toHaveLength(0);
 expect((await p.db.select().from(jobRuns).where(eq(jobRuns.id,p.run.jobRunId)))[0]).toMatchObject({status:'running',finishedAt:null,itemsNew:0});
 expect((await p.db.select().from(executionTasks).where(eq(executionTasks.id,p.ref.executionTaskId)))[0]!.status).toBe('running');
 expect((await p.db.select().from(executionCalls).where(eq(executionCalls.id,p.commit!.callId)))[0]!.resultRef).toBeNull();
 await p.db.execute(sql`DROP TRIGGER t1309_fail_receipt ON ai_task_results`);await p.db.execute(sql`DROP FUNCTION t1309_fail_receipt()`);
 await p.complete();expect(await p.db.select().from(candidates)).toHaveLength(1);
},180000);

it('生产组合：完成后归档只读replay，不重建被删候选；终态回执缺失拒绝新写',async()=>{
 const p=await prepare('model'),receipt=await p.complete();
 await call(ENDPOINTS.archiveAccountGroup,user,{expectedVersion:p.group.version},{groupId:p.group.id});
 await p.db.delete(candidates);
 const before=await p.db.select().from(executionTasks).where(eq(executionTasks.id,p.ref.executionTaskId));
 expect(await p.complete()).toEqual(receipt);expect(await p.db.select().from(candidates)).toHaveLength(0);
 expect(await p.db.select().from(executionTasks).where(eq(executionTasks.id,p.ref.executionTaskId))).toEqual(before);
 await p.db.delete(aiTaskResults).where(eq(aiTaskResults.aiTaskId,p.business.id));
 await expect(p.complete()).rejects.toThrow('历史完成回执缺失');
 expect(await p.db.select().from(aiTaskResults)).toHaveLength(0);expect(await p.db.select().from(candidates)).toHaveLength(0);
},180000);

it('生产组合：活动组归档、跨用户与跨组冻结映射篡改全部拒绝，不写候选',async()=>{
 const archived=await prepare('model');await call(ENDPOINTS.archiveAccountGroup,user,{expectedVersion:archived.group.version},{groupId:archived.group.id});
 await expect(archived.complete()).rejects.toThrow('账号组不可用');
 const foreign=await prepare('model');await foreign.db.update(accountGroups).set({userId:'t1309-foreign'}).where(eq(accountGroups.id,foreign.group.id));
 await expect(foreign.complete()).rejects.toThrow('账号组不可用');
 const changed=await prepare('model'),other=await call(ENDPOINTS.createAccountGroup,user,{name:'另组',idempotencyKey:'mapping-other'});
 await changed.db.update(aiTasks).set({groupId:other.id}).where(eq(aiTasks.id,changed.business.id));
 await expect(changed.complete()).rejects.toThrow('每日选题任务映射无效');
 expect(await changed.db.select().from(candidates)).toHaveLength(0);
},180000);

it('生产组合：取消、过期fence、unknown调用及篡改job/run/call均不提交',async()=>{
 const p=await prepare('model');
 await expect(p.service.commitResult({...p.ref,fenceToken:p.ref.fenceToken+1},p.commit)).rejects.toThrow('执行凭证已失效');
 const payload=structuredClone(p.execution.payload) as any;
 payload.modelInput.facets.__dailyTopic=JSON.stringify({...p.frozen,jobRunId:'not-original-run'});
 await p.db.update(executionTasks).set({payload}).where(eq(executionTasks.id,p.execution.id));
 await expect(p.complete()).rejects.toThrow('每日选题运行缺少任务绑定');
 await p.db.update(executionTasks).set({payload:p.execution.payload}).where(eq(executionTasks.id,p.execution.id));
 await expect(p.service.commitResult(p.ref,{...p.commit!,callId:'not-original-call'})).rejects.toThrow('最后真实模型回执');
 await p.db.update(executionCalls).set({status:'unknown'}).where(eq(executionCalls.id,p.commit!.callId));
 await expect(p.complete()).rejects.toThrow('未确认调用');
 await p.db.update(executionCalls).set({status:'settled'}).where(eq(executionCalls.id,p.commit!.callId));
 await createPersistentTaskService(p.db).command(p.ctx,{taskIds:[p.execution.id],command:'cancel',idempotencyKey:'t1309-cancel'});
 await expect(p.complete()).rejects.toThrow('当前不可提交');
 expect(await p.db.select().from(candidates)).toHaveLength(0);expect(await p.db.select().from(aiTaskResults)).toHaveLength(0);
},180000);

it('生产组合：组加账号冻结member已迁移则拒绝原完成',async()=>{
 const group=await call(ENDPOINTS.createAccountGroup,user,{name:'原组',idempotencyKey:'moved-member'}),ctx={...user,groupId:group.id};
 const account=await call(ENDPOINTS.createAccount,ctx,{platform:'bilibili',accountHandle:'@moved-member',followerBaseline:0});
 const p=await prepare('model',{...ctx,accountId:account.id});
 expect(p.execution).toMatchObject({accountId:account.id,membershipVersion:1});
 // 故障注入模拟外部历史迁移状态；不借public transfer绕过原在途任务门。
 await p.db.update(accountGroupMemberships).set({leftAt:new Date().toISOString()}).where(eq(accountGroupMemberships.accountId,account.id));
 await expect(p.complete()).rejects.toThrow('账号归属已改变');expect(await p.db.select().from(candidates)).toHaveLength(0);
},180000);

/** 兼容库存夹具：真实表中创建完整job/run/AI，再由真实authority冻结、claim和ledger结算。
 * 不是public创建E2E；实际dailyTopicPorts保持生产组合根原端口，不替换锁/validateRun/finishRun。
 */
async function compatibility(template:Awaited<ReturnType<typeof prepare>>,scope:RequestContext){
 const {db}=template,tag=`compat-${++serial}`,stamp=new Date().toISOString();
 const [job]=await db.select().from(scheduledJobs).where(eq(scheduledJobs.id,template.job.id));
 const [run]=await db.select().from(jobRuns).where(eq(jobRuns.id,template.run.jobRunId));
 const frozenScope={accountId:scope.accountId??null,groupId:scope.groupId??null,groupVersion:scope.groupId?1:null,membershipVersion:scope.groupId&&scope.accountId?1:null};
 // 每workspace仅一条每日作业；不同冻结账号任务仍引用原共享job，各有原run。
 const legacyJob=scope.groupId?undefined:(await db.select().from(scheduledJobs)).find(row=>row.userId===scope.userId&&row.accountId===frozenScope.accountId&&row.groupId===null&&row.sourceKind==='topic.daily');
 const jobId=scope.groupId?template.job.id:legacyJob?.id??`t1309-job-${tag}`,runId=`t1309-run-${tag}`;
 if(!scope.groupId&&!legacyJob)await db.insert(scheduledJobs).values({...job!,...frozenScope,id:jobId,enabled:false});
 const created=await(await getChatRuntime()).ai.createTask(scope,{taskType:'scheduled.topic.daily',attemptId:`t1309-${tag}-independent-attempt`,inputData:{jobId,scheduledRun:{version:1,scheduledFor:null}}});
 const aiTaskId=created.id;
 const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,aiTaskId));
 expect(business).toMatchObject({accountId:frozenScope.accountId,groupId:frozenScope.groupId,attemptId:`t1309-${tag}-independent-attempt`});
 await db.insert(jobRuns).values({...run!,id:runId,jobId,aiTaskId,startedAt:stamp,status:'running',finishedAt:null,itemsNew:0,itemsUpdated:0});
 const modelInput=structuredClone((template.execution.payload as any).modelInput);
 modelInput.skillSnapshot=(business!.runtimeData as any).skillSnapshot;
 modelInput.facets.__dailyTopic=JSON.stringify({...template.frozen,jobId,jobRunId:runId});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(scope,aiTaskId,{requestFingerprint:business!.requestFingerprint!,modelInput,budget:template.execution.executionBudget as any});
 const claim=await createPersistentTaskService(db).claimTask({taskId:mapped.executionTaskId,workerId:'t1309-compat-host'});
 expect(claim).toBeTruthy();
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:8,maxTokens:100000,deadlineMs:120000}});
 const modelCall=await ledger.reserve(ref,{kind:'model',operationKey:`t1309/${tag}/model/1`,inputDigest:`sha256:${'b'.repeat(64)}`,reservedTokens:100});
 await ledger.start(ref,modelCall.id);
 const object={topics:[{title:`兼容 ${tag}`,angle:'完整生产组合',source:'demand',predictedScore:80}]};
 const text=JSON.stringify({object,generation:{finishReason:'stop',usage:{inputTokens:2,outputTokens:3,cachedTokens:0,totalTokens:5},attempts:[]}});
 await ledger.settle(ref,modelCall.id,{status:'settled',usage:{totalTokens:5},resultText:text,providerResult:{content:[{type:'text',text:JSON.stringify(object)}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const service=createDailyTopicCompletionService(db,{ports:owned.ports!});
 return {db,ref,aiTaskId,runId,complete:()=>service.commitResult(ref,{outcome:'succeeded',callId:modelCall.id,text})};
}
it('生产端口兼容库存：同组两个真实account冻结任务并发完成共享quota',async()=>{
 const p=await prepare('model'),scope={...user,groupId:p.group.id};
 const a=await call(ENDPOINTS.createAccount,scope,{platform:'bilibili',accountHandle:'@compat-a',followerBaseline:0});
 const b=await call(ENDPOINTS.createAccount,scope,{platform:'bilibili',accountHandle:'@compat-b',followerBaseline:0});
 const first=await compatibility(p,{...scope,accountId:a.id}),second=await compatibility(p,{...scope,accountId:b.id});
 await Promise.all([first.complete(),second.complete()]);
 expect((await p.db.select().from(candidates)).filter(c=>c.groupId===p.group.id)).toHaveLength(1);
 const receipts=(await p.db.select().from(aiTaskResults)).filter(r=>[first.aiTaskId,second.aiTaskId].includes(r.aiTaskId));
 expect(receipts).toHaveLength(2);expect(receipts.map(r=>(r.resultData as any).itemsNew).sort()).toEqual([0,1]);
},180000);
it('生产端口兼容库存：无group真实legacy账号完成；不存在账号和已迁入新组legacy拒绝',async()=>{
 const p=await prepare('model'),account=await call(ENDPOINTS.createAccount,user,{platform:'bilibili',accountHandle:'@legacy-compatible',followerBaseline:0});
 // owned历史兼容夹具：保真实platform行，去除新系统自动注册member以表示迁移前库存。
 await p.db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,account.id));
 const scope={...user,accountId:account.id,groupId:null};
 const valid=await compatibility(p,scope);await valid.complete();
 expect((await p.db.select().from(jobRuns).where(eq(jobRuns.id,valid.runId)))[0]!.status).toBe('succeeded');
 expect((await p.db.select().from(candidates)).filter(c=>c.accountId===account.id&&c.groupId===null)).toHaveLength(1);
 const missing=await compatibility(p,{...user,accountId:'t1309-missing-legacy',groupId:null});
 await expect(missing.complete()).rejects.toThrow('账号不存在');
 const moved=await compatibility(p,scope);
 await p.db.insert(accountGroupMemberships).values({id:'t1309-migrated-member',userId:user.userId,accountId:account.id,groupId:p.group.id,version:2,joinedAt:new Date().toISOString(),leftAt:null});
 await expect(moved.complete()).rejects.toThrow('账号已转组');
 expect((await p.db.select().from(aiTaskResults)).filter(r=>[missing.aiTaskId,moved.aiTaskId].includes(r.aiTaskId))).toHaveLength(0);
},180000);
it('生产完整计数端口：准备后已入池1001条，完成仍保组级UTC日额度及模型用量',async()=>{
 const p=await prepare('model'),stamp=new Date().toISOString();
 await p.db.insert(candidates).values(Array.from({length:1001},(_,i)=>({id:`t1309-full-${i}`,userId:user.userId,groupId:p.group.id,accountId:null,title:`原候选${i}`,source:'idea',createdAt:stamp,updatedAt:stamp})));
 await p.complete();
 expect((await p.db.select().from(candidates)).filter(c=>c.groupId===p.group.id)).toHaveLength(1001);
 expect((await p.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,p.business.id)))[0]!.resultData).toMatchObject({itemsNew:0,dayKey:stamp.slice(0,10),usage:{totalTokens:5}});
},180000);
