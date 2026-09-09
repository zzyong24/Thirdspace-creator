import {beforeEach,afterEach,it,expect} from 'vitest';
import {createDb,eq,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {createPersistentTaskService} from '../execution';
import {createIntelligenceService} from './intelligence.service';
import {createRadarProjectQueueService} from './radar-project-queue.service';
import {runIntelligenceTranscriptTask} from './transcript-runner';
import {createTranscriptSourceRecoveryService,transcriptSourceRetryDelay} from './transcript-source-recovery.service';
import type {RequestContext} from '@creatoros/contract';
const ctx:RequestContext={userId:'u',accountId:'a',requestId:'fixture',source:'user'};
let db:Db,close:()=>Promise<void>,clock:number,serial:number;
let tasks:ReturnType<typeof createPersistentTaskService>,intelligence:ReturnType<typeof createIntelligenceService>,recovery:ReturnType<typeof createTranscriptSourceRecoveryService>;
beforeEach(async()=>{const fixture=await createDb();db=fixture.db;close=()=>fixture.client.close();clock=Date.parse('2026-09-09T00:00:00Z');serial=0;const deps={now:()=>new Date(clock).toISOString(),nextId:(p:string)=>`${p}-${++serial}`};tasks=createPersistentTaskService(db,deps);intelligence=createIntelligenceService(db,{...deps,tasks});recovery=createTranscriptSourceRecoveryService(db,{...deps,random:()=>0.5});});
afterEach(async()=>{await close();});
async function queued(){const itemId=await intelligence.seedItemForTest(ctx,{title:'原作品',canonicalUrl:'https://www.douyin.com/video/123',externalId:'123'});const {tasks:rows}=await intelligence.enqueueTranscripts(ctx,{itemIds:[itemId],idempotencyKey:'click'});return {itemId,taskId:rows[0]!.id};}
it('持续冷却超过旧次数与十分钟截止：原任务持久等待，未到期不领取，到期继续且正文保留',async()=>{
 const {taskId,itemId}=await queued();
 for(let count=1;count<=5;count++){
  await runIntelligenceTranscriptTask(ctx,{taskId},{tasks,intelligence,sourceRecovery:recovery,transcript:{async transcribe(){throw Object.assign(new Error('只保存稳定码'),{name:'DouyinCooldownActiveError',remainMs:180_000});}}});
  const task=await tasks.get(ctx,taskId);expect(task.runtimeStatus).toBe('retry_wait');expect(task.attempt).toBe(count);
  expect(Date.parse(task.retryAt!)-clock).toBeGreaterThanOrEqual(180_000);
  expect((await intelligence.getItem(ctx,itemId)).transcript.status).toBe('queued');
  expect(await tasks.claimNext({kinds:['transcribe'],workerId:'early'})).toBeNull();
  clock=Date.parse(task.retryAt!)+1;
 }
 await runIntelligenceTranscriptTask(ctx,{taskId},{tasks,intelligence,sourceRecovery:recovery,transcript:{async transcribe(){return {text:'已恢复逐字稿',provider:'fixture',model:'fixture',language:'zh'};}}});
 expect((await tasks.get(ctx,taskId)).status).toBe('succeeded');expect((await intelligence.getItem(ctx,itemId)).transcript.text).toBe('已恢复逐字稿');
});
it('指数退避有上限，抖动只延后且不能裁短共享通道冷却',()=>{
 expect(transcriptSourceRetryDelay(1,0,()=>0)).toBe(5000);
 expect(transcriptSourceRetryDelay(2,0,()=>0)).toBe(10000);
 expect(transcriptSourceRetryDelay(999,0,()=>0)).toBe(900000);
 expect(transcriptSourceRetryDelay(999,2000000,()=>1)).toBe(2180000);
});
it('仅点名的旧冷却失败恢复原任务，其他历史与跨账号不动',async()=>{
 const {taskId}=await queued();
 await db.update(executionTasks).set({status:'failed',attempt:9,lastErrorCode:'TRANSCRIBE_FAILED',lastErrorMessage:'DouyinCooldownActiveError',deadlineAt:new Date(clock-1).toISOString()}).where(eq(executionTasks.id,taskId));
 expect(await recovery.recoverReferenced({...ctx,accountId:'other'},taskId)).toBe(false);
 expect(await recovery.recoverReferenced(ctx,taskId)).toBe(true);
 expect((await tasks.get(ctx,taskId)).runtimeStatus).toBe('retry_wait');
 expect(await recovery.recoverReferenced(ctx,taskId)).toBe(false);
 clock=Date.parse((await tasks.get(ctx,taskId)).retryAt!)+1;expect((await tasks.claimNext({kinds:['transcribe'],workerId:'restart'}))?.task.id).toBe(taskId);
});
it('取消优先，失效fence不能改写状态，登录与未知错误不触发来源重试',async()=>{
 const {taskId}=await queued();const claim=(await tasks.claimTask({taskId,workerId:'fixture',leaseSeconds:60}))!;
 const ref={executionTaskId:taskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 expect(await recovery.defer(ctx,ref,Object.assign(new Error('登录'),{name:'DouyinNotLoggedInError'}))).toBe(false);
 expect(await recovery.defer(ctx,ref,Object.assign(new Error('未知'),{name:'MODEL_RESULT_UNKNOWN'}))).toBe(false);
 await tasks.command(ctx,{taskIds:[taskId],command:'cancel',idempotencyKey:'cancel'});
 await expect(recovery.defer(ctx,ref,{name:'DouyinCooldownActiveError',remainMs:1000})).rejects.toThrow();
 expect((await tasks.get(ctx,taskId)).status).toBe('cancel_requested');
});

it('付费调用账本存在时，新旧冷却恢复都拒绝，不清空未知回执',async()=>{
 const {taskId}=await queued();const claim=(await tasks.claimTask({taskId,workerId:'fixture',leaseSeconds:60}))!;
 await db.insert(executionCalls).values({id:'charged',executionTaskId:taskId,sequence:1,operationKey:'asr',kind:'model',inputDigest:'fixture',status:'unknown',reservedTokens:1,createdAt:new Date(clock).toISOString(),updatedAt:new Date(clock).toISOString()});
 await expect(recovery.defer(ctx,{executionTaskId:taskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},{name:'DouyinCooldownActiveError',remainMs:5000})).rejects.toThrow('调用账本');
 await db.update(executionTasks).set({status:'failed',leaseOwner:null,lastErrorCode:'TRANSCRIBE_FAILED',lastErrorMessage:'DouyinCooldownActiveError'}).where(eq(executionTasks.id,taskId));
 await expect(recovery.recoverReferenced(ctx,taskId)).rejects.toThrow('调用账本');
 expect((await tasks.get(ctx,taskId)).status).toBe('failed');
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,'charged')))[0]?.status).toBe('unknown');
});
it('升级父项点名旧冷却子项后等待，复用原子任务且不进入选题阶段',async()=>{
 const {taskId,itemId}=await queued();await db.update(executionTasks).set({status:'failed',lastErrorCode:'TRANSCRIBE_FAILED',lastErrorMessage:'DouyinCooldownActiveError'}).where(eq(executionTasks.id,taskId));
 const queue=createRadarProjectQueueService({tasks,now:()=>new Date(clock).toISOString(),intelligence,assertPositioning:async()=>{},projects:{ensureRadarProject:async()=>{throw Error('冷却中不得创建项目');}},recoverSourceCooldown:recovery.recoverReferenced});
 const parent=(await queue.enqueue(ctx,{itemIds:[itemId],positioningVersionId:'fixture',idempotencyKey:'upgrade'})).tasks[0]!;
 await queue.tick({shouldStop:()=>false});
 expect((await tasks.get(ctx,parent.id)).runtimeStatus).toBe('retry_wait');expect((await tasks.get(ctx,parent.id)).checkpoint).toMatchObject({transcriptTaskId:taskId});
 expect((await tasks.get(ctx,taskId)).runtimeStatus).toBe('retry_wait');expect((await tasks.list(ctx,{kind:'transcribe'})).total).toBe(1);
});
