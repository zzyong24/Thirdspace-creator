// @vitest-environment node
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import {aiTasks, aiTaskResults, candidates, executionTasks, executionCalls, eq, jobRuns, type Db} from '@creatoros/backend';
import {createDailyTopicCompletionService} from '../../../../backend/src/modules/ai/daily-topic-completion.service';
import {createPersistentTaskService, createExecutionCallLedgerService} from '@creatoros/backend/modules/execution';
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
async function scenario(mode:'model'|'quota'|'model_unconfigured'){
 const group=await call(ENDPOINTS.createAccountGroup,user,{name:`T1309 ${mode}`,idempotencyKey:`t1309-group-${mode}`});
 const ctx={...user,groupId:group.id,accountId:null};
 if(mode==='model'){
  await call(ENDPOINTS.putModel,ctx,{provider:'openai',modelName:'t1309-controlled',apiFormat:'openai_chat',baseUrl:'https://t1309.invalid/v1',secret:'controlled-fixture-only',settings:{structuredOutputs:true}},{capability:'default'});
  await call(ENDPOINTS.putModelRouting,ctx,{schemaVersion:1,choices:{text:'self',vision:'official',image:'official',video:'official',audio:'local',embed:'official'},expectedRevision:0});
  await call(ENDPOINTS.upsertProfile,ctx,{persona:'工具创作者',field:'AI实操',audience:'创作者',differentiation:'真实证据',capabilities:[]});
  await call(ENDPOINTS.createStatement,ctx,{oneLiner:'教创作者用真实证据完成工具实操',keywords:['创作','工具','实操']});
 }
 if(mode==='quota')await call(ENDPOINTS.createCandidate,ctx,{title:'本UTC日已确认候选',angle:'真实公开新增',source:'idea'});
 const job=await call(ENDPOINTS.createScheduledJob,ctx,{name:`T1309 ${mode}`,sourceKind:'topic.daily',schedule:'0 0 * * *',enabled:false});
 // 作业临时启用后原公开runNow；完成后finally由本owned DB整体销毁。
 await call(ENDPOINTS.setScheduledJobEnabled,ctx,{enabled:true},{jobId:job.id});
 const run=await call(ENDPOINTS.runScheduledJobNow,ctx,undefined,{jobId:job.id});
 const runtime=await getChatRuntime();
 await vi.waitFor(async()=>expect((await runtime.ai.getTask(ctx,run.aiTaskId)).executionTaskId).toBeTruthy(),{timeout:120000,interval:50});
 const business=await runtime.ai.getTask(ctx,run.aiTaskId), db=owned.db!;
 expect(owned.ports).toBeTruthy();expect(business).toMatchObject({groupId:group.id,taskType:'scheduled.topic.daily'});
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId!));
 expect(execution).toMatchObject({groupId:group.id,accountId:null,ownerId:business.id});
 const frozen=JSON.parse((execution!.payload as any).modelInput.facets.__dailyTopic);
 expect(frozen).toMatchObject({jobId:job.id,jobRunId:run.jobRunId,dailyLimit:1});
 expect(frozen.skipReason??'model').toBe(mode);
 const claim=await createPersistentTaskService(db).claimTask({taskId:execution!.id,workerId:'t1309-controlled-completion'});
 expect(claim).toBeTruthy();
 const ref={executionTaskId:execution!.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
 const service=createDailyTopicCompletionService(db,{ports:owned.ports!});
 let receipt:unknown;
 if(mode==='model'){
  // 受控provider回执：真实账本reserve/start/settle；本用例不fork、不发送HTTP或真实模型请求。
  const ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:8,maxTokens:100000,deadlineMs:120000}});
  const modelCall=await ledger.reserve(ref,{kind:'model',operationKey:'t1309/model/1',inputDigest:`sha256:${'a'.repeat(64)}`,reservedTokens:100});
  await ledger.start(ref,modelCall.id);
  const object={topics:[{title:'T1309受控每日选题',angle:'真实组合完成',source:'demand',predictedScore:80}]};
  const text=JSON.stringify({object,generation:{finishReason:'stop',usage:{inputTokens:2,outputTokens:3,cachedTokens:0,totalTokens:5},attempts:[]}});
  await ledger.settle(ref,modelCall.id,{status:'settled',usage:{totalTokens:5},resultText:text,providerResult:{content:[{type:'text',text:JSON.stringify(object)}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  receipt=await service.commitResult(ref,{outcome:'succeeded',callId:modelCall.id,text});
 }else receipt=await service.completeDailyTopicSkip(ref);
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
