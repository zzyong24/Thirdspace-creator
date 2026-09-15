import { afterEach, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { scheduledJobs, aiTasks, jobRuns } from '@creatoros/backend';
import { createDb } from '../../db';

const closes:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of closes.splice(0))await close();});
const stamp='2026-09-14T00:00:00.000Z';
const minutes={ 'self.metrics':0, 'self.traffic':15, comments:30, 'self.detail':45 };
it('0099前向错峰仅更新拆分默认计划，保留关闭、自定义、历史、冻结输入与增量水位且幂等',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());
 const rows=Object.keys(minutes).flatMap((sourceKind,i)=>[
  {id:`default-${i}`,sourceKind,accountId:'a',enabled:i%2===0,target:{collectionSplitVersion:1,externalSourceId:'src'},schedule:'0 */2 * * *'},
  {id:`custom-${i}`,sourceKind,accountId:'b',enabled:false,target:{collectionSplitVersion:1,externalSourceId:'custom'},schedule:'7 11 * * *'},
  {id:`legacy-${i}`,sourceKind,accountId:'c',enabled:true,target:{externalSourceId:'legacy'},schedule:'0 */2 * * *'},
 ]);
 await f.db.insert(scheduledJobs).values(rows.map(row=>({...row,userId:'u',name:row.id,prompt:'不变',createdAt:stamp,updatedAt:stamp,lastRunAt:stamp,nextRunAt:'2026-09-14T02:00:00.000Z'})));
 await f.db.insert(aiTasks).values({id:'task',userId:'u',accountId:'a',taskType:'scheduled.self.metrics',status:'running',inputData:{jobId:'default-0',target:{operationsSync:{version:1}}},idempotencyKey:'task',requestedAt:stamp});
 await f.db.insert(jobRuns).values({id:'run',jobId:'default-0',userId:'u',aiTaskId:'task',status:'running',itemsNew:9,itemsUpdated:5,startedAt:stamp});
 await f.client.query("INSERT INTO publication_sync_state (user_id,account_id,publication_id,capability,external_id,attempted_at,last_succeeded_at) VALUES ('u','a','pub','cover','ex',$1,$1)",[stamp]);
 const before=await f.db.select().from(scheduledJobs);
 const history=await f.db.select().from(jobRuns),tasks=await f.db.select().from(aiTasks);
 const watermarks=await f.client.query('SELECT * FROM publication_sync_state');
 const sql=await readFile(new URL('../../../drizzle/0099_stagger_collection_jobs.sql',import.meta.url),'utf8');
 await f.client.exec(sql);
 const after=await f.db.select().from(scheduledJobs);
 for(const original of before){
  const current=after.find(row=>row.id===original.id)!;
  if(original.id.startsWith('default-'))expect(current).toEqual({...original,schedule:`${minutes[original.sourceKind as keyof typeof minutes]} */2 * * *`,target:{...(original.target as Record<string,unknown>),scheduleTimezone:'Asia/Shanghai'},nextRunAt:null});
  else expect(current).toEqual(original);
 }
 expect(await f.db.select().from(jobRuns)).toEqual(history);
 expect(await f.db.select().from(aiTasks)).toEqual(tasks);
 expect((await f.client.query('SELECT * FROM publication_sync_state')).rows).toEqual(watermarks.rows);
 await f.client.exec(sql);
 expect((await f.db.select().from(scheduledJobs)).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(after.sort((a,b)=>a.id.localeCompare(b.id)));
});
