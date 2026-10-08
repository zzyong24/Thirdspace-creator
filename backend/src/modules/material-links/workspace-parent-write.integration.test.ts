import {beforeEach,afterEach,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
let store:Awaited<ReturnType<typeof createDb>>,seq=0;
const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-parent-${++seq}`;
const ctx={userId:'owner',groupId:'ga',accountId:null,requestId:'test',source:'user' as const};
beforeEach(async()=>{store=await createDb();await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','owner','甲',now(),now()),('gb','owner','乙',now(),now()); INSERT INTO projects(id,user_id,group_id,title,brief,creation_mode,status,current_stage,started_at,created_at,updated_at) VALUES('pa','owner','ga','项目甲','','guided','active','production',now(),now(),now()),('pb','owner','gb','项目乙','','guided','active','production',now(),now(),now()); INSERT INTO assets(id,user_id,group_id,asset_type,name,status,created_at,updated_at) VALUES('asset-reference','owner','ga','video','真实素材','active',now(),now()); INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('oa','pa','产出甲','video','drafting',now(),now()),('ob','pb','产出乙','video','drafting',now(),now());`);});
afterEach(async()=>store?.client.close());
import {createMaterialLinkRepository} from './material-links.repository';
function repo(){return createMaterialLinkRepository(store.db,{...ctx,now,nextId});}
it('真实用料父项目在其它组时拒绝写边，不把当前ctx变成父组',async()=>{await expect(repo().create({projectId:'pb',entityType:'asset',entityId:'asset-reference'})).rejects.toThrow();expect((await store.client.query('SELECT id FROM material_links')).rows).toEqual([]);});
it('迁移后的父项不允许旧组继续删除用料边',async()=>{const link=await repo().create({projectId:'pa',entityType:'asset',entityId:'asset-reference'});await store.client.exec("UPDATE projects SET group_id='gb' WHERE id='pa'");await expect(repo().delete(link.id)).rejects.toThrow();expect((await store.client.query('SELECT id FROM material_links WHERE id=$1',[link.id])).rows).toEqual([{id:link.id}]);});

import {createMaterialLinksService} from './material-links.service';
it('无工作区的公共用料读取拒绝，不把空scope扩大为该用户所有组',async()=>{
 await repo().create({projectId:'pa',entityType:'asset',entityId:'asset-reference'});
 const unselected={...ctx,groupId:null,accountId:null};
 await expect(createMaterialLinksService({db:store.db,now,nextId}).list(unselected,{page:1,pageSize:10})).rejects.toThrow();
 await expect(createMaterialLinkRepository(store.db,{userId:ctx.userId,now,nextId}).list(null,{})).rejects.toThrow();
 expect((await createMaterialLinksService({db:store.db,now,nextId,assertProjectOwned:async()=>({groupId:'ga'})}).list(ctx,{page:1,pageSize:10})).rows).toHaveLength(1);
});

