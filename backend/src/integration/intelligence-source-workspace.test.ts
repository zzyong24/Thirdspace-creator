import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {afterEach,expect,it} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {OwnedPostgresPool as Pool ,assertOwnedPostgresUrl} from '../test-fixtures/owned-postgres';
import {ENDPOINTS,createClient,type RequestContext} from '@creatoros/contract';
import {createContinuousExecutionBudget} from '@creatoros/contract/execution-worker';
import {createDb,createRuntimeDb} from '../db';
import {executionTasks,executionCalls,executionStreamEvents,executionEvidence,aiTasks,aiConversations,workbenchArtifactLineages,workbenchArtifactLineageVersions,intelligenceSources,intelligenceSyncRuns,intelligenceItems,itemTranscripts,itemSourceObservations,sourceSnapshots,intelligenceTransforms,intelligenceCollections,projectIntelligenceReferences,eq} from '../index';
import {createAccountGroupService,createPlatformAccountService,createPlatformAccountTransport} from '../modules/platform-account';
import {createPersistentTaskService} from '../modules/execution';
import {createIntelligenceService,type IntelligenceAdapterEnvelope} from '../modules/intelligence/intelligence.service';
import {createIntelligenceTransport} from '../modules/intelligence/intelligence.transport';
import {drainIntelligenceSourceQueue,runIntelligenceSourceTask} from '../modules/intelligence/source-sync-runner';
import {createIntelligenceService as createHistoricalIntelligenceService} from '../../../docs/verification/t1217/fixtures/historical-intelligence.service';
import {accountGroupMemberships,accountGroups} from '../schema/account-groups';
import {itemMetricSnapshots} from '../schema/intelligence';
import {createExecutionLeaseService} from '../modules/execution/execution-lease.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionStreamService} from '../modules/execution/execution-stream.service';
import {bindIntelligenceTranscript} from '../modules/intelligence/transcript-execution-binding';
import {createProjectIntelligenceReferenceService} from '../modules/intelligence/project-reference.service';
import {createProjectsService,createProjectRepository} from '../modules/projects';
import {OwnershipError} from '../modules/intelligence/intelligence.errors';

