import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {beforeEach,afterEach,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
let store:Awaited<ReturnType<typeof createDb>>,seq=0;
const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-parent-${++seq}`;
const ctx={userId:'owner',groupId:'ga',accountId:null,requestId:'test',source:'user' as const};
beforeEach(async()=>{store=await createDb();await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','owner','甲',now(),now()),('gb','owner','乙',now(),now()); INSERT INTO projects(id,user_id,group_id,title,brief,creation_mode,status,current_stage,started_at,created_at,updated_at) VALUES('pa','owner','ga','项目甲','','guided','active','production',now(),now(),now()),('pb','owner','gb','项目乙','','guided','active','production',now(),now(),now()); INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('oa','pa','产出甲','video','drafting',now(),now()),('ob','pb','产出乙','video','drafting',now(),now());`);});
afterEach(async()=>store?.client.close());
import {createArtifactRepository} from './artifacts.repository';
function repo(groupId='ga'){return createArtifactRepository(store.db,{...ctx,groupId,now,nextId});}
it('创建作品不得只盖当前组而挂到其它组真实项目',async()=>{await expect(repo().create({projectId:'pb',title:'脚本',stage:'script',artifactType:'master_script'})).rejects.toThrow();expect((await store.client.query("SELECT id FROM artifacts")).rows).toEqual([]);});
it('结构化子项写必须锁并验证真实作品父项，跨组不能改正文',async()=>{const a=await repo().create({projectId:'pa',title:'脚本',stage:'script',artifactType:'master_script'});await repo().replaceStructuredContent(a.currentVersionId!,{scriptSections:[{sectionType:'body',content:'原内容'}]});await expect(repo('gb').replaceStructuredContent(a.currentVersionId!,{scriptSections:[{sectionType:'body',content:'越权内容'}]})).rejects.toThrow();expect((await repo().getScriptSections(a.currentVersionId!))[0]?.content).toBe('原内容');});

import {createArtifactsService} from './artifacts.service';

import {randomUUID} from 'node:crypto';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../../test-fixtures/owned-postgres';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createRuntimeDb,type Db,projects,contentOutputs,assets,eq,and} from '@creatoros/backend';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createGroupMigrationService} from '../platform-account/group-migration.service';
const pgUrl=process.env.CREATOROS_TEST_POSTGRES_URL,pgCleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const cleanup of pgCleanup.splice(0).reverse())await cleanup();});
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};};
function outcome<T>(promise:Promise<T>){let done=false;const result=promise.then(value=>{done=true;return {value,error:undefined};},error=>{done=true;return {value:undefined,error};});return {result,done:()=>done};}
async function pgFixture(){
 if(!pgUrl)throw Error('需显式隔离PG');const parsed=new URL(pgUrl);assertOwnedPostgresUrl(parsed.toString());
 const name=`t1022_artifacts_${randomUUID().replaceAll('-','')}`;const admin=new Pool({connectionString:pgUrl});pgCleanup.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);pgCleanup.push(()=>admin.query(`DROP DATABASE ${name} WITH (FORCE)`));parsed.pathname=`/${name}`;
 const runtime=await createRuntimeDb({connectionString:parsed.toString()});pgCleanup.push(()=>runtime.pool.end());const writerPool=new Pool({connectionString:parsed.toString(),max:1,application_name:`${name}_writer`});pgCleanup.push(()=>writerPool.end());const writer=drizzle(writerPool) as unknown as Db;
 let n=0;const deps={db:runtime.db,now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++n}`},user={userId:`user-${name}`,requestId:'race',source:'user' as const};const groups=createAccountGroupService(deps);const from=(await groups.create(user,{name:'来源',idempotencyKey:'source'})).id,to=(await groups.create(user,{name:'目标',idempotencyKey:'target'})).id;const scope={...user,groupId:from,accountId:null};const at=deps.now();
 await runtime.db.insert(projects).values({id:'parent-project',userId:user.userId,groupId:from,accountId:null,title:'真实项目',brief:'',creationMode:'free',status:'active',currentStage:'production',startedAt:at,createdAt:at,updatedAt:at});await runtime.db.insert(contentOutputs).values({id:'parent-output',projectId:'parent-project',title:'真实产出',contentType:'video',status:'drafting',createdAt:at,updatedAt:at});await runtime.db.insert(assets).values({id:'reference-asset',userId:user.userId,groupId:from,accountId:null,assetType:'video',name:'真实素材',status:'active',createdAt:at,updatedAt:at});
 const artifact=await createArtifactRepository(runtime.db,{...deps,...scope}).create({projectId:'parent-project',title:'真实脚本',stage:'script',artifactType:'master_script'});
 const selection={fromGroupId:from,toGroupId:to,projectIds:['parent-project'],knowledgeIds:[],conversationIds:[]};
 async function watch(done:()=>boolean){for(let i=0;i<200;i++){const result=await runtime.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name=$2 AND wait_event_type='Lock'",[name,`${name}_writer`]);if(result.rows.length)return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('未观察到真实SQL锁等待');}
 async function watchMigration(done:()=>boolean){for(let i=0;i<200;i++){const result=await runtime.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND application_name<>$2 AND pid<>pg_backend_pid() AND wait_event_type='Lock'",[name,`${name}_writer`]);if(result.rows.length)return true;if(done())return false;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('迁移未进入真实SQL锁等待');}
 return {runtime,writer,deps,scope,from,to,selection,watch,watchMigration,write:async(db:Db)=>{return createArtifactsService({...deps,db}).createVersion(scope,artifact.id,{contentText:'并发写入的合法正文'});}};
}
it.skipIf(!pgUrl)('真实PG迁移先校验：作品版本公共子项写等待并在旧scope拒绝',async()=>{
 const f=await pgFixture(),paused=gate(),resume=gate();const migrations=createGroupMigrationService({...f.deps,observePhase:async phase=>{if(phase==='apply:validated'){paused.release();await resume.promise;}}});const preview=await migrations.preview(f.scope,f.selection);const move=outcome(migrations.apply(f.scope,{...f.selection,digest:preview.digest,idempotencyKey:'move'}));await paused.promise;const write=outcome(f.write(f.writer));let blocked=false;try{blocked=await f.watch(write.done);}finally{resume.release();}expect(blocked).toBe(true);expect((await move.result).error).toBeUndefined();expect((await write.result).error).toBeDefined();
},180000);
it.skipIf(!pgUrl)('真实PG公共作品版本子项写先提交：迁移等待后重验digest拒绝过期预览',async()=>{
 const f=await pgFixture(),paused=gate(),resume=gate(),migrations=createGroupMigrationService(f.deps);const preview=await migrations.preview(f.scope,f.selection);const write=outcome(f.writer.transaction(async tx=>{await f.write(tx as unknown as Db);paused.release();await resume.promise;}));await paused.promise;const move=outcome(migrations.apply(f.scope,{...f.selection,digest:preview.digest,idempotencyKey:'move'}));let blocked=false;try{blocked=await f.watchMigration(move.done);}finally{resume.release();}expect(blocked).toBe(true);expect((await write.result).error).toBeUndefined();expect((await move.result).error).toMatchObject({code:'ConflictError'});
},180000);
