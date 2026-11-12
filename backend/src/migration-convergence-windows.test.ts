import {afterEach, expect, it, vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDb} from './db';
import {CONVERGENCE_WHEN, readCatalog} from './migration-convergence';

vi.setConfig({testTimeout:180000, hookTimeout:180000});
const folder=fileURLToPath(new URL('../drizzle',import.meta.url));
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const crlf=(text:string)=>text.replace(/\r?\n/g,'\r\n');
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
type Journal={entries:Array<{tag:string;when:number;idx:number;version:string;breakpoints:boolean}>};
async function ledger(client:PGlite){return(await client.query<{hash:string;created_at:number|string}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;}
async function savedContent(client:PGlite){return{
 projects:(await client.query("SELECT id,user_id,account_id,title,brief FROM projects WHERE id='windows-project'")).rows,
 scripts:(await client.query("SELECT id,artifact_id,version_number,content_text,content_data FROM artifact_versions WHERE id='windows-script'")).rows,
 tasks:(await client.query("SELECT id,user_id,account_id,project_id,input_data,idempotency_key,status FROM ai_tasks WHERE id='windows-task'")).rows,
 files:(await client.query("SELECT id,asset_id,storage_key,file_size FROM asset_files WHERE id='windows-file'")).rows,
};}
async function seed(client:PGlite,root:string){
 const time='2026-09-01T00:00:00Z';
 await mkdir(join(root,'media'));await writeFile(join(root,'media/source.mp4'),'original media');
 await client.query("INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('windows-account','windows-user','douyin','旧账号',$1,$1)",[time]);
 await client.query("INSERT INTO projects(id,user_id,account_id,title,brief,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('windows-project','windows-user','windows-account','旧项目','原文\r\n逐字保留','active','script','manual',$1,$1,$1)",[time]);
 await client.query("INSERT INTO artifacts(id,user_id,account_id,project_id,stage,artifact_type,title,created_at,updated_at) VALUES('windows-artifact','windows-user','windows-account','windows-project','script','script','原稿',$1,$1)",[time]);
 await client.query("INSERT INTO artifact_versions(id,artifact_id,version_number,content_text,content_data,created_at) VALUES('windows-script','windows-artifact',1,'已确认原稿\r\n不替换正文',$1::jsonb,$2)",[JSON.stringify({sourceFileId:'windows-file',digest:'original-digest',optional:null}),time]);
 await client.query("INSERT INTO ai_tasks(id,user_id,account_id,project_id,task_type,status,input_data,idempotency_key,requested_at) VALUES('windows-task','windows-user','windows-account','windows-project','transcription','succeeded',$1::jsonb,'original-request-key',$2)",[JSON.stringify({sourceFileId:'windows-file',storageKey:'source.mp4',requestDigest:'original-input'}),time]);
 await client.query("INSERT INTO assets(id,user_id,account_id,asset_type,name,created_at,updated_at) VALUES('windows-asset','windows-user','windows-account','video','原片',$1,$1)",[time]);
 await client.query("INSERT INTO asset_files(id,asset_id,version_number,storage_key,mime_type,file_size,created_at) VALUES('windows-file','windows-asset',1,'source.mp4','video/mp4',14,$1)",[time]);
 await client.query("INSERT INTO storage_configs(user_id,backend,root_path,created_at,updated_at) VALUES('windows-user','local',$1,$2,$2)",[join(root,'media'),time]);
}
type FixtureKind='root'|'diagnostic'|'canvas'|'installed-keyring'|'installed-workbench'|'installed-external'|'common-prefix'|'converged'|'current'|'mixed'|'keyring-lf'|'keyring-prefix';
async function oldFixture(kind:FixtureKind){
 const root=await mkdtemp(join(tmpdir(),'t1472-windows-migration-'));roots.push(root);
 const current=['common-prefix','converged','current','mixed'].includes(kind);
 const source=current?folder:join(folder,'lineages',kind.startsWith('keyring-')?'installed-keyring':kind);
 const journal=JSON.parse(await readFile(join(source,'meta/_journal.json'),'utf8')) as Journal;
 if(kind==='common-prefix')journal.entries=journal.entries.slice(0,65);
 if(kind==='converged')journal.entries=journal.entries.slice(0,103);
 if(kind==='keyring-prefix')journal.entries=journal.entries.slice(0,69);
 const stage=join(root,'old-migrations');await mkdir(join(stage,'meta'),{recursive:true});
 await writeFile(join(stage,'meta/_journal.json'),crlf(JSON.stringify(journal)));
 for(const [index,entry] of journal.entries.entries()){
  const original=await readFile(join(source,entry.tag+'.sql'),'utf8');
  await writeFile(join(stage,entry.tag+'.sql'),kind==='keyring-lf'||(kind==='mixed'&&index%2===0)?original:crlf(original));
 }
 const dataDir=join(root,'db'),old=new PGlite(dataDir);
 try{await migrate(drizzle(old),{migrationsFolder:stage});await seed(old,root);return{root,dataDir,before:{content:await savedContent(old),ledger:await ledger(old),catalog:await readCatalog(drizzle(old) as never)}};}
 finally{await old.close();}
}

it.each<FixtureKind>(['root','diagnostic','canvas','installed-keyring','installed-workbench','installed-external','common-prefix','converged','current','mixed','keyring-lf','keyring-prefix'])('Windows %s 原迁移字节真实建库后，公共createDb升级双启保留正文/任务/媒体/旧回执',async kind=>{
 const {root,dataDir,before}=await oldFixture(kind);
 const first=await createDb({dataDir});let afterLedger:Awaited<ReturnType<typeof ledger>>,afterCatalog:Awaited<ReturnType<typeof readCatalog>>;
 try{
  expect(await savedContent(first.client)).toEqual(before.content);
  afterLedger=await ledger(first.client);afterCatalog=await readCatalog(first.db);
  for(const receipt of before.ledger)expect(afterLedger).toContainEqual(receipt);
  expect(afterLedger.some(r=>Number(r.created_at)===CONVERGENCE_WHEN)).toBe(true);
 }finally{await first.client.close();}
 const second=await createDb({dataDir});try{
  expect(await savedContent(second.client)).toEqual(before.content);
  expect(await ledger(second.client)).toEqual(afterLedger!);expect(await readCatalog(second.db)).toEqual(afterCatalog!);
 }finally{await second.client.close();}
 expect(await readFile(join(root,'media/source.mp4'),'utf8')).toBe('original media');
 expect((await readdir(root)).some(name=>name.includes('.corrupt-'))).toBe(false);
 if(kind==='installed-keyring'){
  const backupDir=dataDir+'.group-upgrade-backups';
  const manifests=(await readdir(backupDir)).filter(name=>name.endsWith('.manifest.json'));expect(manifests).toHaveLength(1);
  const manifest=JSON.parse(await readFile(join(backupDir,manifests[0]!),'utf8'));
  const bytes=await readFile(manifest.databasePath);expect(sha(bytes)).toBe(manifest.databaseSha256);
  expect(manifest.media).toContainEqual(expect.objectContaining({storageKey:'source.mp4',readable:true}));
  const restored=new PGlite({loadDataDir:new Blob([bytes])});try{
   expect(await savedContent(restored)).toEqual(before.content);expect(await ledger(restored)).toEqual(before.ledger);
  }finally{await restored.close();}
 }
});

it.each(['keyring-hole','short-branch-mixture'] as const)('早期分支%s仍拒绝，不拼接短前缀猜测历史',async kind=>{
 const {root,dataDir}=await oldFixture('installed-keyring'),old=new PGlite(dataDir);
 let before:Awaited<ReturnType<typeof ledger>>;
 try{
  if(kind==='keyring-hole')await old.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at=1786233600000');
  else{
   const journal=JSON.parse(await readFile(join(folder,'lineages/installed-external/meta/_journal.json'),'utf8')) as Journal;
   const entry=journal.entries.at(-1)!,raw=await readFile(join(folder,'lineages/installed-external',entry.tag+'.sql'),'utf8');
   await old.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[sha(crlf(raw)),entry.when]);
  }
  before=await ledger(old);
 }finally{await old.close();}
 await expect(createDb({dataDir})).rejects.toThrow('LINEAGE_UNKNOWN');
 const kept=new PGlite(dataDir);try{expect(await ledger(kept)).toEqual(before!);expect((await savedContent(kept)).scripts[0]).toMatchObject({content_text:'已确认原稿\r\n不替换正文'});}finally{await kept.close();}
 expect((await readdir(root)).some(name=>name.includes('.corrupt-')||name.endsWith('.group-upgrade-backups'))).toBe(false);
});

