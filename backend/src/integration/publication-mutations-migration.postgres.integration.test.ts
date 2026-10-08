import {assets} from "../schema/assets";
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import type {RequestContext} from '@creatoros/contract';
import {createRuntimeDb,type Db} from '../db';
import {createAccountGroupService} from '../modules/platform-account/account-group.service';
import {createGroupMigrationService} from '../modules/platform-account/group-migration.service';
import {createPlatformAccountService} from '../modules/platform-account/platform-account.service';
import {createMembershipLockService} from '../modules/platform-account/membership-lock.service';
import {createProjectsService} from '../modules/projects/projects.service';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createPublishingService} from '../modules/publishing/publishing.service';
const url=process.env.CREATOROS_ISOLATED_PG_URL,cleanups:Array<()=>Promise<unknown>>=[],releases:Array<()=>void>=[];
afterEach(async()=>{for(const release of releases.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);releases.push(release);return {promise,release};}
function outcome(p:Promise<unknown>){let done=false;return {done:()=>done,result:p.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};})};}
// 透明观察Drizzle执行前，暂停原SQL；真正的group/project/output/publication锁必须由生产服务取得。
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
 if(!url)throw new Error('缺少显式隔离PG地址');const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55422')throw new Error('仅允许显式55422隔离测试服务');
 const name=`t1022_pubmut_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());const pool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});cleanups.push(()=>pool.end());const writer=drizzle(pool) as unknown as Db;
 let seq=0;const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-${++seq}`,base:RequestContext={userId:`owner-${name}`,requestId:'publication-mutation-race',source:'user'},deps={db:runtime.db,now,nextId};
 const groups=createAccountGroupService(deps),from=(await groups.create(base,{name:'来源组',idempotencyKey:'from'})).id,to=(await groups.create(base,{name:'目标组',idempotencyKey:'to'})).id,ctx={...base,groupId:from};
 const projects=createProjectsService(createProjectRepository(runtime.db),deps),project=await projects.createProject(ctx,{title:'真实发布项目',creationMode:'free',targetPlatforms:[]}),output=await projects.createOutput(ctx,project.id,{title:'真实稿件'});
 await runtime.db.insert(assets).values(["mock-cover","mock-historical-cover"].map(id=>({id,userId:ctx.userId,groupId:from,accountId:null,name:"真实测试封面元数据",assetType:"image",status:"active",createdAt:now(),updatedAt:now()})));
 const accounts=createPlatformAccountService(deps),account=await accounts.createAccount(ctx,{platform:'douyin',accountHandle:'真实隔离账号'}),targetCtx={...ctx,accountId:account.id};let sideEffects=0;
 const service=(db:Db=runtime.db)=>createPublishingService({...deps,db,membership:createMembershipLockService(db),assertTargetAccount:(ctx,target)=>accounts.assertOwnedAccount(ctx,target.accountId,target.platform),resolveOutputOwner:(ctx,id)=>projects.getOutputOwnerSummary(ctx,id),publisher:{publish:async()=>{sideEffects++;return {externalId:'mock-effect',externalUrl:'https://example.test/mock'};},remove:async()=>{sideEffects++;}}});
 const publication=await service().createPublication(targetCtx,output.id,{platform:'douyin',accountReference:'真实隔离账号'}),selection={fromGroupId:from,toGroupId:to,projectIds:[project.id],knowledgeIds:[],conversationIds:[]};
 const watch=async(done:()=>boolean,writerSide:boolean)=>{for(let attempt=0;attempt<300;attempt++){
  const r=await runtime.pool.query(`SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND application_name ${writerSide?'=':'<>'} $2`,[name,`${name}_writer`]);if(r.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(r=>setTimeout(r,10));
 }throw new Error('实际SQL未完成且未进入Lock等待');};
 return {runtime,writer,deps,base,ctx,targetCtx,from,to,groups,accounts,account,project,output,service,publication,selection,watch,sideEffects:()=>sideEffects};
}
for(const family of ['revision','cover','schedule','publish','visibility','platform-status','import-heal','adopt-draft'] as const)for(const order of ['writer-first','migration-first'] as const){
 it.skipIf(!url)(`${family} ${order}：已有publication公共写入锁住真实父链且版本指针原子`,async()=>{
  const f=await fixture(),paused=gate(),resume=gate();let once=false;
  const revision=['revision','cover','import-heal','adopt-draft'].includes(family),writer=order==='writer-first'?observeWrite(f.writer,revision?'publication_revisions':'publications',async()=>{if(!once){once=true;paused.release();await resume.promise;}}):f.writer;
  if(['visibility','platform-status','import-heal'].includes(family))await f.runtime.pool.query("UPDATE publications SET external_id='external',status='published' WHERE id=$1",[f.publication.id]);
  const service=f.service(writer),write=()=>family==='revision'?service.createRevision(f.targetCtx,f.publication.id,{title:'完整新版',description:'真实正文'}):family==='cover'?service.setCover(f.targetCtx,f.publication.id,'mock-cover'):family==='schedule'?service.transition(f.targetCtx,f.publication.id,{status:'scheduled'}):family==='publish'?service.transition(f.targetCtx,f.publication.id,{status:'published'}):family==='visibility'?service.setVisibilityByExternalKey(f.targetCtx,{platform:'douyin',externalId:'external',hidden:true}):family==='platform-status'?service.setPlatformStatusByExternalKey(f.targetCtx,{platform:'douyin',externalId:'external',platformStatus:'审核通过'}):family==='import-heal'?service.createImportedPublication({...f.targetCtx,source:'ingestion'},f.output.id,{platform:'douyin',externalId:'external',title:'补齐真实标题'}):service.adoptDraft(f.targetCtx,{outputId:f.output.id,platform:'douyin',adoptionKey:'实际候选',title:'完整平台稿',description:'完整正文',platformTags:[]});
  const migrations=createGroupMigrationService({...f.deps,observePhase:order==='migration-first'?async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}:undefined}),preview=await migrations.preview(f.ctx,f.selection),move=()=>migrations.apply(f.ctx,{...f.selection,digest:preview.digest,idempotencyKey:'move'});
  let writing:ReturnType<typeof outcome>,moving:ReturnType<typeof outcome>,waited=false;
  if(order==='writer-first'){writing=outcome(write());await paused.promise;moving=outcome(move());try{waited=await f.watch(moving.done,false);}finally{resume.release();}}
  else{moving=outcome(move());await paused.promise;writing=outcome(write());try{waited=await f.watch(writing.done,true);}finally{resume.release();}}
  expect(waited).toBe(true);const w=await writing.result,m=await moving.result;
  if(order==='writer-first'){expect(w.error).toBeUndefined();expect(m.error).toMatchObject({code:'ConflictError'});}else{expect(m.error).toBeUndefined();expect(w.error).toMatchObject({code:'OwnershipError'});expect(f.sideEffects()).toBe(0);}
  const rows=await f.runtime.pool.query('SELECT r.id,r.title,p.group_id,p.current_revision_id FROM publication_revisions r JOIN publications p ON p.id=r.publication_id WHERE p.content_output_id=$1',[f.output.id]);
  if(order==='migration-first')expect(rows.rows).toHaveLength(1);
  else if(revision){expect(rows.rows).toHaveLength(2);if(family!=='adopt-draft')expect(rows.rows.find(row=>row.title==='完整新版'||row.title==='补齐真实标题'||row.id!==f.publication.currentRevisionId)?.id).toBe(rows.rows[0].current_revision_id);}
  expect(rows.rows.every(row=>row.group_id===(order==='writer-first'?f.from:f.to))).toBe(true);
 },30000);
}
it.skipIf(!url)('采集metadata沿原冻结事实组：账号已转出且组已归档仍可补封面、可见性、审核状态',async()=>{
 const f=await fixture();await f.runtime.pool.query("UPDATE publications SET external_id='old-external',status='published' WHERE id=$1",[f.publication.id]);
 const preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:f.to});await f.groups.transfer(f.base,{...preview,idempotencyKey:'account-transfer'});
 await f.runtime.pool.query("UPDATE account_groups SET status='archived' WHERE id=$1",[f.from]);const frozen={...f.targetCtx,source:'ingestion' as const},service=f.service(f.writer);
 expect((await service.setCover(frozen,f.publication.id,'mock-historical-cover')).coverAssetId).toBe('mock-historical-cover');expect((await service.setVisibilityByExternalKey(frozen,{platform:'douyin',externalId:'old-external',hidden:true}))?.hiddenAt).not.toBeNull();expect((await service.setPlatformStatusByExternalKey(frozen,{platform:'douyin',externalId:'old-external',platformStatus:'审核通过'}))?.platformStatus).toBe('审核通过');
 const row=await f.runtime.pool.query('SELECT group_id,account_id FROM publications WHERE id=$1',[f.publication.id]);expect(row.rows[0]).toEqual({group_id:f.from,account_id:f.account.id});expect(f.sideEffects()).toBe(0);
},30000);

