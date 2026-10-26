import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {afterEach,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createDb,createRuntimeDb,type Db} from './db';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from './test-fixtures/owned-postgres';
import {randomUUID} from 'node:crypto';
import {drizzle as drizzlePg} from 'drizzle-orm/node-postgres';
import {migrate as migratePg} from 'drizzle-orm/node-postgres/migrator';
import {ENDPOINTS,createClient,type RequestContext} from '@creatoros/contract';
import {createAiService} from './modules/ai';
import {createPlatformAccountService,createAccountGroupService} from './modules/platform-account';
import {createSchedulingService,createSchedulingTransport} from './modules/scheduling';
import {createScheduledRunIntentService} from './modules/scheduling/daily-topic-run-intent.service';
import {createExecutionAuthorityService} from './modules/execution';
import {createPersistentTaskService} from './modules/execution';
import {createSchedulingControls} from './application/scheduling/controls';
import {triggerScheduledJob} from './modules/ai-runtime/scheduled-collection-scheduler';
import {createAutomationHandlerRegistry,runAutomationDriverTick} from './modules/ai-runtime/automation-driver';

const folder=fileURLToPath(new URL('../drizzle',import.meta.url)),time='2026-10-11T02:00:00.000Z';
const roots:string[]=[];
const pgCleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const cleanup of pgCleanups.splice(0).reverse())await cleanup();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const ctx:RequestContext={userId:'legacy-user',accountId:'legacy-account',groupId:'grp_legacy_legacy-account',membershipVersion:1,requestId:'t1209',source:'user'};
function controls(db:Db){
 let n=0;const deps={db,now:()=>time,nextId:(prefix:string)=>`${prefix}-t1209-${++n}`};
 const ai=createAiService({...deps,artifacts:{},knowledge:{},candidate:{},learnings:{},publishing:{},materialLinks:{},positioning:{},calibration:{}} as Parameters<typeof createAiService>[0]);
 const scheduling=createSchedulingService(deps),authority=createExecutionAuthorityService(db);
 const intent=createScheduledRunIntentService(db,deps,['self.metrics','self.traffic','comments','self.detail','topic.daily']).ensureRunForTask;
 const dispatched:Array<Promise<unknown>>=[];
 const c=createSchedulingControls({aiService:ai,schedulingService:scheduling,platformAccountService:createPlatformAccountService(deps),dispatchScheduledCollection:async(c,task)=>{const run=authority.bindAiTask(c,task.id);dispatched.push(run);return run;},deps,ensureDailyRun:intent,ensureCollectionRun:intent,ensureDefaultRubric:async()=>{},migrateProfile:async()=>{},scheduling:createSchedulingTransport(()=>scheduling)});
 const runNow=(jobId:string,scope:RequestContext=ctx)=>createClient(ENDPOINTS,c.schedulingWithRunNow,scope).runScheduledJobNow({params:{jobId},query:undefined,body:undefined});
 return {...c,ai,scheduling,dispatched,deps,runNow};
}
async function staged106(count=106){
 const root=await mkdtemp(join(tmpdir(),'creatoros-t1209-'));roots.push(root);
 const staged=join(root,'old106');await cp(folder,staged,{recursive:true});
 const journal=JSON.parse(await readFile(join(staged,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,count);await writeFile(join(staged,'meta/_journal.json'),JSON.stringify(journal));
 return {root,staged};
}
async function seedLegacy(client:{query:(text:string,params?:unknown[])=>Promise<unknown>}){
 await client.query("INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('legacy-account','legacy-user','douyin','中性历史账号',$1,$1)",[time]);
 await client.query("INSERT INTO account_groups(id,user_id,name,status,version,created_at,updated_at) VALUES('grp_legacy_legacy-account','legacy-user','中性初始组','active',1,$1,$1),('other','legacy-user','其它组','active',1,$1,$1)",[time]);
 await client.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at) VALUES('initial','legacy-user','grp_legacy_legacy-account','legacy-account',1,$1)",[time]);
 for(const kind of ['self.metrics','self.traffic','comments','self.detail','topic.daily','intelligence.sync'])await client.query("INSERT INTO scheduled_job(id,user_id,account_id,group_id,name,prompt,source_kind,target,schedule,enabled,created_at,updated_at) VALUES($1,'legacy-user','legacy-account','grp_legacy_legacy-account',$2,'原说明',$2,$3::jsonb,'0 */2 * * *',true,$4,$4)",['old-'+kind,kind,JSON.stringify(kind==='self.detail'?{__backfillOnly:true}:{}),time]);
 await client.query("INSERT INTO job_run(id,user_id,group_id,job_id,status,started_at,finished_at) VALUES('history','legacy-user','grp_legacy_legacy-account','old-self.metrics','succeeded',$1,$1)",[time]);
 await client.query("INSERT INTO ai_tasks(id,user_id,account_id,group_id,task_type,status,idempotency_key,input_data,requested_at,completed_at) VALUES('old-ai','legacy-user','legacy-account','grp_legacy_legacy-account','scheduled.self.metrics','succeeded','old-frozen-ai','{\"jobId\":\"old-self.metrics\"}',$1,$1)",[time]);
 await client.query("INSERT INTO execution_tasks(id,user_id,account_id,group_id,kind,owner_type,owner_id,status,idempotency_key,payload,created_at,updated_at) VALUES('old-execution','legacy-user','legacy-account','grp_legacy_legacy-account','ai_task','ai_task','old-ai','succeeded','old-frozen-execution','{\"frozen\":true}',$1,$1)",[time]);
}
async function legacyFixture(count=106){
 const {root,staged}=await staged106(count),dataDir=join(root,'db'),client=new PGlite(dataDir);await migrate(drizzle(client),{migrationsFolder:staged});await seedLegacy(client);
 return {dataDir,client};
}
async function snapshot(client:PGlite){const values:Record<string,unknown>={};for(const table of ['platform_accounts','account_groups','account_group_memberships','scheduled_job','job_run','ai_tasks','execution_tasks'])values[table]=(await client.query<{row:Record<string,unknown>}>(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows.map(r=>r.row);return values;}

it('T1209旧106库先复现真实runNow409，正常开库补版本后四类私有任务可入队，保原ID排期历史及幂等',async()=>{
 const f=await legacyFixture();let before:Awaited<ReturnType<typeof snapshot>>;
 try{before=await snapshot(f.client);const old=controls(drizzle(f.client) as unknown as Db);
  await expect(old.runNow('old-self.metrics')).rejects.toThrow('采集作业与当前真实账号归属不符');
  expect(await snapshot(f.client)).toEqual(before);
 }finally{await f.client.close();}
 const current=await createDb({dataDir:f.dataDir});let repaired:Awaited<ReturnType<typeof snapshot>>;
 try{
  repaired=await snapshot(current.client);
  const expected=(before!.scheduled_job as Array<Record<string,unknown>>).map(row=>({...row,group_version:1,membership_version:1}));
  expect(repaired).toEqual({...before!,scheduled_job:expected});
  const c=controls(current.db);
  for(const kind of ['self.metrics','self.traffic','comments','self.detail']){
   const result=await c.runNow('old-'+kind);
   expect(result.deduped).toBe(false);expect(result.jobRunId).toBeTruthy();
   const task=await c.ai.getTask(ctx,result.aiTaskId);expect(task).toMatchObject({groupId:ctx.groupId,membershipVersion:1,taskType:'scheduled.'+kind});
   expect((await current.client.query('SELECT account_id FROM ai_tasks WHERE id=$1',[result.aiTaskId])).rows).toEqual([{account_id:ctx.accountId}]);
   expect(await c.scheduling.getRun(ctx,result.jobRunId)).toMatchObject({jobId:'old-'+kind,aiTaskId:result.aiTaskId});
   const again=await c.runNow('old-'+kind);expect(again).toEqual({...result,deduped:true});
  }
  await Promise.all(c.dispatched);expect(c.dispatched).toHaveLength(4);
  expect(await c.scheduling.getRun(ctx,'history')).toMatchObject({id:'history',status:'succeeded'});
  for(const bad of [{...ctx,userId:'foreign'},{...ctx,groupId:'other'}])await expect(c.runNow('old-self.metrics',bad)).rejects.toThrow();
  // runNow从真实job派生执行版本；注入过期页面版本不代表真实job错版。核实际AI准入仍拒绝过期冻结值。
  await expect(c.ai.createTask({...ctx,source:'ingestion',membershipVersion:99},{taskType:'scheduled.self.metrics',attemptId:'stale-membership-rejected',inputData:{jobId:'old-self.metrics'}},{scheduledCollectorJobId:'old-self.metrics'})).rejects.toThrow('账号归属已改变');
  repaired=await snapshot(current.client);
 }finally{await current.client.close();}
 const reopened=await createDb({dataDir:f.dataDir});try{expect(await snapshot(reopened.client)).toEqual(repaired!);}finally{await reopened.client.close();}
});

it('T1209旧作业正常开库后真实定时driver经持久任务/AI/执行准入，重复tick不再创建',async()=>{
 const f=await legacyFixture();await f.client.close();const opened=await createDb({dataDir:f.dataDir});
 try{
  const c=controls(opened.db),seen:string[]=[];
  const driver={ctx:{...ctx,accountId:null,groupId:null,source:'ingestion' as const},tasks:createPersistentTaskService(opened.db,c.deps),registry:createAutomationHandlerRegistry().register('scheduled_collection',async(scope,input)=>{const r=await triggerScheduledJob(scope,input.job,c.triggerDeps,{scheduledFor:input.scheduledFor});await r.completion;seen.push(r.aiTaskId);}).seal(),listRunnableJobs:async()=>{const j=await c.scheduling.getJob(ctx,'old-self.metrics');return [{...j,accountId:j.accountId??null}];},now:()=>time,workerId:'t1209-driver',cron:{validate:()=>true},maxClaims:1};
  const first=await runAutomationDriverTick(driver);expect(first).toMatchObject({enqueued:1,succeeded:1,failed:0});expect(seen).toHaveLength(1);
  const count=(await opened.client.query('SELECT count(*)::int AS n FROM execution_tasks')).rows;
  const again=await runAutomationDriverTick(driver);expect(again).toMatchObject({succeeded:0,failed:0});expect(seen).toHaveLength(1);expect((await opened.client.query('SELECT count(*)::int AS n FROM execution_tasks')).rows).toEqual(count);
  expect((await opened.client.query<{membership_version:number;group_id:string;account_id:string}>("SELECT membership_version,group_id,account_id FROM execution_tasks WHERE id<>'old-execution' ORDER BY id")).rows.every(row=>row.membership_version===1&&row.group_id===ctx.groupId&&row.account_id===ctx.accountId)).toBe(true);
 }finally{await opened.client.close();}
});

it.each(['group','account'])('T1209归档%s补元数据但保留原权限规则',async mode=>{
 const f=await legacyFixture();try{await f.client.query(mode==='group'?"UPDATE account_groups SET status='archived' WHERE id='grp_legacy_legacy-account'":"UPDATE platform_accounts SET status='archived'");}finally{await f.client.close();}
 const opened=await createDb({dataDir:f.dataDir});try{
  expect((await opened.client.query<{membership_version:number;group_version:number}>('SELECT membership_version,group_version FROM scheduled_job')).rows.every(row=>row.membership_version===1&&row.group_version===1)).toBe(true);
  const c=controls(opened.db),job=await c.scheduling.getJob(ctx,'old-self.metrics');
  if(mode==='account'){const result=await triggerScheduledJob(ctx,job,c.triggerDeps);expect(result.skippedReason).toBeTruthy();expect(c.dispatched).toHaveLength(0);}
  else{const result=await triggerScheduledJob({...ctx,source:'ingestion'},job,c.triggerDeps);await result.completion;expect(result.aiTaskId).toBeTruthy();await expect(c.scheduling.createJob(ctx,{name:'共享',sourceKind:'topic.daily',schedule:'* * * * *'})).rejects.toThrow();}
 }finally{await opened.client.close();}
});

it.each(['wrong-user','wrong-group','moved-back','history-with-v1','foreign-history-with-v1','wrong-version','wrong-group-version','missing-account','pure-group','no-member'])('T1209缺完整初始证明%s不补版本，也不重签旧任务',async mode=>{
 const f=await legacyFixture();let before:Awaited<ReturnType<typeof snapshot>>;
 try{
  if(mode==='wrong-user')await f.client.query("UPDATE scheduled_job SET user_id='foreign'");
  if(mode==='wrong-group')await f.client.query("UPDATE scheduled_job SET group_id='other'");
  if(mode==='moved-back'){await f.client.query("UPDATE account_group_memberships SET version=3");await f.client.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at,left_at) VALUES('history-member','legacy-user','other','legacy-account',2,$1,$1)",[time]);}
  if(mode==='history-with-v1'||mode==='foreign-history-with-v1')await f.client.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at,left_at) VALUES('history-member',$1,'other','legacy-account',1,$2,$2)",[mode==='foreign-history-with-v1'?'foreign':'legacy-user',time]);
  if(mode==='wrong-version')await f.client.query('UPDATE scheduled_job SET membership_version=99');
  if(mode==='wrong-group-version')await f.client.query('UPDATE scheduled_job SET group_version=99');
  if(mode==='missing-account')await f.client.query("UPDATE scheduled_job SET account_id='missing'");
  if(mode==='pure-group')await f.client.query('UPDATE scheduled_job SET account_id=NULL');
  if(mode==='no-member')await f.client.query('DELETE FROM account_group_memberships');
  before=await snapshot(f.client);
 }finally{await f.client.close();}
 const opened=await createDb({dataDir:f.dataDir});try{expect(await snapshot(opened.client)).toEqual(before!);}finally{await opened.client.close();}
});

it('T1209旧105库补尾，新作业和legacy共享作业沿原公共运行合同，旧执行冻结值不动',async()=>{
 const f=await legacyFixture(105);await f.client.close();const opened=await createDb({dataDir:f.dataDir});try{
  const c=controls(opened.db);
  const fresh=await c.scheduling.createJob(ctx,{name:'新合法计划',sourceKind:'self.metrics',schedule:'0 */2 * * *'});expect(fresh).toMatchObject({id:'old-self.metrics',membershipVersion:1});
  const newJob=await c.scheduling.createJob({...ctx,accountId:null,membershipVersion:undefined},{name:'新共享计划',sourceKind:'intelligence.sync',systemManaged:true,schedule:'0 9 * * *'});expect(newJob.id).toBe('old-intelligence.sync');
  for(const kind of ['topic.daily','intelligence.sync']){const r=await c.runNow('old-'+kind);expect(r.aiTaskId).toBeTruthy();}
  await Promise.all(c.dispatched);
  expect((await opened.client.query("SELECT membership_version,group_version FROM ai_tasks WHERE id='old-ai'")).rows).toEqual([{membership_version:null,group_version:null}]);
  expect((await opened.client.query("SELECT membership_version,group_version FROM execution_tasks WHERE id='old-execution'")).rows).toEqual([{membership_version:null,group_version:null}]);
  // 正常开库补齐当前库存：旧尾项逐一保留，仅明确追加0141审核规则组范围迁移。
  expect((await opened.client.query<{created_at:number}>('SELECT created_at FROM drizzle.__drizzle_migrations WHERE created_at>=1791043200004 ORDER BY created_at')).rows.map(r=>Number(r.created_at))).toEqual([1791043200004,1791043200005,1791043200006,1791043200008,1791043200009,1791043200010,1791043200011,1791043200012,1791043200013,1791043200014]);
 }finally{await opened.client.close();}
});

function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
async function pgFixture(){
 const url=process.env.CREATOROS_TEST_POSTGRES_URL;if(!url)throw Error('真实并发验收必须显式指定隔离PG');
 const parsed=new URL(url);assertOwnedPostgresUrl(parsed.toString());
 const name='t1209_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url});pgCleanups.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);pgCleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname='/'+name;
 const pool=new Pool({connectionString:parsed.toString(),application_name:name+'_test'});pgCleanups.push(()=>pool.end());const {staged}=await staged106();await migratePg(drizzlePg(pool),{migrationsFolder:staged});await seedLegacy(pool);
 const db=drizzlePg(pool) as unknown as Db,groups=createAccountGroupService({db,now:()=>time,nextId:p=>p+randomUUID()});
 const migrateNormally=async()=>{const connection=new URL(parsed);connection.searchParams.set('application_name',name+'_migration');const runtime=await createRuntimeDb({connectionString:connection.toString()});pgCleanups.push(()=>runtime.pool.end());return runtime;};
 return {pool,db,groups,name,migrateNormally};
}
async function waitPg(f:Awaited<ReturnType<typeof pgFixture>>,predicate:(r:{query:string;wait_event:string;wait_event_type:string})=>boolean){const until=Date.now()+120000;while(Date.now()<until){const state=await f.pool.query('SELECT query,wait_event,wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[f.name]);if(state.rows.some(predicate))return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('未观察到真实迁移/转组锁等待');}
it('T1209真实PG转组先持锁，正常迁移退让后重读；未来私有作业v2、旧历史不改',{timeout:300000},async()=>{
 const f=await pgFixture(),preview=await f.groups.previewTransfer(ctx,{accountId:ctx.accountId!,toGroupId:'other'}),reached=gate(),resume=gate();
 const transfer=f.db.transaction(async tx=>{const result=await createAccountGroupService({db:tx as unknown as Db,now:()=>time,nextId:p=>p+randomUUID()}).transfer(ctx,{...preview,idempotencyKey:'pg-transfer-first'});reached.release();await resume.promise;return result;});await reached.promise;
 const migration=f.migrateNormally();void migration.catch(()=>{});
 try{await waitPg(f,r=>r.query.includes('DO $migration$')&&r.wait_event==='PgSleep');}finally{resume.release();}
 await transfer;await migration;
 expect((await f.pool.query("SELECT group_id,membership_version FROM scheduled_job WHERE source_kind='self.metrics'")).rows).toEqual([{group_id:'other',membership_version:2}]);
 expect((await f.pool.query("SELECT group_id,membership_version FROM job_run WHERE id='history'")).rows).toEqual([{group_id:ctx.groupId,membership_version:null}]);
 expect((await f.pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at=1791043200005')).rows).toEqual([{n:1}]);
});
it('T1209真实PG迁移先持锁，转组真实等待；提交后原服务转组v2且重开幂等',{timeout:300000},async()=>{
 const f=await pgFixture(),preview=await f.groups.previewTransfer(ctx,{accountId:ctx.accountId!,toGroupId:'other'}),client=await f.pool.connect();
 try{
  await client.query('BEGIN');await client.query(await readFile(join(folder,'0132_legacy_scheduled_job_membership.sql'),'utf8'));
  const transfer=f.groups.transfer(ctx,{...preview,idempotencyKey:'pg-migration-first'});void transfer.catch(()=>{});
  try{await waitPg(f,r=>r.wait_event_type==='Lock');}finally{await client.query('COMMIT');}
  await transfer;await f.migrateNormally();
  expect((await f.pool.query("SELECT group_id,membership_version FROM scheduled_job WHERE source_kind='self.metrics'")).rows).toEqual([{group_id:'other',membership_version:2}]);
  expect((await f.pool.query("SELECT membership_version FROM ai_tasks WHERE id='old-ai'")).rows).toEqual([{membership_version:null}]);
 }finally{await client.query('ROLLBACK');client.release();}
});
