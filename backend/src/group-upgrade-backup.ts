import type {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export interface GroupUpgradeBackup {
 version:1;createdAt:string;databasePath:string;databaseSha256:string;
 counts:Record<string,number>;accountMapping:Array<{id:string;groupId:string}>;
 media:Array<{storageKey:string;readable:boolean|null;root:string|null}>;
}
type QueryClient=Pick<PGlite,'query'>;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function tables(client:QueryClient){return (await client.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.table_name);}
async function counts(client:QueryClient,names:string[]){const result:Record<string,number>={};for(const name of names){const row=await client.query<{n:number}>(`SELECT count(*)::int AS n FROM ${quote(name)}`);result[name]=row.rows[0]!.n;}return result;}
/** SEMANTIC_BOUNDARY_ALLOW: 升级前按数据库真实表/账号ID记录完整备份与文件可读性，不猜合并关系、不移动媒体。 */
export async function backupBeforeGroupUpgrade(client:PGlite,options:{dataDir?:string;mediaRoot?:string}):Promise<GroupUpgradeBackup|null>{
 if(!options.dataDir)return null;
 const names=await tables(client);
 if(names.includes('account_groups')||!names.includes('projects'))return null;
 const directory=options.dataDir+'.group-upgrade-backups';await mkdir(directory,{recursive:true,mode:0o700});
 const tag=new Date().toISOString().replaceAll(':','-');const databasePath=join(directory,tag+'.tar.gz');
 const count=await counts(client,names);
 const accountMapping=names.includes('platform_accounts')?(await client.query<{id:string}>('SELECT id FROM platform_accounts ORDER BY id')).rows.map(r=>({id:r.id,groupId:`grp_legacy_${r.id}`})):[];
 let files:Array<{storage_key:string;user_id?:string}>=[];
 if(names.includes('asset_files')){
  const cols=(await client.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_name='asset_files'")).rows.map(r=>r.column_name);
  if(cols.includes('storage_key'))files=(await client.query<{storage_key:string;user_id?:string}>(names.includes('assets')?'SELECT f.storage_key,a.user_id FROM asset_files f JOIN assets a ON a.id=f.asset_id ORDER BY f.storage_key':'SELECT storage_key FROM asset_files ORDER BY storage_key')).rows;
 }
 const configs=names.includes('storage_configs')?(await client.query<{user_id:string;backend:string;root_path:string}>('SELECT user_id,backend,root_path FROM storage_configs')).rows:[];
 const media:GroupUpgradeBackup['media']=[];
 for(const f of files){const cfg=configs.find(c=>c.user_id===f.user_id);if(cfg?.backend==='s3'){media.push({storageKey:f.storage_key,root:null,readable:null});continue;}
  const root=resolve(options.mediaRoot??(cfg?.root_path?.trim()||join(homedir(),'CreatorOS','media')));
  const path=resolve(root,f.storage_key);let readable=false;
  if(path.startsWith(root+sep))try{await access(path);readable=true;}catch{/* 保留升级前已缺失文件的真实状态，不制造或删除文件。 */}
  media.push({storageKey:f.storage_key,root,readable});
 }
 const dump=Buffer.from(await (await client.dumpDataDir()).arrayBuffer());
 await writeFile(databasePath+'.pending',dump,{mode:0o600});await rename(databasePath+'.pending',databasePath);
 const reread=await readFile(databasePath);const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 if(sha(reread)!==sha(dump))throw new Error('账号组升级备份校验失败，原库未执行迁移');
 const manifest:GroupUpgradeBackup={version:1,createdAt:new Date().toISOString(),databasePath,databaseSha256:sha(dump),counts:count,accountMapping,media};
 await writeFile(databasePath+'.manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});
 return manifest;
}
export async function verifyGroupUpgradeCounts(client:QueryClient,backup:GroupUpgradeBackup){
 const after=await counts(client,Object.keys(backup.counts));
 for(const [name,before]of Object.entries(backup.counts))if(after[name]!==before)throw new Error(`账号组升级记录数校验失败：${name} ${before} → ${after[name]}；完整备份：${backup.databasePath}`);
}

const runFile=promisify(execFile);
/** PostgreSQL 同样先留完整可恢复 dump；连接密码只经进程环境传递，不进入 argv 或诊断。 */
export async function backupPostgresBeforeGroupUpgrade(client:QueryClient,connectionString:string,options:{backupDir?:string;mediaRoot?:string}={}):Promise<GroupUpgradeBackup|null>{
 const names=await tables(client);if(names.includes('account_groups')||!names.includes('projects'))return null;
 const url=new URL(connectionString);const directory=resolve(options.backupDir??process.env.CREATOROS_DATABASE_BACKUP_DIR??join(homedir(),'CreatorOS','database-backups'));
 await mkdir(directory,{recursive:true,mode:0o700});const databasePath=join(directory,new Date().toISOString().replaceAll(':','-')+'.pgdump');
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:url.searchParams.get('sslmode')??process.env.PGSSLMODE??'prefer'};
 const count=await counts(client,names);
 const accountMapping=names.includes('platform_accounts')?(await client.query<{id:string}>('SELECT id FROM platform_accounts ORDER BY id')).rows.map(r=>({id:r.id,groupId:`grp_legacy_${r.id}`})):[];
 try{await runFile('pg_dump',['--format=custom','--no-owner','--file',databasePath+'.pending'],{env,maxBuffer:1024*1024});}
 catch{throw new Error('账号组升级前 PostgreSQL 完整备份未完成。请安装可用的 pg_dump 并检查备份目录和数据库权限；原库尚未执行账号组迁移。');}
 const dump=await readFile(databasePath+'.pending');if(dump.subarray(0,5).toString()!=='PGDMP')throw new Error('账号组升级备份格式校验失败，原库尚未迁移');
 await rename(databasePath+'.pending',databasePath);const reread=await readFile(databasePath);const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 if(sha(reread)!==sha(dump))throw new Error('账号组升级备份完整性校验失败，原库尚未迁移');
 const media:GroupUpgradeBackup['media']=[];
 if(names.includes('asset_files')){
  const files=(await client.query<{storage_key:string;user_id:string}>('SELECT f.storage_key,a.user_id FROM asset_files f JOIN assets a ON a.id=f.asset_id ORDER BY f.storage_key')).rows;
  const configs=names.includes('storage_configs')?(await client.query<{user_id:string;backend:string;root_path:string}>('SELECT user_id,backend,root_path FROM storage_configs')).rows:[];
  for(const file of files){const config=configs.find(c=>c.user_id===file.user_id);if(config?.backend==='s3'){media.push({storageKey:file.storage_key,root:null,readable:null});continue;}
   const root=resolve(options.mediaRoot??config?.root_path??join(homedir(),'CreatorOS','media'));const path=resolve(root,file.storage_key);let readable=false;if(path.startsWith(root+sep))try{await access(path);readable=true;}catch{}
   media.push({storageKey:file.storage_key,root,readable});
  }
 }
 const manifest:GroupUpgradeBackup={version:1,createdAt:new Date().toISOString(),databasePath,databaseSha256:sha(dump),counts:count,accountMapping,media};
 await writeFile(databasePath+'.manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
