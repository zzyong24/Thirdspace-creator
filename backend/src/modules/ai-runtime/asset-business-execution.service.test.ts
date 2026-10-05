import {accountGroups} from "../../schema/account-groups";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createAssetBusinessExecutionService} from "./asset-business-execution.service";
let db:Db,connection:Awaited<ReturnType<typeof createDb>>,seq=0;
beforeAll(async()=>{connection=await createDb();db=connection.db;});afterAll(async()=>connection.client.close());
const stamp="2026-09-06T00:00:00.000Z",ctx={userId:"asset-entry-user",accountId:"asset-entry-account",requestId:"test",source:"user" as const};
const spec={kind:"image",provider:"openai",model:"image-model",baseUrl:null,token:"private-token",settings:{quality:"high"}} as const;
async function fixture(patch:Partial<typeof aiTasks.$inferInsert>={}){
 const id=`asset-entry-${++seq}`;
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",status:"queued",requestedAt:stamp,idempotencyKey:id,requestFingerprint:`sha256:${"a".repeat(64)}`,inputData:{kind:"image",prompt:"真实画面"},...patch});
 const resolveSpec=vi.fn(async()=>spec),assertProject=vi.fn(async()=>{});
 const service=createAssetBusinessExecutionService(db,{now:()=>stamp,budget:{maxCalls:6,maxTokens:10000,deadlineMs:600000},resolveSpec,assertProject});return {id,service,resolveSpec,assertProject};
}
it("新素材准备冻结规格但不保存密钥，重放不重新解析模型",async()=>{
 const f=await fixture(),mapped=await f.service.prepare(ctx,f.id);expect(mapped).not.toHaveProperty("legacy");
 const row=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId!)))[0]!;
 expect(row.payload).toMatchObject({modelInput:{kind:"asset.generate",mediaKind:"image",provider:"openai",model:"image-model",runtimeOptionsDigest:expect.stringMatching(/^sha256:/)}});
 expect(JSON.stringify(row)).not.toContain("private-token");expect(row.deadlineAt).toBe("2026-09-06T00:10:00.000Z");
 f.resolveSpec.mockRejectedValue(new Error("配置变化"));expect(await f.service.prepare(ctx,f.id)).toEqual(mapped);expect(f.resolveSpec).toHaveBeenCalledTimes(1);
});
it.each(["checkpoint","retry","result"])("旧 %s 事实沿原恢复账本，不建立新付费提交",async variant=>{
 const original=variant==='retry'?await fixture():undefined;
 const f=await fixture(variant==='checkpoint'?{runtimeData:{multimodalProviderCheckpoint:{broken:true}}}:original?{retryOfTaskId:original.id}:{});
 if(variant==='result')await db.insert(aiTaskResults).values({id:`result-${f.id}`,aiTaskId:f.id,resultType:'generated_asset',resultData:{assetId:'old'}});
 const before=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!,mapped=await f.service.prepare(ctx,f.id),row=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!;
 expect(mapped).toEqual({aiTaskId:f.id,executionTaskId:row.id});expect(row).toMatchObject({userId:ctx.userId,accountId:ctx.accountId,ownerType:'ai_task',ownerId:f.id,kind:'ai_task',status:variant==='result'?'succeeded':'unknown_result',executionBudget:{maxCalls:1},payload:{assetLegacyRecovery:{mode:'review',originalTaskId:original?.id??f.id,inputData:before.inputData,requestFingerprint:before.requestFingerprint}}});
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id))).toHaveLength(0);expect(JSON.stringify(row)).not.toContain('private-token');expect(await f.service.prepare(ctx,f.id)).toEqual(mapped);expect(f.resolveSpec).toHaveBeenCalledTimes(1);
 const after=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;for(const field of ['userId','accountId','groupId','groupVersion','membershipVersion','inputData','attemptId','requestFingerprint','costUsd','modelCallStartedAt'] as const)expect(after[field]).toEqual(before[field]);
 if(variant==='result')expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toMatchObject([{resultData:{assetId:'old'}}]);
});
it("准备期间取消，不创建执行任务",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));return spec;});
 await expect(f.service.prepare(ctx,f.id)).rejects.toThrow();expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
});
it("准备期间出现旧提交事实，重新核验后留在旧对账路径",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({runtimeData:{multimodalProviderCheckpoint:{state:"submitting"}}}).where(eq(aiTasks.id,f.id));return spec;});
 const mapped=await f.service.prepare(ctx,f.id),row=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!;expect(row).toMatchObject({status:'unknown_result',lastErrorCode:'ASSET_LEGACY_REVIEW_REQUIRED',payload:{assetLegacyRecovery:{mode:'review',originalTaskId:f.id,inputData:{kind:'image',prompt:'真实画面'},requestFingerprint:`sha256:${"a".repeat(64)}`}}});expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.runtimeData).toMatchObject({multimodalProviderCheckpoint:{state:'submitting'}});expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id))).toHaveLength(0);expect(await f.service.prepare(ctx,f.id)).toEqual(mapped);expect(f.resolveSpec).toHaveBeenCalledTimes(1);
});
it("恢复准备挂起时可停止，迟到配置不能转交任务",async()=>{
 await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.status,"queued"));
 const f=await fixture();let release!:(value:typeof spec)=>void;
 f.resolveSpec.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const legacy=vi.fn(async()=>{}),failed=vi.fn(async()=>{});
 const work=f.service.recoverQueued(failed,()=>false);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 f.service.stop();await work;release(spec);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();expect(legacy).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
});

