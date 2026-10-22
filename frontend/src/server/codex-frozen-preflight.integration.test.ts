// @vitest-environment node
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Endpoint,RequestContext} from '@creatoros/contract';
import {executionRouteSchema} from '@creatoros/contract/execution-worker';
type DailyAdapter=ReturnType<typeof import('@creatoros/backend/modules/ai-runtime').createDailyTopicBusinessAdapter>;
type MediaAdapters=ReturnType<typeof import('@creatoros/backend/application/generation/media').createMediaBusinessAdapters>;
type Flywheel=ReturnType<typeof import('@creatoros/backend/modules/ai-runtime').createScheduledFlywheelExecutionService>;
type Attribution=ReturnType<typeof import('@creatoros/backend/application/collection/attribution').createCollectedWorkAttribution>;
const held=vi.hoisted(()=>({daily:null as DailyAdapter|null,media:null as MediaAdapters|null,flywheel:null as Flywheel|null,attribution:null as Attribution|null,api:vi.fn(),imageApi:vi.fn()}));
// 不读取用户媒体目录；真实root/aiTask/偏好服务不替换。只观察已创建adapter。
vi.mock('@creatoros/backend/modules/assets',async original=>({...await original<typeof import('@creatoros/backend/modules/assets')>(),migrateStorageRoot:async()=>{throw Error('本测试禁止用户媒体迁移');}}));
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
 return {...actual,resolveLlmConfig:held.api,resolveMultimodalSpec:held.imageApi,
  // 仅安装/模型元数据夹具，原根实际冻结Codex身份；不执行Codex或读取用户认证。
  createLocalCodexStatusService:()=>{
   const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'t1238-fixture-model',availableModels:[{id:'t1238-fixture-model',inputModalities:['text','image']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:true,imageGeneration:false,imageEditing:'unavailable' as const}};
   return {read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}};
  },
  createDailyTopicBusinessAdapter:(...args:Parameters<typeof actual.createDailyTopicBusinessAdapter>)=>held.daily=actual.createDailyTopicBusinessAdapter(...args),
  createScheduledFlywheelExecutionService:(...args:Parameters<typeof actual.createScheduledFlywheelExecutionService>)=>held.flywheel=actual.createScheduledFlywheelExecutionService(...args)};
});
vi.mock('@creatoros/backend/application/generation/media',async original=>{
 const actual=await original<typeof import('@creatoros/backend/application/generation/media')>();
 return {...actual,createMediaBusinessAdapters:(...args:Parameters<typeof actual.createMediaBusinessAdapters>)=>held.media=actual.createMediaBusinessAdapters(...args)};
});
vi.mock('@creatoros/backend/application/collection/attribution',async original=>{const actual=await original<typeof import('@creatoros/backend/application/collection/attribution')>();return {...actual,createCollectedWorkAttribution:(...args:Parameters<typeof actual.createCollectedWorkAttribution>)=>held.attribution=actual.createCollectedWorkAttribution(...args)};});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from './persistence-client';
import {canonicalDataset} from '@/fixtures/canonical';
const ctx:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,requestId:'t1238-preflight',source:'user'};
const call=async(id:string,body?:unknown,params?:unknown)=>(await compositeTransport.request({id} as Endpoint,{params,body} as never,ctx) as {data:any}).data;
let directory:string,runtime:Awaited<ReturnType<typeof getChatRuntime>>;
function expectFrozenCodex(raw:unknown){
 const route=executionRouteSchema.parse(raw);expect(route.schemaVersion).toBe(2);
 if(route.schemaVersion!==2)throw Error('当前公共任务必须冻结V2模型身份');
 expect(route.orchestrator).toEqual({engine:'codex',source:'preference',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'});
 for(const key of ['text:topic.generate','structured:topic.generate','vision:asset.classify'])expect(route.routes[key]).toMatchObject({source:'codex',readiness:'configured',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'t1238-fixture-model'}});
}
beforeAll(async()=>{
 directory=mkdtempSync(join(tmpdir(),'t1238-preflight-'));
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(directory,'db'));vi.stubEnv('CREATOROS_MEDIA_ROOT',join(directory,'media'));vi.stubEnv('CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH',join(directory,'missing-seed'));
 held.api.mockImplementation(()=>{throw Error('NO_TEXT_KEY_API_FORBIDDEN');});held.imageApi.mockImplementation(()=>{throw Error('NO_IMAGE_KEY_API_FORBIDDEN');});
 __resetPersistenceForTests();runtime=await getChatRuntime();
},180_000);
afterAll(async()=>{
 await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();if(directory)rmSync(directory,{recursive:true,force:true});
},180_000);
it('真实公共偏好/aiTask/每日adapter：原Codex任务切Pi无key仍有模型，不读当前供应商',{timeout:180_000,retry:0},async()=>{
 await call('settings.preferences.patch',{assistantExecutionEngine:'codex'});
 const job=await call('scheduledJobs.create',{name:'原Codex自动选题',prompt:'',sourceKind:'topic.daily',target:{},schedule:'40 9 * * *',toolGrants:[]});
 const task=await runtime.ai.createTask(ctx,{taskType:'scheduled.topic.daily',attemptId:'preflight-original-daily',inputData:{jobId:job.id,scheduledRun:{version:1,scheduledFor:null}}});
 const frozen=await runtime.ai.getTaskRuntimeData(ctx,task.id);expectFrozenCodex(frozen.executionRoute);
 await call('settings.preferences.patch',{assistantExecutionEngine:'pi'});expect((await call('settings.preferences.get')).assistantExecutionEngine).toBe('pi');
 const facets=await held.daily!.prepare(ctx,{id:task.id,projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:frozen.skillSnapshot as never});
 expect(JSON.parse(facets.__dailyTopic!)).not.toHaveProperty('skipReason');expect(JSON.parse(facets.__topicGenerate!)).toMatchObject({mode:'daily'});
 expect((await runtime.ai.getTaskRuntimeData(ctx,task.id)).executionRoute).toEqual(frozen.executionRoute);expect(held.api).not.toHaveBeenCalled();expect(held.imageApi).not.toHaveBeenCalled();
});
it.each(['asset.classify','material.extract'] as const)('真实公共偏好/素材/aiTask/%s adapter：原Codex任务切Pi无key不跳过',{timeout:180_000,retry:0},async type=>{
 await call('settings.preferences.patch',{assistantExecutionEngine:'codex'});
 const uploaded=await call('assets.uploads.create',{assetType:'image',mimeType:'image/png',fileSize:1024});
 const asset=await call('assets.uploads.complete',{name:'原任务真实素材'}, {uploadId:uploaded.uploadId});
 const task=await runtime.ai.createTask(ctx,{taskType:type,attemptId:`preflight-original-${type}`,inputData:{assetId:asset.id}});
 const frozen=await runtime.ai.getTaskRuntimeData(ctx,task.id);expectFrozenCodex(frozen.executionRoute);
 await call('settings.preferences.patch',{assistantExecutionEngine:'pi'});
 const facets=await held.media![type].prepare(ctx,{id:task.id,projectId:null,retryOfTaskId:null,inputData:{assetId:asset.id},skillSnapshot:frozen.skillSnapshot as never});
 expect(JSON.parse(facets.__assetProcessing!)).toMatchObject({taskType:type,assetId:asset.id,fileId:asset.currentFileId,skipModel:false});
 expect((await runtime.ai.getTaskRuntimeData(ctx,task.id)).executionRoute).toEqual(frozen.executionRoute);expect(held.api).not.toHaveBeenCalled();expect(held.imageApi).not.toHaveBeenCalled();
});