import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,type Db,projects,contentOutputs,assets,eq,and} from '@creatoros/backend';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createGroupMigrationService} from '../platform-account/group-migration.service';
const pgUrl=process.env.CREATOROS_TEST_POSTGRES_URL,pgCleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const cleanup of pgCleanup.splice(0).reverse())await cleanup();});
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};};
function outcome<T>(promise:Promise<T>){let done=false;const result=promise.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};});return {result,done:()=>done};}
async function pgFixture(){
 if(!pgUrl)throw Error('需显式隔离PG');const parsed=new URL(pgUrl);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55422')throw Error('只允许55422隔离测试服务');
 const name=`t1022_material_links_${randomUUID().replaceAll('-','')}`;const admin=new Pool({connectionString:pgUrl});pgCleanup.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);pgCleanup.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});pgCleanup.push(()=>runtime.pool.end());const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});pgCleanup.push(()=>writerPool.end());const writer=drizzle(writerPool) as unknown as Db;
 let n=0;const deps={db:runtime.db,now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++n}`},user={userId:`user-${name}`,requestId:'race',source:'user' as const};const groups=createAccountGroupService(deps);const from=(await groups.create(user,{name:'来源',idempotencyKey:'source'})).id,to=(await groups.create(user,{name:'目标',idempotencyKey:'target'})).id;const scope={...user,groupId:from,accountId:null};const at=deps.now();
 await runtime.db.insert(projects).values({id:'parent-project',userId:user.userId,groupId:from,accountId:null,title:'真实项目',brief:'',creationMode:'free',status:'active',currentStage:'production',startedAt:at,createdAt:at,updatedAt:at});await runtime.db.insert(contentOutputs).values({id:'parent-output',projectId:'parent-project',title:'真实产出',contentType:'video',status:'drafting',createdAt:at,updatedAt:at});await runtime.db.insert(assets).values({id:'reference-asset',userId:user.userId,groupId:from,accountId:null,assetType:'video',name:'真实素材',status:'active',createdAt:at,updatedAt:at});
 
 const selection={fromGroupId:from,toGroupId:to,projectIds:['parent-project'],knowledgeIds:[],conversationIds:[]};
 async function watch(done:()=>boolean){for(let i=0;i<200;i++){const result=await runtime.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name=$2 AND wait_event_type='Lock'",[name,`${name}_writer`]);if(result.rows.length)return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('未观察到真实SQL锁等待');}
 async function watchMigration(done:()=>boolean){for(let i=0;i<200;i++){const result=await runtime.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name<>$2 AND pid<>pg_backend_pid() AND wait_event_type='Lock'",[name,`${name}_writer`]);if(result.rows.length)return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('迁移未进入真实SQL锁等待');}
 return {runtime,writer,deps,scope,from,to,selection,watch,watchMigration,write:async(db:Db)=>{return createMaterialLinksService({...deps,db,assertProjectOwned:async(c,id)=>{const [p]=await db.select().from(projects).where(and(eq(projects.id,id),eq(projects.userId,c.userId),eq(projects.groupId,c.groupId!)));if(!p)throw Error('项目不存在');return p;},assertAssetOwned:async(c,id)=>{const [a]=await db.select().from(assets).where(and(eq(assets.id,id),eq(assets.userId,c.userId),eq(assets.groupId,c.groupId!)));if(!a)throw Error('素材不存在');return a;}}).create(scope,{projectId:'parent-project',entityType:'asset',entityId:'reference-asset'});}};
}
it.skipIf(!pgUrl)('真实PG迁移先校验：用料链公共子项写等待并在旧scope拒绝',async()=>{
 const f=await pgFixture(),paused=gate(),resume=gate();const migrations=createGroupMigrationService({...f.deps,observePhase:async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}});const preview=await migrations.preview(f.scope,f.selection);const move=outcome(migrations.apply(f.scope,{...f.selection,digest:preview.digest,idempotencyKey:'move'}));await paused.promise;const write=outcome(f.write(f.writer));let blocked=false;try{blocked=await f.watch(write.done);}finally{resume.release();}expect(blocked).toBe(true);expect((await move.result).error).toBeUndefined();expect((await write.result).error).toBeDefined();
},30000);
it.skipIf(!pgUrl)('真实PG公共用料链子项写先提交：迁移等待后重验digest拒绝过期预览',async()=>{
 const f=await pgFixture(),paused=gate(),resume=gate(),migrations=createGroupMigrationService(f.deps);const preview=await migrations.preview(f.scope,f.selection);const write=outcome(f.writer.transaction(async tx=>{await f.write(tx as unknown as Db);paused.release();await resume.promise;}));await paused.promise;const move=outcome(migrations.apply(f.scope,{...f.selection,digest:preview.digest,idempotencyKey:'move'}));let blocked=false;try{blocked=await f.watchMigration(move.done);}finally{resume.release();}expect(blocked).toBe(true);expect((await write.result).error).toBeUndefined();expect((await move.result).error).toMatchObject({code:'ConflictError'});
},30000);
