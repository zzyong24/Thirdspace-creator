import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {randomUUID} from 'node:crypto';
import {afterEach,expect,it} from 'vitest';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,type Db} from '../db';
import {projects,contentOutputs,projectStages,tasks,projectActivities} from '../schema/projects';
import {assets} from '../schema/assets';
import {resourceAccessGrants} from '../schema/resource-access';
import {eq} from 'drizzle-orm';
import {createAccountGroupService,createGroupMigrationService} from '../modules/platform-account';
import {createProjectRepository,createProjectsService} from '../modules/projects';
import type {RequestContext} from '@creatoros/contract';
const url=process.env.CREATOROS_TEST_POSTGRES_URL;
const activeGates:Array<()=>void>=[];
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const release of activeGates.splice(0))release();for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});activeGates.push(release);return {promise,release};}
function outcome(promise:Promise<unknown>){let done=false;const result=promise.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};});return {result,done:()=>done};}
async function fixture(){
 if(!url)throw new Error('isolated PG URL missing');const parsed=new URL(url);
 assertOwnedPostgresUrl(parsed.toString());
 const name=`t1022_move_${randomUUID().replaceAll('-','')}`;const admin=new Pool({connectionString:url});cleanups.push(()=>admin.end());
 await admin.query(`CREATE DATABASE ${name}`);cleanups.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));
 parsed.pathname=`/${name}`;const runtime=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>runtime.pool.end());
 const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});cleanups.push(()=>writerPool.end());
 const writer=drizzle(writerPool) as unknown as Db;let seq=0;
 const deps={db:runtime.db,now:()=>new Date().toISOString(),nextId:(p:string)=>`${p}-${++seq}`};
 const ctx:RequestContext={userId:`user-${name}`,source:'user',requestId:'migration-race'};
 const groups=createAccountGroupService(deps);
 const from=(await groups.create(ctx,{name:'来源组',idempotencyKey:'source'})).id,to=(await groups.create(ctx,{name:'目标组',idempotencyKey:'target'})).id;
 const publicProjects=createProjectsService(createProjectRepository(runtime.db),deps);
 const p=await publicProjects.createProject({...ctx,groupId:from},{title:'预览时的标题',creationMode:'free',targetPlatforms:[]});
 const selection={fromGroupId:from,toGroupId:to,projectIds:[p.id],knowledgeIds:[],conversationIds:[]};
 const watch=async(done:()=>boolean)=>{for(let attempt=0;attempt<200;attempt++){
  const r=await runtime.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name=$2",[name,`${name}_writer`]);
  if(r.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));
 }throw new Error('真实SQL未在时限内完成或进入Lock等待');};
 const watchMigration=async(done:()=>boolean)=>{for(let attempt=0;attempt<200;attempt++){
  const r=await runtime.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND application_name<>$2",[name,`${name}_writer`]);
  if(r.rows.some(row=>row.wait_event_type==='Lock'))return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));
 }throw new Error('真实迁移SQL未在时限内完成或进入Lock等待');};
 return {runtime,writer,writerPool,deps,ctx,from,to,p,selection,watch,watchMigration,publicProjects};
}
async function grantFixture(){
 const f=await fixture();const at=f.deps.now();
 await f.runtime.db.insert(assets).values({id:'origin-asset',userId:f.ctx.userId,groupId:f.from,accountId:null,name:'真实素材',assetType:'image',status:'active',createdAt:at,updatedAt:at});
 await f.runtime.db.insert(contentOutputs).values({id:'original-output',projectId:f.p.id,title:'原稿',contentType:'image',status:'draft',primaryAssetId:'origin-asset',createdAt:at,updatedAt:at});
 const service=createGroupMigrationService(f.deps),preview=await service.preview({...f.ctx,groupId:f.from},f.selection);
 const moved=await service.apply({...f.ctx,groupId:f.from},{...f.selection,digest:preview.digest,idempotencyKey:'move'});
 const other=await f.publicProjects.createProject({...f.ctx,groupId:f.to},{title:'目标组的另一项目',creationMode:'free',targetPlatforms:[]});
 const consumer={id:'new-consumer',projectId:other.id,title:'授权素材的新创作',contentType:'image',status:'draft',primaryAssetId:'origin-asset',createdAt:at,updatedAt:at};
 return {...f,moved,consumer};
}
it.skipIf(!url)('apply先校验：真实公共项目patch必须等待，不能把旧scope编辑搬入目标组',async()=>{
 const f=await fixture(),paused=gate(),resume=gate();
 const service=createGroupMigrationService({...f.deps,observePhase:async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}});
 const preview=await service.preview({...f.ctx,groupId:f.from},f.selection);
 const move=outcome(service.apply({...f.ctx,groupId:f.from},{...f.selection,digest:preview.digest,idempotencyKey:'move'}));await paused.promise;
 const writerService=createProjectsService(createProjectRepository(f.writer),f.deps);
 const patch=outcome(writerService.patchProject({...f.ctx,groupId:f.from},f.p.id,{title:'旧scope的迟到编辑'}));
 let blocked=false;try{blocked=await f.watch(patch.done);}finally{resume.release();}
 const migrated=await move.result;await patch.result;
 expect(blocked).toBe(true);expect(migrated.error).toBeUndefined();
 const [current]=await f.runtime.db.select().from(projects).where(eq(projects.id,f.p.id));expect(current?.groupId).toBe(f.to);expect(current?.title).toBe('预览时的标题');
},180000);
it.skipIf(!url)('项目patch先持锁：apply等待真实提交后必须重建digest拒绝过期预览',async()=>{
 const f=await fixture(),paused=gate(),resume=gate(),service=createGroupMigrationService(f.deps);
 const preview=await service.preview({...f.ctx,groupId:f.from},f.selection);
 const patch=outcome(f.writer.transaction(async tx=>{const svc=createProjectsService(createProjectRepository(tx as unknown as Db),f.deps);await svc.patchProject({...f.ctx,groupId:f.from},f.p.id,{title:'先提交的合法编辑'});paused.release();await resume.promise;}));await paused.promise;
 const move=outcome(service.apply({...f.ctx,groupId:f.from},{...f.selection,digest:preview.digest,idempotencyKey:'move'}));
 const waiting=await f.watchMigration(move.done);
 resume.release();await patch.result;const migrated=await move.result;
 expect(waiting).toBe(true);expect(migrated.error).toMatchObject({code:'ConflictError'});const [current]=await f.runtime.db.select().from(projects).where(eq(projects.id,f.p.id));expect(current?.groupId).toBe(f.from);expect(current?.title).toBe('先提交的合法编辑');
},180000);
it.skipIf(!url)('undo先校验：其他真实项目的新grant消费等待撤销，不能在撤销后留有效引用',async()=>{
 const f=await grantFixture(),paused=gate(),resume=gate();
 const service=createGroupMigrationService({...f.deps,observePhase:async phase=>{if(phase==='undo:validated'){paused.release();await resume.promise;}}});
 const undo=outcome(service.undo({...f.ctx,groupId:f.to},f.moved.id));await paused.promise;
 const consume=outcome(f.writer.insert(contentOutputs).values(f.consumer).returning());let blocked=false;
 try{blocked=await f.watch(consume.done);}finally{resume.release();}
 expect(blocked).toBe(true);expect((await undo.result).error).toBeUndefined();expect((await consume.result).error).toBeDefined();
 expect(await f.runtime.db.select().from(contentOutputs).where(eq(contentOutputs.id,f.consumer.id))).toEqual([]);
},180000);
it.skipIf(!url)('grant消费先持真实SHARE锁：undo等待commit后重验ledger，必须拒绝撤销',async()=>{
 const f=await grantFixture(),paused=gate(),resume=gate();
 const consume=outcome(f.writer.transaction(async tx=>{await tx.insert(contentOutputs).values(f.consumer);paused.release();await resume.promise;}));await paused.promise;
 const undo=outcome(createGroupMigrationService(f.deps).undo({...f.ctx,groupId:f.to},f.moved.id));
 const waiting=await f.watchMigration(undo.done);
 resume.release();expect(waiting).toBe(true);expect((await consume.result).error).toBeUndefined();expect((await undo.result).error).toMatchObject({code:'ConflictError'});
 const grants=await f.runtime.db.select().from(resourceAccessGrants).where(eq(resourceAccessGrants.migrationId,f.moved.id));expect(grants.every(row=>row.revokedAt===null)).toBe(true);
},180000);