it("T1062 旧素材恢复冻结真实空组归属并复读；归档首次交接零新执行",async()=>{
 await db.insert(accountGroups).values([{id:'asset-empty-group',userId:ctx.userId,name:'空组',status:'active',version:1,createdAt:stamp,updatedAt:stamp},{id:'asset-archived-group',userId:ctx.userId,name:'归档组',status:'archived',version:1,createdAt:stamp,updatedAt:stamp}]);
 const f=await fixture({accountId:null,groupId:'asset-empty-group',groupVersion:1,runtimeData:{multimodalProviderCheckpoint:{broken:true}}}),g={...ctx,accountId:null,groupId:'asset-empty-group'};
 const mapped=await f.service.prepare(g,f.id),row=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!;
 expect(row).toMatchObject({userId:ctx.userId,accountId:null,groupId:g.groupId,groupVersion:1,membershipVersion:null});
 expect(await f.service.prepare(g,f.id)).toEqual(mapped);
 const archived=await fixture({accountId:null,groupId:'asset-archived-group',groupVersion:1,runtimeData:{multimodalProviderCheckpoint:{broken:true}}});
 await expect(archived.service.prepare({...g,groupId:'asset-archived-group'},archived.id)).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,archived.id)))[0]!.executionTaskId).toBeNull();
});


