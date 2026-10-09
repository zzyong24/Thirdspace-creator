import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {and,createDb,eq,executionTasks,intelligenceItems,itemTranscripts,platformAccounts,projects,sourceSnapshots,type Db} from '@creatoros/backend';
import {accountGroupMemberships,accountGroups} from '../../schema/account-groups';
import {ENDPOINTS,type ExecutionTaskResourceV2,type RequestContext} from '@creatoros/contract';
import {assertFrozenWorkspaceMembership,type FrozenWorkspace} from './membership-lock.service';
import {createPersistentTaskService} from '../execution';
import {createIntelligenceService} from '../intelligence/intelligence.service';
import {createIntelligenceTransport} from '../intelligence/intelligence.transport';
import {createRadarProjectQueueService} from '../intelligence/radar-project-queue.service';
import {drainIntelligenceTopicPreviewQueue,type TopicPreviewGeneratorPort} from '../intelligence/topic-preview-runner';
import {drainIntelligenceTranscriptQueue,type IntelligenceTranscriptPort} from '../intelligence/transcript-runner';
import {createPositioningService} from '../positioning';
import {createProjectRepository,createProjectsService,createRadarProjectService} from '../projects';

// 全部数据来自独立 createDb/PGlite；不连接用户数据库、平台或凭据。
const stamp='2026-10-09T00:00:00.000Z';
let db:Db,close:()=>Promise<void>,sequence=0;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},180000);
afterAll(async()=>{await close?.();},180000);

async function fixture(){
 const tag=`t1106-${++sequence}`,userId=`${tag}-user`,accountId=`${tag}-account`,groupId=`grp_legacy_${accountId}`,membershipId=`${tag}-member`,taskId=`${tag}-task`;
 await db.insert(platformAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:'隔离测试账号',status:'active',createdAt:stamp,updatedAt:stamp});
 await db.insert(accountGroups).values({id:groupId,userId,name:'原初始组',status:'active',version:1,createdAt:stamp,updatedAt:stamp});
 await db.insert(accountGroupMemberships).values({id:membershipId,userId,groupId,accountId,version:1,joinedAt:stamp,leftAt:null});
 await db.insert(executionTasks).values({id:taskId,userId,accountId,groupId,groupVersion:null,membershipVersion:null,kind:'radar_project_upgrade',ownerType:'item',ownerId:`${tag}-item`,idempotencyKey:`${tag}-upgrade`,status:'blocked',payload:{itemId:`${tag}-item`,positioningVersionId:`${tag}-positioning`,frozenContent:'原输入保留'},checkpoint:{stage:'transcribing',transcriptTaskId:`${tag}-child`},createdAt:stamp,updatedAt:stamp});
 const ctx:RequestContext={userId,accountId,groupId,requestId:tag,source:'user'};
 const frozen:FrozenWorkspace={userId,accountId,groupId,groupVersion:null,membershipVersion:null};
 return {tag,userId,accountId,groupId,membershipId,taskId,ctx,frozen};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function snapshot(f:Fixture){
 return {
  account:(await db.select().from(platformAccounts).where(eq(platformAccounts.id,f.accountId)))[0],
  group:(await db.select().from(accountGroups).where(eq(accountGroups.id,f.groupId)))[0],
  members:await db.select().from(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.accountId)),
  task:(await db.select().from(executionTasks).where(eq(executionTasks.id,f.taskId)))[0],
 };
}
const admit=(frozen:FrozenWorkspace,allowArchived=false)=>db.transaction(tx=>assertFrozenWorkspaceMembership(tx,frozen,{allowArchived}));

