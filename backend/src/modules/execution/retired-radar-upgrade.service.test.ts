import {afterEach,expect,it} from 'vitest';
import {createDb,executionTasks,executionCalls,eq} from '@creatoros/backend';
import {createPersistentTaskService} from './persistent-task.service';
import type {RequestContext} from '@creatoros/contract';
const ctx:RequestContext={userId:'retire-user',accountId:'retire-account',requestId:'retire',source:'user'};
const stamp='2026-10-21T00:00:00.000Z';
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0))await close();});
async function fixture(){const f=await createDb();cleanups.push(()=>f.client.close());return {...f,tasks:createPersistentTaskService(f.db,{now:()=>stamp})};}
async function seed(f:Awaited<ReturnType<typeof fixture>>,id:string,status:string,patch:Record<string,unknown>={}){await f.db.insert(executionTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,kind:'radar_project_upgrade',ownerType:'item',ownerId:'item',payload:{itemId:'item'},checkpoint:{stage:'generating'},status,idempotencyKey:id,createdAt:stamp,updatedAt:stamp,...patch} as typeof executionTasks.$inferInsert);}
it('退役kind停接单、两种claim均拒绝，retry/resume统一给出升级提示',async()=>{
 const f=await fixture();await seed(f,'old-queued','queued');await seed(f,'old-failed','failed');
 await expect(f.tasks.enqueue(ctx,{kind:'radar_project_upgrade',ownerType:'item',ownerId:'item',idempotencyKey:'new',payload:{itemId:'item'}})).rejects.toThrow('系统已升级，请重新点击升级为项目');
 expect(await f.tasks.claimNext({kinds:['radar_project_upgrade'],workerId:'old'})).toBeNull();expect(await f.tasks.claimTask({taskId:'old-queued',workerId:'old'})).toBeNull();
 for(const command of ['retry','resume'] as const)for(const id of ['old-queued','old-failed'])await expect(f.tasks.command(ctx,{taskIds:[id],command,idempotencyKey:command+id})).rejects.toThrow('系统已升级，请重新点击升级为项目');
});
it('一次性收尾全部非终态，保留终态/回执/原调用，独占子停止而共享转写不动；重跑无写入',async()=>{
 const f=await fixture();const states=['queued','running','pause_requested','paused','cancel_requested','retry_wait','waiting_user','unknown_result','blocked'];
 for(const status of [...states,'succeeded','failed','cancelled','partial'])await seed(f,status,status,{leaseOwner:'old-worker',leaseExpiresAt:'2026-10-22T00:00:00Z',fenceToken:'original-fence',attempt:2});
 await f.db.update(executionTasks).set({checkpoint:{stage:'generating',topicTaskId:'exclusive-topic',transcriptTaskId:'shared-transcript'}}).where(eq(executionTasks.id,'running'));
 await seed(f,'exclusive-topic','running',{kind:'topic_preview',ownerType:'transform',idempotencyKey:'running:preview'});await seed(f,'shared-transcript','running',{kind:'transcribe'});await seed(f,'checkpoint-missing-topic','queued',{kind:'topic_preview',ownerType:'transform',idempotencyKey:'queued:preview'});
 await f.db.insert(executionCalls).values({id:'original-call',executionTaskId:'exclusive-topic',sequence:1,operationKey:'original-operation',kind:'model',inputDigest:'original-digest',status:'unknown',reservedTokens:77,createdAt:stamp,updatedAt:stamp});
 const calls=await f.db.select().from(executionCalls),before=await f.db.select().from(executionTasks);
 const {retireLegacyRadarUpgrades}=await import('./retired-radar-upgrade.service');await retireLegacyRadarUpgrades(f.db,stamp);
 for(const status of states){const [row]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,status));expect(row).toMatchObject({status:'cancelled',lastErrorCode:'SYSTEM_UPGRADED',lastErrorMessage:'系统已升级，请重新点击升级为项目',leaseOwner:null,leaseExpiresAt:null,fenceToken:null,attempt:2});expect(row!.checkpoint).toEqual(before.find(x=>x.id===status)!.checkpoint);}
 for(const status of ['succeeded','failed','cancelled','partial'])expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,status)))[0]).toEqual(before.find(x=>x.id===status));
 expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,'checkpoint-missing-topic')))[0]).toMatchObject({status:'cancelled',lastErrorCode:'SYSTEM_UPGRADED'});
 expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,'exclusive-topic')))[0]).toMatchObject({status:'unknown_result',leaseOwner:null});
 expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,'shared-transcript')))[0]).toEqual(before.find(x=>x.id==='shared-transcript'));expect(await f.db.select().from(executionCalls)).toEqual(calls);
 await expect(f.tasks.saveCheckpoint({taskId:'running',workerId:'old-worker',attempt:2,checkpoint:{projectId:'late-project'}})).rejects.toThrow();
 const after=await f.db.select().from(executionTasks);await retireLegacyRadarUpgrades(f.db,'2026-10-22T00:00:00Z');expect(await f.db.select().from(executionTasks)).toEqual(after);
});
