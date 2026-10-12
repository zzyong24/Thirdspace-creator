import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {drizzle} from 'drizzle-orm/node-postgres';
import type {RequestContext} from '@creatoros/contract';
import {createRuntimeDb,type Db} from '../db';
import {createAccountGroupService} from '../modules/platform-account/account-group.service';
import {createGroupMigrationService} from '../modules/platform-account/group-migration.service';
import {createPlatformAccountService} from '../modules/platform-account/platform-account.service';
import {createMembershipLockService} from '../modules/platform-account/membership-lock.service';
import {createProjectsService} from '../modules/projects/projects.service';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createContentCalendarService} from '../modules/content-calendar/content-calendar.service';
import {createCalibrationService} from '../modules/calibration/calibration.service';
import {createPublishingService} from '../modules/publishing/publishing.service';
const url=process.env.CREATOROS_ISOLATED_PG_URL;
const cleanups:Array<()=>Promise<unknown>>=[],releases:Array<()=>void>=[];
afterEach(async()=>{for(const release of releases.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);releases.push(release);return {promise,release};}
function outcome(p:Promise<unknown>){let done=false;return {result:p.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};}),done:()=>done};}
// 透明观察真实Drizzle执行，只在已完成INSERT且仍处事务内暂停；不替换SQL、结果或锁。
function observeInserts(db:Db,table:string,observe:()=>Promise<void>):Db{
 const cache=new WeakMap<object,object>();
 const wrap=(value:any):any=>{
  if(!value||typeof value!=='object')return value;if(cache.has(value))return cache.get(value);
  const proxy=new Proxy(value,{get(target,key){
   if(key==='transaction')return (body:any,...args:any[])=>target.transaction((tx:any)=>body(wrap(tx)),...args);
   if(key==='then'&&typeof target.then==='function')return (resolve:any,reject:any)=>target.then(async(result:any)=>{
    const query=typeof target.toSQL==='function'?target.toSQL().sql:'';
    if(query.startsWith(`insert into "${table}"`))await observe();return result;
   }).then(resolve,reject);
   const item=Reflect.get(target,key,target);return typeof item==='function'?(...args:any[])=>wrap(item.apply(target,args)):item;
  }});cache.set(value,proxy);return proxy;
 };return wrap(db);
}
async function fixture(){
 if(!url)throw new Error('缺少显式隔离PG地址');const parsed=new URL(url);
 assertOwnedPostgresUrl(parsed.toString());
 const name=`t1022_adjacent_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());
 const pool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});cleanups.push(()=>pool.end());const writer=drizzle(pool) as unknown as Db;
 let seq=0;const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-${++seq}`,deps={db:runtime.db,now,nextId};
 const base:RequestContext={userId:`owner-${name}`,source:'user',requestId:'adjacent-parent-race'},groups=createAccountGroupService(deps);
 const from=(await groups.create(base,{name:'来源组',idempotencyKey:'from'})).id,to=(await groups.create(base,{name:'目标组',idempotencyKey:'to'})).id,ctx={...base,groupId:from};
 const projects=createProjectsService(createProjectRepository(runtime.db),deps),project=await projects.createProject(ctx,{title:'真实内容父项目',creationMode:'free',targetPlatforms:[]}),output=await projects.createOutput(ctx,project.id,{title:'真实稿件'});
 const accounts=createPlatformAccountService(deps),account=await accounts.createAccount(ctx,{platform:'douyin',accountHandle:'隔离测试账号'}),targetCtx={...ctx,accountId:account.id};
 const selection={fromGroupId:from,toGroupId:to,projectIds:[project.id],knowledgeIds:[],conversationIds:[]};
 const watch=async(done:()=>boolean,writerWait:boolean)=>{for(let attempt=0;attempt<300;attempt++){
  const rows=await runtime.pool.query(`SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND application_name ${writerWait?'=':'<>'} $2`,[name,`${name}_writer`]);
  if(rows.rows.some(r=>r.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(r=>setTimeout(r,10));
 }throw new Error('真实SQL未完成也未进入Lock等待');};
 return {runtime,writer,deps,ctx,targetCtx,from,to,project,output,projects,accounts,selection,watch};
}
const families=['calendar','calibration-output','calibration-publication','publication-create','publication-imported','publication-register'] as const;
for(const family of families)for(const order of ['stale-read','migration-first','writer-first'] as const){
 it.skipIf(!url)(`${family} ${order}：真实公共服务锁住实际父链并拒绝过期scope/digest`,async()=>{
  const f=await fixture(),paused=gate(),resume=gate();let observed=false;
  const pause=async()=>{if(!observed){observed=true;paused.release();await resume.promise;}};
  const table=family==='calendar'?'content_calendar_entries':family.startsWith('calibration')?'predictions':'publications';
  const writer=order==='writer-first'?observeInserts(f.writer,table,pause):f.writer;
  const read=async<T>(promise:Promise<T>)=>{const value=await promise;if(order==='stale-read')await pause();return value;};
  const publishing=createPublishingService({...f.deps,db:writer,membership:createMembershipLockService(writer),assertTargetAccount:(ctx,target)=>f.accounts.assertOwnedAccount(ctx,target.accountId,target.platform),resolveOutputOwner:(ctx,id)=>read(f.projects.getOutputOwnerSummary(ctx,id))});
  const calendar=createContentCalendarService({...f.deps,db:writer,clock:{now:f.deps.now},platformAccounts:{getAccount:async()=>({})},publishing:{isOutputPublished:async()=>false},candidates:{exists:async()=>false},notifications:{notify:async()=>{}},identity:{getEffectiveTimezone:async()=> 'UTC'},projects:{getScheduleProject:(ctx,id)=>read(f.projects.getScheduleProject(ctx,id))},schedulePublishing:{getProjectPublicationFact:async()=>null}});
  // 校准publication族使用真实已发布父行；公开当前组读取以真实publishing服务作归属检查。
  let publicationId:string|undefined;
  if(family==='calibration-publication'){
   const baseline=createPublishingService({...f.deps,membership:createMembershipLockService(f.runtime.db),assertTargetAccount:(ctx,target)=>f.accounts.assertOwnedAccount(ctx,target.accountId,target.platform),resolveOutputOwner:(ctx,id)=>f.projects.getOutputOwnerSummary(ctx,id)});
   publicationId=(await baseline.createImportedPublication(f.targetCtx,f.output.id,{platform:'douyin',externalId:'baseline-fact'})).id;
  }
  const calibration=createCalibrationService({...f.deps,db:writer,ingestion:{assertRunExists:async()=>{},ensureManualRun:async()=> 'manual'},learnings:{adjustConfidence:async()=>{}},assertSubjectOwned:(ctx,input)=>read<unknown>(input.subjectType==='publication'?publishing.getPublication(ctx,input.subjectId):f.projects.getOutput(ctx,input.subjectId))});
  const rubric=await calibration.createRubric(f.ctx,{name:'真实评分标准',dimensions:[{key:'altruism',label:'利他',weight:1}]}),version=await calibration.getCurrentRubricVersion(f.ctx,rubric.id);
  const fact={platform:'douyin',externalId:'isolated-fact',externalUrl:'https://example.test/work',publishedAt:f.deps.now(),accountReference:'隔离测试账号',title:'测试作品',description:''};
  const write=()=>family==='calendar'?calendar.createGroupEntry(f.ctx,f.from,{projectId:f.project.id,plannedDate:f.deps.now().slice(0,10)}):family.startsWith('calibration')?calibration.createPrediction(f.ctx,{subjectType:publicationId?'publication':'content_output',subjectId:publicationId??f.output.id,rubricVersionId:version.id,predictedMetrics:{},predictedConversion:{},confidence:'med'}):family==='publication-create'?publishing.createPublication(f.targetCtx,f.output.id,{platform:'douyin',accountReference:'隔离测试账号'}):family==='publication-imported'?publishing.createImportedPublication(f.targetCtx,f.output.id,fact):publishing.registerOwnerPublication(f.targetCtx,f.output.id,fact);
  const migrations=createGroupMigrationService({...f.deps,observePhase:order==='migration-first'?async phase=>{if(phase==='apply:validated')await pause();}:undefined}),preview=await migrations.preview(f.ctx,f.selection);
  const move=()=>migrations.apply(f.ctx,{...f.selection,digest:preview.digest,idempotencyKey:'migration'});
  if(order==='stale-read'){
   const writing=outcome(write());await paused.promise;expect((await move()).status).toBe('applied');resume.release();expect((await writing.result).error).toMatchObject({code:'OwnershipError'});
  }else if(order==='migration-first'){
   const moving=outcome(move());await paused.promise;const writing=outcome(write());let waited=false;
   try{waited=await f.watch(writing.done,true);}finally{resume.release();}
   expect(waited).toBe(true);expect((await moving.result).error).toBeUndefined();expect((await writing.result).error).toMatchObject({code:'OwnershipError'});
  }else{
   const writing=outcome(write());await paused.promise;const moving=outcome(move());let waited=false;
   try{waited=await f.watch(moving.done,false);}finally{resume.release();}
   expect(waited).toBe(true);expect((await writing.result).error).toBeUndefined();expect((await moving.result).error).toMatchObject({code:'ConflictError'});
  }
  const result=await f.runtime.pool.query(`SELECT group_id FROM projects WHERE id=$1`,[f.project.id]);expect(result.rows[0].group_id).toBe(order==='writer-first'?f.from:f.to);
  const rows=family==='calendar'?await f.runtime.pool.query('SELECT c.group_id,p.group_id AS parent_group FROM content_calendar_entries c JOIN projects p ON p.id=c.project_id WHERE p.id=$1',[f.project.id]):family.startsWith('calibration')?await f.runtime.pool.query('SELECT group_id FROM predictions WHERE rubric_version_id=$1',[version.id]):await f.runtime.pool.query('SELECT pub.group_id,p.group_id AS parent_group FROM publications pub JOIN content_outputs o ON o.id=pub.content_output_id JOIN projects p ON p.id=o.project_id WHERE p.id=$1',[f.project.id]);
  expect(rows.rows).toHaveLength(order==='writer-first'?1:0);if(rows.rows.length)expect(rows.rows[0].group_id).toBe(f.from);
 },180000);
}
