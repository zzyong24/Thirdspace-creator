import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import type {RequestContext} from '@creatoros/contract';
import {createRuntimeDb,type Db} from '../db';
import {createAccountGroupService} from '../modules/platform-account/account-group.service';
import {createCalibrationService} from '../modules/calibration/calibration.service';
import {createProjectsService} from '../modules/projects/projects.service';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {learnings} from '../schema/learnings';
const url=process.env.CREATOROS_ISOLATED_PG_URL,cleanups:Array<()=>Promise<unknown>>=[],releases:Array<()=>void>=[];
afterEach(async()=>{for(const release of releases.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);releases.push(release);return {promise,release};}
function outcome(p:Promise<unknown>){let done=false;return {done:()=>done,result:p.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};})};}
// 透明探针暂停真实INSERT/UPDATE即将执行的位置；保留原SQL和真实事务锁。
function observeWrite(db:Db,table:string,observe:()=>Promise<void>):Db{
 const cache=new WeakMap<object,object>();const wrap=(value:any):any=>{
  if(!value||typeof value!=='object')return value;if(cache.has(value))return cache.get(value);
  const proxy=new Proxy(value,{get(target,key){
   if(key==='transaction')return (body:any,...args:any[])=>target.transaction((tx:any)=>body(wrap(tx)),...args);
   if(key==='then'&&typeof target.then==='function')return async(resolve:any,reject:any)=>{
    const query=typeof target.toSQL==='function'?target.toSQL().sql:'';
    if(query.startsWith(`insert into "${table}"`)||query.startsWith(`update "${table}"`))await observe();return target.then(resolve,reject);
   };
   const item=Reflect.get(target,key,target);return typeof item==='function'?(...args:any[])=>wrap(item.apply(target,args)):item;
  }});cache.set(value,proxy);return proxy;
 };return wrap(db);
}
async function fixture(){
 if(!url)throw new Error('缺少显式隔离PG地址');const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55422')throw new Error('只允许显式55422隔离测试');
 const name=`t1022_calarchive_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());const pool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});cleanups.push(()=>pool.end());const writer=drizzle(pool) as unknown as Db;
 let seq=0;const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-${++seq}`,base:RequestContext={userId:`owner-${name}`,requestId:'calibration-archive',source:'user'},deps={db:runtime.db,now,nextId};
 const groups=createAccountGroupService(deps),group=await groups.create(base,{name:'真实校准组',idempotencyKey:'group'}),ctx={...base,groupId:group.id};
 const projects=createProjectsService(createProjectRepository(runtime.db),deps),project=await projects.createProject(ctx,{title:'真实项目',creationMode:'free',targetPlatforms:[]}),output=await projects.createOutput(ctx,project.id,{title:'真实稿件'});
 await runtime.db.insert(learnings).values({id:'learning',userId:ctx.userId,groupId:ctx.groupId,accountId:null,title:'人工确认经验',createdAt:now(),updatedAt:now()});
 const service=(db:Db=runtime.db)=>createCalibrationService({...deps,db,ingestion:{assertRunExists:async()=>{},ensureManualRun:async()=> 'manual'},learnings:{adjustConfidence:async()=>{}},assertSubjectOwned:(ctx,subject)=>projects.getOutput(ctx,subject.subjectId),assertLearningOwned:async()=>{}});
 const dimensions=[{key:'altruism',label:'利他',weight:1}],baseline=service(),rubric=await baseline.createRubric(ctx,{name:'初始量表',dimensions});
 const prediction=await baseline.createPrediction(ctx,{subjectType:'content_output',subjectId:output.id,rubricVersionId:rubric.currentVersionId,predictedMetrics:{},predictedConversion:{},confidence:'med'});
 const suggestion=await baseline.createRuleSuggestion(ctx,{learningId:'learning',rubricId:rubric.id,proposedDimension:{key:'altruism',label:'补充利他',weight:1,description:''},rationale:'实际回流'});
 const watch=async(done:()=>boolean,writerSide:boolean)=>{for(let attempt=0;attempt<300;attempt++){
  const r=await runtime.pool.query(`SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND application_name ${writerSide?'=':'<>'} $2`,[name,`${name}_writer`]);if(r.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(r=>setTimeout(r,10));
 }throw new Error('真实SQL未完成且未进入Lock等待');};
 return {runtime,writer,service,ctx,base,group,groups,deps,rubric,prediction,suggestion,dimensions,output,watch};
}
const families=['root','bump','prediction','draft-prediction','lock','result','suggestion','adopt','dismiss'] as const;
for(const family of families)for(const order of ['writer-first','archive-first'] as const){
 it.skipIf(!url)(`calibration ${family} ${order}：真实归档与公共写入串行且无半成品`,async()=>{
  const f=await fixture(),paused=gate(),resume=gate();let observed=false;
  const pause=async()=>{if(!observed){observed=true;paused.release();await resume.promise;}};
  const table=family==='root'?'rubrics':family==='bump'||family==='adopt'?'rubric_versions':family==='result'?'calibration_results':family==='suggestion'||family==='dismiss'?'calibration_rule_suggestions':'predictions';
  if(family==='result')await f.service().lockPrediction(f.ctx,f.prediction.id);
  // 另一个真实learning，避免建议创建的既有pending幂等早返。
  if(family==='suggestion')await f.runtime.db.insert(learnings).values({id:'new-learning',userId:f.ctx.userId,groupId:f.ctx.groupId,title:'另一真实经验',createdAt:f.deps.now(),updatedAt:f.deps.now()});
  const service=f.service(order==='writer-first'?observeWrite(f.writer,table,pause):f.writer);
  const predictionInput={subjectType:'content_output' as const,subjectId:f.output.id,rubricVersionId:f.rubric.currentVersionId,predictedMetrics:{},predictedConversion:{},confidence:'med' as const};
  const write=()=>family==='root'?service.createRubric(f.ctx,{name:'完整新量表',dimensions:f.dimensions}):family==='bump'?service.bumpRubricVersion(f.ctx,f.rubric.id,{dimensions:f.dimensions,changeSummary:'真实递增'}):family==='prediction'?service.createPrediction(f.ctx,predictionInput):family==='draft-prediction'?service.createDraftPrediction(f.ctx,predictionInput):family==='lock'?service.lockPrediction(f.ctx,f.prediction.id):family==='result'?service.recordResult(f.ctx,f.prediction.id,{ingestionRunId:'external-mock',actualMetrics:{}}):family==='suggestion'?service.createRuleSuggestion(f.ctx,{learningId:'new-learning',rubricId:f.rubric.id,proposedDimension:{key:'altruism',label:'利他',weight:1,description:''},rationale:'用户确认'}):family==='adopt'?service.adoptRuleSuggestion(f.ctx,f.suggestion.id):service.dismissRuleSuggestion(f.ctx,f.suggestion.id);
  const before=await f.runtime.pool.query('SELECT (SELECT count(*)::int FROM rubrics) AS rubrics,(SELECT count(*)::int FROM rubric_versions) AS versions,(SELECT count(*)::int FROM predictions) AS predictions,(SELECT count(*)::int FROM calibration_results) AS results,(SELECT count(*)::int FROM calibration_rule_suggestions) AS suggestions');
  let writing:ReturnType<typeof outcome>,archiving:ReturnType<typeof outcome>,waited=false;
  if(order==='writer-first'){
   writing=outcome(write());await paused.promise;archiving=outcome(f.groups.archive(f.base,f.group.id,f.group.version));try{waited=await f.watch(archiving.done,false);}finally{resume.release();}
  }else{
   archiving=outcome(f.runtime.db.transaction(async tx=>{await createAccountGroupService({...f.deps,db:tx as unknown as Db}).archive(f.base,f.group.id,f.group.version);paused.release();await resume.promise;}));await paused.promise;writing=outcome(write());try{waited=await f.watch(writing.done,true);}finally{resume.release();}
  }
  expect(waited).toBe(true);expect((await archiving.result).error).toBeUndefined();const result=await writing.result;
  if(order==='writer-first')expect(result.error).toBeUndefined();else expect(result.error).toMatchObject({code:'OwnershipError'});
  const after=await f.runtime.pool.query('SELECT (SELECT count(*)::int FROM rubrics) AS rubrics,(SELECT count(*)::int FROM rubric_versions) AS versions,(SELECT count(*)::int FROM predictions) AS predictions,(SELECT count(*)::int FROM calibration_results) AS results,(SELECT count(*)::int FROM calibration_rule_suggestions) AS suggestions');
  if(order==='archive-first')expect(after.rows).toEqual(before.rows);
  const partial=await f.runtime.pool.query('SELECT r.id FROM rubrics r LEFT JOIN rubric_versions v ON v.id=r.current_version_id WHERE r.current_version_id IS NULL OR v.id IS NULL');expect(partial.rows).toEqual([]);
 },30000);
}
it.skipIf(!url)('两个真实公共版本递增等待同一rubric锁，连续编号且指针指向最新完整版本',async()=>{
 const f=await fixture(),paused=gate(),resume=gate();let once=false;
 const first=f.service(observeWrite(f.writer,'rubric_versions',async()=>{if(!once){once=true;paused.release();await resume.promise;}})),a=outcome(first.bumpRubricVersion(f.ctx,f.rubric.id,{dimensions:f.dimensions,changeSummary:'先递增'}));await paused.promise;
 const b=outcome(f.service().bumpRubricVersion(f.ctx,f.rubric.id,{dimensions:f.dimensions,changeSummary:'后递增'}));let waited=false;try{waited=await f.watch(b.done,false);}finally{resume.release();}
 expect(waited).toBe(true);expect((await a.result).error).toBeUndefined();expect((await b.result).error).toBeUndefined();const rows=await f.runtime.pool.query('SELECT version_number FROM rubric_versions WHERE rubric_id=$1 ORDER BY version_number',[f.rubric.id]);expect(rows.rows.map(row=>row.version_number)).toEqual([1,2,3]);
 expect((await f.service().getRubric(f.ctx,f.rubric.id)).currentVersion.versionNumber).toBe(3);
},30000);
it.skipIf(!url)('公共初始化首版失败全部回滚，重试返回完整量表',async()=>{
 const f=await fixture(),before=await f.runtime.pool.query('SELECT count(*)::int AS n FROM rubrics');
 const broken=createCalibrationService({...f.deps,db:f.writer,nextId:prefix=>{if(prefix==='rubricver')throw new Error('真实首版中断');return f.deps.nextId(prefix);},ingestion:{assertRunExists:async()=>{},ensureManualRun:async()=> 'manual'},learnings:{adjustConfidence:async()=>{}}});
 await expect(broken.createRubric(f.ctx,{name:'不可留半成品',dimensions:f.dimensions})).rejects.toThrow('真实首版中断');expect((await f.runtime.pool.query('SELECT count(*)::int AS n FROM rubrics')).rows).toEqual(before.rows);
 expect((await f.service(f.writer).createRubric(f.ctx,{name:'完整重试',dimensions:f.dimensions})).currentVersion.versionNumber).toBe(1);
},30000);