for(const family of ['output','stage','task','activity'] as const){
 it.skipIf(!url)(`项目已开始移组：旧ctx的无scope ${family}公共写入等锁后必须拒绝`,async()=>{
  const f=await fixture(),paused=gate(),resume=gate(),at=f.deps.now(),id=`late-${family}`;
  const service=createGroupMigrationService({...f.deps,observePhase:async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}});
  const preview=await service.preview({...f.ctx,groupId:f.from},f.selection);
  const move=outcome(service.apply({...f.ctx,groupId:f.from},{...f.selection,digest:preview.digest,idempotencyKey:'move'}));await paused.promise;
  const repo=createProjectRepository(f.writer),ctx={...f.ctx,groupId:f.from};
  const child=outcome(family==='output'?repo.insertOutput(ctx,{id,projectId:f.p.id,title:'迟到稿件',contentType:'image',format:'',aspectRatio:'',targetDurationSeconds:0,status:'draft',contentRole:null,primaryAssetId:null,createdAt:at,updatedAt:at}):family==='stage'?repo.insertStages(ctx,[{id,projectId:f.p.id,stage:'race-stage',status:'pending',progressPct:0,skipped:false,startedAt:null,completedAt:null,updatedAt:at}]):family==='task'?repo.insertTask(ctx,{id,projectId:f.p.id,contentOutputId:null,stage:'script',title:'迟到任务',description:'',status:'todo',priority:3,dueAt:null,completedAt:null}):repo.appendActivity(ctx,{id,projectId:f.p.id,eventType:'race',entityType:'project',entityId:f.p.id,eventData:{},occurredAt:at}));
  let blocked=false;try{blocked=await f.watch(child.done);}finally{resume.release();}
  expect((await move.result).error).toBeUndefined();expect(blocked).toBe(true);expect((await child.result).error).toMatchObject({code:'OwnershipError'});
  const table=family==='output'?contentOutputs:family==='stage'?projectStages:family==='task'?tasks:projectActivities;
  expect(await f.runtime.db.select().from(table).where(eq(table.id,id))).toEqual([]);
 },180000);
}

