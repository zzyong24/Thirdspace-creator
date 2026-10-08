import {afterEach,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backupBeforeGroupUpgrade,verifyGroupUpgradeCounts} from './group-upgrade-backup';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
it('已有库先取得可恢复完整快照，保留真实ID与storageKey，复核减少记录会失败',async()=>{
 const root=await mkdtemp(join(tmpdir(),'creatoros-group-backup-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'media'));await writeFile(join(root,'media','same-key.mp4'),'old-media');
 const db=new PGlite();await db.waitReady;cleanup.push(()=>db.close());
 await db.exec("CREATE TABLE projects(id text primary key,account_id text); INSERT INTO projects VALUES ('p-original','a-original'); CREATE TABLE asset_files(id text primary key,storage_key text); INSERT INTO asset_files VALUES ('f-original','same-key.mp4')");
 const backup=await backupBeforeGroupUpgrade(db,{dataDir:join(root,'db'),mediaRoot:join(root,'media')});
 expect(backup?.counts.projects).toBe(1);expect(backup?.media[0]).toMatchObject({storageKey:'same-key.mp4',readable:true});
 const recovered=new PGlite({loadDataDir:new Blob([await readFile(backup!.databasePath)])});await recovered.waitReady;cleanup.push(()=>recovered.close());
 expect((await recovered.query('SELECT * FROM projects')).rows).toEqual([{id:'p-original',account_id:'a-original'}]);
 await verifyGroupUpgradeCounts(db,backup!);
 await db.exec("DELETE FROM projects");await expect(verifyGroupUpgradeCounts(db,backup!)).rejects.toThrow('projects');
},30000);
it('升级过的库与内存正常路径不重复备份',async()=>{
 const db=new PGlite();await db.waitReady;cleanup.push(()=>db.close());
 expect(await backupBeforeGroupUpgrade(db,{})).toBeNull();
 await db.exec('CREATE TABLE account_groups(id text); CREATE TABLE projects(id text)');
 expect(await backupBeforeGroupUpgrade(db,{dataDir:join(tmpdir(),'never-written-t1022')})).toBeNull();
});