describe('T1106 真实初始旧任务归属证明',()=>{
 it('初始旧组双NULL可以准入，原任务、checkpoint、输入与归属数据逐字段不变',async()=>{
  const f=await fixture(),before=await snapshot(f);
  await expect(admit(f.frozen)).resolves.toBeUndefined();
  expect(await snapshot(f)).toEqual(before);
 });
 it('仅改组名和组版本，原成员未变的双NULL旧任务仍可准入且不补写版本',async()=>{
  const f=await fixture();await db.update(accountGroups).set({name:'改名后的初始组',version:2}).where(eq(accountGroups.id,f.groupId));
  const before=await snapshot(f);await expect(admit(f.frozen)).resolves.toBeUndefined();expect(await snapshot(f)).toEqual(before);
 });
 it.each(['transferred-returned','other-history','foreign-history','member-version','foreign-user','foreign-account','non-initial-group','archived-account','archived-group','group-only-version','membership-only-version'] as const)('%s不能凭缺失版本取得执行权',async mode=>{
  const f=await fixture();let frozen=f.frozen;
  if(mode==='transferred-returned'){
   await db.update(accountGroupMemberships).set({leftAt:stamp}).where(eq(accountGroupMemberships.id,f.membershipId));
   await db.insert(accountGroupMemberships).values({id:`${f.tag}-returned`,userId:f.userId,accountId:f.accountId,groupId:f.groupId,version:3,joinedAt:stamp,leftAt:null});
  }
  if(mode==='other-history')await db.insert(accountGroupMemberships).values({id:`${f.tag}-history`,userId:f.userId,accountId:f.accountId,groupId:f.groupId,version:1,joinedAt:stamp,leftAt:stamp});
  if(mode==='foreign-history')await db.insert(accountGroupMemberships).values({id:`${f.tag}-foreign-history`,userId:`${f.tag}-foreign-user`,accountId:f.accountId,groupId:f.groupId,version:1,joinedAt:stamp,leftAt:stamp});
  if(mode==='member-version')await db.update(accountGroupMemberships).set({version:2}).where(eq(accountGroupMemberships.id,f.membershipId));
  if(mode==='foreign-user')frozen={...frozen,userId:`${f.tag}-foreign-user`};
  if(mode==='foreign-account'){
   const foreign=await fixture();frozen={...frozen,accountId:foreign.accountId,groupId:foreign.groupId};
  }
  if(mode==='non-initial-group'){
   const other=`${f.tag}-other-group`;await db.insert(accountGroups).values({id:other,userId:f.userId,name:'非初始组',status:'active',version:1,createdAt:stamp,updatedAt:stamp});
   await db.update(accountGroupMemberships).set({groupId:other}).where(eq(accountGroupMemberships.id,f.membershipId));frozen={...frozen,groupId:other};
  }
  if(mode==='archived-account')await db.update(platformAccounts).set({status:'archived'}).where(eq(platformAccounts.id,f.accountId));
  if(mode==='archived-group')await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.groupId));
  if(mode==='group-only-version')frozen={...frozen,groupVersion:1};
  if(mode==='membership-only-version')frozen={...frozen,membershipVersion:1};
  const before=await snapshot(f);await expect(admit(frozen)).rejects.toThrow();expect(await snapshot(f)).toEqual(before);
 });
 it('旧任务初始组归档时，即使调用者请求归档豁免也不能使用旧证明',async()=>{
  const f=await fixture();await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.groupId));
  await expect(admit(f.frozen,true)).rejects.toThrow();
 });
 it('完整冻结但成员版本错误继续拒绝，正确原版本仍按原守卫执行',async()=>{
  const f=await fixture(),before=await snapshot(f);
  await expect(admit({...f.frozen,groupVersion:1,membershipVersion:2})).rejects.toThrow();
  await expect(admit({...f.frozen,groupVersion:1,membershipVersion:1})).resolves.toBeUndefined();expect(await snapshot(f)).toEqual(before);
 });
});