// T1062 锁序 RED：只假定模型规格，不运行神经模型、Worker、媒体 IO 或供应商。
// DB、父、任务、冻结、转组和执行绑定全部走真实公共服务及独立随机 PG。
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createRuntimeDb} from '../../db';
import {createAiService} from '../ai/ai.service';
import {createProjectsService,createProjectRepository} from '../projects';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account/platform-account.service';
const assetLockPg=process.env.CREATOROS_TEST_POSTGRES_URL;
async function assetLockFixture(){
 if(!assetLockPg)throw Error('锁序回归需显式隔离 PG');
 const url=new URL(assetLockPg);if(url.hostname!=='127.0.0.1'||url.port!=='55422')throw Error('仅允许 localhost55422 随机库');
 const name=`t1062_asset_lock_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:assetLockPg});
 const runtimes:Array<Awaited<ReturnType<typeof createRuntimeDb>>>=[];
 await admin.query(`CREATE DATABASE ${name}`);url.pathname=`/${name}`;
 async function open(role:string){const scoped=new URL(url);scoped.searchParams.set('application_name',`${name}_${role}`);const runtime=await createRuntimeDb({connectionString:scoped.toString()});runtime.pool.options.max=1;runtimes.push(runtime);return runtime;}
 try{
  const setup=await open('setup'),left=await open('left'),right=await open('right');
  let sequence=0;const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++sequence}`};
  const user={userId:name,requestId:'lock-public',source:'user' as const},groups=createAccountGroupService({db:setup.db,...deps});
  const group=await groups.create(user,{name:'同组两父',idempotencyKey:'lock-group'}),target=await groups.create(user,{name:'转组目标',idempotencyKey:'lock-target'});
  const scope={...user,groupId:group.id,accountId:null,groupVersion:group.version};
  const projects=(database:Db)=>createProjectsService(createProjectRepository(database),deps);
  const parents=await Promise.all([0,1].map(i=>projects(setup.db).createProject(scope,{title:`真实父 ${i}`,brief:'公共 PG 锁序测试'})));
  const unused=async():Promise<never>=>{throw Error('锁序测试不调用供应商或采用');};
  const ai=(database:Db)=>createAiService({db:database,...deps,artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
  const business=(database:Db)=>createAssetBusinessExecutionService(database,{now:deps.now,budget:{maxCalls:6,maxTokens:10000,deadlineMs:600000},resolveSpec:async()=>spec,assertProject:async(c,id,transaction=database,forUpdate)=>{await projects(transaction).getProject(c,id,forUpdate);}});
  let blocker:import('pg').PoolClient|undefined,held=false;
  async function holdGroup(){blocker??=await setup.pool.connect();await blocker.query('BEGIN');held=true;await blocker.query('SELECT id FROM account_groups WHERE id=$1 FOR SHARE',[group.id]);}
  async function releaseGroup(){if(held){held=false;await blocker!.query('ROLLBACK');blocker!.release();blocker=undefined;}}
  async function observeLocks(roles:string[]){const deadline=Date.now()+6000;while(Date.now()<deadline){const rows=await admin.query<{application_name:string;wait_event_type:string;wait_event:string;query:string}>('SELECT application_name,wait_event_type,wait_event,query FROM pg_stat_activity WHERE datname=$1 AND application_name=ANY($2::text[]) AND wait_event_type=\'Lock\'',[name,roles.map(role=>`${name}_${role}`)]);if(rows.rows.length===roles.length){console.info('T1062实际锁等待',JSON.stringify(rows.rows));return;}await new Promise(resolve=>setTimeout(resolve,10));}throw Error('未观察到所有公共 caller 的真实 Lock 等待');}
  return{setup,left,right,deps,user,scope,group,target,parents,groups,projects,ai,business,holdGroup,releaseGroup,observeLocks,close:async()=>{await releaseGroup();blocker?.release();const closed=await Promise.allSettled(runtimes.map(runtime=>runtime.pool.end()));try{await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);}finally{await admin.end();}for(const result of closed)if(result.status==='rejected')throw result.reason;}};
 }catch(error){await Promise.allSettled(runtimes.map(runtime=>runtime.pool.end()));try{await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);}finally{await admin.end();}throw error;}
}
it.skipIf(!assetLockPg).each([false,true])('T1062真实PG素材 prepare 同组不同父并发且原回执重放零新增，legacy=%s',async legacy=>{
 const f=await assetLockFixture();let pending:Promise<unknown>[]=[];
 try{
  const tasks=await Promise.all(f.parents.map((parent,i)=>f.ai(f.setup.db).createTask(f.scope,{taskType:'asset.generate',attemptId:`lock-asset-public-task-${i}`,inputData:{projectId:parent.id,kind:'image',prompt:`真实独立任务 ${i}`} })));
  if(legacy)for(const task of tasks)await f.setup.db.update(aiTasks).set({runtimeData:{multimodalProviderCheckpoint:{broken:true}}}).where(eq(aiTasks.id,task.id));
  const original=await f.setup.db.select().from(aiTasks);
  await f.holdGroup();
  // 先挂 rejection handler，保留 SQL 的原始失败，不使 deadlock 成 unhandled rejection。
  const calls=[f.business(f.left.db),f.business(f.right.db)].map((service,i)=>service.prepare(f.scope,tasks[i]!.id));
  const results=Promise.allSettled(calls);pending=[results];
  try{await f.observeLocks(['left','right']);}finally{await f.releaseGroup();}
  const settled=await results;console.info('T1062素材公共锁结果',settled);
  for(const result of settled)expect(result.status).toBe('fulfilled');
  const executions=await f.setup.db.select().from(executionTasks);expect(executions).toHaveLength(2);expect(new Set(executions.map(row=>row.ownerId)).size).toBe(2);
  for(const task of original){const current=(await f.setup.db.select().from(aiTasks).where(eq(aiTasks.id,task.id)))[0]!;for(const field of ['userId','accountId','groupId','groupVersion','membershipVersion','attemptId','inputData','requestFingerprint','costUsd'] as const)expect(current[field]).toEqual(task[field]);}
  const before=await f.setup.db.select().from(executionTasks);await Promise.all(tasks.map(task=>f.business(f.setup.db).prepare(f.scope,task.id)));expect(await f.setup.db.select().from(executionTasks)).toEqual(before);expect(await f.setup.db.select().from(executionCalls)).toHaveLength(0);
  if(legacy)for(const row of executions)expect(row).toMatchObject({status:'unknown_result',lastErrorCode:'ASSET_LEGACY_REVIEW_REQUIRED',groupId:f.group.id,accountId:null});
 }finally{await f.releaseGroup();await Promise.allSettled(pending);await f.close();}
},30000);
it.skipIf(!assetLockPg)('T1062真实PG账号 transfer 先持账号/member 等组，素材 prepare 不反向持组等账号',async()=>{
 const f=await assetLockFixture();let pending:Promise<unknown>[]=[];
 try{
  const account=await createPlatformAccountService({db:f.setup.db,...f.deps}).createAccount(f.scope,{platform:'douyin',accountHandle:'真实转组交错账号'});
  const membership=await f.groups.forAccount(f.user,account.id),scope={...f.scope,accountId:account.id,membershipVersion:membership.version};
  const task=await f.ai(f.setup.db).createTask(scope,{taskType:'asset.generate',attemptId:'lock-account-public-task',inputData:{projectId:f.parents[0]!.id,kind:'image',prompt:'原账号输入'}});
  const original=(await f.setup.db.select().from(aiTasks).where(eq(aiTasks.id,task.id)))[0]!;
  const preview=await f.groups.previewTransfer(f.user,{accountId:account.id,toGroupId:f.target.id});expect(preview.activeTaskCount).toBeGreaterThan(0);
  await f.holdGroup();const move=Promise.allSettled([createAccountGroupService({db:f.left.db,...f.deps}).transfer(f.user,{...preview,idempotencyKey:'lock-transfer'})]);pending.push(move);await f.observeLocks(['left']);
  const prepare=Promise.allSettled([f.business(f.right.db).prepare(scope,task.id)]);pending.push(prepare);
  try{await f.observeLocks(['left','right']);}finally{await f.releaseGroup();}
  const [moved]=await move,[prepared]=await prepare;console.info('T1062账号交错结果',{moved,prepared});expect(moved?.status).toBe('rejected');if(moved?.status==='rejected')expect(moved.reason).toMatchObject({code:'ConflictError'});expect(prepared?.status).toBe('fulfilled');
  expect(await f.groups.forAccount(f.user,account.id)).toMatchObject({groupId:f.group.id,version:membership.version});
  const after=(await f.setup.db.select().from(aiTasks).where(eq(aiTasks.id,task.id)))[0]!;for(const field of ['userId','accountId','groupId','groupVersion','membershipVersion','inputData','requestFingerprint','costUsd'] as const)expect(after[field]).toEqual(original[field]);
  const executions=await f.setup.db.select().from(executionTasks);expect(executions).toHaveLength(1);await f.business(f.setup.db).prepare(scope,task.id);expect(await f.setup.db.select().from(executionTasks)).toEqual(executions);expect(await f.setup.db.select().from(executionCalls)).toHaveLength(0);
 }finally{await f.releaseGroup();await Promise.allSettled(pending);await f.close();}
},30000);
