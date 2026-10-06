import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {readCatalog} from './migration-convergence';
it('FK引用的独立唯一索引与partial predicate保留，约束自有唯一索引排除',async()=>{
 const client=new PGlite();try{await client.exec(`CREATE TABLE parent(id text PRIMARY KEY,owner text NOT NULL,scope text,UNIQUE(owner,scope)); CREATE UNIQUE INDEX parent_owner_idx ON parent(owner); CREATE UNIQUE INDEX parent_partial_idx ON parent(scope) WHERE scope IS NOT NULL; CREATE TABLE child(owner text REFERENCES parent(owner));`);
 const catalog=await readCatalog(drizzle(client) as never);expect(catalog.indexes.some(r=>r.name==='parent_owner_idx')).toBe(true);expect(catalog.indexes.find(r=>r.name==='parent_partial_idx')?.definition).toContain('WHERE (scope IS NOT NULL)');expect(catalog.indexes.some(r=>r.name==='parent_owner_scope_key')).toBe(false);
 await client.exec(`INSERT INTO parent VALUES('p','u','s'); INSERT INTO child VALUES('u');`);await expect(client.exec(`INSERT INTO parent VALUES('p2','u','s2');`)).rejects.toMatchObject({code:'23505'});
 }finally{await client.close();}
},30000);

