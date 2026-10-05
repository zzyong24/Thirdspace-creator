import {afterAll,expect,it} from 'vitest';
import {Pool} from 'pg';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {backupPostgresBeforeGroupUpgrade,verifyGroupUpgradeCounts} from './group-upgrade-backup';
const url=process.env.CREATOROS_TEST_POSTGRES_URL;const cleanup:Array<()=>Promise<unknown>>=[];
afterAll(async()=>{for(const fn of cleanup.reverse())await fn();});
it.skipIf(!url)('隔离PostgreSQL完整dump能恢复所有旧ID并校验升级记录数',async()=>{
 const parsed=new URL(url!);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55422')throw new Error('此测试只允许显式隔离测试服务器55422');
 const admin=new Pool({connectionString:url});cleanup.push(()=>admin.end());const tag=Date.now(),source=`t1022_backup_src_${tag}`,target=`t1022_backup_dst_${tag}`;
 await admin.query(`CREATE DATABASE ${source}`);await admin.query(`CREATE DATABASE ${target}`);cleanup.push(async()=>{await admin.query(`DROP DATABASE ${source}`);await admin.query(`DROP DATABASE ${target}`);});
 const srcUrl=new URL(url!);srcUrl.pathname='/'+source;const dstUrl=new URL(url!);dstUrl.pathname='/'+target;
 const pool=new Pool({connectionString:srcUrl.toString()}),restored=new Pool({connectionString:dstUrl.toString()});cleanup.push(()=>pool.end(),()=>restored.end());
 await pool.query("CREATE TABLE projects(id text);INSERT INTO projects VALUES ('old-p');CREATE TABLE platform_accounts(id text);INSERT INTO platform_accounts VALUES ('old-a');CREATE TABLE assets(id text,user_id text);INSERT INTO assets VALUES ('old-asset','owner');CREATE TABLE asset_files(id text,asset_id text,storage_key text);INSERT INTO asset_files VALUES ('old-f','old-asset','owner/original.mp4')");
 const directory=await mkdtemp(join(tmpdir(),'t1022-pg-backup-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));
 const client={query:async<T>(sql:string)=>({rows:(await pool.query(sql)).rows as T[]})};
 const backup=await backupPostgresBeforeGroupUpgrade(client as never,srcUrl.toString(),{backupDir:directory,mediaRoot:directory});expect(backup?.accountMapping).toEqual([{id:'old-a',groupId:'grp_legacy_old-a'}]);expect((await readFile(backup!.databasePath)).subarray(0,5).toString()).toBe('PGDMP');
 await promisify(execFile)('pg_restore',['--no-owner','--dbname',dstUrl.toString(),backup!.databasePath]);expect((await restored.query('SELECT id FROM projects')).rows).toEqual([{id:'old-p'}]);expect((await restored.query('SELECT storage_key FROM asset_files')).rows).toEqual([{storage_key:'owner/original.mp4'}]);
 await verifyGroupUpgradeCounts(client as never,backup!);await pool.query('DELETE FROM projects');await expect(verifyGroupUpgradeCounts(client as never,backup!)).rejects.toThrow('projects');
},30000);
