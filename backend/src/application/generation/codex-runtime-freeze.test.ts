import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createDb,executionTasks,scheduledJobs,eq,type Db} from '@creatoros/backend';
import {getOfficialSkillBase,listOfficialSkillBases} from '@creatoros/ai-worker';
import {createSettingsRepository} from '../../modules/settings';
import {createMomentsRuntime} from './moments-model-runtime';
import {createTransactionalTaskRuntimeResolver} from './transactional-task-runtime';
import {freezeSelectedModelRoutes} from '../../modules/ai-runtime/capability-model-routing';
import {createVideoDecisionsBusinessAdapter} from '../../modules/ai-runtime/video-decisions-business-adapter';
import {codexExecutionSpec,createExecutionRoute} from '@creatoros/contract/execution-worker';
let db:Db,close:()=>Promise<void>;
const ctx={userId:'t1238-runtime',accountId:'t1238-account',requestId:'runtime',source:'user' as const};
const deps={now:()=>new Date().toISOString(),nextId:(p:string)=>p+'-t1238',officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'t1238',text:'真实官方Skill冻结测试'})},readPinnedAuthority:vi.fn(async()=>({authority:'local' as const,digest:'local'}))};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();await createSettingsRepository(db,deps).patchPreferences(ctx,{assistantExecutionEngine:'codex'});});
afterAll(async()=>close?.());
it('朋友圈冻结Codex并不读取文本供应商authority',async()=>{
 deps.readPinnedAuthority.mockClear();const runtime=await createMomentsRuntime(db,deps)(ctx,'moments.draft',{});
 expect(runtime.executionRoute).toEqual(createExecutionRoute('codex'));expect(runtime.skillSnapshot).toBeTruthy();expect(deps.readPinnedAuthority).not.toHaveBeenCalled();
});
it('benchmark纯ASR保留无Skill但冻结后续文本引擎',async()=>{
 deps.readPinnedAuthority.mockClear();const runtime=await createTransactionalTaskRuntimeResolver(db,deps)(ctx,'benchmark.transcribe',{});
 expect(runtime).toEqual({executionRoute:createExecutionRoute('codex')});expect(deps.readPinnedAuthority).not.toHaveBeenCalled();
});
it('视频逐Skill消费原任务Codex，不读取当前API选择',async()=>{
 const runtime=await createTransactionalTaskRuntimeResolver(db,deps)(ctx,'video.decisions',{});
 const resolveModelSpec=vi.fn(async()=>{throw Error('禁止读取另一文本供应商');});
 const adapter=createVideoDecisionsBusinessAdapter({resolveModelSpec,getTaskRuntimeData:async()=>runtime,listBrollInventory:async()=>[],readStoryboard:async()=>[]});
 const facets=await adapter.prepare(ctx,{id:'frozen-video',retryOfTaskId:null,projectId:'project',inputData:{},skillSnapshot:runtime.skillSnapshot as never});
 const frozen=JSON.parse(facets.__videoDecisions!);
 expect(Object.values(frozen.modelIdentities).length).toBeGreaterThan(0);
 for(const identity of Object.values(frozen.modelIdentities))expect(identity).toMatchObject({...codexExecutionSpec(),schemaVersion:1});
 expect(resolveModelSpec).not.toHaveBeenCalled();
});
it('调度新task在attach/Worker领取前就继承同组真实父路由',async()=>{
 const stamp='2026-10-11T00:00:00.000Z',jobId='t1238-scheduled-job';
 await db.insert(scheduledJobs).values({id:jobId,userId:ctx.userId,accountId:ctx.accountId,name:'真实调度冻结测试',sourceKind:'topic.daily',schedule:'* * * * *',createdAt:stamp,updatedAt:stamp});
 await db.insert(executionTasks).values({id:'t1238-scheduled-parent',userId:ctx.userId,accountId:ctx.accountId,kind:'automation_sync',ownerType:'scheduled_job',ownerId:jobId,idempotencyKey:'t1238-scheduled-parent',status:'running',payload:{job:{id:jobId},scheduledFor:stamp,executionRoute:createExecutionRoute('codex')},createdAt:stamp,updatedAt:stamp});
 const settings=createSettingsRepository(db,deps);await settings.patchPreferences(ctx,{assistantExecutionEngine:'pi'});
 const resolve=createTransactionalTaskRuntimeResolver(db,deps);
 const input={jobId,scheduledRun:{version:1,scheduledFor:stamp}};
 expect((await resolve(ctx,'scheduled.topic.daily',input)).executionRoute).toEqual(createExecutionRoute('codex','parent'));
 expect((await resolve({...ctx,userId:'other-runtime-user'},'scheduled.topic.daily',input)).executionRoute).toEqual(createExecutionRoute('pi'));
 expect((await resolve({...ctx,accountId:'other-runtime-account'},'scheduled.topic.daily',input)).executionRoute).toEqual(createExecutionRoute('pi'));
 expect((await resolve(ctx,'scheduled.topic.daily',{...input,scheduledRun:{version:1,scheduledFor:'2026-10-11T00:01:00.000Z'}})).executionRoute).toEqual(createExecutionRoute('pi'));
});

async function v2Route(){return freezeSelectedModelRoutes({choices:{text:'codex',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},revision:7,read:async(_entry,source)=>source==='codex'?{status:'ready',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-fixture-default'}}:{status:'not_configured',reasonCode:'MODEL_NOT_CONFIGURED'}});}
it('同tx通用任务调用私有root快照；trusted旧图和真实父图都不重读当前配置',async()=>{
 const route=await v2Route(),capture=vi.fn(async()=>route);
 const resolve=createTransactionalTaskRuntimeResolver(db,{...deps,resolveExecutionRoute:capture});
 const direct=await resolve(ctx,'benchmark.transcribe',{});expect(direct.executionRoute).toEqual(route);expect(capture).toHaveBeenCalledWith(ctx,db);
 capture.mockClear();
 expect((await resolve(ctx,'benchmark.transcribe',{},route)).executionRoute).toEqual(route);expect(capture).not.toHaveBeenCalled();
 const id='t1238-scheduled-parent';await db.update(executionTasks).set({payload:{job:{id:'t1238-scheduled-job'},scheduledFor:'2026-10-11T00:00:00.000Z',executionRoute:route}}).where(eq(executionTasks.id,id));
 expect((await resolve(ctx,'scheduled.topic.daily',{jobId:'t1238-scheduled-job',scheduledRun:{version:1,scheduledFor:'2026-10-11T00:00:00.000Z'}})).executionRoute).toEqual(route);
 expect(capture).not.toHaveBeenCalled();
},180_000);