import {afterEach,vi} from 'vitest';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle as drizzlePg} from 'drizzle-orm/node-postgres';
import {migrate as migratePg} from 'drizzle-orm/node-postgres/migrator';
import {createDb,createRuntimeDb} from './db';
import {CONVERGENCE_WHEN} from './migration-convergence';
const folder=fileURLToPath(new URL('../drizzle',import.meta.url));
const roots:string[]=[];
afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
vi.setConfig({testTimeout:180000,hookTimeout:180000});
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
type Client={query:(s:string,args?:unknown[])=>Promise<{rows:any[]}>};
async function newRoot(){const r=await mkdtemp(join(tmpdir(),'t1062-complete-lineage-'));roots.push(r);await mkdir(join(r,'media'));await writeFile(join(r,'media','source-original.mp4'),'fixture media bytes');return r;}
async function has(c:Client,t:string){return(await c.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS present`)).rows[0].present;}
async function hasCol(c:Client,t:string,column:string){return(await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,[t,column])).rows.length>0;}
async function seed(c:Client,root:string){
 const time='2026-10-01T00:00:00Z';
 await c.query("INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('old-account','old-user','douyin','原账号',$1,$1)",[time]);
 await c.query("INSERT INTO projects(id,user_id,account_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('old-project','old-user','old-account','原项目','active','script','manual',$1,$1,$1)",[time]);
 await c.query("INSERT INTO assets(id,user_id,account_id,asset_type,name,created_at,updated_at) VALUES('old-asset','old-user','old-account','video','原片',$1,$1)",[time]);
 await c.query("INSERT INTO asset_files(id,asset_id,version_number,storage_key,mime_type,file_size,created_at) VALUES('old-file','old-asset',1,'source-original.mp4','video/mp4',19,$1)",[time]);
 await c.query("INSERT INTO storage_configs(user_id,backend,root_path,created_at,updated_at) VALUES('old-user','local',$1,$2,$2)",[join(root,'media'),time]);
 await c.query("INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('old-output','old-project','原作品','video','draft',$1,$1)",[time]);
 await c.query("INSERT INTO productions(id,user_id,content_output_id,recording_config,subtitle_config,updated_at) VALUES('old-production','old-user','old-output',$1::jsonb,$2::jsonb,$3)",[JSON.stringify({sourceAssetId:'old-asset',sourceFileId:'old-file',storageKey:'source-original.mp4',requestDigest:'frozen-source-digest'}),JSON.stringify({subtitles:[{text:'原话',startMs:10,endMs:700}]}),time]);
 await c.query("INSERT INTO production_segments(id,user_id,production_id,title,start_ms,end_ms,segment_config) VALUES('old-segment','old-user','old-production','原片段',10,700,$1::jsonb)",[JSON.stringify({digest:'original-token-digest',sourceFileId:'old-file'})]);
 if(await has(c,'account_groups')){
  await c.query("INSERT INTO account_groups VALUES('grp_legacy_old-account','old-user','原归档组','archived',9,$1,$1),('moved-group','old-user','当前组','active',5,$1,$1)",[time]);
  await c.query("INSERT INTO account_group_memberships VALUES('history-old','old-user','grp_legacy_old-account','old-account',6,$1,$2),('history-current','old-user','moved-group','old-account',7,$2,NULL)",[time,'2026-10-02T00:00:00Z']);
  await c.query("UPDATE projects SET group_id='grp_legacy_old-account' WHERE id='old-project'");await c.query("UPDATE assets SET group_id='grp_legacy_old-account' WHERE id='old-asset'");
  await c.query("INSERT INTO account_group_migrations(id,user_id,from_group_id,to_group_id,idempotency_key,input_hash,status,before_image,after_digest,created_at) VALUES('old-migration','old-user','grp_legacy_old-account','moved-group','old-move-key','old-input-digest','applied',$1::jsonb,'old-after-digest',$2)",[JSON.stringify({oldProjectId:'old-project',fileId:'old-file'}),time]);
  await c.query("INSERT INTO assets(id,user_id,account_id,asset_type,name,created_at,updated_at) VALUES('old-unassigned-asset','old-user','old-account','image','显式未归组旧素材',$1,$1)",[time]);await c.query("UPDATE assets SET group_id=NULL WHERE id='old-unassigned-asset'");
 }
 await c.query("INSERT INTO ai_tasks(id,user_id,account_id,project_id,content_output_id,task_type,status,input_data,idempotency_key,requested_at,request_fingerprint) VALUES('old-task','old-user','old-account','old-project','old-output','transcription','succeeded',$1::jsonb,'old-task-key',$2,'frozen-task-fingerprint')",[JSON.stringify({sourceFileId:'old-file',requestDigest:'frozen-task-input',scope:'historic original account'}),time]);
 if(await hasCol(c,'ai_tasks','group_id'))await c.query("UPDATE ai_tasks SET group_id='grp_legacy_old-account',group_version=9,membership_version=6 WHERE id='old-task'");
 if(await has(c,'creative_canvases')){
  await c.query("INSERT INTO creative_canvases(id,user_id,account_id,title,project_id,document_json,revision,created_at,updated_at) VALUES('old-canvas','old-user','old-account','原画布','old-project',$1::jsonb,7,$2,$2)",[JSON.stringify({schemaVersion:1,nodes:[{id:'n',assetId:'old-asset',assetFileId:'old-file'}],edges:[]}),time]);
  await c.query("INSERT INTO canvas_generation_links(id,user_id,account_id,canvas_id,node_id,attempt_id,task_id,input_revision,input_digest,input_json,result_asset_id,created_at,updated_at) VALUES('old-link','old-user','old-account','old-canvas','n','old-attempt','old-task',7,'frozen-canvas-input',$1::jsonb,'old-asset',$2,$2)",[JSON.stringify({prompt:'原输入',sourceFileId:'old-file'}),time]);
  await c.query("INSERT INTO canvas_agent_proposals(id,user_id,account_id,canvas_id,base_revision,operations_json,status,created_at,expires_at) VALUES('old-proposal','old-user','old-account','old-canvas',7,$1::jsonb,'pending',$2,$3)",[JSON.stringify([{type:'history-only',digest:'frozen-proposal'}]),time,'2026-10-09T00:00:00Z']);
 }
 if(await has(c,'creative_canvases'))await c.query("INSERT INTO creative_canvases(id,user_id,account_id,title,document_json,revision,created_at,updated_at) VALUES('orphan-canvas','old-user','unknown-legacy-account','待归组画布',$1::jsonb,12,$2,$2)",[JSON.stringify({sourceFileId:'old-file',orphan:'retain-not-guess'}),time]);
 if(await has(c,'visual_template_favorites'))await c.query("INSERT INTO visual_template_favorites(id,user_id,account_id,snapshot,revision,created_at,updated_at) VALUES('old-favorite','old-user','old-account',$1::jsonb,4,$2,$2)",[JSON.stringify({snapshot:'private fixture',assetFileId:'old-file'}),time]);
 if(await has(c,'work_compositions')){
  await c.query("INSERT INTO creative_results(id,user_id,account_id,project_id,output_id,output_type,kind,owner,request_digest,client_request_id,status,created_at,updated_at) VALUES('old-result-a','old-user','old-account','old-project','old-output','video','title','fixture','original-result-digest-a','reused-old-account-key','succeeded',$1,$1),('old-result-b','old-user','other-old-account','old-project','old-output','video','title','fixture','original-result-digest-b','reused-old-account-key','succeeded',$1,$1)",[time]);
  await c.query("INSERT INTO work_compositions VALUES('old-composition','old-user','old-account','old-project',3,$1,$1)",[time]);
  await c.query("INSERT INTO work_composition_versions VALUES('old-composition-version','old-composition',3,$1::jsonb,$2)",[JSON.stringify({fileId:'old-file',digest:'composition-original'}),time]);
  await c.query("INSERT INTO work_material_receipts VALUES('old-material-receipt','old-user','old-account','old-composition','old-material-key','frozen-material-digest',$1::jsonb,$2)",[JSON.stringify({fileId:'old-file',input:'original material'}),time]);
  await c.query("INSERT INTO production_media_requests(id,user_id,account_id,output_id,request_id,request_digest,kind,frozen_input,task_id,created_at) VALUES('old-media-request','old-user','old-account','old-output','old-media-key','frozen-media-request','transcription',$1::jsonb,'old-task',$2)",[JSON.stringify({sourceFileId:'old-file',storageKey:'source-original.mp4',sourceCommitDigest:'frozen-source-commit'}),time]);
 }
 if(await has(c,'production_edit_versions'))await c.query("INSERT INTO production_edit_versions(id,user_id,production_id,revision,request_id,request_digest,plan_digest,source,plan,created_at) VALUES('old-edit','old-user','old-production',8,'old-edit-request','frozen-request-digest','frozen-plan-digest','editor',$1::jsonb,$2)",[JSON.stringify({sourceFileId:'old-file',tokenIds:['old-token'],nativePatch:{beforeDigest:'keep-before'}}),time]);
}
async function snapshot(c:Client,known?:Record<string,string[]>){
 const cols=known??{};if(!known)for(const r of(await c.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows)(cols[r.table_name]??=[]).push(r.column_name);
 const rows:Record<string,unknown>={},counts:Record<string,number>={};for(const [t,names]of Object.entries(cols)){counts[t]=Number((await c.query(`SELECT count(*) AS n FROM ${quote(t)}`)).rows[0].n);if(t==='page_read_revision')continue;const projected=names.map(n=>`'${n}',${quote(n)}`).join(',');rows[t]=(await c.query(`SELECT jsonb_build_object(${projected}) AS row FROM ${quote(t)} ORDER BY 1::text`)).rows.map(r=>r.row).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
 return{columns:cols,rows,counts,ledger:await hasLedger(c)?(await c.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows:[]};
}
async function hasLedger(c:Client){return(await c.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present")).rows[0].present;}
let canonical:unknown;
it.each(['fresh','root','diagnostic','canvas'] as const)('完整%s原账本 public createDb 双启，旧ID/digest/storage/history/全量catalog保持',async kind=>{
 const r=await newRoot(),dataDir=join(r,'db');let before:Awaited<ReturnType<typeof snapshot>>|undefined;
 if(kind!=='fresh'){const old=new PGlite(dataDir);try{await migrate(drizzle(old),{migrationsFolder:join(folder,'lineages',kind)});await seed(old as Client,r);before=await snapshot(old as Client);}finally{await old.close();}}
 const first=await createDb({dataDir});let after:unknown;try{
  const catalog=await readCatalog(first.db);if(canonical)expect(catalog).toEqual(canonical);else canonical=catalog;
  const current=await snapshot(first.client as Client,before?.columns);if(before){expect(current.rows).toEqual(before.rows);expect(current.counts).toEqual(before.counts);for(const receipt of before.ledger)expect(current.ledger).toContainEqual(receipt);}
  expect(current.ledger.filter(r=>Number(r.created_at)===CONVERGENCE_WHEN)).toHaveLength(1);
  if(kind==='root'){expect((await first.client.query<{group_id:string|null}>("SELECT group_id FROM assets WHERE id='old-unassigned-asset'")).rows).toEqual([{group_id:null}]);expect((await first.client.query("SELECT id,group_id,left_at,version FROM account_group_memberships ORDER BY id")).rows).toEqual([{id:'history-current',group_id:'moved-group',left_at:null,version:7},{id:'history-old',group_id:'grp_legacy_old-account',left_at:'2026-10-02T00:00:00Z',version:6}]);expect((await first.client.query("SELECT status,version FROM account_groups WHERE id='grp_legacy_old-account'")).rows).toEqual([{status:'archived',version:9}]);}
  if(kind==='diagnostic'||kind==='canvas')expect((await first.client.query<{group_id:string|null}>("SELECT group_id FROM creative_canvases WHERE id='orphan-canvas'")).rows).toEqual([{group_id:null}]);
  if(kind!=='fresh')expect((await first.client.query<{group_id:string|null}>("SELECT group_id FROM productions WHERE id='old-production'")).rows[0]?.group_id).toBe('grp_legacy_old-account');
  if(kind==='diagnostic'){expect((await first.client.query("SELECT id,group_id FROM creative_results ORDER BY id")).rows).toEqual([{id:'old-result-a',group_id:'grp_legacy_old-account'},{id:'old-result-b',group_id:'grp_legacy_old-account'}]);expect((await first.client.query<{group_id:string|null}>("SELECT group_id FROM work_material_receipts WHERE id='old-material-receipt'")).rows[0]?.group_id).toBe('grp_legacy_old-account');}
  after=await snapshot(first.client as Client);
  if(kind!=='fresh'){const manifests=(await readdir(dataDir+'.group-upgrade-backups')).filter(f=>f.endsWith('.manifest.json'));expect(manifests).toHaveLength(1);const manifest=JSON.parse(await readFile(join(dataDir+'.group-upgrade-backups',manifests[0]!),'utf8'));const bytes=await readFile(manifest.databasePath);expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.databaseSha256);expect(manifest.media[0]).toMatchObject({storageKey:'source-original.mp4',readable:true});const restored=new PGlite({loadDataDir:new Blob([bytes])});try{await restored.waitReady;expect((await snapshot(restored as Client,before!.columns)).rows).toEqual(before!.rows);}finally{await restored.close();}}
 }finally{await first.client.close();}
 const second=await createDb({dataDir});try{expect(await snapshot(second.client as Client)).toEqual(after);expect(await readCatalog(second.db)).toEqual(canonical);}finally{await second.client.close();}
});

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const runFile=promisify(execFile);
const pgAdminUrl='postgresql://zyongzhu@127.0.0.1:55422/postgres';
it.each(['fresh','root','diagnostic','canvas'] as const)('真实隔离PostgreSQL %s双启/完整恢复/冻结历史/相同catalog',async kind=>{
 const r=await newRoot(),admin=new Pool({connectionString:pgAdminUrl});const name='t1062_'+randomUUID().replaceAll('-',''),restoreName=name+'_restore';const url=new URL(pgAdminUrl);url.pathname='/'+name;const connectionString=url.toString();let before:Awaited<ReturnType<typeof snapshot>>|undefined;
 const oldBackupDir=process.env.CREATOROS_DATABASE_BACKUP_DIR;process.env.CREATOROS_DATABASE_BACKUP_DIR=join(r,'pg-backups');
 try{await admin.query(`CREATE DATABASE ${quote(name)}`);
  if(kind!=='fresh'){const oldPool=new Pool({connectionString});try{await migratePg(drizzlePg(oldPool),{migrationsFolder:join(folder,'lineages',kind)});await seed(oldPool as Client,r);before=await snapshot(oldPool as Client);}finally{await oldPool.end();}}
  const first=await createRuntimeDb({connectionString});let after:unknown;try{
   const current=await snapshot(first.pool as Client,before?.columns);if(before){expect(current.rows).toEqual(before.rows);expect(current.counts).toEqual(before.counts);for(const receipt of before.ledger)expect(current.ledger).toContainEqual(receipt);}
   expect(current.ledger.filter(i=>Number(i.created_at)===CONVERGENCE_WHEN)).toHaveLength(1);expect(await readCatalog(first.db)).toEqual(canonical);after=await snapshot(first.pool as Client);
   if(kind!=='fresh'){const dir=process.env.CREATOROS_DATABASE_BACKUP_DIR!;const manifests=(await readdir(dir)).filter(f=>f.endsWith('.manifest.json'));expect(manifests).toHaveLength(1);const manifest=JSON.parse(await readFile(join(dir,manifests[0]!),'utf8'));const bytes=await readFile(manifest.databasePath);expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.databaseSha256);expect(bytes.subarray(0,5).toString()).toBe('PGDMP');expect(manifest.media[0]).toMatchObject({storageKey:'source-original.mp4',readable:true});
    await admin.query(`CREATE DATABASE ${quote(restoreName)}`);await runFile('pg_restore',['--no-owner','--no-acl','--dbname',restoreName,manifest.databasePath],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'55422',PGUSER:'zyongzhu',PGDATABASE:restoreName},maxBuffer:1024*1024});const restoreUrl=new URL(pgAdminUrl);restoreUrl.pathname='/'+restoreName;const restored=new Pool({connectionString:restoreUrl.toString()});try{const actual=await snapshot(restored as Client,before!.columns);expect(actual.rows).toEqual(before!.rows);expect(actual.counts).toEqual(before!.counts);expect(actual.ledger).toEqual(before!.ledger);}finally{await restored.end();}
   }
  }finally{await first.pool.end();}
  const second=await createRuntimeDb({connectionString});try{expect(await snapshot(second.pool as Client)).toEqual(after);expect(await readCatalog(second.db)).toEqual(canonical);}finally{await second.pool.end();}
 }finally{if(oldBackupDir===undefined)delete process.env.CREATOROS_DATABASE_BACKUP_DIR;else process.env.CREATOROS_DATABASE_BACKUP_DIR=oldBackupDir;await admin.query(`DROP DATABASE IF EXISTS ${quote(restoreName)} WITH (FORCE)`);await admin.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`);await admin.end();}
});

