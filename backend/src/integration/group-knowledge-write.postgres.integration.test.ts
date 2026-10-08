import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,type Db} from '../db';
import {knowledgeItems,knowledgeRelations,knowledgeRevisions} from '../schema/knowledge';
import {createAccountGroupService,createGroupMigrationService} from '../modules/platform-account';
import {createKnowledgeRepository,createKnowledgeService} from '../modules/knowledge';
const url=process.env.CREATOROS_TEST_POSTGRES_URL;
const cleanup:Array<()=>Promise<unknown>>=[],releaseGates:Array<()=>void>=[];
afterEach(async()=>{for(const release of releaseGates.splice(0))release();for(const run of cleanup.splice(0).reverse())await run();});
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});releaseGates.push(release);return {promise,release};}
function outcome(promise:Promise<unknown>){let done=false;const result=promise.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};});return {result,done:()=>done};}
/** 透明观察实际SQL await点；递归传递实际transaction，只延迟提交，不替代授权或数据。 */
function pauseWrite(db:Db,table:unknown,reached:ReturnType<typeof gate>,resume:ReturnType<typeof gate>):Db{
 let pending=true;
 const builder=(value:any):any=>new Proxy(value,{get(target,key){if(key==='then')return async(resolve:any,reject:any)=>{if(pending){pending=false;reached.release();await resume.promise;}return target.then(resolve,reject);};const field=target[key];return typeof field==='function'?(...args:any[])=>{const next=field.apply(target,args);return next&&typeof next==='object'?builder(next):next;}:field;}});
 const wrap=(store:any):any=>new Proxy(store,{get(target,key){if(key==='transaction')return (callback:any,...args:any[])=>target.transaction((tx:any)=>callback(wrap(tx)),...args);const field=target[key];if(key==='insert'||key==='update'||key==='delete')return (selected:unknown)=>selected===table?builder(field.call(target,selected)):field.call(target,selected);return typeof field==='function'?field.bind(target):field;}});
 return wrap(db);
}
async function fixture(){
 if(!url)throw Error('只允许显式隔离测试PG');const parsed=new URL(url);
 if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55422')throw Error('只允许55422隔离服务器');
 const name=`t1022_knowledge_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanup.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);cleanup.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));
 parsed.pathname=`/${name}`;const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanup.push(()=>runtime.pool.end());const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:name+'_writer'});cleanup.push(()=>writerPool.end());const writer=drizzle(writerPool) as unknown as Db;
 let sequence=0;const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++sequence}`};
 const base={userId:name,requestId:'knowledge-race',source:'user' as const},groups=createAccountGroupService({db:runtime.db,...deps});
 const from=(await groups.create(base,{name:'原组',idempotencyKey:'from'})).id,to=(await groups.create(base,{name:'目标组',idempotencyKey:'to'})).id,ctx={...base,groupId:from};
 const service=createKnowledgeService(createKnowledgeRepository(runtime.db,deps)),first=await service.createKnowledge(ctx,{title:'原始知识',content:'原文'}),second=await service.createKnowledge(ctx,{title:'第二知识',content:'第二原文'});
 async function waitLock(writerSide:boolean,done:()=>boolean){for(let attempt=0;attempt<250;attempt++){
  const rows=await runtime.pool.query(`SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND ${writerSide?'application_name=$2':'application_name<>$2'}`,[name,name+'_writer']);
  if(rows.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));
 }throw Error('没有观察到真实SQL锁等待');}
 return {runtime,writer,deps,base,from,to,ctx,first,second,waitLock};
}
for(const family of ['revision','archive','rename','relation-source','relation-target'] as const){
 for(const writerFirst of [true,false])it.skipIf(!url)(`知识${family}：${writerFirst?'写入先持锁，归组重验':'归组先持锁，旧组写入拒绝'}`,async()=>{
  const f=await fixture(),reached=gate(),resume=gate(),chosen=family==='relation-target'?f.second:f.first;
  const selection={fromGroupId:f.from,toGroupId:f.to,projectIds:[],knowledgeIds:[chosen.id],conversationIds:[]};
  const migration=createGroupMigrationService({db:f.runtime.db,...f.deps,observePhase:writerFirst?undefined:async phase=>{if(phase==='apply:validated'){reached.release();await resume.promise;}}});
  const preview=await migration.preview(f.ctx,selection);
  const db=writerFirst?pauseWrite(f.writer,family==='revision'?knowledgeRevisions:family.startsWith('relation')?knowledgeRelations:knowledgeItems,reached,resume):f.writer;
  const repo=createKnowledgeRepository(db,f.deps),service=createKnowledgeService(repo);
  const write=()=>family==='revision'?service.createRevision(f.ctx,f.first.id,{content:'追加正文'}):family==='archive'?service.archiveKnowledge(f.ctx,f.first.id):family==='rename'?repo.renameTitle(f.base.userId,{kind:'group',id:f.from},f.first.id,'新标题'):service.createRelation(f.ctx,f.first.id,{targetKnowledgeId:f.second.id,relationType:'related'});
  const move=()=>migration.apply(f.ctx,{...selection,digest:preview.digest,idempotencyKey:'move'});
  let writeResult,moveResult;
  if(writerFirst){const writing=outcome(write());await reached.promise;const moving=outcome(move());let blocked=false;try{blocked=await f.waitLock(false,moving.done);}finally{resume.release();}expect(blocked).toBe(true);writeResult=await writing.result;moveResult=await moving.result;expect(writeResult.error).toBeUndefined();expect(moveResult.error).toMatchObject({code:'ConflictError'});}
  else{const moving=outcome(move());await reached.promise;const writing=outcome(write());let blocked=false;try{blocked=await f.waitLock(true,writing.done);}finally{resume.release();}expect(blocked).toBe(true);moveResult=await moving.result;writeResult=await writing.result;expect(moveResult.error).toBeUndefined();expect(writeResult.error).toMatchObject({code:'OwnershipError'});}
  const row=(await f.runtime.pool.query('SELECT group_id,title,status FROM knowledge_items WHERE id=$1',[chosen.id])).rows[0];
  expect(row.group_id).toBe(writerFirst?f.from:f.to);
  if(!writerFirst){expect(row.title).toBe(family==='relation-target'?'第二知识':'原始知识');expect(row.status).toBe('active');expect((await f.runtime.pool.query('SELECT content FROM knowledge_revisions WHERE knowledge_item_id=$1 ORDER BY revision_number',[f.first.id])).rows).toEqual([{content:'原文'}]);expect((await f.runtime.pool.query('SELECT id FROM knowledge_relations')).rows).toEqual([]);expect((await createKnowledgeService(createKnowledgeRepository(f.runtime.db,f.deps)).getKnowledge({...f.base,groupId:f.to},chosen.id)).id).toBe(chosen.id);}
 },30000);
}
