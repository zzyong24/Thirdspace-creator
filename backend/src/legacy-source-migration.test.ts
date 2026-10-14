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
import {createHash,randomUUID} from 'node:crypto';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from './test-fixtures/owned-postgres';
import {drizzle as drizzlePg} from 'drizzle-orm/node-postgres';
import {migrate as migratePg} from 'drizzle-orm/node-postgres/migrator';
import {createDb,createRuntimeDb,type Db} from './db';
import type {RequestContext} from '@creatoros/contract';
import {createProjectRepository,createProjectsService} from './modules/projects';
import {createArtifactsService} from './modules/artifacts';
import {createArticlesService} from './modules/articles';
import {createGraphicPostsService} from './modules/graphic-posts';
import {createGroupMigrationService,createAccountGroupService} from './modules/platform-account';
import {lockWorkspaceMembership} from './modules/platform-account/membership-lock.service';
const folder=fileURLToPath(new URL('../drizzle',import.meta.url));
const roots:string[]=[];
afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
type Query={query:<T=Record<string,unknown>>(text:string,args?:unknown[])=>Promise<{rows:T[]}>};
const time='2026-10-08T00:00:00Z';
async function staged104(){
 const root=await mkdtemp(join(tmpdir(),'t1089-owned-'));roots.push(root);
 const staged=join(root,'old104');await cp(folder,staged,{recursive:true});
 const journal=JSON.parse(await readFile(join(staged,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,104);
 await writeFile(join(staged,'meta/_journal.json'),JSON.stringify(journal));await rm(join(staged,'0130_legacy_source_ownership.sql'),{force:true});
 return {root,staged};
}
async function old104(){
 const {root,staged}=await staged104();const dataDir=join(root,'db'),client=new PGlite(dataDir);await migrate(drizzle(client),{migrationsFolder:staged});return {root,dataDir,client};
}
async function seed(c:Query){
 await c.query("INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('a','u','xiaohongshu','合成账号',$1,$1),('b','u','douyin','另一账号',$1,$1),('foreign','v','douyin','另一用户',$1,$1)",[time]);
 await c.query("INSERT INTO account_groups(id,user_id,name,status,version,created_at,updated_at) VALUES('grp_legacy_a','u','真实初始组','active',1,$1,$1),('grp_legacy_b','u','另一初始组','active',1,$1,$1),('other','u','其它组','active',1,$1,$1)",[time]);
 await c.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at) VALUES('ma','u','grp_legacy_a','a',1,$1),('mb','u','grp_legacy_b','b',1,$1)",[time]);
 await c.query("INSERT INTO projects(id,user_id,account_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('p','u','a','原项目','active','script','manual',$1,$1,$1),('other-p','u','b','另一项目','active','script','manual',$1,$1,$1)",[time]);
 for(const [id,kind,type] of [['article','article','wechat_article'],['graphic','image','graphic_post']] as const){
  await c.query('INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at,group_id) VALUES($1,\'p\',\'原作品\',$2,\'draft\',$3,$3,\'grp_legacy_a\')',[id,kind,time]);
  await c.query("INSERT INTO artifacts(id,user_id,account_id,project_id,content_output_id,artifact_type,title,stage,created_at,updated_at) VALUES($1,'u','a','p',$2,$3,'原稿','script',$4,$4)",['art-'+id,id,type,time]);
  await c.query(`INSERT INTO ${id==='article'?'article_anchors':'graphic_post_anchors'}(output_id,project_id,user_id,account_id,artifact_id,client_request_id,request_digest,created_at) VALUES($1,'p','u','a',$2,$3,'原摘要',$4)`,[id,'art-'+id,'original-'+id,time]);
 }
 for(const [id,user,account,project,group] of [
  ['project-valid','u','a','p',null],['global-valid','u','a',null,null],['foreign-user','v','a','p',null],['wrong-account','u','b','p',null],['missing-project','u','a','missing',null],['no-member','u','missing',null,null],['already-stamped','u','a','p','other']
 ] as const)await c.query('INSERT INTO ai_conversations(id,user_id,account_id,project_id,group_id,title,scope,created_at,updated_at) VALUES($1,$2,$3,$4,$5,\'原会话\',\'global\',$6,$6)',[id,user,account,project,group,time]);
}
async function snapshot(c:Query){
 const result:Record<string,unknown[]>={};
 for(const table of ['platform_accounts','account_groups','account_group_memberships','projects','content_outputs','artifacts','article_anchors','graphic_post_anchors','ai_conversations','ai_messages','ai_tasks','execution_tasks','execution_calls'])result[table]=(await c.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
 return result;
}
const omitGroup=(rows:unknown[])=>rows.map(value=>{const {group_id,...rest}=value as Record<string,unknown>;return rest;});

it('正常104升级仅修复可证明三来源NULL，所有内容/父归属/历史回执保真且双启不重放',{timeout:180000,retry:0},async()=>{
 const {dataDir,client}=await old104();let before:Awaited<ReturnType<typeof snapshot>>;let oldLedger:unknown[];
 try{await seed(client);before=await snapshot(client);oldLedger=(await client.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;}finally{await client.close();}
 const opened=await createDb({dataDir});let after:Awaited<ReturnType<typeof snapshot>>;
 try{
  expect((await opened.client.query("SELECT id,group_id FROM ai_conversations WHERE id IN ('project-valid','global-valid') ORDER BY id")).rows).toEqual([{id:'global-valid',group_id:'grp_legacy_a'},{id:'project-valid',group_id:'grp_legacy_a'}]);
  for(const table of ['article_anchors','graphic_post_anchors'])expect((await opened.client.query(`SELECT group_id FROM ${table}`)).rows).toEqual([{group_id:'grp_legacy_a'}]);
  expect((await opened.client.query("SELECT id,group_id FROM ai_conversations WHERE id NOT IN ('project-valid','global-valid') ORDER BY id")).rows).toEqual([{id:'already-stamped',group_id:'other'},{id:'foreign-user',group_id:null},{id:'missing-project',group_id:null},{id:'no-member',group_id:null},{id:'wrong-account',group_id:null}]);
  after=await snapshot(opened.client);
  for(const [table,values] of Object.entries(before!))expect(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?omitGroup(after[table]!):after[table]).toEqual(['ai_conversations','article_anchors','graphic_post_anchors'].includes(table)?omitGroup(values):values);
  const ledger=(await opened.client.query<{hash:string;created_at:number}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  expect(ledger.slice(0,oldLedger!.length)).toEqual(oldLedger!);expect(ledger).toHaveLength(oldLedger!.length+5);expect(ledger.slice(oldLedger!.length).map(row=>Number(row.created_at))).toEqual([1791043200003,1791043200004,1791043200005,1791043200006,1791043200007]);expect(ledger.at(-1)?.created_at).toBe(1791043200007);
   expect(ledger.at(-1)).toEqual({hash:'d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494',created_at:1791043200007});
 }finally{await opened.client.close();}
 const second=await createDb({dataDir});try{expect(await snapshot(second.client)).toEqual(after!);expect((await second.client.query('SELECT * FROM drizzle.__drizzle_migrations WHERE created_at=1791043200003')).rows).toHaveLength(1);}finally{await second.client.close();}
});

it.each(['transfer','return-with-history','wrong-artifact-type','wrong-artifact-project','wrong-artifact-output','foreign-artifact-user','foreign-artifact-account','conflicting-output-group','null-output-group','null-project-group','archived-account','archived-group'] as const)('旧来源%s不凭同名账号或不完整父链取得新归属',{timeout:180000,retry:0},async mode=>{
 const {dataDir,client}=await old104();let before:Awaited<ReturnType<typeof snapshot>>;
 try{
  await seed(client);
  if(mode==='transfer'||mode==='return-with-history'){
   await client.query("UPDATE account_group_memberships SET left_at=$1 WHERE id='ma'",[time]);
   await client.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at) VALUES('moved','u',$1,'a',2,$2)",[mode==='transfer'?'other':'grp_legacy_a',time]);
  }
  if(mode==='wrong-artifact-type')await client.query("UPDATE artifacts SET artifact_type='output_script' WHERE id IN ('art-article','art-graphic')");
  if(mode==='wrong-artifact-project')await client.query("UPDATE artifacts SET project_id='other-p' WHERE id IN ('art-article','art-graphic')");
  if(mode==='wrong-artifact-output')await client.query("UPDATE artifacts SET content_output_id='not-this-output' WHERE id IN ('art-article','art-graphic')");
  if(mode==='foreign-artifact-user')await client.query("UPDATE artifacts SET user_id='v' WHERE id IN ('art-article','art-graphic')");
  if(mode==='foreign-artifact-account')await client.query("UPDATE artifacts SET account_id='b' WHERE id IN ('art-article','art-graphic')");
  if(mode==='conflicting-output-group'||mode==='null-output-group')await client.query('UPDATE content_outputs SET group_id=$1 WHERE id IN (\'article\',\'graphic\')',[mode==='null-output-group'?null:'other']);
  if(mode==='null-project-group')await client.query("UPDATE projects SET group_id=NULL WHERE id='p'");
  if(mode==='archived-account')await client.query("UPDATE platform_accounts SET status='archived' WHERE id='a'");
  if(mode==='archived-group')await client.query("UPDATE account_groups SET status='archived' WHERE id='grp_legacy_a'");
  before=await snapshot(client);
 }finally{await client.close();}
 const opened=await createDb({dataDir});try{
  const after=await snapshot(opened.client);
  for(const table of ['article_anchors','graphic_post_anchors'])expect(after[table]).toEqual(before![table]);
  for(const table of ['platform_accounts','account_groups','account_group_memberships','projects','content_outputs','artifacts','ai_messages','ai_tasks','execution_tasks','execution_calls'])expect(after[table]).toEqual(before![table]);
  if(['transfer','return-with-history','archived-account','archived-group'].includes(mode))expect(after.ai_conversations).toEqual(before!.ai_conversations);
  if(mode==='null-project-group')expect((await opened.client.query("SELECT group_id FROM ai_conversations WHERE id='project-valid'")).rows).toEqual([{group_id:null}]);
 }finally{await opened.client.close();}
});

it('0130SQL身份及当前109尾精确追加，旧104 journal及历史迁移固定不漂移',{timeout:120000,retry:0},async()=>{
 const journal=JSON.parse(await readFile(join(folder,'meta/_journal.json'),'utf8'));
 expect(journal.entries).toHaveLength(109);expect(journal.entries[104]).toEqual({idx:104,version:'7',when:1791043200003,tag:'0130_legacy_source_ownership',breakpoints:true});
 expect(journal.entries[105]).toEqual({idx:105,version:'7',when:1791043200004,tag:'0131_platform_native_reports',breakpoints:true});
 expect(journal.entries[106]).toEqual({idx:106,version:'7',when:1791043200005,tag:'0132_legacy_scheduled_job_membership',breakpoints:true});
 expect(journal.entries[107]).toEqual({idx:107,version:'7',when:1791043200006,tag:'0133_assistant_execution_engine',breakpoints:true});
 expect(journal.entries[108]).toEqual({idx:108,version:'7',when:1791043200007,tag:'0134_client_observability',breakpoints:true});
 const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
 expect(digest(await readFile(join(folder,'0134_client_observability.sql'),'utf8'))).toBe('d9ffc8a011672cc985015d3f6cafcb693be8b77f33b5f04d6906d25939f80494');
 expect(digest(await readFile(join(folder,'0133_assistant_execution_engine.sql'),'utf8'))).toBe('0f51f97932dd96244d1402eaebcc8e5716b0c85eff848afac3a4111884238af6');
 expect(digest(await readFile(join(folder,'0128_workspace_convergence.sql'),'utf8'))).toBe('60cac883f02fa7fcd83051264bd6a63ec49132369c7c983b36e34e979a2f7713');
 expect(digest(await readFile(join(folder,'0129_workbench_artifact_convergence.sql'),'utf8'))).toBe('e4a8e08ec392d781ba6401d6f6389ec0fcaf4fb18a06aa51945864ce63951113');
});

function deferred(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
function outcome<T>(promise:Promise<T>){return promise.then(value=>({value,error:undefined}),error=>({value:undefined,error:error as Error&{code?:string}}));}
async function pgFixture(){
 const connectionString=process.env.CREATOROS_TEST_POSTGRES_URL;
 if(!connectionString)throw Error('T1089必须显式配置独立PG，不得skip后宣称并发通过');
 const parsed=new URL(connectionString);assertOwnedPostgresUrl(parsed.toString());
 const name='t1089_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString});
 try{await admin.query(`CREATE DATABASE ${name}`);}catch(error){await admin.end();throw error;}parsed.pathname='/'+name;
 const pool=new Pool({connectionString:parsed.toString()});
 try{const {staged}=await staged104();await migratePg(drizzlePg(pool),{migrationsFolder:staged});await seed(pool as unknown as Query);
  // 本并发夹具只保留合法闭包；错误归属族由前面的独立迁移矩阵验证。
  await pool.query("DELETE FROM ai_conversations WHERE id NOT IN ('project-valid','global-valid')");
 }catch(error){await pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();throw error;}
 const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_writer'});
 const db=drizzlePg(writerPool) as unknown as Db;
 const ctx:RequestContext={userId:'u',accountId:'a',source:'user',requestId:'t1089-owned-pg'};let seq=0;
 const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${name}-${++seq}`};
 const migrateNormally=()=>{const url=new URL(parsed);url.searchParams.set('application_name',name+'_migration');return createRuntimeDb({connectionString:url.toString()});};
 const sleepObserved=async()=>{
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   const result=await pool.query('SELECT pid,query,wait_event,wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name=$2',[name,name+'_migration']);
   if(result.rows.some(r=>String(r.query).includes('DO $migration$')&&r.wait_event==='PgSleep'))return result.rows;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('未实际观察到0130整轮NOWAIT退让后的PgSleep');
 };
 const cleanup=async()=>{await writerPool.end();await pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();};
 return {name,pool,writerPool,db,ctx,deps,migrateNormally,sleepObserved,cleanup};
}
function realDraftOwner(f:Awaited<ReturnType<typeof pgFixture>>,family:'article'|'graphic',paused:ReturnType<typeof deferred>,resume:ReturnType<typeof deferred>){
 let observed=false;
 const projects=(db:Db)=>{const original=createProjectsService(createProjectRepository(db),f.deps);return {...original,getProject:async(...args:Parameters<typeof original.getProject>)=>{
  const value=await original.getProject(...args);
  if(args[2]===true&&!observed){observed=true;paused.release();await resume.promise;}
  return value;
 }};};
 const artifacts=(db:Db)=>createArtifactsService({db,...f.deps,assertProjectOwned:(c,id)=>createProjectsService(createProjectRepository(db),f.deps).getProject(c,id),resolveOutputProjectId:(c,id)=>createProjectsService(createProjectRepository(db),f.deps).getProjectIdByOutput(c,id)});
 const deny=async():Promise<never>=>{throw Error('本并发测试禁止模型、素材或候选');};
 return family==='article'?createArticlesService(f.db,{...f.deps,projects,artifacts,assertAssetFile:deny,resolveDocumentSource:deny,resolveSelectedBrand:deny,submitGeneration:deny,readGeneration:deny}):createGraphicPostsService(f.db,{...f.deps,projects,artifacts,assertAssetFile:deny,submitTextGeneration:deny,readTextGeneration:deny});
}

it.each(['article','graphic'] as const)('真实PG原%s owner持项目UPDATE后，新迁移整轮退让并保留原创建/重放',{timeout:180000,retry:0},async family=>{
 const f=await pgFixture(),paused=deferred(),resume=deferred();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;
 const owner=realDraftOwner(f,family,paused,resume),input={title:'并发真实稿件',clientRequestId:'t1089-'+family+'-create'};
 const write=outcome(owner.createOutput(f.ctx,'p',input));let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 try{
  await Promise.race([paused.promise,write.then(r=>{throw r.error??Error('原创建没有进入项目锁阶段');})]);upgrade=outcome(f.migrateNormally());const observation=await f.sleepObserved();expect(observation).not.toHaveLength(0);
  resume.release();const result=await write;expect(result.error).toBeUndefined();expect(result.value).toBeDefined();
  const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  const table=family==='article'?'article_anchors':'graphic_post_anchors';
  expect((await f.pool.query(`SELECT group_id FROM ${table} WHERE output_id=$1`,[result.value!.id])).rows).toEqual([{group_id:'grp_legacy_a'}]);
  const count=(await f.pool.query(`SELECT * FROM ${table} ORDER BY output_id`)).rows;
  expect((await owner.createOutput(f.ctx,'p',input)).id).toBe(result.value!.id);
  expect((await f.pool.query(`SELECT * FROM ${table} ORDER BY output_id`)).rows).toEqual(count);
  expect((await f.pool.query('SELECT * FROM drizzle.__drizzle_migrations WHERE created_at=1791043200003')).rows).toHaveLength(1);
 }finally{resume.release();await write;if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it('真实PG旧来源ROW EXCLUSIVE阻新DDL时，异常回滚释放组锁，新提交来源被最终重采',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),b=await f.writerPool.connect();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 try{
  await b.query('BEGIN');await b.query("INSERT INTO ai_conversations(id,user_id,account_id,title,created_at,updated_at) VALUES('window-new','u','a','锁窗口中提交',$1,$1)",[time]);
  upgrade=outcome(f.migrateNormally());await f.sleepObserved();
  // 如果失败轮还持group SHARE，这里的真正UPDATE NOWAIT会55P03；成功证明整轮已释放。
  await b.query("SELECT id FROM account_groups WHERE id='grp_legacy_a' FOR UPDATE NOWAIT");await b.query('COMMIT');
  const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  expect((await f.pool.query("SELECT group_id FROM ai_conversations WHERE id='window-new'")).rows).toEqual([{group_id:'grp_legacy_a'}]);
  const catalog=(await f.pool.query("SELECT c.relname,t.tgname,t.tgisinternal FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('ai_conversations','article_anchors','graphic_post_anchors') ORDER BY c.relname,t.tgname")).rows;
  expect(catalog.filter(r=>r.tgname==='legacy_source_group_stamp'&&!r.tgisinternal)).toHaveLength(3);
  expect(catalog.some(r=>r.relname==='ai_conversations'&&r.tgisinternal)).toBe(true);
 }finally{await b.query('ROLLBACK');b.release();if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it('真实PG显式归组持真实组/父/来源行锁时，0130退让后沿最新父归属保真',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),paused=deferred(),resume=deferred();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;
 const service=createGroupMigrationService({db:f.db,...f.deps,observePhase:async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}});
 const ctx={...f.ctx,groupId:'grp_legacy_a'},selection={fromGroupId:'grp_legacy_a',toGroupId:'other',projectIds:['p'],knowledgeIds:[],conversationIds:[]};
 const preview=await service.preview(ctx,selection);expect(preview.counts.article_anchors).toBe(1);expect(preview.counts.graphic_post_anchors).toBe(1);
 const move=outcome(service.apply(ctx,{...selection,digest:preview.digest,idempotencyKey:'t1089-real-move'}));let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 try{
  await Promise.race([paused.promise,move.then(r=>{throw r.error??Error('原归组没有进入validated阶段');})]);upgrade=outcome(f.migrateNormally());await f.sleepObserved();resume.release();expect((await move).error).toBeUndefined();
  const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  for(const table of ['article_anchors','graphic_post_anchors'])expect((await f.pool.query(`SELECT group_id FROM ${table}`)).rows).toEqual([{group_id:'other'}]);
  expect((await f.pool.query("SELECT group_id FROM ai_conversations WHERE id='project-valid'")).rows).toEqual([{group_id:'other'}]);
  expect((await f.pool.query("SELECT group_id FROM ai_conversations WHERE id='global-valid'")).rows).toEqual([{group_id:'grp_legacy_a'}]);
 }finally{resume.release();await move;if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

async function blockedBy(pool:Pool,pid:number,blocker?:number){
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){const result=await pool.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid]);
  if(result.rows.some(r=>r.wait_event_type==='Lock'&&(blocker===undefined||r.blockers.includes(blocker))))return result.rows;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw Error('未实际观察到预期的PG锁等待');
}

it.each(['article','graphic','group-migration'] as const)('真实PG错误DDL-first锁序与原%s服务形成实际40P01（诊断反例）',{timeout:180000,retry:0},async family=>{
 const f=await pgFixture(),paused=deferred(),resume=deferred(),a=await f.pool.connect();
 let write:ReturnType<typeof outcome<unknown>>|undefined;let waiting:ReturnType<typeof outcome<unknown>>|undefined;
 try{
  if(family==='group-migration'){
   const service=createGroupMigrationService({db:f.db,...f.deps,observePhase:async()=>{paused.release();await resume.promise;}}),ctx={...f.ctx,groupId:'grp_legacy_a'};
   const selection={fromGroupId:'grp_legacy_a',toGroupId:'other',projectIds:['p'],knowledgeIds:[],conversationIds:[]},preview=await service.preview(ctx,selection);
   expect(preview.counts.article_anchors).toBe(1);
   write=outcome(service.apply(ctx,{...selection,digest:preview.digest,idempotencyKey:'diagnostic-bad-order'}));
  }else write=outcome(realDraftOwner(f,family,paused,resume).createOutput(f.ctx,'p',{title:'真实竞争创建',clientRequestId:'bad-order-'+family}));
  await Promise.race([paused.promise,write.then(r=>{throw r.error??Error('原服务未进入真实持锁阶段');})]);
  await a.query('BEGIN');await a.query('CREATE FUNCTION public.t1089_diagnostic_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
  const table=family==='graphic'?'graphic_post_anchors':'article_anchors';await a.query(`CREATE TRIGGER t1089_diagnostic_stamp BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.t1089_diagnostic_stamp()`);
  const pid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
  waiting=outcome(a.query(family==='group-migration'?"SELECT id FROM account_groups WHERE id='grp_legacy_a' FOR SHARE":"SELECT id FROM projects WHERE id='p' FOR SHARE"));
  const lock=await blockedBy(f.pool,pid);expect(lock).not.toHaveLength(0);resume.release();
  const wrongOrder=await waiting;await a.query('ROLLBACK');const original=await write;
  expect([wrongOrder.error?.code,original.error?.code]).toContain('40P01');
  console.info('[T1089-actual-wrong-order]',{family,actualDdlTable:table,lock,migrationError:wrongOrder.error?.code,originalError:original.error?.code});
  expect((await f.pool.query("SELECT tgname FROM pg_trigger WHERE tgname='t1089_diagnostic_stamp'")).rows).toHaveLength(0);
 }finally{resume.release();await a.query('ROLLBACK');a.release();if(waiting)await waiting;if(write)await write;await f.cleanup();}
});

it('真实PG原membership freeze后转组完成，0130重采真实历史并保持旧NULL来源',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),paused=deferred(),resume=deferred();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 const groupService=createAccountGroupService({db:f.db,...f.deps}),preview=await groupService.previewTransfer(f.ctx,{accountId:'a',toGroupId:'other'});
 const transfer=outcome(f.db.transaction(async tx=>{
  await lockWorkspaceMembership(tx,f.ctx);paused.release();await resume.promise;
  return createAccountGroupService({db:tx as unknown as Db,...f.deps}).transfer(f.ctx,{...preview,idempotencyKey:'t1089-frozen-then-transfer'});
 }));
 try{
  await Promise.race([paused.promise,transfer.then(r=>{throw r.error??Error('原freeze未到达');})]);upgrade=outcome(f.migrateNormally());await f.sleepObserved();resume.release();
  const moved=await transfer;expect(moved.error).toBeUndefined();expect(moved.value?.groupId).toBe('other');
  const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  for(const table of ['article_anchors','graphic_post_anchors'])expect((await f.pool.query(`SELECT group_id FROM ${table}`)).rows).toEqual([{group_id:null}]);
  expect((await f.pool.query('SELECT group_id FROM ai_conversations ORDER BY id')).rows).toEqual([{group_id:null},{group_id:null}]);
 }finally{resume.release();await transfer;if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it('真实PG0130成功轮持锁时，原项目INSERT被阻止；回滚诊断后正常迁移含真实新父',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),a=await f.pool.connect();let write:ReturnType<typeof outcome<unknown>>|undefined;let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;
 try{
  await f.pool.query("INSERT INTO ai_conversations(id,user_id,account_id,project_id,title,created_at,updated_at) VALUES('future-parent-source','u','a','future-parent','缺父来源',$1,$1)",[time]);
  await a.query('BEGIN');await a.query(await readFile(join(folder,'0130_legacy_source_ownership.sql'),'utf8'));
  const aPid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
  const bPid=(await f.writerPool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
  const projects=createProjectsService(createProjectRepository(f.db),{...f.deps,nextId:prefix=>prefix==='project'?'future-parent':f.deps.nextId(prefix)});
  write=outcome(projects.createProject(f.ctx,{title:'真实晚到父项目'}));expect(await blockedBy(f.pool,bPid,aPid)).not.toHaveLength(0);
  // 此直接执行仅证明精确SQL的事务锁生命周期；回滚，不手写migration receipt。
  await a.query('ROLLBACK');expect((await write).error).toBeUndefined();
  opened=await f.migrateNormally();expect((await f.pool.query("SELECT group_id FROM ai_conversations WHERE id='future-parent-source'")).rows).toEqual([{group_id:'grp_legacy_a'}]);
 }finally{await a.query('ROLLBACK');a.release();if(write)await write;await opened?.pool.end();await f.cleanup();}
});

it('真实PG来源行锁冲突整轮释放；原事务提交后正常迁移重新盖章',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),b=await f.writerPool.connect();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 try{
  await b.query('BEGIN');await b.query("SELECT id FROM ai_conversations WHERE id='global-valid' FOR UPDATE");
  upgrade=outcome(f.migrateNormally());await f.sleepObserved();
  await b.query("SELECT id FROM account_groups WHERE id='grp_legacy_a' FOR UPDATE NOWAIT");await b.query('COMMIT');
  const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  expect((await f.pool.query("SELECT group_id FROM ai_conversations WHERE id='global-valid'")).rows).toEqual([{group_id:'grp_legacy_a'}]);
 }finally{await b.query('ROLLBACK');b.release();if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it('真实PG整轮退让中取消，旧数据与104账本保持；再次正常升级可完成',{timeout:180000,retry:0},async()=>{
 const f=await pgFixture(),b=await f.writerPool.connect();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 try{
  const before=await snapshot(f.pool as unknown as Query),ledger=(await f.pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  await b.query('BEGIN');await b.query("SELECT id FROM ai_conversations WHERE id='global-valid' FOR UPDATE");
  upgrade=outcome(f.migrateNormally());const sleeping=await f.sleepObserved();
  expect((await f.pool.query('SELECT pg_cancel_backend($1) AS cancelled',[sleeping[0]!.pid])).rows).toEqual([{cancelled:true}]);
  const cancelled=await upgrade;expect(cancelled.error).toBeDefined();expect(String(cancelled.error)).toMatch(/canceling statement|cancelled|canceled/);
  expect(await snapshot(f.pool as unknown as Query)).toEqual(before);
  expect((await f.pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows).toEqual(ledger);
  expect((await f.pool.query("SELECT proname FROM pg_proc WHERE proname LIKE 'creatoros_proven_%' OR proname='creatoros_stamp_legacy_source_group'")).rows).toEqual([]);
  expect((await f.pool.query("SELECT tgname FROM pg_trigger WHERE tgname='legacy_source_group_stamp'")).rows).toEqual([]);
  await b.query("SELECT id FROM account_groups WHERE id='grp_legacy_a' FOR UPDATE NOWAIT");await b.query('COMMIT');
  opened=await f.migrateNormally();expect((await f.pool.query('SELECT * FROM drizzle.__drizzle_migrations WHERE created_at=1791043200003')).rows).toHaveLength(1);
  expect((await f.pool.query('SELECT group_id FROM ai_conversations ORDER BY id')).rows).toEqual([{group_id:'grp_legacy_a'},{group_id:'grp_legacy_a'}]);
 }finally{await b.query('ROLLBACK');b.release();if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it.each(['a-first','b-first'] as const)('真实PG两原归组服务反向参数%s，与0130竞争仍正确串行',{timeout:180000,retry:0},async order=>{
 const f=await pgFixture(),paused=deferred(),resume=deferred();let opened:Awaited<ReturnType<typeof createRuntimeDb>>|undefined;let upgrade:ReturnType<typeof outcome<Awaited<ReturnType<typeof createRuntimeDb>>>>|undefined;
 const firstSelection=order==='a-first'?{fromGroupId:'grp_legacy_a',toGroupId:'grp_legacy_b',projectIds:['p'],knowledgeIds:[],conversationIds:[]}:{fromGroupId:'grp_legacy_b',toGroupId:'grp_legacy_a',projectIds:['other-p'],knowledgeIds:[],conversationIds:[]};
 const secondSelection=order==='a-first'?{fromGroupId:'grp_legacy_b',toGroupId:'grp_legacy_a',projectIds:['other-p'],knowledgeIds:[],conversationIds:[]}:{fromGroupId:'grp_legacy_a',toGroupId:'grp_legacy_b',projectIds:['p'],knowledgeIds:[],conversationIds:[]};
 const context=(groupId:string):RequestContext=>({...f.ctx,accountId:groupId==='grp_legacy_a'?'a':'b',groupId});
 const first=createGroupMigrationService({db:f.db,...f.deps,observePhase:async()=>{paused.release();await resume.promise;}}),second=createGroupMigrationService({db:drizzlePg(f.pool) as unknown as Db,...f.deps});
 const one=await first.preview(context(firstSelection.fromGroupId),firstSelection),two=await second.preview(context(secondSelection.fromGroupId),secondSelection);
 const moving=outcome(first.apply(context(firstSelection.fromGroupId),{...firstSelection,digest:one.digest,idempotencyKey:'first-'+order}));let opposite:ReturnType<typeof outcome<Awaited<ReturnType<typeof second.apply>>>>|undefined;
 try{
  await Promise.race([paused.promise,moving.then(r=>{throw r.error??Error('第一原服务未持锁');})]);
  opposite=outcome(second.apply(context(secondSelection.fromGroupId),{...secondSelection,digest:two.digest,idempotencyKey:'second-'+order}));
  const watcherDeadline=Date.now()+120000;let observed=false;
  while(Date.now()<watcherDeadline){const lock=await f.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name<>$2 AND pid<>pg_backend_pid()",[f.name,f.name+'_writer']);if(lock.rows.some(r=>r.wait_event_type==='Lock')){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
  expect(observed).toBe(true);upgrade=outcome(f.migrateNormally());await f.sleepObserved();resume.release();
  expect((await moving).error).toBeUndefined();expect((await opposite).error).toBeUndefined();const migrated=await upgrade;expect(migrated.error).toBeUndefined();opened=migrated.value!;
  expect((await f.pool.query('SELECT id,group_id FROM projects ORDER BY id')).rows).toEqual([{id:'other-p',group_id:'grp_legacy_a'},{id:'p',group_id:'grp_legacy_b'}]);
  for(const table of ['article_anchors','graphic_post_anchors'])expect((await f.pool.query(`SELECT group_id FROM ${table}`)).rows).toEqual([{group_id:'grp_legacy_b'}]);
  expect((await f.pool.query('SELECT status FROM account_group_migrations')).rows).toEqual([{status:'applied'},{status:'applied'}]);
 }finally{resume.release();await moving;if(opposite)await opposite;if(upgrade){const r=await upgrade;if(!opened)opened=r.value;}await opened?.pool.end();await f.cleanup();}
});

it.each(['missing-0128','missing-0129','wrong-0130-hash','future-when'] as const)('0130身份%s严格拒绝，原业务与迁移账本不修改',{timeout:180000,retry:0},async mode=>{
 const {dataDir,client}=await old104();await client.close();const migrated=await createDb({dataDir});
 let ledger:unknown[];
 try{
  if(mode==='missing-0128'||mode==='missing-0129')await migrated.client.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at=$1',[mode==='missing-0128'?1791043200001:1791043200002]);
  if(mode==='wrong-0130-hash')await migrated.client.query("UPDATE drizzle.__drizzle_migrations SET hash='invalid-test-only' WHERE created_at=1791043200003");
  if(mode==='future-when')await migrated.client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('unknown-test-only',1791043200004)");
  ledger=(await migrated.client.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
 }finally{await migrated.client.close();}
 await expect(createDb({dataDir})).rejects.toThrow(/MIGRATION_LINEAGE_UNKNOWN/);
 const check=new PGlite(dataDir);try{expect((await check.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows).toEqual(ledger!);}finally{await check.close();}
});