it('新account=NULL组回执按group唯一，历史account非NULL撞键完整保留',async()=>{
 const {client,db}=await createDb();try{
  const insert=(id:string,group:string|null,account:string|null,key:string)=>client.query("INSERT INTO visual_template_mutation_receipts(id,user_id,group_id,account_id,attempt_id,digest,created_at) VALUES($1,'scope-user',$2,$3,$4,'immutable-digest','2026-10-05T00:00:00Z')",[id,group,account,key]);
  await insert('new-a','group-a',null,'request-same');await insert('new-b','group-b',null,'request-same');await expect(insert('duplicate-a','group-a',null,'request-same')).rejects.toMatchObject({code:'23505'});
  await insert('old-a','group-a','old-account-a','historic-same');await insert('old-b','group-a','old-account-b','historic-same');expect((await client.query('SELECT id FROM visual_template_mutation_receipts ORDER BY id')).rows).toEqual([{id:'new-a'},{id:'new-b'},{id:'old-a'},{id:'old-b'}]);
  const indexes=(await readCatalog(db)).indexes.filter(r=>r.table_name==='visual_template_mutation_receipts');expect(indexes.some(r=>String(r.definition).includes('group_id')&&String(r.definition).includes('account_id IS NULL'))).toBe(true);
 }finally{await client.close();}
});