async function radarFixture(transcriptDone=true){
 const f=await fixture(),itemId=`${f.tag}-radar-item`,snapshotId=`${f.tag}-snapshot`,url=`https://example.com/${f.tag}`;
 let clock=Date.parse(stamp),next=0;
 const deps={now:()=>new Date(clock).toISOString(),nextId:(prefix:string)=>`${f.tag}-${prefix}-${++next}`};
 const tasks=createPersistentTaskService(db,deps),projectService=createProjectsService(createProjectRepository(db),deps);
 const positioning=createPositioningService({db,...deps,projects:{async getProjectSubject(ctx,id){const p=await projectService.getProject(ctx,id);return {title:p.title,brief:p.brief};}}});
 await positioning.upsertProfile(f.ctx,{persona:'工程作者',field:'工程实践',audience:'小团队',differentiation:'可复现的流程',capabilities:['实测']});
 const statement=await positioning.createStatementVersion(f.ctx,{oneLiner:'帮助小团队建立可复现的工程流程',keywords:['工程','实践','复现'],productAnchorIds:[]});
 await db.insert(intelligenceItems).values({id:itemId,userId:f.userId,accountId:f.accountId,groupId:f.groupId,type:transcriptDone?'article':'video',platform:transcriptDone?'example.com':'douyin',canonicalUrl:url,canonicalUrlHash:f.tag,title:'隔离来源作品',capturedAt:stamp,createdAt:stamp,updatedAt:stamp,availability:'available'});
 await db.insert(sourceSnapshots).values({id:snapshotId,userId:f.userId,accountId:f.accountId,groupId:f.groupId,sourceId:`${f.tag}-source`,runId:`${f.tag}-run`,itemId,capturedAt:stamp,finalUrl:url,title:'隔离来源快照',contentHash:f.tag,privacyClass:'public'});
 await db.insert(itemTranscripts).values({itemId,userId:f.userId,accountId:f.accountId,groupId:f.groupId,status:transcriptDone?'done':'not_requested',text:transcriptDone?'先看业务输入，再看责任边界，最后选择工具。':null,source:transcriptDone?'manual':null,completedAt:transcriptDone?stamp:null,updatedAt:stamp});
 const intelligence=createIntelligenceService(db,{...deps,tasks,positioning:{getVersion:(ctx,id)=>positioning.getStatement(ctx,id)}});
 const queueDeps={...deps,tasks,intelligence,assertPositioning:(ctx:RequestContext,id:string)=>positioning.getStatement(ctx,id),projects:createRadarProjectService(db,deps)};
 let queue=createRadarProjectQueueService(queueDeps);
 const transport=createIntelligenceTransport(()=>intelligence,undefined,undefined,()=>queue);
 const enqueue=async(key:string)=>{
  const endpoint=ENDPOINTS.enqueueIntelligenceProjectUpgrades;
  const body=endpoint.body!.parse({itemIds:[itemId],positioningVersionId:statement.id,idempotencyKey:key});
  const result=await transport.request(endpoint,{params:undefined,query:undefined,body},f.ctx) as {data:{tasks:ExecutionTaskResourceV2[]}};
  return endpoint.response.parse(result.data).tasks[0]!;
 };
 // 仅模型候选与ASR结果使用fixture；任务、定位、转写/选题保存、项目保存均走真实服务。
 const generate=vi.fn<TopicPreviewGeneratorPort['generate']>(async(ctx,target,_checkpoint,claim)=>{
  expect(claim?.task.id).toBe((await tasks.get(ctx,claim!.task.id)).id);
  expect(target.item.id).toBe(itemId);expect(target.positioningVersionId).toBe(statement.id);
  return {generationMode:'strategy_backed',hook:'先明确输入',structureSteps:['核对输入','确定责任'],coreClaims:['流程需要可复现'],reusablePattern:'输入到边界',factRisks:[],title:'可复现的工程流程',angle:'从输入开始',differentiation:'实际边界',sourceSummary:'隔离来源摘要',targetAudience:'小团队',audiencePain:'交付不稳定',coreConflict:'工具与流程脱节',format:'文章',adaptationStrategy:{keep:['输入'],replace:[],add:['责任边界'],avoid:['虚构']},adaptedDraft:'模型fixture候选：先核对业务输入和责任边界。'};
 });
 const tick=async()=>{clock+=3000;await queue.tick({shouldStop:()=>false});};
 const drain=()=>drainIntelligenceTopicPreviewQueue({tasks,intelligence,generator:{generate},workerId:()=>`${f.tag}-fixture-model-worker`},{maxTasks:1});
 const transcribe=vi.fn<IntelligenceTranscriptPort['transcribe']>(async(ctx,target,claim)=>{
  expect(target.itemId).toBe(itemId);expect(claim?.task.id).toBe((await tasks.get(ctx,claim!.task.id)).id);
  return {text:'转写模型fixture：先看业务输入，再看责任边界。',provider:'fixture',model:'fixture',language:'zh'};
 });
 const drainTranscript=()=>drainIntelligenceTranscriptQueue({tasks,intelligence,transcript:{transcribe},workerId:()=>`${f.tag}-fixture-asr-worker`},{maxTasks:1,concurrency:1});
 const itemTasks=()=>db.select().from(executionTasks).where(and(eq(executionTasks.userId,f.userId),eq(executionTasks.ownerId,itemId)));
 const projectRows=()=>db.select().from(projects).where(eq(projects.userId,f.userId));
 return {...f,itemId,snapshotId,tasks,intelligence,enqueue,tick,drain,generate,transcribe,drainTranscript,itemTasks,projectRows,restart:()=>{queue=createRadarProjectQueueService(queueDeps);}};
}

