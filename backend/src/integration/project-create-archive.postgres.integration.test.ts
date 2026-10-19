import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,projects,type Db} from '@creatoros/backend';
import {createAccountGroupService,createPlatformAccountService} from '../modules/platform-account';
import {createProjectRepository,createProjectsService} from '../modules/projects';
import type {RequestContext} from '@creatoros/contract';

const url=process.env.CREATOROS_TEST_POSTGRES_URL;
const cleanups:Array<()=>Promise<unknown>>=[];
const releases:Array<()=>void>=[];
afterEach(async()=>{for(const release of releases.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});releases.push(release);return {promise,release};}
function outcome<T>(promise:Promise<T>){let done=false;return {done:()=>done,result:promise.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};})};}
// 透明暂停SQL builder，保留真实transaction与真实数据库；不替换服务返回值或锁。
function pauseRootInsert(db:Db,paused:ReturnType<typeof gate>,resume:ReturnType<typeof gate>):Db {
 let pending=true;
 const builder=(value:any):any=>new Proxy(value,{get(target,key){
  if(key==='then')return async(resolve:any,reject:any)=>{if(pending){pending=false;paused.release();await resume.promise;}return target.then(resolve,reject);};
  const member=target[key];return typeof member==='function'?(...args:any[])=>{const next=member.apply(target,args);return next&&typeof next==='object'?builder(next):next;}:member;
 }});
 const wrap=(store:any):any=>new Proxy(store,{get(target,key){
  if(key==='transaction')return (callback:any,...args:any[])=>target.transaction((tx:any)=>callback(wrap(tx)),...args);
  if(key==='insert')return (table:any)=>table===projects?builder(target.insert(table)):target.insert(table);
  const member=target[key];return typeof member==='function'?member.bind(target):member;
 }});
 return wrap(db);
}
async function fixture(){
 if(!url)throw new Error('隔离PG URL缺失');const parsed=new URL(url);
 assertOwnedPostgresUrl(parsed.toString());
 const name=`t1022_create_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));
 parsed.pathname=`/${name}`;const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());
 const pool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});cleanups.push(()=>pool.end());
 const writer=drizzle(pool) as unknown as Db;let seq=0;const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const base:RequestContext={userId:`owner-${name}`,source:'user',requestId:'create-archive'};
 const groups=createAccountGroupService({db:runtime.db,...deps}),group=await groups.create(base,{name:'空组',idempotencyKey:'group'});
 const ctx={...base,groupId:group.id},service=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
 const counts=async()=>{const result=await runtime.pool.query('SELECT (SELECT count(*)::int FROM projects) AS roots,(SELECT count(*)::int FROM project_stages) AS stages,(SELECT count(*)::int FROM project_target_platforms) AS targets,(SELECT count(*)::int FROM project_activities) AS activities');return result.rows[0];};
 const watch=async(done:()=>boolean,writerSide:boolean)=>{for(let n=0;n<250;n++){
  const result=await runtime.pool.query(`SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND application_name ${writerSide?'=':'<>'} $2`,[name,`${name}_writer`]);
  if(result.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));
 }throw new Error('SQL既未完成也未进入真实Lock等待');};
 return {runtime,writer,deps,base,ctx,groups,group,service,counts,watch};
}
const command={title:'原子创建项目',creationMode:'free' as const,targetPlatforms:['douyin','xiaohongshu']};
it.skipIf(!url)('新建先锁组：归档真实等待，commit后root/7阶段/平台/活动一起可读',async()=>{
 const f=await fixture(),paused=gate(),resume=gate();
 const create=outcome(f.service(pauseRootInsert(f.writer,paused,resume)).createProject(f.ctx,command));await paused.promise;
 const archive=outcome(f.groups.archive(f.base,f.group.id,f.group.version));
 let waiting=false;try{waiting=await f.watch(archive.done,false);}finally{resume.release();}
 expect((await create.result).error).toBeUndefined();expect((await archive.result).error).toBeUndefined();expect(waiting).toBe(true);
 expect(await f.counts()).toEqual({roots:1,stages:7,targets:2,activities:1});
},180000);
it.skipIf(!url)('归档先锁组：新建真实等待，归档commit后拒绝且四族均无残行',async()=>{
 const f=await fixture(),paused=gate(),resume=gate();
 const archive=outcome(f.runtime.db.transaction(async tx=>{await createAccountGroupService({db:tx as unknown as Db,...f.deps}).archive(f.base,f.group.id,f.group.version);paused.release();await resume.promise;}));await paused.promise;
 const create=outcome(f.service(f.writer).createProject(f.ctx,command));let waiting=false;
 try{waiting=await f.watch(create.done,true);}finally{resume.release();}
 expect((await archive.result).error).toBeUndefined();expect((await create.result).error).toMatchObject({code:'OwnershipError'});expect(waiting).toBe(true);
 expect(await f.counts()).toEqual({roots:0,stages:0,targets:0,activities:0});
},180000);
for(const table of ['project_stages','project_target_platforms','project_activities']){
 it.skipIf(!url)(`${table}真实INSERT异常：整个公共createProject事务回滚且可以重新创建`,async()=>{
  const f=await fixture();
  await f.runtime.pool.query("CREATE FUNCTION fail_project_create() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced project create rollback'; END; $$ LANGUAGE plpgsql");
  await f.runtime.pool.query(`CREATE TRIGGER fail_project_create_trigger BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_project_create()`);
  await expect(f.service(f.writer).createProject(f.ctx,command)).rejects.toThrow('forced project create rollback');
  expect(await f.counts()).toEqual({roots:0,stages:0,targets:0,activities:0});
  await f.runtime.pool.query(`DROP TRIGGER fail_project_create_trigger ON ${table}`);
  await f.service(f.writer).createProject(f.ctx,command);expect(await f.counts()).toEqual({roots:1,stages:7,targets:2,activities:1});
 },180000);
}
it.skipIf(!url)('真实旧账号scope仍可完整创建，不把legacy账号隐式扩大成组scope',async()=>{
 const f=await fixture(),account=await createPlatformAccountService({db:f.runtime.db,...f.deps}).createAccount(f.base,{platform:'douyin',accountHandle:'旧账号'});
 const project=await f.service(f.writer).createProject({...f.base,accountId:account.id},command);
 expect(project.accountId).toBe(account.id);expect(project.groupId).toBe(`grp_legacy_${account.id}`);expect(await f.counts()).toEqual({roots:1,stages:7,targets:2,activities:1});
},180000);
it.skipIf(!url)('归档组合法采集历史导入仍完整写入，用户伪造imported不能放行',async()=>{
 const f=await fixture();await f.groups.archive(f.base,f.group.id,f.group.version);
 await expect(f.service(f.writer).createProject(f.ctx,{...command,source:'imported'})).rejects.toMatchObject({code:'OwnershipError'});
 expect(await f.counts()).toEqual({roots:0,stages:0,targets:0,activities:0});
 const project=await f.service(f.writer).createProject({...f.ctx,source:'ingestion',ingestionRunId:'verified-ingestion-run'},{...command,source:'imported',platformRef:{platform:'douyin',externalId:'historical-work'}});
 expect(project.source).toBe('imported');expect(project.groupId).toBe(f.group.id);expect(await f.counts()).toEqual({roots:1,stages:7,targets:2,activities:1});
},180000);