it('已收敛CRLF旧库缺可修复表时，真实执行LF修复并保留两种原回执，双启一致',async()=>{
 const {dataDir,before}=await oldFixture('current'),old=new PGlite(dataDir);
 try{await old.exec('DROP TABLE reporting_consent_changes');}finally{await old.close();}
 const first=await createDb({dataDir});let after:Awaited<ReturnType<typeof ledger>>;
 try{
  expect(await savedContent(first.client)).toEqual(before.content);after=await ledger(first.client);
  expect(after.filter(r=>Number(r.created_at)===CONVERGENCE_WHEN)).toHaveLength(2);
  for(const receipt of before.ledger)expect(after).toContainEqual(receipt);
 }finally{await first.client.close();}
 const second=await createDb({dataDir});try{expect(await savedContent(second.client)).toEqual(before.content);expect(await ledger(second.client)).toEqual(after!);}finally{await second.client.close();}
});

it.each(['unknown','wrong-time','future','prefix-hole','schema-drift','conflicting-variants'] as const)('Windows兼容仍拒绝%s，迁移前原库/回执/正文保持',async kind=>{
 const {root,dataDir}=await oldFixture('installed-workbench');
 const old=new PGlite(dataDir);let beforeContent:Awaited<ReturnType<typeof savedContent>>,beforeLedger:Awaited<ReturnType<typeof ledger>>,beforeCatalog:Awaited<ReturnType<typeof readCatalog>>;
 try{
  const history=await ledger(old),first=history[0]!;
  if(kind==='unknown')await old.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',['e'.repeat(64),1]);
  if(kind==='wrong-time')await old.query('UPDATE drizzle.__drizzle_migrations SET created_at=created_at+1 WHERE hash=$1',[first.hash]);
  if(kind==='future')await old.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',['f'.repeat(64),CONVERGENCE_WHEN+10000]);
  if(kind==='prefix-hole')await old.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash=$1',[history[30]!.hash]);
  if(kind==='schema-drift')await old.exec('ALTER TABLE projects ADD COLUMN unexplained_windows_column text');
  if(kind==='conflicting-variants'){
   const journal=JSON.parse(await readFile(join(folder,'lineages/installed-workbench/meta/_journal.json'),'utf8')) as Journal;
   const entry=journal.entries[0]!,raw=await readFile(join(folder,'lineages/installed-workbench',entry.tag+'.sql'),'utf8');
   await old.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[sha(raw),entry.when]);
  }
  beforeContent=await savedContent(old);beforeLedger=await ledger(old);beforeCatalog=await readCatalog(drizzle(old) as never);
 }finally{await old.close();}
 await expect(createDb({dataDir})).rejects.toThrow(kind==='schema-drift'?'SCHEMA_INCOMPATIBLE':'LINEAGE_UNKNOWN');
 const kept=new PGlite(dataDir);try{
  expect(await savedContent(kept)).toEqual(beforeContent!);expect(await ledger(kept)).toEqual(beforeLedger!);expect(await readCatalog(drizzle(kept) as never)).toEqual(beforeCatalog!);
 }finally{await kept.close();}
 expect((await readdir(root)).some(name=>name.includes('.corrupt-')||name.endsWith('.group-upgrade-backups'))).toBe(false);
});

it('未知身份只输出有界摘要和时间，不把任意hash文本写入错误',async()=>{
 const {dataDir}=await oldFixture('installed-keyring'),old=new PGlite(dataDir);
 const secret='never-print-this-secret\nline-break';
 try{for(let i=0;i<10;i++)await old.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[i===0?secret:i.toString(16).repeat(64),i+1]);}finally{await old.close();}
 let message='';try{await createDb({dataDir});}catch(error){message=String(error);}
 expect(message).toContain('unknownCount=10');expect(message).toContain('created_at');expect(message).toContain('invalid-hash');
 expect(message).not.toContain(secret);expect(message).not.toContain('9'.repeat(64));expect(message.length).toBeLessThan(1500);
});
