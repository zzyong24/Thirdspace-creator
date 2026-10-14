import {createSettingsRepository} from '../modules/settings';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {aiTasks,createDb,eq,executionTasks} from '@creatoros/backend';
import {executionRouteV2Schema,modelRouteCatalog,createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createExecutionAuthorityService} from '../modules/execution/execution-authority.service';
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
});