describe('T1106 正式雷达入队、持久执行与原项恢复',()=>{
 it('公开enqueue无需内部版本，经真实claim、选题子任务和项目保存完成，重复点击不重做',async()=>{
  const f=await radarFixture(),parent=await f.enqueue('public-first');
  expect(parent).toMatchObject({groupId:f.groupId,accountId:f.accountId,groupVersion:1,membershipVersion:1});
  expect((await f.enqueue('public-repeat')).id).toBe(parent.id);
  await f.tick();const waiting=await f.tasks.get(f.ctx,parent.id),savedCheckpoint=waiting.checkpoint as {topicTaskId:string;transformId:string};
  const checkpoint={topicTaskId:savedCheckpoint.topicTaskId,transformId:savedCheckpoint.transformId};
  expect(waiting.runtimeStatus).toBe('retry_wait');
  expect(await f.tasks.get(f.ctx,checkpoint.topicTaskId)).toMatchObject({groupId:f.groupId,accountId:f.accountId,groupVersion:1,membershipVersion:1});
  expect(await f.drain()).toBe(1);expect(f.generate).toHaveBeenCalledTimes(1);await f.tick();
  const complete=await f.tasks.get(f.ctx,parent.id);expect(complete.status).toBe('succeeded');expect(complete.checkpoint).toMatchObject(checkpoint);
  const rows=await f.projectRows();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({groupId:f.groupId,accountId:f.accountId});
  expect((rows[0]!.briefDetail as Record<string,any>).contentRadarEvidence.adaptedDraftSeed.contentText).toContain('模型fixture候选');
  expect((await f.enqueue('public-after-completion')).id).toBe(parent.id);await f.tick();expect(f.generate).toHaveBeenCalledTimes(1);expect(await f.projectRows()).toEqual(rows);
 });
 it('旧双NULL父项blocked显式retry，重启沿原topic子项和checkpoint继续，不重签旧输入',async()=>{
  const f=await radarFixture(),parent=await f.enqueue('legacy-first');
  const enqueuedParent=(await db.select().from(executionTasks).where(eq(executionTasks.id,parent.id)))[0]!;
  expect(enqueuedParent).toMatchObject({maxAttempts:3,executionBudget:{policy:'continuous'}});
  await f.tick();
  const first=await f.tasks.get(f.ctx,parent.id),savedCheckpoint=first.checkpoint as {topicTaskId:string;transformId:string};
  const checkpoint={topicTaskId:savedCheckpoint.topicTaskId,transformId:savedCheckpoint.transformId};
  await db.update(executionTasks).set({status:'failed',lastErrorCode:'WORKER_EXECUTION_INTERRUPTED',groupVersion:null,membershipVersion:null}).where(eq(executionTasks.id,checkpoint.topicTaskId));
  await f.tick();expect((await f.tasks.get(f.ctx,parent.id)).status).toBe('blocked');
  await db.update(executionTasks).set({groupVersion:null,membershipVersion:null,attempt:18}).where(eq(executionTasks.id,parent.id));
  const originalParent=(await db.select().from(executionTasks).where(eq(executionTasks.id,parent.id)))[0]!;
  const originalChild=(await db.select().from(executionTasks).where(eq(executionTasks.id,checkpoint.topicTaskId)))[0]!;
  expect(originalParent).toMatchObject({attempt:18,maxAttempts:3,executionBudget:{policy:'continuous'}});
  expect(originalParent.executionBudget).toEqual(enqueuedParent.executionBudget);expect(originalParent.deadlineAt).toEqual(enqueuedParent.deadlineAt);
  const originalIds=(await f.itemTasks()).map(row=>row.id).sort();
  f.restart();expect((await f.enqueue('legacy-repeat')).id).toBe(parent.id);await f.tick();expect(f.generate).not.toHaveBeenCalled();expect((await f.tasks.get(f.ctx,parent.id)).status).toBe('blocked');
  await f.tasks.command(f.ctx,{taskIds:[parent.id],command:'retry',idempotencyKey:'explicit-original-retry'});
  expect(await f.tasks.get(f.ctx,parent.id)).toMatchObject({id:parent.id,status:'queued',attempt:18,maxAttempts:3});
  await f.tick();
  const waiting=await f.tasks.get(f.ctx,parent.id);expect(waiting).toMatchObject({id:parent.id,status:'queued',runtimeStatus:'retry_wait',attempt:19,maxAttempts:3,checkpoint});
  expect((await f.tasks.get(f.ctx,checkpoint.topicTaskId)).status).toBe('queued');
  const waitingParent=(await db.select().from(executionTasks).where(eq(executionTasks.id,parent.id)))[0]!;
  expect(waitingParent.executionBudget).toEqual(enqueuedParent.executionBudget);expect(waitingParent.deadlineAt).toEqual(enqueuedParent.deadlineAt);
  f.restart();expect(await f.drain()).toBe(1);expect(f.generate).toHaveBeenCalledTimes(1);expect(f.generate.mock.calls[0]![0]).toMatchObject({userId:f.userId,groupId:f.groupId,accountId:f.accountId,groupVersion:undefined,membershipVersion:undefined});await f.tick();
  const completed=await f.tasks.get(f.ctx,parent.id);expect(completed).toMatchObject({id:parent.id,status:'succeeded',attempt:20,maxAttempts:3,groupVersion:null,membershipVersion:null});expect(completed.checkpoint).toMatchObject(checkpoint);
  const savedParent=(await db.select().from(executionTasks).where(eq(executionTasks.id,parent.id)))[0]!;
  const savedChild=(await db.select().from(executionTasks).where(eq(executionTasks.id,checkpoint.topicTaskId)))[0]!;
  for(const saved of [savedParent,savedChild])expect(saved).toMatchObject({userId:f.userId,groupId:f.groupId,accountId:f.accountId,groupVersion:null,membershipVersion:null});
  expect(savedParent.executionBudget).toEqual(enqueuedParent.executionBudget);expect(savedParent.deadlineAt).toEqual(enqueuedParent.deadlineAt);
  expect(savedChild.executionBudget).toEqual(originalChild.executionBudget);expect(savedChild.deadlineAt).toEqual(originalChild.deadlineAt);
  expect(savedParent.payload).toEqual(originalParent.payload);expect(savedChild.payload).toEqual(originalChild.payload);expect((await f.itemTasks()).map(row=>row.id).sort()).toEqual(originalIds);expect(await f.projectRows()).toHaveLength(1);
 });
 it('旧父项恢复原transcribe子项，再创建选题并保存项目，原转写ID和冻结输入不变',async()=>{
  const f=await radarFixture(false),parent=await f.enqueue('legacy-transcript-first');await f.tick();
  const childId=((await f.tasks.get(f.ctx,parent.id)).checkpoint as {transcriptTaskId:string}).transcriptTaskId;expect(childId).toBeTruthy();
  await db.update(executionTasks).set({status:'failed',lastErrorCode:'WORKER_EXECUTION_INTERRUPTED',groupVersion:null,membershipVersion:null}).where(eq(executionTasks.id,childId));
  await f.tick();expect((await f.tasks.get(f.ctx,parent.id)).status).toBe('blocked');
  await db.update(executionTasks).set({groupVersion:null,membershipVersion:null}).where(eq(executionTasks.id,parent.id));
  const originalChild=(await db.select().from(executionTasks).where(eq(executionTasks.id,childId)))[0]!;
  f.restart();await f.tasks.command(f.ctx,{taskIds:[parent.id],command:'retry',idempotencyKey:'explicit-original-transcript-retry'});await f.tick();
  expect((await f.tasks.get(f.ctx,parent.id)).checkpoint).toMatchObject({transcriptTaskId:childId});expect((await f.tasks.get(f.ctx,childId)).status).toBe('queued');
  expect(await f.drainTranscript()).toBe(1);expect(f.transcribe).toHaveBeenCalledTimes(1);expect(f.transcribe.mock.calls[0]![0]).toMatchObject({groupId:f.groupId,accountId:f.accountId,groupVersion:undefined,membershipVersion:undefined});
  await f.tick();expect(await f.drain()).toBe(1);await f.tick();
  expect(await f.tasks.get(f.ctx,parent.id)).toMatchObject({id:parent.id,status:'succeeded',groupVersion:null,membershipVersion:null,checkpoint:{transcriptTaskId:childId}});
  const savedChild=(await db.select().from(executionTasks).where(eq(executionTasks.id,childId)))[0]!;
  expect(savedChild).toMatchObject({id:childId,status:'succeeded',groupVersion:null,membershipVersion:null});expect(savedChild.payload).toEqual(originalChild.payload);
  expect((await f.itemTasks()).filter(row=>row.kind==='transcribe').map(row=>row.id)).toEqual([childId]);expect(await f.projectRows()).toHaveLength(1);
 });
 it.each([true,false])('转写已完成=%s：旧父项显式retry不重发未知子项，保留原topic/transcript checkpoint',async transcriptDone=>{
  const f=await radarFixture(transcriptDone),parent=await f.enqueue('unknown-first');await f.tick();
  const first=await f.tasks.get(f.ctx,parent.id),checkpoint=first.checkpoint as {topicTaskId?:string;transcriptTaskId?:string};
  const childId=transcriptDone?checkpoint.topicTaskId!:checkpoint.transcriptTaskId!;expect(childId).toBeTruthy();
  await db.update(executionTasks).set({status:'unknown_result',groupVersion:null,membershipVersion:null,lastErrorCode:'REQUIRES_RECONCILIATION'}).where(eq(executionTasks.id,childId));
  await f.tick();await db.update(executionTasks).set({groupVersion:null,membershipVersion:null}).where(eq(executionTasks.id,parent.id));
  const originalIds=(await f.itemTasks()).map(row=>row.id).sort(),originalChild=(await db.select().from(executionTasks).where(eq(executionTasks.id,childId)))[0]!;
  f.restart();await f.tasks.command(f.ctx,{taskIds:[parent.id],command:'retry',idempotencyKey:'explicit-unknown-retry'});await f.tick();
  expect((await f.tasks.get(f.ctx,parent.id)).status).toBe('blocked');expect((await f.tasks.get(f.ctx,parent.id)).checkpoint).toMatchObject(checkpoint);
  expect((await f.tasks.get(f.ctx,childId)).runtimeStatus).toBe('unknown_result');expect((await db.select().from(executionTasks).where(eq(executionTasks.id,childId)))[0]).toEqual(originalChild);
  expect((await f.itemTasks()).map(row=>row.id).sort()).toEqual(originalIds);expect(await f.drain()).toBe(0);expect(await f.drainTranscript()).toBe(0);expect(f.generate).not.toHaveBeenCalled();expect(f.transcribe).not.toHaveBeenCalled();expect(await f.projectRows()).toHaveLength(0);
 });
});