for(const family of ['output','stage','task','activity'] as const){
 it.skipIf(!url)(`无scope ${family}公共写入先持锁：移组等提交后必须拒绝旧digest`,async()=>{
  const f=await fixture(),paused=gate(),resume=gate(),at=f.deps.now(),id=`first-${family}`;
  const service=createGroupMigrationService(f.deps),preview=await service.preview({...f.ctx,groupId:f.from},f.selection);
  const child=outcome(f.writer.transaction(async tx=>{
   const repo=createProjectRepository(tx as unknown as Db),ctx={...f.ctx,groupId:f.from};
   if(family==='output')await repo.insertOutput(ctx,{id,projectId:f.p.id,title:'先提交稿件',contentType:'image',format:'',aspectRatio:'',targetDurationSeconds:0,status:'draft',contentRole:null,primaryAssetId:null,createdAt:at,updatedAt:at});
   else if(family==='stage')await repo.insertStages(ctx,[{id,projectId:f.p.id,stage:'race-stage',status:'pending',progressPct:0,skipped:false,startedAt:null,completedAt:null,updatedAt:at}]);
   else if(family==='task')await repo.insertTask(ctx,{id,projectId:f.p.id,contentOutputId:null,stage:'script',title:'先提交任务',description:'',status:'todo',priority:3,dueAt:null,completedAt:null});
   else await repo.appendActivity(ctx,{id,projectId:f.p.id,eventType:'race',entityType:'project',entityId:f.p.id,eventData:{},occurredAt:at});
   paused.release();await resume.promise;
  }));await paused.promise;
  const move=outcome(service.apply({...f.ctx,groupId:f.from},{...f.selection,digest:preview.digest,idempotencyKey:'move'}));
  let waiting=false;try{waiting=await f.watchMigration(move.done);}finally{resume.release();}
  expect(waiting).toBe(true);expect((await child.result).error).toBeUndefined();expect((await move.result).error).toMatchObject({code:'ConflictError'});
  const [current]=await f.runtime.db.select().from(projects).where(eq(projects.id,f.p.id));expect(current?.groupId).toBe(f.from);
  const table=family==='output'?contentOutputs:family==='stage'?projectStages:family==='task'?tasks:projectActivities;
  expect(await f.runtime.db.select().from(table).where(eq(table.id,id))).toHaveLength(1);
 },180000);
}