import installedSources from './migration-convergence-installed-lineages.json';
import frozenSources from './migration-convergence-lineages.json';
import {inspectMigrationConvergence} from './migration-convergence';
import {cp} from 'node:fs/promises';
/** SEMANTIC_BOUNDARY_ALLOW: 测试夹具按真实SQL身份组合执行，不声称存在合成105条的历史journal。 */
async function installedFixture(root:string,subset:'all'|'keyring'|'workbench'|'external'|'asr-without-keyring'='all'){
 const legacy=new Map(frozenSources.root.entries.slice(0,101).map(e=>[e.hash+':'+e.when,{...e,source:'root'}]));
 for(const [name,source]of Object.entries(installedSources)){
  if(subset!=='all'&&!(subset==='keyring'&&name==='installed-keyring')&&!(subset==='workbench'&&name==='installed-workbench')&&!(subset==='external'&&name==='installed-external')&&!(subset==='asr-without-keyring'&&name==='installed-keyring'))continue;
  for(const e of source.entries){if(subset==='asr-without-keyring'&&e.tag==='0068_keyring_only_credentials')continue;legacy.set(e.hash+':'+e.when,{...e,source:name});}
 }
 const fixture=join(root,'fixture-sql');await mkdir(join(fixture,'meta'),{recursive:true});
 const sorted=[...legacy.values()].sort((a,b)=>a.when-b.when);
 for(const e of sorted)await writeFile(join(fixture,e.tag+'.sql'),await readFile(join(folder,'lineages',e.source,e.tag+'.sql')));
 await writeFile(join(fixture,'meta','_journal.json'),JSON.stringify({version:'7',dialect:'postgresql',entries:sorted.map(({hash,source,...e},idx)=>({...e,idx}))}));
 const dataDir=join(root,'db'),old=new PGlite(dataDir);try{await migrate(drizzle(old),{migrationsFolder:fixture});await seed(old as Client,root);
const time='2026-10-01T00:00:00Z';
 if(await hasCol(old as Client,'model_configurations','keyring_ref')){
  await old.query("INSERT INTO model_configurations(id,user_id,capability,provider,model_name,settings,keyring_ref,credential_migration_state,rotated_at) VALUES('legacy-model','old-user','fixture-capability','fixture-provider','fixture-model','{}','fixture-keyring-ref','migrated',$1)",[time]);
  await old.query("INSERT INTO channel_model_credentials(user_id,scope_id,service_id,encrypted_secret,updated_at,keyring_ref,service_type,credential_status,migration_state,rotated_at) VALUES('old-user','fixture-scope','fixture-service',NULL,$1,'fixture-keyring-ref','legacy','migration_pending','pending',$1)",[time]);
 }
 if(await has(old as Client,'asr_usage_intents'))await old.query("INSERT INTO asr_usage_intents(id,user_id,account_scope,intent_id,idempotency_key,request_fingerprint,service_id,duration_seconds,byte_length,charged_units,created_at,updated_at) VALUES('old-asr-intent','old-user','old-account','old-intent','old-intent-key','frozen-intent-digest','qwen-asr-main',37,19,25000,$1,$1)",[time]);
 if(await has(old as Client,'external_agent_connections'))await old.query("INSERT INTO external_agent_connections(id,user_id,idempotency_key,client_kind,account_id,allowed_ops,revision,credential_hash,credential_expires_at,created_at,updated_at) VALUES('old-connection','old-user','old-pair-key','codex','old-account','[\"fixture.read\"]','7','fixture-hash-not-secret','2026-10-08T00:00:00Z',$1,$1)",[time]);
 if(await has(old as Client,'workbench_artifact_lineages')){
  await old.query("INSERT INTO ai_conversations(id,user_id,account_id,title,created_at,updated_at) VALUES('old-lineage-conversation','old-user','old-account','fixture conversation',$1,$1)",[time]);
  await old.query("INSERT INTO execution_tasks(id,user_id,account_id,kind,owner_type,owner_id,status,idempotency_key,created_at,updated_at) VALUES('old-lineage-task','old-user','old-account','intelligence_transcribe','intelligence-item','old-owner','succeeded','old-lineage-key',$1,$1)",[time]);
  await old.query("INSERT INTO execution_calls(id,execution_task_id,sequence,operation_key,kind,input_digest,status,reserved_tokens,created_at,updated_at) VALUES('old-lineage-call','old-lineage-task',1,'fixture.read','fixture','frozen-call-digest','succeeded',0,$1,$1)",[time]);
  await old.query("INSERT INTO workbench_artifact_lineages(id,user_id,account_id,conversation_id,artifact_id,current_version,pending_metadata,pending_source,pending_html_resources,created_at,updated_at) VALUES('old-lineage','old-user','old-account','old-lineage-conversation','old-artifact',3,'{\"digest\":\"frozen-meta\"}','{\"storageKey\":\"source-original.mp4\"}','[]',$1,$1)",[time]);
  await old.query("INSERT INTO workbench_artifact_lineage_versions(id,lineage_id,artifact_id,version,task_id,operation_id,request_digest,metadata,source,created_at) VALUES('old-lineage-version','old-lineage','old-artifact',3,'old-lineage-task','old-lineage-call','frozen-version-digest','{\"revision\":3}','{\"fileId\":\"old-file\"}',$1)",[time]);
 }
return{dataDir,before:await snapshot(old as Client)}}finally{await old.close()}
}
it.each(['all','keyring','workbench','external'] as const)('已执行历史%s subset public createDb升级双启，原值和ledger保持，参考缓存互不混淆',async subset=>{
 const root=await newRoot();const {dataDir,before}=await installedFixture(root,subset);
 const first=await createDb({dataDir});let after:Awaited<ReturnType<typeof snapshot>>,cat:Awaited<ReturnType<typeof readCatalog>>;
 try{
  const current=await snapshot(first.client as Client,before.columns);expect(current.rows).toEqual(before.rows);expect(current.counts).toEqual(before.counts);for(const receipt of before.ledger)expect(current.ledger).toContainEqual(receipt);
  expect(current.ledger.filter(r=>Number(r.created_at)===CONVERGENCE_WHEN)).toHaveLength(1);
  cat=await readCatalog(first.db);const keyring=cat.columns.find(c=>c.table_name==='channel_model_credentials'&&c.column_name==='encrypted_secret');expect(keyring?.is_nullable).toBe(subset==='all'||subset==='keyring'?'YES':'NO');
  expect(cat.columns.some(c=>c.table_name==='model_configurations'&&c.column_name==='keyring_ref')).toBe(subset==='all'||subset==='keyring');
  expect(await has(first.client as Client,'asr_usage_intents')).toBe(subset==='all'||subset==='keyring');
  expect(await has(first.client as Client,'workbench_artifact_lineages')).toBe(subset==='all'||subset==='workbench');
  expect(await has(first.client as Client,'external_agent_connections')).toBe(subset==='all'||subset==='external');
  after=await snapshot(first.client as Client);
 }finally{await first.client.close()}
 const second=await createDb({dataDir});try{expect(await snapshot(second.client as Client)).toEqual(after!);expect(await readCatalog(second.db)).toEqual(cat!)}finally{await second.client.close()}
});
it('全新库保持现行凭证结构，不因兼容旧安装而带入未执行的legacy字段',async()=>{const {client,db}=await createDb();try{const cat=await readCatalog(db);expect(cat.columns.some(c=>c.table_name==='model_configurations'&&c.column_name==='keyring_ref')).toBe(false);expect(cat.columns.find(c=>c.table_name==='channel_model_credentials'&&c.column_name==='encrypted_secret')?.is_nullable).toBe('NO');for(const t of ['asr_usage_intents','workbench_artifact_lineages','external_agent_connections'])expect(await has(client as Client,t)).toBe(false)}finally{await client.close()}});
it.each(['unknown','future','common-hole','supplemental-hole','schema-drift'] as const)('补充兼容仍拒绝%s且零旧数据/回执改写',async kind=>{
 const root=await newRoot();const {dataDir}=await installedFixture(root,kind==='supplemental-hole'?'asr-without-keyring':'all');
 const c=new PGlite(dataDir);let before:Awaited<ReturnType<typeof snapshot>>;try{
  if(kind==='unknown')await c.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',['0'.repeat(64),1790553600000]);
  if(kind==='future')await c.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',['f'.repeat(64),CONVERGENCE_WHEN+1]);
  if(kind==='common-hole')await c.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash=$1',[frozenSources.root.entries[68]!.hash]);
  if(kind==='schema-drift')await c.exec('ALTER TABLE model_configurations ADD COLUMN unexplained_legacy_flag text');
  before=await snapshot(c as Client);
 }finally{await c.close()}
 await expect(createDb({dataDir})).rejects.toThrow(kind==='schema-drift'?'SCHEMA_INCOMPATIBLE':'LINEAGE_UNKNOWN');
 const kept=new PGlite(dataDir);try{expect(await snapshot(kept as Client)).toEqual(before!)}finally{await kept.close()}
});
it('补充冻结SQL或journal损坏时拒绝，不接受仅身份白名单',async()=>{
 const root=await newRoot(),copy=join(root,'drizzle');await cp(folder,copy,{recursive:true});
 const c=new PGlite();try{
  const target=join(copy,'lineages','installed-keyring','0068_keyring_only_credentials.sql');const raw=await readFile(target);await writeFile(target,Buffer.concat([raw,Buffer.from('\n-- changed')]));
  await expect(inspectMigrationConvergence(drizzle(c) as never,copy)).rejects.toThrow('冻结SQL校验失败');
  await writeFile(target,raw);await writeFile(join(copy,'lineages','installed-external','meta','_journal.json'),'{}');
  await expect(inspectMigrationConvergence(drizzle(c) as never,copy)).rejects.toThrow('冻结journal校验失败');
 }finally{await c.close()}
});
