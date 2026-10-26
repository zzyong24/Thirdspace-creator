import {expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {createDb} from './db';
it('0141真实历史root→public createDb双启：旧规则所有字段/ID/状态/时间保留，不猜归属、不克隆或停用',async()=>{
 const fixtureRoot=await mkdtemp(join(tmpdir(),'t1406-rule-migration-')),dataDir=join(fixtureRoot,'isolated-db');
 let before:unknown;const legacy=new PGlite(dataDir);
 try{
  await migrate(drizzle(legacy),{migrationsFolder:fileURLToPath(new URL('../drizzle/lineages/root',import.meta.url))});
  await legacy.query("INSERT INTO review_rules(id,user_id,tier,category,match_type,pattern,note,source,status,created_at,updated_at) VALUES('old-manual','synthetic-owner','empirical','历史','word','old-manual-word','保留原注释','manual','active','2026-01-01','2026-01-02'),('old-retro','synthetic-owner','empirical','历史','word','old-retro-word','保留候选','retro','candidate','2026-01-03','2026-01-04'),('old-seed','synthetic-owner','official_hard','历史','word','old-seed-word','原种子','seed','active','2026-01-05','2026-01-06')");
  before=(await legacy.query('SELECT to_jsonb(r) AS row FROM review_rules r ORDER BY id')).rows;
 }finally{await legacy.close();}
 try{
  const first=await createDb({dataDir});let full:unknown;
  try{
   const rows=(await first.client.query('SELECT to_jsonb(r) AS row FROM review_rules r ORDER BY id')).rows as Array<{row:Record<string,unknown>}>;
   expect(rows).toHaveLength(3);expect(rows.every(({row})=>row.group_id===null)).toBe(true);
   expect(rows.map(({row})=>{const {group_id,...legacyRow}=row;return {row:legacyRow};})).toEqual(before);full=rows;
   const receipt=(await first.client.query("SELECT hash,created_at FROM drizzle.__drizzle_migrations WHERE created_at=1791043200014")).rows;
   expect(receipt).toEqual([{hash:'369bab227e661865bd2b855ce3d67c788c1a80531eea144e1df93b5458807416',created_at:1791043200014}]);
  }finally{await first.client.close();}
  const second=await createDb({dataDir});try{expect((await second.client.query('SELECT to_jsonb(r) AS row FROM review_rules r ORDER BY id')).rows).toEqual(full);}finally{await second.client.close();}
 }finally{
  const absolute=resolve(fixtureRoot),temp=resolve(tmpdir());if(!absolute.startsWith(temp+'\\')&&!absolute.startsWith(temp+'/'))throw Error('fixture cleanup boundary mismatch');await rm(absolute,{recursive:true,force:true});
 }
},180000);