it.skipIf(!url)('真实孤儿publication可补采平台metadata并重锚到用户选择的真实新稿件，不造假parent',async()=>{
 const f=await fixture();await f.runtime.pool.query("UPDATE publications SET content_output_id='missing-historical-output',external_id='orphan-external',status='published' WHERE id=$1",[f.publication.id]);
 const service=f.service(f.writer),frozen={...f.targetCtx,source:'ingestion' as const};
 expect((await service.setVisibilityByExternalKey(frozen,{platform:'douyin',externalId:'orphan-external',hidden:true}))?.id).toBe(f.publication.id);
 expect((await service.setPlatformStatusByExternalKey(frozen,{platform:'douyin',externalId:'orphan-external',platformStatus:'审核通过'}))?.platformStatus).toBe('审核通过');
 await expect(service.createRevision(f.targetCtx,f.publication.id,{title:'不存在的内容不能编辑',description:''})).rejects.toMatchObject({code:'OwnershipError'});
 const repaired=await service.registerOwnerPublication(f.targetCtx,f.output.id,{platform:'douyin',externalId:'orphan-external'});expect(repaired.id).toBe(f.publication.id);expect(repaired.contentOutputId).toBe(f.output.id);expect(f.sideEffects()).toBe(0);
 expect((await f.runtime.pool.query("SELECT id FROM content_outputs WHERE id='missing-historical-output'")).rows).toEqual([]);
},30000);
