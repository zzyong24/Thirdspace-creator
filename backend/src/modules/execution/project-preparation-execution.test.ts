import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,type Db} from '../../db';
import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pglite';
import {executionTasks,intelligenceItems,sourceSnapshots,intelligenceSources,intelligenceSyncRuns} from '../../schema/intelligence';
import {projectSourceReferences} from '../../schema/projects';
import type {RequestContext} from '@creatoros/contract';
import {createProjectsService,createProjectRepository} from '../projects';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionLeaseService} from './execution-lease.service';
const queries:Array<{query:string;params:unknown[]}>=[];
let db:Db,close:()=>Promise<void>,seq=0;
const clock={value:'2026-10-21T02:00:00.000Z'},now=()=>clock.value,nextId=(prefix:string)=>`${prefix}-prep-exec-${++seq}`;
beforeAll(async()=>{const opened=await createDb();db=drizzle(opened.client,{logger:{logQuery(query,params){queries.push({query,params});}}}) as Db;close=()=>opened.client.close();},120000);afterAll(async()=>close?.(),120000);
async function fixture(){
 clock.value='2026-10-21T02:00:00.000Z';
 const ctx:RequestContext={userId:'prep-exec',accountId:nextId('account'),source:'user',requestId:'test'};
 const project=await createProjectsService(createProjectRepository(db),{now,nextId}).createProject(ctx,{title:'父子预算'}),itemId=nextId('item'),referenceId=nextId('reference');
 await db.insert(intelligenceItems).values({id:itemId,userId:ctx.userId,accountId:ctx.accountId,type:'video',platform:'douyin',canonicalUrl:'https://example.test/item',canonicalUrlHash:itemId,title:'来源',capturedAt:now(),createdAt:now(),updatedAt:now()});
 const sourceId=nextId('source'),runId=nextId('run'),snapshotId=nextId('snapshot'),owner={userId:ctx.userId,accountId:ctx.accountId};
 await db.insert(intelligenceSources).values({...owner,id:sourceId,type:'rss',platform:'web',displayName:'来源',externalKey:sourceId,adapterConfig:{type:'rss',url:'https://example.test/feed'},createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceSyncRuns).values({...owner,id:runId,sourceId,executionTaskId:nextId('sync'),trigger:'manual',status:'succeeded',startedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(sourceSnapshots).values({...owner,id:snapshotId,sourceId,runId,itemId,capturedAt:now(),finalUrl:'https://example.test/item',title:'来源',contentHash:'original-source'});
 await db.insert(projectSourceReferences).values({id:referenceId,projectId:project.id,sourceKind:'intelligence_item',sourceKey:itemId,itemId,snapshotId,sourceDigest:'original-source',createdAt:now(),updatedAt:now()});
 const service=createPersistentTaskService(db,{now,nextId});
 const parent=await service.enqueue(ctx,{kind:'project_preparation' as never,ownerType:'project',ownerId:project.id,idempotencyKey:'parent',payload:{schemaVersion:1,projectId:project.id,sourceReferenceIds:[referenceId],requestedSteps:['transcript']},executionBudget:{maxCalls:10,maxTokens:10000,deadlineMs:1800000}});
 const claim=await service.claimTask({taskId:parent.id,workerId:'parent-worker'});
 const proof={taskId:parent.id,workerId:claim!.lease.workerId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken,preparationReferenceId:referenceId};
 const child=()=>service.enqueue(ctx,{kind:'transcribe',ownerType:'item',ownerId:itemId,idempotencyKey:'child',payload:{itemId,sourceUrl:'https://example.test/item'},modelRouteParent:proof});
 return {ctx,project,itemId,referenceId,service,parent,claim:claim!,proof,child};
}
it('有限父短tick超过三次不耗模型重试额度，原deadline不变',async()=>{
 const f=await fixture(),[original]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parent.id));let claim=f.claim;
 for(let i=0;i<5;i++){
  expect(await f.service.finish({taskId:f.parent.id,...claim.lease,status:'retry_wait',retryAfterMs:1000})).toMatchObject({runtimeStatus:'retry_wait'});
  clock.value=new Date(Date.parse(clock.value)+2000).toISOString();claim=(await f.service.claimTask({taskId:f.parent.id,workerId:'parent-worker'}))!;expect(claim).toBeTruthy();
 }
 const [saved]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parent.id));expect(saved!.deadlineAt).toBe(original!.deadlineAt);
});
it('有限子继承父绝对期限，剩余不足120秒不向上续期；父子越权与错fence拒绝',async()=>{
 const f=await fixture();await db.update(executionTasks).set({deadlineAt:'2026-10-21T02:00:45.000Z'}).where(eq(executionTasks.id,f.parent.id));
 const child=await f.child(),[row]=await db.select().from(executionTasks).where(eq(executionTasks.id,child.id));expect(row!.deadlineAt).toBe('2026-10-21T02:00:45.000Z');expect((row!.executionBudget as {deadlineMs:number}).deadlineMs).toBe(45000);
 for(const proof of [{...f.proof,fenceToken:'foreign'},{...f.proof,preparationReferenceId:'other'}])await expect(f.service.enqueue(f.ctx,{kind:'transcribe',ownerType:'item',ownerId:f.itemId,idempotencyKey:nextId('bad'),payload:{itemId:f.itemId},modelRouteParent:proof})).rejects.toThrow();
 await expect(f.service.enqueue(f.ctx,{kind:'transcribe',ownerType:'item',ownerId:'other',idempotencyKey:'other-item',payload:{itemId:'other'},modelRouteParent:f.proof})).rejects.toThrow();
});
it('父暂停后独占子不能admission；公开payload不能自报父证明',async()=>{
 const f=await fixture(),child=await f.child(),claim=(await f.service.claimTask({taskId:child.id,workerId:'child-worker'}))!;
 await f.service.saveCheckpoint({taskId:f.parent.id,workerId:f.proof.workerId,attempt:f.proof.attempt,checkpoint:{schemaVersion:1,projectId:f.project.id,steps:[{name:'transcript',childTaskId:child.id,reuse:'exclusive'}]}});
 await f.service.command(f.ctx,{taskIds:[f.parent.id],command:'pause',idempotencyKey:'pause-parent'});
 expect((await f.service.get(f.ctx,child.id)).status).toBe('pause_requested');
 await expect(createExecutionLeaseService(db,{now}).withLease({executionTaskId:child.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',async()=>true)).rejects.toThrow();
 await expect(f.service.enqueue(f.ctx,{kind:'transcribe',ownerType:'item',ownerId:f.itemId,idempotencyKey:'forged-proof',payload:{itemId:f.itemId,preparationParentProof:{parentTaskId:f.parent.id}}})).rejects.toThrow();
});
it('准备预约不要求已配置模型，不调用根模型准入',async()=>{
 const f=await fixture(),service=createPersistentTaskService(db,{now,nextId,prepareModelAuthority:async()=>{throw Error('未配置模型');}});
 await expect(service.enqueue(f.ctx,{kind:'project_preparation' as never,ownerType:'project',ownerId:f.project.id,idempotencyKey:'no-model-parent',payload:{schemaVersion:1,projectId:f.project.id,sourceReferenceIds:[]}})).resolves.toMatchObject({kind:'project_preparation'});
});
it('准备转写来源冷却不清空有限期限；冷却超过剩余期限如实停止',async()=>{
 const f=await fixture(),child=await f.child();const {itemTranscripts}=await import('../../schema/intelligence');
 await db.insert(itemTranscripts).values({itemId:f.itemId,userId:f.ctx.userId,accountId:f.ctx.accountId,status:'queued',executionTaskId:child.id,updatedAt:now()});
 const claim=(await f.service.claimTask({taskId:child.id,workerId:'transcript'}))!,deadline='2026-10-21T02:01:00.000Z';await db.update(executionTasks).set({deadlineAt:deadline}).where(eq(executionTasks.id,child.id));
 const {createTranscriptSourceRecoveryService}=await import('../intelligence/transcript-source-recovery.service');
 await createTranscriptSourceRecoveryService(db,{now,random:()=>0}).defer(f.ctx,{executionTaskId:child.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},{name:'DouyinCooldownActiveError',remainMs:120000});
 const [saved]=await db.select().from(executionTasks).where(eq(executionTasks.id,child.id));expect(saved!.deadlineAt).toBe(deadline);expect(saved!.status).toBe('failed');expect(saved!.lastErrorCode).toBe('EXECUTION_DEADLINE');
});

it.each(['paused','pause_requested','unknown_result','cancel_requested'])('T1382 父停止对已停止/未知子幂等，不回滚父：%s',async status=>{
 const f=await fixture(),child=await f.child();await db.update(executionTasks).set({status}).where(eq(executionTasks.id,child.id));
 const command=status==='cancel_requested'?'cancel':'pause';
 await expect(f.service.command(f.ctx,{taskIds:[f.parent.id],command,idempotencyKey:'stop-existing-child'})).resolves.toHaveLength(1);
 expect((await f.service.get(f.ctx,f.parent.id)).status).toBe(command==='cancel'?'cancel_requested':'pause_requested');
 const saved=await f.service.get(f.ctx,child.id);expect(saved.runtimeStatus??saved.status).toBe(status);
});
it('T1382 第二父复用原item转写后取消第一父不停止共享子',async()=>{
 const f=await fixture(),child=await f.child(),childClaim=(await f.service.claimTask({taskId:child.id,workerId:'shared-transcript'}))!;
 const second=await f.service.enqueue(f.ctx,{kind:'project_preparation',ownerType:'project',ownerId:f.project.id,idempotencyKey:'second-parent',payload:{schemaVersion:1,projectId:f.project.id,sourceReferenceIds:[f.referenceId]},executionBudget:{maxCalls:10,maxTokens:10000,deadlineMs:1800000}}),parentClaim=(await f.service.claimTask({taskId:second.id,workerId:'second'}))!;
 const {createProjectPreparationStateService}=await import('./project-preparation-state.service');await createProjectPreparationStateService(db).reuseTranscript(f.ctx,{parentClaim,referenceId:f.referenceId,childTaskId:child.id,now:now()});
 await f.service.command(f.ctx,{taskIds:[f.parent.id],command:'cancel',idempotencyKey:'cancel-original-consumer'});
 expect((await f.service.get(f.ctx,child.id)).status).toBe('running');await expect(createExecutionLeaseService(db,{now}).withLease({executionTaskId:child.id,attempt:childClaim.lease.attempt,fenceToken:childClaim.lease.fenceToken},'admission',async()=>true)).resolves.toBe(true);
});

it.each(['retry','resume'] as const)('T1382 %s原父按workspace→parent取锁，不等待独占child锁',async(command)=>{
 const f=await fixture(),child=await f.child();await db.update(executionTasks).set({status:command==='retry'?'failed':'paused',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,f.parent.id));
 const {createProjectPreparationStateService}=await import('./project-preparation-state.service');queries.length=0;
 await createProjectPreparationStateService(db).update(f.ctx,f.parent.id,f.project.id,async(tx,row)=>{await createPersistentTaskService(tx,{now,nextId}).command(f.ctx,{taskIds:[row.id],command,idempotencyKey:'locked-'+command});return {checkpoint:row.checkpoint,result:undefined};});
 const locks=queries.filter(row=>/for update/i.test(row.query));expect(locks[0]?.query).toContain('platform_accounts');
 expect(locks.filter(row=>row.query.includes('execution_tasks')).some(row=>row.params.includes(child.id))).toBe(false);
 expect((await f.service.get(f.ctx,child.id)).status).toBe('queued');expect((await f.service.get(f.ctx,f.parent.id)).status).toBe('queued');
});

it('T1382 首次显式start也先锁workspace再锁项目，沿同一写入顺序',async()=>{
 const f=await fixture(),project=await createProjectsService(createProjectRepository(db),{now,nextId}).createProject(f.ctx,{title:'首次准备'}),{createProjectPreparationService}=await import('../projects/project-preparation.service');
 const service=createProjectPreparationService(db,{now,nextId,tasks:f.service,dispatch:async()=>({status:'not_required',reasonCode:'TEST'})});queries.length=0;
 await service.start(f.ctx,project.id,{idempotencyKey:'first-lock-order',requestedSteps:['brief']});const locks=queries.filter(row=>/for update/i.test(row.query));expect(locks[0]?.query).toContain('platform_accounts');
});