it('真实公共原采集任务/归因adapter预检：原Codex父切Pi无key后按原lease检查，不误判未配置',{timeout:180_000,retry:0},async()=>{
 await call('settings.preferences.patch',{assistantExecutionEngine:'codex'});
 const job=await call('scheduledJobs.create',{name:'原Codex作品归因',prompt:'',sourceKind:'self.metrics',target:{},schedule:'40 9 * * *',toolGrants:[]});
 const task=await runtime.ai.createTask(ctx,{taskType:'scheduled.self.metrics',attemptId:'preflight-original-attribution',inputData:{jobId:job.id,scheduledRun:{version:1,scheduledFor:null}}});
 const frozen=await runtime.ai.getTaskRuntimeData(ctx,task.id);expectFrozenCodex(frozen.executionRoute);
 await held.flywheel!.prepare(ctx,task.id);await call('settings.preferences.patch',{assistantExecutionEngine:'pi'});
 let checked=false;
 await held.flywheel!.run(ctx,task.id,async(c,current,scope)=>{
  const result=await held.attribution!(c);expect(result.message).not.toContain('未配');expect(result.attributed).toBe(0);checked=true;
  await scope.ai.markSucceeded(c,current.id);
 });
 expect(checked).toBe(true);expect((await runtime.ai.getTaskRuntimeData(ctx,task.id)).executionRoute).toEqual(frozen.executionRoute);expect(held.api).not.toHaveBeenCalled();expect(held.imageApi).not.toHaveBeenCalled();
});