// T1217：真实公共账号注册和来源创建，不改写字段来模拟归属错误；适配器只返回中性空内容。
const cleanups:Array<()=>Promise<unknown>>=[];
const databaseEvidence=(value:unknown)=>appendFileSync(new URL('../../../docs/verification/t1217/isolated-databases.ndjson',import.meta.url),JSON.stringify(value)+'\n');
afterEach(async()=>{const errors:unknown[]=[];for(const cleanup of cleanups.splice(0).reverse())try{await cleanup();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'隔离测试清理未完成');});
async function openIsolated(postgres=false){
 if(!postgres){const opened=await createDb();cleanups.push(()=>opened.client.close());return opened.db;}
 const address=process.env.CREATOROS_TEST_POSTGRES_URL;if(!address)throw Error('并发回归需要显式 CREATOROS_TEST_POSTGRES_URL');const parsed=new URL(address);
 assertOwnedPostgresUrl(parsed.toString());
 const name=`creatoros_test_t1217_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:address});cleanups.push(()=>admin.end());await admin.query(`CREATE DATABASE ${name}`);const owner=await admin.query<{owner:string}>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[name]);databaseEvidence({witness:'T1217 isolated database created',name,owner:owner.rows[0]?.owner});cleanups.push(async()=>{await admin.query(`DROP DATABASE ${name}`);const remaining=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name]);expect(remaining.rowCount).toBe(0);databaseEvidence({witness:'T1217 isolated database removed',name});});parsed.pathname=`/${name}`;
 const opened=await createRuntimeDb({connectionString:parsed.toString()});cleanups.push(()=>opened.pool.end());return opened.db;
}
async function fixture(mode:'legacy'|'group'='legacy',runInitial=true,options:{historical?:boolean;postgres?:boolean}={}){
 const db=await openIsolated(options.postgres);
 let n=0,elapsed=0;const now=()=>new Date(Date.parse('2026-10-11T10:00:00.000Z')+elapsed).toISOString(),nextId=(p:string)=>`${p}-t1217-${++n}`,deps={db,now,nextId};
 const base:RequestContext={userId:'isolated-source-user',requestId:'t1217',source:'user'},groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const explicit=mode==='group'?await groups.create(base,{name:'隔离显式账号组',idempotencyKey:'explicit'}):null;
 const registrationCtx={...base,...(explicit?{groupId:explicit.id}:{})};
 const account=await createClient(ENDPOINTS,createPlatformAccountTransport(()=>accounts),registrationCtx).createAccount({params:undefined,query:undefined,body:{platform:'douyin',accountHandle:'隔离来源账号',idempotencyKey:'isolated-account'}});
 const member=await groups.forAccount(base,account.id);expect(member).toMatchObject({accountId:account.id,version:1});if(mode==='legacy')expect(member.groupId).toBe(`grp_legacy_${account.id}`);
 const ctx:RequestContext={...registrationCtx,accountId:account.id},frozen:RequestContext={...ctx,groupId:member.groupId,groupVersion:1,membershipVersion:1,source:'ingestion'};
 const tasks=createPersistentTaskService(db,{now}),intelligence=(options.historical?createHistoricalIntelligenceService:createIntelligenceService)(db,{tasks,now,nextId}),transport=createIntelligenceTransport(()=>intelligence);
 const created=await createClient(ENDPOINTS,transport,ctx).createIntelligenceSource({params:undefined,query:undefined,body:{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/isolated-feed.xml'},monitorEnabled:false,runInitial,idempotencyKey:'isolated-source'}});
 const envelope=():IntelligenceAdapterEnvelope=>({adapterStatus:'succeeded_no_change',upstreamEvidence:{adapter:'rss',responseShape:'isolated-empty-feed',capturedAt:now(),listValid:true},items:[],checkpoint:null,errorCode:null,safeDiagnostics:{returnedCount:0}});
 return {db,ctx,frozen,base,groups,account,member,tasks,intelligence,created,now,nextId,envelope,advance:(ms:number)=>{elapsed+=ms;}};
}

it.each(['legacy','group'] as const)('%s 公共账号→来源初始运行→冻结执行→恢复消费完成原 run/task，无外网',async mode=>{
 const f=await fixture(mode),{source,run,task}=f.created;if(!run||!task)throw Error('来源未创建初始任务');
 const [storedSource]=await f.db.select().from(intelligenceSources).where(eq(intelligenceSources.id,source.id)),[storedRun]=await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.id,run.id));
 expect(task).toMatchObject({accountId:f.account.id,groupId:f.member.groupId,membershipVersion:1});
 let entered=0;const processed=await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async(ctx,input)=>{entered++;expect(ctx).toMatchObject({groupId:f.member.groupId,accountId:f.account.id});expect(input.source.id).toBe(source.id);return f.envelope();}}},1);
 expect(processed).toBe(1);expect(entered).toBe(1);
 expect(await f.tasks.get(f.ctx,task.id)).toMatchObject({id:task.id,status:'succeeded',attempt:1});
 expect((await f.intelligence.getRun(f.ctx,run.id)).run).toMatchObject({id:run.id,executionTaskId:task.id,status:'succeeded_no_change',newCount:0,scannedCount:0});
 expect((await f.intelligence.getRun(f.frozen,run.id)).run.id).toBe(run.id);
 const sources=await f.db.select().from(intelligenceSources),runs=await f.db.select().from(intelligenceSyncRuns);expect(sources).toHaveLength(1);expect(runs).toHaveLength(1);expect(sources[0]!.groupId).toBe(storedSource!.groupId);expect(runs[0]!.groupId).toBe(storedRun!.groupId);expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);
});

it('旧账号来源先建后手动 startRun 同样复用原 source/run/task 完成',async()=>{
 const f=await fixture('legacy',false);expect(f.created.run).toBeNull();
 const started=await f.intelligence.startRun(f.ctx,f.created.source.id,{trigger:'manual',idempotencyKey:'manual-legacy-start'});
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>f.envelope()}},1);
 expect((await f.intelligence.getRun(f.ctx,started.run.id)).run).toMatchObject({executionTaskId:started.task.id,status:'succeeded_no_change'});expect(await f.db.select().from(executionTasks)).toHaveLength(1);
});

it.each(['legacy','group'] as const)('%s 冻结来源/run 对异用户和异真实账号组继续拒绝',async mode=>{
 const f=await fixture(mode),{source,run,task}=f.created;if(!run||!task)throw Error('缺初始任务');
 const other=await f.groups.create(f.base,{name:'另一真实组',idempotencyKey:'other'});
 for(const ctx of [{...f.frozen,userId:'foreign-user'},{...f.frozen,groupId:other.id}]){
  await expect(f.intelligence.getRunByTaskForExecution(ctx,task.id)).rejects.toThrow();await expect(f.intelligence.getSourceExecutionInput(ctx,source.id)).rejects.toThrow();
 }
 expect(await f.tasks.get(f.ctx,task.id)).toMatchObject({status:'queued',attempt:0});expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);
});

it('真实转组受在途来源任务保护；取消后转组不让新组消费历史来源',async()=>{
 const f=await fixture(),{source,run,task}=f.created;if(!run||!task)throw Error('缺初始任务');
 const target=await f.groups.create(f.base,{name:'转组目标',idempotencyKey:'to'}),preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:target.id});
 await expect(f.groups.transfer(f.base,{...preview,idempotencyKey:'blocked-transfer'})).rejects.toThrow('进行中的任务');
 await f.tasks.command(f.ctx,{taskIds:[task.id],command:'cancel',idempotencyKey:'cancel-before-transfer'});
 const fresh=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:target.id}),moved=await f.groups.transfer(f.base,{...fresh,idempotencyKey:'transfer-after-cancel'});
 const next={...f.frozen,groupId:moved.groupId,membershipVersion:moved.version};await expect(f.intelligence.getRunByTaskForExecution(next,task.id)).rejects.toThrow();await expect(f.intelligence.startRun(next,source.id,{trigger:'manual',idempotencyKey:'reject-history-retrigger'})).rejects.toThrow();
 let entered=0;expect(await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{entered++;return f.envelope();}}},1)).toBe(0);expect(entered).toBe(0);expect(await f.tasks.get(f.ctx,task.id)).toMatchObject({status:'cancelled'});
});

it('显式组归档后的排队来源不能启动 adapter，原任务不伪签成功',async()=>{
 const f=await fixture('group'),task=f.created.task;if(!task)throw Error('缺初始任务');const group=await f.groups.get(f.base,f.member.groupId);await f.groups.archive(f.base,group.id,group.version);
 let entered=0;expect(await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{entered++;return f.envelope();}}},1)).toBe(0);expect(entered).toBe(0);expect((await f.tasks.get(f.ctx,task.id)).status).not.toBe('succeeded');
});

it('宿主停止前不领取来源；明确取消后不消费，保留原 ID 和真实零计数',async()=>{
 const f=await fixture(),{run,task}=f.created;if(!run||!task)throw Error('缺初始任务');let entered=0;const deps={tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{entered++;return f.envelope();}}};
 expect(await drainIntelligenceSourceQueue(deps,1,{shouldStop:()=>true})).toBe(0);expect(await f.tasks.get(f.ctx,task.id)).toMatchObject({status:'queued',attempt:0});
 await f.tasks.command(f.ctx,{taskIds:[task.id],command:'cancel',idempotencyKey:'cancel-queued-source'});expect(await drainIntelligenceSourceQueue(deps,1)).toBe(0);expect(entered).toBe(0);
 expect((await f.intelligence.getRun(f.ctx,run.id)).run).toMatchObject({id:run.id,executionTaskId:task.id,status:'failed',scannedCount:0,newCount:0});
});

it('实际租约恢复换 owner 后旧 adapter 回执不能覆盖新领取或写入结果',async()=>{
 const f=await fixture('group'),{source,run,task}=f.created;if(!run||!task)throw Error('缺初始任务');let replacement:Awaited<ReturnType<typeof f.tasks.claimTask>>;
 await expect(runIntelligenceSourceTask(f.frozen,{sourceId:source.id,runId:run.id,taskId:task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,workerId:()=> 'old-source-owner',adapter:{run:async()=>{f.advance(91000);await f.tasks.recoverExpiredLeases();replacement=await f.tasks.claimTask({taskId:task.id,workerId:'new-source-owner',leaseSeconds:90});expect(replacement).toBeTruthy();return f.envelope();}}})).rejects.toThrow();
 const [current]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));expect(current).toMatchObject({status:'running',attempt:2,leaseOwner:'new-source-owner',fenceToken:replacement!.lease.fenceToken});expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);expect(await f.db.select().from(intelligenceSyncRuns)).toHaveLength(1);
});

// 以下为正式修订后的增补族；上面九例与原 RED 断言保持。
function contentEnvelope(stamp:string,externalId:string|null='legacy-aweme',url='https://www.douyin.com/video/legacy-aweme'):IntelligenceAdapterEnvelope{
 return {adapterStatus:'succeeded_with_items',upstreamEvidence:{adapter:'rss',responseShape:'isolated-content',capturedAt:stamp,listValid:true},items:[{type:'video',platform:'douyin',externalId,canonicalUrl:url,authorId:'isolated-author',authorName:'隔离作者',title:'隔离真实旧作品',summary:null,coverUrl:null,publishedAt:null,durationMs:12000,metrics:{likeCount:2,commentCount:0,collectCount:0,shareCount:0,followerCount:null,metricSource:'isolated',qualityFlags:[]},snapshot:{finalUrl:url,title:'隔离快照',contentHash:'sha256:isolated-content',safeExtract:'隔离公开内容证据',storageRef:null,retentionUntil:null,privacyClass:'public'}}],checkpoint:null,errorCode:null,safeDiagnostics:{returnedCount:1}};
}
async function historicalContent(externalId:string|null='legacy-aweme',postgres=false,mode:'legacy'|'group'='legacy'){
 const f=await fixture(mode,true,{historical:true,postgres}),{run,task}=f.created;if(!run||!task)throw Error('旧服务未产生原任务');
 const claim=await f.tasks.claimTask({taskId:task.id,workerId:'historical-writer',leaseSeconds:90});if(!claim)throw Error('旧夹具未能领取');
 const result=await f.intelligence.applyAdapterBatch(f.ctx,{runId:run.id,lease:claim.lease,envelope:contentEnvelope(f.now(),externalId),terminal:true});const itemId=result.itemIds[0]!;
 await f.intelligence.uploadManualTranscript(f.ctx,{itemId,inputMode:'paste',text:'这是原始隔离逐字稿，必须保留原文与真实作品关系。'});
 const [item]=await f.db.select().from(intelligenceItems).where(eq(intelligenceItems.id,itemId)),[transcript]=await f.db.select().from(itemTranscripts).where(eq(itemTranscripts.itemId,itemId)),[observation]=await f.db.select().from(itemSourceObservations).where(eq(itemSourceObservations.itemId,itemId)),[snapshot]=await f.db.select().from(sourceSnapshots).where(eq(sourceSnapshots.itemId,itemId));
 for(const row of [item,transcript,observation,snapshot])expect(row!.groupId).toBe(mode==='legacy'?null:f.member.groupId);
 return {...f,item:item!,transcript:transcript!,observation:observation!,snapshot:snapshot!,candidate:createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId})};
}

it.each(['externalId','urlHash'] as const)('旧版本真实 NULL 根和关联按%s再次采集复用原 ID，列表详情同一作品',async kind=>{
 const f=await historicalContent(kind==='externalId'?'legacy-aweme':null),started=await f.candidate.startRun(f.frozen,f.created.source.id,{trigger:'manual',idempotencyKey:'canonical-again'});
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>contentEnvelope(f.now(),kind==='externalId'?'legacy-aweme':null)}},1);
 expect((await f.candidate.getRun(f.frozen,started.run.id)).run).toMatchObject({newCount:0,updatedCount:1,status:'succeeded_with_items'});
 const [item]=await f.db.select().from(intelligenceItems);expect(item).toMatchObject({id:f.item.id,groupId:null,createdAt:f.item.createdAt});expect(await f.db.select().from(intelligenceItems)).toHaveLength(1);
 expect((await f.candidate.getItem(f.frozen,f.item.id)).transcript.text).toBe(f.transcript.text);expect((await f.candidate.listItems(f.frozen,{sourceId:f.created.source.id})).rows.map(row=>row.item.id)).toEqual([f.item.id]);
 expect((await f.db.select().from(itemSourceObservations))[0]).toMatchObject({id:f.observation.id,groupId:null});expect((await f.db.select().from(sourceSnapshots)).find(row=>row.id===f.snapshot.id)).toMatchObject({groupId:null,contentHash:f.snapshot.contentHash});
});

it('真实旧来源通过 legacy 和 group/account=NULL 串行创建复用；系统分类不复制',async()=>{
 const f=await historicalContent(),groupOnly={...f.frozen,accountId:null,membershipVersion:undefined};
 const repeat=await f.candidate.createSource(groupOnly,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/isolated-feed.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'group-same'});
 expect(repeat.source.id).toBe(f.created.source.id);expect(await f.db.select().from(intelligenceSources)).toHaveLength(1);
 const oldWorkspace=await f.intelligence.getWorkspace(f.ctx),current=await f.candidate.getWorkspace(groupOnly);expect(current.collections.map(row=>row.id).sort()).toEqual(oldWorkspace.collections.map(row=>row.id).sort());expect(await f.db.select().from(intelligenceCollections)).toHaveLength(2);
});

it('PG55422 两入口来源并发和不同来源相同作品并发只复用一个逻辑实体',async()=>{
 const f=await fixture('legacy',false,{postgres:true}),groupOnly={...f.frozen,accountId:null,membershipVersion:undefined};
 const input={collectionId:null,type:'rss' as const,config:{type:'rss' as const,url:'https://example.test/concurrent.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'concurrent'};
 const [a,b]=await Promise.all([f.intelligence.createSource(f.ctx,input),f.intelligence.createSource(groupOnly,input)]);expect(a.source.id).toBe(b.source.id);
 const left=await f.intelligence.startRun(f.frozen,f.created.source.id,{trigger:'manual',idempotencyKey:'left'}),right=await f.intelligence.startRun(groupOnly,a.source.id,{trigger:'manual',idempotencyKey:'right'});
 await Promise.all([runIntelligenceSourceTask(f.frozen,{sourceId:left.run.sourceId,runId:left.run.id,taskId:left.task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,workerId:()=> 'left',adapter:{run:async()=>contentEnvelope(f.now())}}),runIntelligenceSourceTask(groupOnly,{sourceId:right.run.sourceId,runId:right.run.id,taskId:right.task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,workerId:()=> 'right',adapter:{run:async()=>contentEnvelope(f.now())}})]);
 expect(await f.db.select().from(intelligenceItems)).toHaveLength(1);const runs=await f.db.select().from(intelligenceSyncRuns);expect(runs.reduce((sum,row)=>sum+row.newCount,0)).toBe(1);expect(runs.reduce((sum,row)=>sum+row.updatedCount,0)).toBe(1);
 const [item]=await f.db.select().from(intelligenceItems);expect(item!.groupId).toBe(f.member.groupId);
});

it('旧 item 真正转写 admission 绑定原 transcript/task，手工稿和来源 URL 不漂移',async()=>{
 const f=await historicalContent(),queued=await f.candidate.enqueueTranscripts(f.frozen,{itemIds:[f.item.id],idempotencyKey:'transcribe-old'}),task=queued.tasks[0];if(!task)throw Error('未创建转写任务');
 const claim=await f.tasks.claimTask({taskId:task.id,workerId:'isolated-transcribe',leaseSeconds:300});if(!claim)throw Error('未领取转写');
 const leases=createExecutionLeaseService(f.db,{now:f.now}),bound=await leases.withLease({executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',bindIntelligenceTranscript);
 expect(bound.item.id).toBe(f.item.id);expect(bound.transcript.executionTaskId).toBe(task.id);expect(bound.item.canonicalUrl).toBe(f.item.canonicalUrl);
 await f.candidate.finishTranscript(f.frozen,{taskId:task.id,status:'done',text:'隔离 ASR 返回的正确逐字稿',provider:'isolated',model:'isolated'});await f.tasks.finish({taskId:task.id,...claim.lease,status:'succeeded'});
 expect((await f.candidate.getItem(f.frozen,f.item.id)).transcript.text).toBe('隔离 ASR 返回的正确逐字稿');expect((await f.db.select().from(itemTranscripts))[0]!.groupId).toBeNull();
});

it('group-only RSS 在历史账号真实转组后仍可消费原组来源，旧历史不进新组',async()=>{
 const f=await historicalContent(),target=await f.groups.create(f.base,{name:'历史成员转出',idempotencyKey:'target'}),preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:target.id});await f.groups.transfer(f.base,{...preview,idempotencyKey:'move'});
 const groupOnly={...f.frozen,accountId:null,membershipVersion:undefined},started=await f.candidate.startRun(groupOnly,f.created.source.id,{trigger:'manual',idempotencyKey:'group-rss-no-account'});
 expect(started.task.accountId).toBeNull();expect((await f.candidate.getItem(groupOnly,f.item.id)).item.id).toBe(f.item.id);await expect(f.candidate.getItem({...groupOnly,groupId:target.id},f.item.id)).rejects.toThrow();
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async(ctx)=>{expect(ctx.accountId).toBeNull();return f.envelope();}}},1);expect((await f.candidate.getRun(groupOnly,started.run.id)).run.status).toBe('succeeded_no_change');
});

it('缺真实成员、重复初始历史和 leftAt 后 NULL 根不借旧支路',async()=>{
 const f=await historicalContent();await f.db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.account.id));await expect(f.candidate.getItem(f.frozen,f.item.id)).rejects.toThrow();await expect(f.candidate.createSource(f.ctx,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/missing-member.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'bad'})).rejects.toThrow();
 await f.db.insert(accountGroupMemberships).values([{id:'duplicate-v1-a',userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,version:1,joinedAt:f.now(),leftAt:f.now()},{id:'duplicate-v1-b',userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,version:1,joinedAt:f.now(),leftAt:f.now()}]);await expect(f.candidate.getItem(f.frozen,f.item.id)).rejects.toThrow();
 await f.db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.id,'duplicate-v1-b'));f.advance(1000);const late=await f.intelligence.seedItemForTest(f.ctx,{canonicalUrl:'https://example.test/post-transfer',externalId:null,title:'不合法的新 NULL 根'});await expect(f.candidate.getItem({...f.frozen,accountId:null,membershipVersion:undefined},late)).rejects.toThrow();
});

it('旧 capturedAt 的错 snapshot 父关系不能进入 item 详情或项目引用',async()=>{
 const f=await historicalContent();await f.db.update(sourceSnapshots).set({runId:'unrelated-real-id',capturedAt:'1990-01-01T00:00:00.000Z'}).where(eq(sourceSnapshots.id,f.snapshot.id));
 const detail=await f.candidate.getItem(f.frozen,f.item.id);expect(detail.snapshots).toHaveLength(0);
});

it.each(['pause','cancel'] as const)('首次绑定拒绝的 get/finish 之间用户%s，原控制优先不变 blocked',async command=>{
 const f=await fixture('group'),task=f.created.task!,run=f.created.run!;let inserted=false;
 const tasks={...f.tasks,finish:async(input:Parameters<typeof f.tasks.finish>[0])=>{if(!inserted){inserted=true;await f.tasks.command(f.frozen,{taskIds:[task.id],command,idempotencyKey:'last-moment-'+command});}return f.tasks.finish(input);}};
 const intelligence={...f.intelligence,getRunByTaskForExecution:async()=>{throw new OwnershipError('隔离绑定拒绝');}};
 await drainIntelligenceSourceQueue({tasks,intelligence,now:f.now,adapter:{run:async()=>{throw Error('不应调用');}}},1).catch(()=>{});
 expect(inserted).toBe(true);expect((await f.tasks.get(f.frozen,task.id)).status).toBe(command==='pause'?'paused':'cancelled');expect((await f.db.select().from(intelligenceSyncRuns))[0]!.id).toBe(run.id);
});

it('当前 claim 首次拒绝只 blocked 原 execution；合法绑定的原 run 回读对账',async()=>{
 const f=await fixture('group'),task=f.created.task!,run=f.created.run!;const intelligence={...f.intelligence,getRunByTaskForExecution:async()=>{throw new OwnershipError('隔离读取拒绝');}};
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence,now:f.now,adapter:{run:async()=>{throw Error('不应调用');}}},1).catch(()=>{});
 expect(await f.tasks.get(f.frozen,task.id)).toMatchObject({status:'blocked',errorCode:'SOURCE_SYNC_ADMISSION_REJECTED',attempt:1});expect((await f.intelligence.getRun(f.frozen,run.id)).run).toMatchObject({status:'blocked',executionTaskId:task.id});
});

it('错 task owner 与 payload 来源不启动 adapter、不修改其它原 run',async()=>{
 const f=await fixture('group'),task=f.created.task!,run=f.created.run!;await f.db.update(executionTasks).set({ownerId:'another-source',payload:{sourceId:'another-source'}}).where(eq(executionTasks.id,task.id));let entered=0;
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{entered++;return f.envelope();}}},1).catch(()=>{});expect(entered).toBe(0);expect((await f.tasks.get(f.frozen,task.id)).status).toBe('blocked');expect((await f.db.select().from(intelligenceSyncRuns))[0]).toMatchObject({id:run.id,status:'queued'});
});

it('原 fence 内部传入落结果，篡改当前 fence 的旧 adapter 无写入权',async()=>{
 const f=await fixture('group'),{source,run,task}=f.created;if(!run||!task)throw Error('无原任务');
 await expect(runIntelligenceSourceTask(f.frozen,{sourceId:source.id,runId:run.id,taskId:task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{await f.db.update(executionTasks).set({fenceToken:'replacement-fence'}).where(eq(executionTasks.id,task.id));return contentEnvelope(f.now());}}})).rejects.toThrow();
 expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);const [current]=await f.db.select().from(executionTasks);expect(current).toMatchObject({status:'running',fenceToken:'replacement-fence'});
});

it.each([false,true])('旧服务确认 transform 后项目引用回读及并发保原 snapshot/hash（PG=%s）',async postgres=>{
 const f=await historicalContent('legacy-aweme',postgres),historical=createHistoricalIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,positioning:{getVersion:async()=>({id:'isolated-positioning',oneLiner:'隔离定位',keywords:[]})},topics:{create:async()=>({id:'isolated-confirmed-topic'})}});
 const preview=await historical.startTopicPreview(f.ctx,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,positioningVersionId:'isolated-positioning',strategyBacked:true,idempotencyKey:'old-transform'}),claim=await f.tasks.claimTask({taskId:preview.task.id,workerId:'isolated-transform',leaseSeconds:300});if(!claim)throw Error('未领取旧 transform');
 await historical.finishTopicPreview(f.ctx,preview.transform.id,{generationMode:'strategy_backed',hook:'隔离钩子',structureSteps:['提出问题','验证事实'],coreClaims:['隔离观点'],reusablePattern:'隔离结构',factRisks:[],title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]},adaptedDraft:'隔离初稿正文',sourceUrl:f.item.canonicalUrl,transcriptHash:'sha256:'+createHash('sha256').update(f.transcript.text!.trim()).digest('hex')});
 await f.tasks.finish({taskId:preview.task.id,...claim.lease,status:'succeeded'});const confirmed=await historical.confirmTopic(f.ctx,preview.transform.id,{idempotencyKey:'confirm-old',editedCandidate:{title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]}}});expect(confirmed.transform.status).toBe('confirmed');
 const projects=createProjectsService(createProjectRepository(f.db),{now:f.now,nextId:f.nextId}),project=await projects.createProject(f.frozen,{title:'隔离真实来源项目'}),projectId=project.id;
 const references=createProjectIntelligenceReferenceService(f.db,{now:f.now,nextId:f.nextId,projects:{assertExists:async(ctx,id)=>{await projects.getProject(ctx,id);}}});
 const ref=await references.attach(f.frozen,{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-old'}),[context]=await references.getSourceContexts(f.frozen,{projectId,referenceIds:[ref.id]});expect(context!.transcript.hash).toBe(ref.transcriptHash);expect(context!.item.id).toBe(f.item.id);expect(context!.snapshot.id).toBe(f.snapshot.id);
 const again=await references.attach(f.frozen,{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-again'});expect(again.id).toBe(ref.id);expect(await f.db.select().from(projectIntelligenceReferences)).toHaveLength(1);
 const parallel=await Promise.all([references.attach(f.ctx,{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-parallel-legacy'}),references.attach({...f.frozen,accountId:null,membershipVersion:undefined},{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-parallel-group'})]);expect(parallel.map(value=>value.id)).toEqual([ref.id,ref.id]);expect(await f.db.select().from(projectIntelligenceReferences)).toHaveLength(1);
 await f.db.update(itemTranscripts).set({text:'另一份新稿'}).where(eq(itemTranscripts.itemId,f.item.id));await expect(references.getSourceContexts(f.frozen,{projectId})).rejects.toThrow('逐字稿已变化');await f.db.update(itemTranscripts).set({text:f.transcript.text}).where(eq(itemTranscripts.itemId,f.item.id));
 await f.db.update(sourceSnapshots).set({itemId:'foreign-item'}).where(eq(sourceSnapshots.id,f.snapshot.id));await expect(references.getSourceContexts(f.frozen,{projectId})).rejects.toThrow();
});

it('真实 share_import 专用族保两段 apply/finalize，不被 source_sync owner 门误杀',async()=>{
 const f=await fixture('group',false),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});const projectAccount=async(ctx:RequestContext,id:string)=>{const row=await accounts.getAccount(ctx,id);return {accountId:row.id,accountHandle:row.accountHandle,platform:row.platform,status:row.status};};const intelligence=createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,collectorAccounts:{getCollectorAccount:projectAccount,listCollectorAccounts:async()=>[await projectAccount(f.frozen,f.account.id)]}});
 const queued=await intelligence.enqueueDouyinShareImport(f.frozen,{collectionId:null,shareInput:'https://www.douyin.com/video/isolated-share',idempotencyKey:'isolated-share'}),claim=await f.tasks.claimTask({taskId:queued.task.id,workerId:'isolated-share-owner',leaseSeconds:300});if(!claim)throw Error('未领取分享');
 const item=contentEnvelope(f.now(),'isolated-share','https://www.douyin.com/video/isolated-share').items[0]!;const result=await intelligence.importDouyinSharedItem(f.frozen,{taskId:queued.task.id,lease:claim.lease,collectionId:null,item,browserSessionRef:'isolated-session'});
 expect(result.createdItem).toBe(true);expect(await f.tasks.get(f.frozen,queued.task.id)).toMatchObject({status:'succeeded',attempt:1});expect((await intelligence.getItem(f.frozen,result.item.id)).item.id).toBe(result.item.id);expect((await f.db.select().from(intelligenceSyncRuns))[0]).toMatchObject({executionTaskId:queued.task.id,newCount:1,status:'succeeded_with_items'});
});

it.each(['account','group'] as const)('adapter 等待时归档%s 迟到回执不得写入结果',async target=>{
 const f=await fixture('group'),{source,run,task}=f.created;if(!run||!task)throw Error('无原任务');
 await runIntelligenceSourceTask(f.frozen,{sourceId:source.id,runId:run.id,taskId:task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{if(target==='group'){const group=await f.groups.get(f.base,f.member.groupId);await f.groups.archive(f.base,group.id,group.version);}else{const accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});await accounts.archiveAccount(f.frozen,f.account.id);}return contentEnvelope(f.now());}}}).catch(()=>{});
 expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);expect((await f.tasks.get(f.frozen,task.id)).status).not.toBe('succeeded');
});

it('adapter 已返回而心跳仍 in-flight 时等待原心跳；停控先提交不落回执',async()=>{
 const f=await fixture('group'),{source,run,task}=f.created;if(!run||!task)throw Error('无原任务');let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});let heartbeats=0;
 const tasks={...f.tasks,heartbeat:async(input:Parameters<typeof f.tasks.heartbeat>[0])=>{heartbeats++;enter();await held;return f.tasks.heartbeat(input);}};
 const pending=runIntelligenceSourceTask(f.frozen,{sourceId:source.id,runId:run.id,taskId:task.id},{tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{await entered;return contentEnvelope(f.now());}}});
 try{await entered;await f.tasks.command(f.frozen,{taskIds:[task.id],command:'pause',idempotencyKey:'pause-in-flight'});expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);}finally{release();}
 await pending;expect(heartbeats).toBe(1);expect((await f.tasks.get(f.frozen,task.id)).status).toBe('paused');expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);
},120000);

it('首次拒绝前明确存量 unknown_result 安全夹具与真实调用账本，原未知事实不被 blocked 覆盖',async()=>{
 const f=await fixture('group'),task=f.created.task!,intelligence={...f.intelligence,getRunByTaskForExecution:async()=>{const [row]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));const ref={executionTaskId:row!.id,attempt:row!.attempt,fenceToken:row!.fenceToken!},ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget:{maxCalls:3,maxTokens:100,deadlineMs:120000}}),call=await ledger.reserve(ref,{operationKey:'isolated-unconfirmed-source',kind:'tool',inputDigest:'sha256:'+'c'.repeat(64),reservedTokens:1});await ledger.start(ref,call.id);
 // 仅安全负例：当前 source_sync 恢复按只读族不读取调用账本；不冒称自然恢复会生成 unknown。
 await f.db.update(executionTasks).set({status:'unknown_result',lastErrorCode:'CALL_RESULT_UNKNOWN',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,task.id));throw Error('原回执状态已未知');}};
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence,now:f.now,adapter:{run:async()=>{throw Error('不应调用');}}},1).catch(()=>{});const [row]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));expect(row).toMatchObject({status:'unknown_result',attempt:1,lastErrorCode:'CALL_RESULT_UNKNOWN'});
});

it('真实初始成员仍 current 时重复 v1 历史拒绝旧入口写入，不新增第二份来源',async()=>{
 const f=await fixture('legacy',false,{historical:true}),candidate=createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId});
 await f.db.insert(accountGroupMemberships).values({id:'ambiguous-initial-history',userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,version:1,joinedAt:f.now(),leftAt:f.now()});
 await expect(candidate.createSource(f.ctx,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/isolated-feed.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'ambiguous-write'})).rejects.toThrow('历史不唯一');
 const rows=await f.db.select().from(intelligenceSources);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:f.created.source.id,groupId:null});
});

it('转组后旧根日期必须是可信 UTC 日历，坏月份/日期/垃圾串不借历史且不炸合法列表',async()=>{
 const f=await historicalContent(),goodId=await f.intelligence.seedItemForTest(f.ctx,{canonicalUrl:'https://example.test/calendar-valid',externalId:null,title:'合法历史根'});f.advance(1000);
 const target=await f.groups.create(f.base,{name:'时间边界目标',idempotencyKey:'calendar-target'}),preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:target.id});await f.groups.transfer(f.base,{...preview,idempotencyKey:'calendar-transfer'});
 const oldGroup={...f.frozen,accountId:null,membershipVersion:undefined};expect((await f.candidate.getItem(oldGroup,f.item.id)).item.id).toBe(f.item.id);
 for(const createdAt of ['2025-00-00Tgarbage','2025-01-01Tgarbage','2025-02-30T00:00:00.000Z','2025-02-29T00:00:00.000Z','2025-04-31T00:00:00.000Z','2025-13-01T00:00:00.000Z','2025-01-01T24:00:00.000Z','2025-01-01T00:00:60.000Z','2026-10-11T10:00:01.001Z']){
  await f.db.update(intelligenceItems).set({createdAt}).where(eq(intelligenceItems.id,f.item.id));await expect(f.candidate.getItem(oldGroup,f.item.id)).rejects.toThrow();const listed=await f.candidate.listItems(oldGroup,{});expect(listed.rows.map(row=>row.item.id)).toContain(goodId);expect(listed.rows.map(row=>row.item.id)).not.toContain(f.item.id);
 }
 await f.db.update(intelligenceItems).set({createdAt:'2024-02-29T00:00:00.000Z'}).where(eq(intelligenceItems.id,f.item.id));expect((await f.candidate.getItem(oldGroup,f.item.id)).item.id).toBe(f.item.id);
 await f.db.update(accountGroupMemberships).set({leftAt:'2026-10-99Tgarbage'}).where(eq(accountGroupMemberships.id,f.member.id));await expect(f.candidate.getItem(oldGroup,f.item.id)).rejects.toThrow();
});


it('旧来源 schedule 消费新增作品与改写根 canonical，旧关联与原预算不漂移',async()=>{
 const f=await historicalContent();await f.candidate.updateSource(f.frozen,f.created.source.id,{monitorEnabled:true,expectedVersion:1});f.advance(25*60*60*1000);
 expect(await f.candidate.enqueueDueSourceRuns(f.frozen)).toBe(1);const pending=(await f.db.select().from(executionTasks)).find(row=>row.status==='queued'&&row.kind==='source_sync');if(!pending)throw Error('未产生原计划任务');const before=pending.executionBudget;
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>contentEnvelope(f.now(),'new-canonical-item','https://www.douyin.com/video/new-canonical-item')}},1);const fresh=(await f.db.select().from(intelligenceItems)).find(row=>row.id!==f.item.id);expect(fresh!.groupId).toBe(f.member.groupId);expect((await f.db.select().from(executionTasks)).find(row=>row.id===pending.id)!.executionBudget).toEqual(before);
 const preview=await f.candidate.startTopicPreview(f.ctx,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,idempotencyKey:'canonical-rewrite'});expect((await f.db.select().from(intelligenceTransforms))[0]).toMatchObject({id:preview.transform.id,groupId:f.member.groupId,itemId:f.item.id,sourceSnapshotId:f.snapshot.id});expect(preview.task.groupId).toBe(f.member.groupId);expect((await f.db.select().from(intelligenceItems)).find(row=>row.id===f.item.id)!.groupId).toBeNull();
});


it.each([{mode:'legacy' as const,postgres:false},{mode:'group' as const,postgres:false},{mode:'legacy' as const,postgres:true}])('$mode PG=$postgres 永久删除保项目来源保护：原引用回读且业务隐藏、原 identity 可重建',async({mode,postgres})=>{
 const f=await historicalContent('legacy-aweme',postgres,mode),historical=createHistoricalIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,positioning:{getVersion:async()=>({id:'isolated-positioning',oneLiner:'隔离定位',keywords:[]})},topics:{create:async()=>({id:'isolated-confirmed-topic'})}});
 const preview=await historical.startTopicPreview(f.ctx,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,positioningVersionId:'isolated-positioning',strategyBacked:true,idempotencyKey:'old-transform'}),claim=await f.tasks.claimTask({taskId:preview.task.id,workerId:'isolated-transform',leaseSeconds:300});if(!claim)throw Error('未领取旧 transform');
 await historical.finishTopicPreview(f.ctx,preview.transform.id,{generationMode:'strategy_backed',hook:'隔离钩子',structureSteps:['提出问题','验证事实'],coreClaims:['隔离观点'],reusablePattern:'隔离结构',factRisks:[],title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]},adaptedDraft:'隔离初稿正文',sourceUrl:f.item.canonicalUrl,transcriptHash:'sha256:'+createHash('sha256').update(f.transcript.text!.trim()).digest('hex')});
 await f.tasks.finish({taskId:preview.task.id,...claim.lease,status:'succeeded'});const confirmed=await historical.confirmTopic(f.ctx,preview.transform.id,{idempotencyKey:'confirm-old',editedCandidate:{title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]}}});expect(confirmed.transform.status).toBe('confirmed');
 const projects=createProjectsService(createProjectRepository(f.db),{now:f.now,nextId:f.nextId}),project=await projects.createProject(f.frozen,{title:'隔离真实来源项目'}),projectId=project.id;
 const references=createProjectIntelligenceReferenceService(f.db,{now:f.now,nextId:f.nextId,projects:{assertExists:async(ctx,id)=>{await projects.getProject(ctx,id);}}});
 const ref=await references.attach(f.frozen,{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-old'}),[context]=await references.getSourceContexts(f.frozen,{projectId,referenceIds:[ref.id]});expect(context!.transcript.hash).toBe(ref.transcriptHash);expect(context!.item.id).toBe(f.item.id);expect(context!.snapshot.id).toBe(f.snapshot.id);
 if(postgres){const sibling=await projects.createProject(f.frozen,{title:'并发引用的真实项目'});const results=await Promise.all([references.attach(f.frozen,{projectId:sibling.id,topicId:confirmed.topicId,idempotencyKey:'concurrent-attach'}),f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})]);expect(results[1].status).toBe('deleted');expect((await references.getSourceContexts(f.frozen,{projectId:sibling.id}))[0]!.transcript.hash).toBe(ref.transcriptHash);}
 else{const removed=await f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id});expect(removed.status).toBe('deleted');}
 const contexts=await references.getSourceContexts(f.frozen,{projectId,referenceIds:[ref.id]});expect(contexts).toHaveLength(1);expect(contexts[0]!.item.id).toBe(f.item.id);expect(contexts[0]!.snapshot.id).toBe(f.snapshot.id);expect(contexts[0]!.transcript.hash).toBe(ref.transcriptHash);expect((await f.db.select().from(projectIntelligenceReferences))[0]!.id).toBe(ref.id);
 const [shell]=await f.db.select().from(intelligenceSources).where(eq(intelligenceSources.id,f.created.source.id));expect(shell).toMatchObject({id:f.created.source.id,groupId:mode==='legacy'?null:f.member.groupId,status:'archived',monitorEnabled:false,nextRunAt:null,browserSessionRef:null,extractionInstruction:null,adapterConfig:{__creatorosProvenanceOnly:1,originalExternalKey:f.created.source.externalKey},externalKey:`__creatoros_deleted_source__:${f.created.source.id}`});
 for(const query of [{},{status:'archived' as const},{status:'active' as const}])expect((await f.candidate.listSources(f.frozen,query)).total).toBe(0);
 const workspace=await f.candidate.getWorkspace(f.frozen);expect(workspace.sources).toHaveLength(0);expect(workspace.health).toHaveLength(0);expect(workspace.memberships).toHaveLength(0);
 await expect(f.candidate.getSourceExecutionInput(f.frozen,f.created.source.id)).rejects.toThrow();await expect(f.candidate.startRun(f.frozen,f.created.source.id,{trigger:'manual',idempotencyKey:'no-revive'})).rejects.toThrow();await expect(f.candidate.getRun(f.frozen,f.created.run!.id)).rejects.toThrow();await expect(f.candidate.listRuns(f.frozen,f.created.source.id)).rejects.toThrow();expect(await f.db.select().from(executionTasks)).toHaveLength(1);
 const createInput={collectionId:null,type:'rss' as const,config:{type:'rss' as const,url:'https://example.test/isolated-feed.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'new-after-permanent'};
 const replacement=await f.candidate.createSource(f.frozen,createInput);if(postgres){const more=await Promise.all([f.candidate.createSource(f.ctx,createInput),f.candidate.createSource({...f.frozen,accountId:null,membershipVersion:undefined},createInput)]);expect(more.map(value=>value.source.id)).toEqual([replacement.source.id,replacement.source.id]);}expect(replacement.source.id).not.toBe(f.created.source.id);expect((await f.candidate.listSources(f.frozen,{})).rows.map(row=>row.id)).toEqual([replacement.source.id]);
 await f.candidate.deleteSource(f.frozen,replacement.source.id,{mode:'archive'});expect((await f.candidate.listSources(f.frozen,{status:'archived'})).rows.map(row=>row.id)).toEqual([replacement.source.id]);expect((await f.candidate.listSources(f.frozen,{})).rows.map(row=>row.id)).toEqual([replacement.source.id]);

});

it('原租约过期但尚未恢复时迟到 adapter 不写批次、不把原任务强行结算',async()=>{
 const f=await fixture('group'),{source,run,task}=f.created;if(!run||!task)throw Error('缺原任务');
 await expect(runIntelligenceSourceTask(f.frozen,{sourceId:source.id,runId:run.id,taskId:task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,workerId:()=> 'expired-original',adapter:{run:async()=>{f.advance(91000);return contentEnvelope(f.now());}}})).rejects.toThrow();
 expect(await f.db.select().from(intelligenceItems)).toHaveLength(0);const [raw]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));expect(raw).toMatchObject({id:task.id,status:'running',attempt:1,leaseOwner:'expired-original'});expect((await f.db.select().from(intelligenceSyncRuns))[0]).toMatchObject({id:run.id,newCount:0,scannedCount:0});
});

it('坏 snapshot 父不解除已生成稿件保护，工作流保真实存在而正文/AI仍拒绝',async()=>{
 const f=await historicalContent(),preview=await f.candidate.startTopicPreview(f.frozen,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,idempotencyKey:'guard-bad-parent'});
 await f.db.update(sourceSnapshots).set({sourceId:'nonexistent-source'}).where(eq(sourceSnapshots.id,f.snapshot.id));
 await expect(f.candidate.uploadManualTranscript(f.frozen,{itemId:f.item.id,inputMode:'paste',text:'不应覆盖原稿'})).rejects.toThrow('TRANSCRIPT_LOCKED');expect((await f.candidate.enqueueTranscripts(f.frozen,{itemIds:[f.item.id],idempotencyKey:'guard-retranscribe'})).skipped).toEqual([{itemId:f.item.id,reason:'TRANSCRIPT_LOCKED'}]);
 expect((await f.candidate.getItem(f.frozen,f.item.id)).transforms).toHaveLength(0);await expect(f.candidate.getTopicPreviewForExecution(f.frozen,preview.task.id)).rejects.toThrow();expect((await f.db.select().from(itemTranscripts))[0]!.text).toBe(f.transcript.text);
});


async function protectedContentFixture(attach=true,mode:'legacy'|'group'='legacy',postgres=false){
 const f=await historicalContent('legacy-aweme',postgres,mode),historical=createHistoricalIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,positioning:{getVersion:async()=>({id:'isolated-positioning',oneLiner:'隔离定位',keywords:[]})},topics:{create:async()=>({id:'isolated-confirmed-topic'})}});
 const preview=await historical.startTopicPreview(f.ctx,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,positioningVersionId:'isolated-positioning',strategyBacked:true,idempotencyKey:'old-transform'}),claim=await f.tasks.claimTask({taskId:preview.task.id,workerId:'isolated-transform',leaseSeconds:300});if(!claim)throw Error('未领取旧 transform');
 await historical.finishTopicPreview(f.ctx,preview.transform.id,{generationMode:'strategy_backed',hook:'隔离钩子',structureSteps:['提出问题','验证事实'],coreClaims:['隔离观点'],reusablePattern:'隔离结构',factRisks:[],title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]},adaptedDraft:'隔离初稿正文',sourceUrl:f.item.canonicalUrl,transcriptHash:'sha256:'+createHash('sha256').update(f.transcript.text!.trim()).digest('hex')});
 await f.tasks.finish({taskId:preview.task.id,...claim.lease,status:'succeeded'});const confirmed=await historical.confirmTopic(f.ctx,preview.transform.id,{idempotencyKey:'confirm-old',editedCandidate:{title:'隔离确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]}}});expect(confirmed.transform.status).toBe('confirmed');
 const projects=createProjectsService(createProjectRepository(f.db),{now:f.now,nextId:f.nextId}),project=await projects.createProject(f.frozen,{title:'隔离真实来源项目'}),projectId=project.id;
 const references=createProjectIntelligenceReferenceService(f.db,{now:f.now,nextId:f.nextId,projects:{assertExists:async(ctx,id)=>{await projects.getProject(ctx,id);}}});
 const ref=attach?await references.attach(f.frozen,{projectId,topicId:confirmed.topicId,idempotencyKey:'attach-old'}):null;
 return {...f,projects,projectId,references,confirmed,preview,ref};
}


it('只有真实 confirmed topic 也保最小父闭包，不借空 Project ref',async()=>{
 const f=await protectedContentFixture(false);expect(await f.db.select().from(projectIntelligenceReferences)).toHaveLength(0);
 const deleted=await f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id});expect(deleted).toMatchObject({status:'deleted',affectedItems:0,preservedSnapshots:1});
 const detail=await f.candidate.getItem(f.frozen,f.item.id);expect(detail.snapshots.map(value=>value.id)).toContain(f.snapshot.id);expect(detail.transforms.map(value=>value.id)).toContain(f.confirmed.transform.id);expect((await f.db.select().from(intelligenceSyncRuns)).map(value=>value.id)).toEqual([f.created.run!.id]);expect((await f.candidate.listSources(f.frozen,{})).total).toBe(0);
});

it('同源混合多 run 仅保真正受保护父，未引用作品/回执和执行权清理',async()=>{
 const f=await protectedContentFixture(),extra=await f.candidate.startRun(f.frozen,f.created.source.id,{trigger:'manual',idempotencyKey:'unprotected-second-run'});
 await runIntelligenceSourceTask(f.frozen,{sourceId:f.created.source.id,runId:extra.run.id,taskId:extra.task.id},{tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>contentEnvelope(f.now(),'unprotected-item','https://www.douyin.com/video/unprotected-item')}});
 expect((await f.db.select().from(intelligenceItems))).toHaveLength(2);const deleted=await f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id});expect(deleted).toMatchObject({affectedItems:1,preservedSnapshots:1,status:'deleted'});expect((await f.db.select().from(intelligenceSyncRuns)).map(value=>value.id)).toEqual([f.created.run!.id]);expect((await f.db.select().from(sourceSnapshots)).map(value=>value.id)).toEqual([f.snapshot.id]);expect((await f.db.select().from(intelligenceItems)).map(value=>value.id)).toEqual([f.item.id]);expect((await f.references.getSourceContexts(f.frozen,{projectId:f.projectId}))[0]!.transcript.hash).toBe(f.ref!.transcriptHash);
});

it('保护 snapshot 只属于另一来源时本 source 完全删除，不误保证据壳',async()=>{
 const f=await protectedContentFixture(),other=await f.candidate.createSource(f.frozen,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/other-shared-source.xml'},monitorEnabled:false,runInitial:true,idempotencyKey:'other-shared'});if(!other.run||!other.task)throw Error('缺其它来源真实任务');
 await runIntelligenceSourceTask(f.frozen,{sourceId:other.source.id,runId:other.run.id,taskId:other.task.id},{tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>contentEnvelope(f.now())}});
 expect(await f.db.select().from(intelligenceItems)).toHaveLength(1);const deleted=await f.candidate.deleteSource(f.frozen,other.source.id,{mode:'permanent',confirmToken:other.source.id});expect(deleted).toMatchObject({affectedItems:0,status:'deleted'});expect((await f.db.select().from(intelligenceSources)).map(value=>value.id)).toEqual([f.created.source.id]);expect((await f.db.select().from(intelligenceSyncRuns)).map(value=>value.id)).toEqual([f.created.run!.id]);expect((await f.references.getSourceContexts(f.frozen,{projectId:f.projectId}))[0]!.snapshot.id).toBe(f.snapshot.id);expect((await f.candidate.listSources(f.frozen,{})).rows.map(value=>value.id)).toEqual([f.created.source.id]);
});

it('错误确认/错组/真实在途拒绝永久删除，所有原数据零部分变更',async()=>{
 const f=await fixture('group'),other=await f.groups.create(f.base,{name:'删除拒绝其它组',idempotencyKey:'other-delete-group'}),before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)};
 await expect(f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:'bad-confirm'})).rejects.toThrow();await expect(f.intelligence.deleteSource({...f.frozen,groupId:other.id},f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).rejects.toThrow();await expect(f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).rejects.toThrow('同步中');
 expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)}).toEqual(before);
});

it('自有伪 legacy 前缀组与另一真实账号都不能读取旧 NULL 根',async()=>{
 const f=await historicalContent(),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});
 const other=await accounts.createAccount(f.base,{platform:'douyin',accountHandle:'另一真实来源账号',idempotencyKey:'other-real-account'});
 const otherMember=await f.groups.forAccount(f.base,other.id),fakeId=`grp_legacy_${f.account.id}_fake`;
 await f.db.insert(accountGroups).values({id:fakeId,userId:f.base.userId,name:'隔离伪前缀组',status:'active',version:1,createdAt:f.now(),updatedAt:f.now()});
 for(const ctx of [{...f.frozen,groupId:fakeId,accountId:null},{...f.frozen,accountId:other.id,groupId:otherMember.groupId}]){
  await expect(f.candidate.getItem(ctx,f.item.id)).rejects.toThrow();
  await expect(f.candidate.getSourceExecutionInput(ctx,f.created.source.id)).rejects.toThrow();
 }
 expect((await f.db.select().from(intelligenceItems))[0]!.id).toBe(f.item.id);
});

it('真实转出再转回后纯账号入口不借 v1，显式组按当前 v3 完整消费旧来源',async()=>{
 const f=await historicalContent(),target=await f.groups.create(f.base,{name:'转回验证临时组',idempotencyKey:'round-trip-target'});
 for(const [to,key] of [[target.id,'round-trip-out'],[f.member.groupId,'round-trip-back']] as const){const preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:to});await f.groups.transfer(f.base,{...preview,idempotencyKey:key});f.advance(1000);}
 const member=await f.groups.forAccount(f.base,f.account.id);expect(member.version).toBe(3);
 await expect(f.candidate.getItem(f.ctx,f.item.id)).rejects.toThrow();
 await expect(f.candidate.createSource(f.ctx,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/round-trip-rejected.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'round-trip-rejected'})).rejects.toThrow();
 const current={...f.frozen,membershipVersion:member.version};expect((await f.candidate.getItem(current,f.item.id)).item.id).toBe(f.item.id);
 const started=await f.candidate.startRun(current,f.created.source.id,{trigger:'manual',idempotencyKey:'round-trip-explicit'});expect(started.task.membershipVersion).toBe(3);
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>f.envelope()}},1);
 expect((await f.candidate.getRun(current,started.run.id)).run.status).toBe('succeeded_no_change');
 expect((await f.db.select().from(intelligenceItems))[0]).toMatchObject({id:f.item.id,groupId:null,createdAt:f.item.createdAt});
});

it('跨真实账号 NULL 子行不借旧 capturedAt 或同 itemId，转写绑定拒绝并保原任务',async()=>{
 const f=await historicalContent(),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});
 const other=await accounts.createAccount(f.base,{platform:'douyin',accountHandle:'子行异账号',idempotencyKey:'foreign-child-account'});
 await f.db.update(itemMetricSnapshots).set({accountId:other.id,capturedAt:'1990-01-01T00:00:00.000Z'}).where(eq(itemMetricSnapshots.itemId,f.item.id));
 await f.db.update(itemSourceObservations).set({accountId:other.id}).where(eq(itemSourceObservations.id,f.observation.id));
 await f.db.update(sourceSnapshots).set({accountId:other.id,capturedAt:'1990-01-01T00:00:00.000Z'}).where(eq(sourceSnapshots.id,f.snapshot.id));
 const detail=await f.candidate.getItem(f.frozen,f.item.id);expect(detail.metrics).toHaveLength(0);expect(detail.observations).toHaveLength(0);expect(detail.snapshots).toHaveLength(0);expect(detail.transcript.text).toBe(f.transcript.text);
 const queued=await f.candidate.enqueueTranscripts(f.frozen,{itemIds:[f.item.id],idempotencyKey:'foreign-child-transcript'}),task=queued.tasks[0]!;
 const claim=await f.tasks.claimTask({taskId:task.id,workerId:'foreign-child-binding',leaseSeconds:300});if(!claim)throw Error('未领取隔离转写');
 await f.db.update(itemTranscripts).set({accountId:other.id}).where(eq(itemTranscripts.itemId,f.item.id));
 const leases=createExecutionLeaseService(f.db,{now:f.now});await expect(leases.withLease({executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},'admission',bindIntelligenceTranscript)).rejects.toThrow();
 expect(await f.tasks.get(f.frozen,task.id)).toMatchObject({id:task.id,status:'running',attempt:1});expect((await f.db.select().from(itemTranscripts))[0]!.text).toBe(f.transcript.text);
});

it.each(['initial-read','bound-read','write'] as const)('真实 claim 的未分类%s短暂错误保原状态/租约，不写准入拒绝',async stage=>{
 const f=await fixture('group'),task=f.created.task!,run=f.created.run!;
 const claim=await f.tasks.claimTask({taskId:task.id,workerId:'unclassified-source',leaseSeconds:90});if(!claim)throw Error('未领取真实来源任务');
 const [before]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id)),[beforeRun]=await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.id,run.id));
 const error=new Error('隔离暂时故障');if(stage==='initial-read')error.name='OwnershipError';
 const intelligence={...f.intelligence,...(stage==='write'?{applyAdapterBatch:async()=>{throw error;}}:{getRunByTaskForExecution:async()=>{throw error;}})};
 if(stage==='initial-read'){
  const tasks={...f.tasks,claimNext:async()=>claim};await expect(drainIntelligenceSourceQueue({tasks,intelligence,now:f.now,adapter:{run:async()=>f.envelope()}},1)).rejects.toThrow('隔离暂时故障');
 }else await expect(runIntelligenceSourceTask(f.frozen,{sourceId:f.created.source.id,runId:run.id,taskId:task.id,existingClaim:claim},{tasks:f.tasks,intelligence,now:f.now,adapter:{run:async()=>f.envelope()}})).rejects.toThrow('隔离暂时故障');
 expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id)))[0]).toEqual(before);
 expect((await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.id,run.id)))[0]).toEqual(beforeRun);
});

it('真实 failed run 显式 retry 的原 queued/running execution 均阻止永久删除',async()=>{
 const f=await fixture('group'),task=f.created.task!,run=f.created.run!;
 await runIntelligenceSourceTask(f.frozen,{sourceId:f.created.source.id,runId:run.id,taskId:task.id},{tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>{throw Error('隔离上游暂时故障');}}});
 expect((await f.intelligence.getRun(f.frozen,run.id)).run.status).toBe('failed');expect((await f.tasks.get(f.frozen,task.id)).status).toBe('failed');
 await f.tasks.command(f.frozen,{taskIds:[task.id],command:'retry',idempotencyKey:'retry-before-delete'});
 for(const state of ['queued','running'] as const){
  if(state==='running')expect(await f.tasks.claimTask({taskId:task.id,workerId:'retry-before-delete',leaseSeconds:90})).toBeTruthy();
  const before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)};
  expect((await f.tasks.get(f.frozen,task.id)).status).toBe(state);
  await expect(f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).rejects.toThrow();
  expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)}).toEqual(before);
 }
});

it.each(['run','transcript','transform'] as const)('来源的%s错 execution 指针不删除另一真实组原任务，原数据零变更',async pointer=>{
 const f=await historicalContent(),other=await f.groups.create(f.base,{name:'另一个真实任务组',idempotencyKey:'other-execution-group'}),otherCtx={...f.frozen,groupId:other.id,accountId:null,membershipVersion:undefined};
 const otherSource=await f.candidate.createSource(otherCtx,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/other-actual-source.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'other-actual-source'}),foreignTask=await f.tasks.enqueue(otherCtx,{kind:'source_sync',ownerType:'source',ownerId:otherSource.source.id,idempotencyKey:'other-real-execution',payload:{sourceId:otherSource.source.id},priority:20});
 if(pointer==='run')await f.db.update(intelligenceSyncRuns).set({executionTaskId:foreignTask.id}).where(eq(intelligenceSyncRuns.id,f.created.run!.id));
 else if(pointer==='transcript')await f.db.update(itemTranscripts).set({executionTaskId:foreignTask.id}).where(eq(itemTranscripts.itemId,f.item.id));
 else{const preview=await f.candidate.startTopicPreview(f.frozen,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,idempotencyKey:'wrong-transform-pointer'});await f.db.update(intelligenceTransforms).set({aiTaskId:foreignTask.id}).where(eq(intelligenceTransforms.id,preview.transform.id));}
 const before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),items:await f.db.select().from(intelligenceItems),transcripts:await f.db.select().from(itemTranscripts),transforms:await f.db.select().from(intelligenceTransforms)};
 await expect(f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).rejects.toThrow();
 expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),items:await f.db.select().from(intelligenceItems),transcripts:await f.db.select().from(itemTranscripts),transforms:await f.db.select().from(intelligenceTransforms)}).toEqual(before);
 expect(await f.tasks.get(otherCtx,foreignTask.id)).toMatchObject({id:foreignTask.id,status:'queued',attempt:0});
});

it('真实来源原 execution 的 user/account/group/kind/owner/payload 任一错绑定都零部分删除',async()=>{
 const f=await historicalContent(),taskId=f.created.task!.id,other=await f.groups.create(f.base,{name:'错绑定真实组',idempotencyKey:'bad-binding-group'}),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});
 const foreign=await accounts.createAccount({...f.base,userId:'foreign-account-owner'},{platform:'douyin',accountHandle:'异用户真实账号',idempotencyKey:'foreign-account'});
 const otherSource=await f.candidate.createSource(f.frozen,{collectionId:null,type:'rss',config:{type:'rss',url:'https://example.test/another-binding-source.xml'},monitorEnabled:false,runInitial:false,idempotencyKey:'another-binding-source'});
 const [original]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,taskId));
 const patches:Array<[string,Partial<typeof executionTasks.$inferInsert>]>=[['user',{userId:'foreign-account-owner'}],['account',{accountId:foreign.id}],['group',{groupId:other.id}],['kind',{kind:'transcribe'}],['ownerType',{ownerType:'item'}],['ownerId',{ownerId:otherSource.source.id}],['payload',{payload:{sourceId:otherSource.source.id}}],['missing-payload',{payload:{}}],['unknown',{status:'unknown_result'}]];
 for(const [reason,patch] of patches){
  await f.db.update(executionTasks).set(patch).where(eq(executionTasks.id,taskId));
  const before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),items:await f.db.select().from(intelligenceItems)};
  await expect(f.candidate.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id}),reason).rejects.toThrow();
  expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),items:await f.db.select().from(intelligenceItems)},reason).toEqual(before);
  await f.db.update(executionTasks).set(original!).where(eq(executionTasks.id,taskId));
 }
});

it('真实 share_import 来源可永久删除，无法反证的终态原任务保 ID/状态且业务源消失',async()=>{
 const f=await fixture('group',false),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId});const projectAccount=async(ctx:RequestContext,id:string)=>{const row=await accounts.getAccount(ctx,id);return {accountId:row.id,accountHandle:row.accountHandle,platform:row.platform,status:row.status};};
 const intelligence=createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,collectorAccounts:{getCollectorAccount:projectAccount,listCollectorAccounts:async()=>[await projectAccount(f.frozen,f.account.id)]}});
 const queued=await intelligence.enqueueDouyinShareImport(f.frozen,{collectionId:null,shareInput:'https://www.douyin.com/video/share-delete',idempotencyKey:'share-delete'}),claim=await f.tasks.claimTask({taskId:queued.task.id,workerId:'share-delete',leaseSeconds:300});if(!claim)throw Error('分享任务未领取');
 const item=contentEnvelope(f.now(),'share-delete','https://www.douyin.com/video/share-delete').items[0]!,result=await intelligence.importDouyinSharedItem(f.frozen,{taskId:queued.task.id,lease:claim.lease,collectionId:null,item,browserSessionRef:'isolated-session'});
 const [run]=await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.executionTaskId,queued.task.id)),[beforeTask]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,queued.task.id));
 expect((await intelligence.deleteSource(f.frozen,run!.sourceId,{mode:'permanent',confirmToken:run!.sourceId})).status).toBe('deleted');
 expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,queued.task.id)))[0]).toEqual(beforeTask);expect(await f.tasks.get(f.frozen,queued.task.id)).toMatchObject({id:queued.task.id,status:'succeeded'});
 await expect(intelligence.getSourceExecutionInput(f.frozen,run!.sourceId)).rejects.toThrow();expect((await f.db.select().from(intelligenceItems)).some(row=>row.id===result.item.id)).toBe(false);
});

it('旧账号转出后 group-only RSS 完整消费成功仍可永久删除，内容账号不等于执行账号',async()=>{
 const f=await historicalContent(),target=await f.groups.create(f.base,{name:'删除历史RSS前转出',idempotencyKey:'delete-rss-target'}),preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:target.id});await f.groups.transfer(f.base,{...preview,idempotencyKey:'delete-rss-move'});
 const groupOnly={...f.frozen,accountId:null,membershipVersion:undefined},started=await f.candidate.startRun(groupOnly,f.created.source.id,{trigger:'manual',idempotencyKey:'group-only-rss-before-delete'});
 expect(started.task.accountId).toBeNull();expect((await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.id,started.run.id)))[0]!.accountId).toBe(f.account.id);
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.candidate,now:f.now,adapter:{run:async()=>f.envelope()}},1);expect((await f.candidate.getRun(groupOnly,started.run.id)).run.status).toBe('succeeded_no_change');
 expect((await f.candidate.deleteSource(groupOnly,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');
 await expect(f.candidate.getSourceExecutionInput(groupOnly,f.created.source.id)).rejects.toThrow();await expect(f.tasks.get(groupOnly,started.task.id)).rejects.toThrow();
});

it('group-only creator_profile 真实collector完整消费后可删除，source/run账号NULL不冒充collector',async()=>{
 const f=await fixture('group',false),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId}),projectAccount=async(ctx:RequestContext,id:string)=>{const row=await accounts.getAccount(ctx,id);return {accountId:row.id,accountHandle:row.accountHandle,platform:row.platform,status:row.status};};
 const intelligence=createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,collectorAccounts:{getCollectorAccount:projectAccount,listCollectorAccounts:async()=>[await projectAccount(f.frozen,f.account.id)]}}),groupOnly={...f.frozen,accountId:null,membershipVersion:undefined};
 const created=await intelligence.createSource(groupOnly,{collectionId:null,type:'creator_profile',config:{type:'creator_profile',collectorAccountId:f.account.id,externalAccountId:'isolated-profile-target',canonicalUrl:'https://www.douyin.com/user/isolated-profile-target'},monitorEnabled:false,runInitial:true,idempotencyKey:'group-only-collector-delete'});
 expect(created.task!.accountId).toBe(f.account.id);expect(created.run!.accountId).toBeNull();expect(created.source.accountId).toBeNull();
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence,now:f.now,adapter:{run:async()=>({...f.envelope(),upstreamEvidence:{...f.envelope().upstreamEvidence,adapter:'douyin_profile'}})}},1);expect((await intelligence.getRun(groupOnly,created.run!.id)).run.status).toBe('succeeded_no_change');
 expect((await intelligence.deleteSource(groupOnly,created.source.id,{mode:'permanent',confirmToken:created.source.id})).status).toBe('deleted');await expect(f.tasks.get(groupOnly,created.task!.id)).rejects.toThrow();
});

it('只owned user不足证明终态执行账号，缺失/错组/错版本/坏时间成员均拒绝删除',async()=>{
 const f=await fixture('group'),task=f.created.task!,other=await f.groups.create(f.base,{name:'冻结成员反例组',idempotencyKey:'frozen-member-other'});
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>f.envelope()}},1);expect((await f.tasks.get(f.frozen,task.id)).status).toBe('succeeded');
 const [original]=await f.db.select().from(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.account.id)),groupOnly={...f.frozen,accountId:null,membershipVersion:undefined};
 const cases:Array<[string,Partial<typeof accountGroupMemberships.$inferInsert>|null]>=[['missing',null],['group',{groupId:other.id}],['version',{version:2}],['joined-late',{joinedAt:'2026-10-11T10:00:01.000Z'}],['left-early',{leftAt:'2026-10-11T09:59:59.000Z'}],['bad-time',{joinedAt:'2026-00-00Tgarbage'}]];
 for(const [reason,patch]of cases){await f.db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.account.id));if(patch)await f.db.insert(accountGroupMemberships).values({...original!,...patch});
  const before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)};
  await expect(f.intelligence.deleteSource(groupOnly,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id}),reason).rejects.toThrow();
  expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks)},reason).toEqual(before);
 }
});

it.each(['settled','rejected'] as const)('真实未确认 topic_preview 的%s调用历史不反杀来源删除，原账本不删除',async outcome=>{
 const f=await historicalContent(),intelligence=createIntelligenceService(f.db,{tasks:f.tasks,now:f.now,nextId:f.nextId,positioning:{getVersion:async()=>({id:'isolated-positioning',oneLiner:'隔离定位',keywords:[]})}});
 const preview=await intelligence.startTopicPreview(f.frozen,{itemId:f.item.id,sourceSnapshotId:f.snapshot.id,positioningVersionId:'isolated-positioning',strategyBacked:true,idempotencyKey:'ledger-before-delete'}),claim=await f.tasks.claimTask({taskId:preview.task.id,workerId:'ledger-before-delete',leaseSeconds:300});if(!claim)throw Error('未领取topic真实执行');
 const ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget:createContinuousExecutionBudget()}),ref={executionTaskId:preview.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const call=await ledger.reserve(ref,{kind:'model',operationKey:'isolated-topic-preview',inputDigest:'sha256:'+createHash('sha256').update('isolated-input').digest('hex'),reservedTokens:1});await ledger.start(ref,call.id);
 await createExecutionStreamService(f.db,{now:f.now}).append(ref,{callId:call.id,startIndex:0,chunks:[{type:'text-start',id:'isolated-text'},{type:'text-delta',id:'isolated-text',delta:'隔离历史文本'},{type:'text-end',id:'isolated-text'}]});
 // 这里只验证真实FK的持久完整性，不冒充网页工具授权或AI产物公共生成流程。
 const conversationId=f.nextId('fk-conversation'),lineageId=f.nextId('fk-lineage');
 await f.db.insert(aiConversations).values({id:conversationId,userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,title:'隔离FK会话',createdAt:f.now(),updatedAt:f.now()});
 await f.db.insert(workbenchArtifactLineages).values({id:lineageId,userId:f.ctx.userId,accountId:f.account.id,conversationId,artifactId:'isolated-fk-artifact',currentVersion:1,createdAt:f.now(),updatedAt:f.now()});
 await f.db.insert(workbenchArtifactLineageVersions).values({id:f.nextId('fk-version'),lineageId,artifactId:'isolated-fk-artifact',version:1,taskId:preview.task.id,operationId:call.id,requestDigest:call.inputDigest,metadata:{},source:{},createdAt:f.now()});
 await f.db.insert(executionEvidence).values({id:f.nextId('fk-evidence'),executionTaskId:preview.task.id,originCallId:call.id,requestedUrl:'https://example.test/fk',sourceUrl:'https://example.test/fk',title:'隔离FK证据',fullText:'隔离正文',contentHash:'sha256:'+createHash('sha256').update('隔离正文').digest('hex'),byteLength:Buffer.byteLength('隔离正文'),createdAt:f.now()});
 if(outcome==='settled')await ledger.settle(ref,call.id,{status:'settled',usage:{totalTokens:1},resultText:'隔离模型回执'});else await ledger.settle(ref,call.id,{status:'rejected',rejectionCode:'STRUCTURED_PROTOCOL_UNSUPPORTED'});
 await intelligence.finishTopicPreview(f.frozen,preview.transform.id,{generationMode:'strategy_backed',hook:'隔离钩子',structureSteps:['提出问题','验证事实'],coreClaims:['隔离观点'],reusablePattern:'隔离结构',factRisks:[],title:'未确认选题',angle:'隔离角度',differentiation:'隔离差异',sourceSummary:'隔离来源',targetAudience:'隔离读者',audiencePain:'隔离问题',coreConflict:'隔离冲突',format:'口播',adaptationStrategy:{keep:['事实'],replace:[],add:[],avoid:[]},adaptedDraft:'隔离初稿正文',sourceUrl:f.item.canonicalUrl,transcriptHash:'sha256:'+createHash('sha256').update(f.transcript.text!.trim()).digest('hex')});
 const beforeCalls=(await ledger.inspect(ref)).calls,beforeStream=await f.db.select().from(executionStreamEvents),beforeEvidence=await f.db.select().from(executionEvidence),beforeVersions=await f.db.select().from(workbenchArtifactLineageVersions);await f.tasks.finish({taskId:preview.task.id,...claim.lease,status:'succeeded'});const beforeTask=await f.tasks.get(f.frozen,preview.task.id);
 expect((await intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');
 expect((await f.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,preview.task.id))).sort((a,b)=>a.sequence-b.sequence)).toEqual(beforeCalls);expect(await f.tasks.get(f.frozen,preview.task.id)).toEqual(beforeTask);await expect(intelligence.getSourceExecutionInput(f.frozen,f.created.source.id)).rejects.toThrow();
 expect(await f.db.select().from(executionStreamEvents)).toEqual(beforeStream);expect(await f.db.select().from(executionEvidence)).toEqual(beforeEvidence);expect(await f.db.select().from(workbenchArtifactLineageVersions)).toEqual(beforeVersions);
});

it.each(['ai-task','pending-lineage'] as const)('无calls账本时独立%s真实FK保留终态执行父，不改变引用数据',async reference=>{
 const f=await fixture('group'),task=f.created.task!;
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>f.envelope()}},1);
 expect(await f.db.select().from(executionCalls)).toHaveLength(0);
 // 持久引用夹具：只证明schema完整性，不伪称由AI/工作台服务生成这个来源任务。
 if(reference==='ai-task')await f.db.insert(aiTasks).values({id:f.nextId('fk-ai'),executionTaskId:task.id,userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,taskType:'source_collection',status:'succeeded',idempotencyKey:'isolated-fk-ai',requestedAt:f.now(),completedAt:f.now()});
 else {const conversationId=f.nextId('fk-conversation');await f.db.insert(aiConversations).values({id:conversationId,userId:f.ctx.userId,accountId:f.account.id,groupId:f.member.groupId,title:'独立FK会话',createdAt:f.now(),updatedAt:f.now()});await f.db.insert(workbenchArtifactLineages).values({id:f.nextId('fk-lineage'),userId:f.ctx.userId,accountId:f.account.id,conversationId,artifactId:'independent-fk-artifact',pendingTaskId:task.id,state:'committed',createdAt:f.now(),updatedAt:f.now()});}
 const beforeTask=await f.tasks.get(f.frozen,task.id),beforeAi=await f.db.select().from(aiTasks),beforeLineage=await f.db.select().from(workbenchArtifactLineages);
 expect((await f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');
 expect(await f.tasks.get(f.frozen,task.id)).toEqual(beforeTask);expect(await f.db.select().from(aiTasks)).toEqual(beforeAi);expect(await f.db.select().from(workbenchArtifactLineages)).toEqual(beforeLineage);await expect(f.intelligence.getSourceExecutionInput(f.frozen,f.created.source.id)).rejects.toThrow();
});

it('真实账号执行先终态再转出，原组删除仅验证冻结历史成员不要求current',async()=>{
 const f=await fixture('group'),task=f.created.task!;
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async()=>f.envelope()}},1);expect((await f.tasks.get(f.frozen,task.id)).status).toBe('succeeded');
 f.advance(1000);const destination=await f.groups.create(f.base,{name:'终态执行后转出',idempotencyKey:'terminal-transfer-target'}),preview=await f.groups.previewTransfer(f.base,{accountId:f.account.id,toGroupId:destination.id});await f.groups.transfer(f.base,{...preview,idempotencyKey:'terminal-transfer'});
 const groupOnly={...f.frozen,accountId:null,membershipVersion:undefined};expect((await f.groups.forAccount(f.base,f.account.id)).groupId).toBe(destination.id);
 expect((await f.intelligence.deleteSource(groupOnly,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');await expect(f.tasks.get(groupOnly,task.id)).rejects.toThrow();
});

it('同组真实B账号运行历史A来源后合法删除，不用内容账号覆盖执行冻结账号',async()=>{
 const f=await fixture('group',false),accounts=createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId}),accountB=await accounts.createAccount({...f.base,groupId:f.member.groupId},{platform:'douyin',accountHandle:'同组实际B账号',idempotencyKey:'same-group-account-b'}),memberB=await f.groups.forAccount(f.base,accountB.id),ctxB={...f.base,groupId:f.member.groupId,accountId:accountB.id};expect(memberB.groupId).toBe(f.member.groupId);
 const started=await f.intelligence.startRun(ctxB,f.created.source.id,{trigger:'manual',idempotencyKey:'actual-b-runs-a'});expect(started.task.accountId).toBe(accountB.id);expect((await f.db.select().from(intelligenceSyncRuns).where(eq(intelligenceSyncRuns.id,started.run.id)))[0]!.accountId).toBe(f.account.id);
 await drainIntelligenceSourceQueue({tasks:f.tasks,intelligence:f.intelligence,now:f.now,adapter:{run:async(ctx)=>{expect(ctx.accountId).toBe(accountB.id);return f.envelope();}}},1);expect((await f.intelligence.getRun(ctxB,started.run.id)).run.status).toBe('succeeded_no_change');
 expect((await f.intelligence.deleteSource(ctxB,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');await expect(f.tasks.get(ctxB,started.task.id)).rejects.toThrow();
});

it.each(['reserved','started','unknown','unknown-usage'] as const)('确定终态执行但真实%s账本未完成时拒绝永久删除并零部分改变',async status=>{
 const f=await fixture('group'),task=f.created.task!,claim=await f.tasks.claimTask({taskId:task.id,workerId:'unresolved-delete-owner',leaseSeconds:300});if(!claim)throw Error('缺真实claim');
 const ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget:createContinuousExecutionBudget()}),ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},call=await ledger.reserve(ref,{kind:'model',operationKey:'unresolved-source-delete',inputDigest:'sha256:'+'d'.repeat(64),reservedTokens:1});
 if(status!=='reserved')await ledger.start(ref,call.id);if(status==='unknown')await ledger.settle(ref,call.id,{status:'unknown'});if(status==='unknown-usage')await ledger.settle(ref,call.id,{status:'settled',usage:{},resultText:'有正文但实际用量未知'});
 if(status==='unknown-usage')expect((await ledger.inspect(ref)).unknownUsage).toBe(true);
 await f.intelligence.applyAdapterBatch(f.frozen,{runId:f.created.run!.id,lease:claim.lease,envelope:f.envelope(),terminal:true});expect((await f.tasks.get(f.frozen,task.id)).status).toBe('succeeded');
 const before={sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),calls:await f.db.select().from(executionCalls)};
 await expect(f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).rejects.toThrow();
 expect({sources:await f.db.select().from(intelligenceSources),runs:await f.db.select().from(intelligenceSyncRuns),tasks:await f.db.select().from(executionTasks),calls:await f.db.select().from(executionCalls)}).toEqual(before);
});

it('实际requests计量调用已结算不需要token用量，正常删除业务源并保原账本父',async()=>{
 const f=await fixture('group'),task=f.created.task!,claim=await f.tasks.claimTask({taskId:task.id,workerId:'request-metered-delete',leaseSeconds:300});if(!claim)throw Error('缺真实claim');
 const ledger=createExecutionCallLedgerService(f.db,{now:f.now,budget:createContinuousExecutionBudget()}),ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},call=await ledger.reserve(ref,{kind:'model',operationKey:'request-metered-source',inputDigest:'sha256:'+'e'.repeat(64),reservedTokens:0,accountingBasis:'requests'});await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:'settled',usage:{},resultText:'已确认请求计量回执'});
 await f.intelligence.applyAdapterBatch(f.frozen,{runId:f.created.run!.id,lease:claim.lease,envelope:f.envelope(),terminal:true});
 const beforeTask=await f.tasks.get(f.frozen,task.id),beforeCalls=await f.db.select().from(executionCalls);
 expect((await f.intelligence.deleteSource(f.frozen,f.created.source.id,{mode:'permanent',confirmToken:f.created.source.id})).status).toBe('deleted');expect(await f.tasks.get(f.frozen,task.id)).toEqual(beforeTask);expect(await f.db.select().from(executionCalls)).toEqual(beforeCalls);
});
