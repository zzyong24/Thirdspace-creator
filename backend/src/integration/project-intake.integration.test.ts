import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,type Db} from '../db';
import {sql,eq} from 'drizzle-orm';
import {ENDPOINTS,type RequestContext,type Endpoint} from '@creatoros/contract';
import {projects,projectStages,projectActivities,contentOutputs} from '../schema/projects';
import {accountGroups,accountGroupMemberships} from '../schema/account-groups';
import {publications} from '../schema/publishing';
import {platformAccounts} from '../schema/platform-account';
import {intelligenceItems,sourceSnapshots,intelligenceSources,intelligenceSyncRuns,executionTasks,itemTranscripts} from '../schema/intelligence';
import {createProjectsTransport} from '../modules/projects/projects.transport';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createProjectsService} from '../modules/projects/projects.service';
import {createCandidateService} from '../modules/candidate/candidate.service';

vi.setConfig({testTimeout:120000,hookTimeout:120000});
const now=()=> '2026-10-20T15:00:00.000Z';
let db:Db,close:()=>Promise<void>,seq=0;
const nextId=(prefix:string)=>`${prefix}-intake-test-${++seq}`,deps={now,nextId};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);
afterAll(async()=>close?.(),120000);
async function scope(account=false):Promise<RequestContext>{
 const id=nextId('group'),userId='intake-user';
 await db.insert(accountGroups).values({id,userId,name:'隔离测试组',status:'active',createdAt:now(),updatedAt:now()});
 const ctx:RequestContext={userId,groupId:id,accountId:null,requestId:nextId('request'),source:'user'};
 if(account){ctx.accountId=nextId('account');ctx.membershipVersion=1;await db.insert(platformAccounts).values({id:ctx.accountId,userId,platform:'douyin',accountHandle:ctx.accountId,status:'active',createdAt:now(),updatedAt:now()});await db.insert(accountGroupMemberships).values({id:nextId('member'),userId,groupId:id,accountId:ctx.accountId,version:1,joinedAt:now()});}
 return ctx;
}
async function source(ctx:RequestContext){
 const itemId=nextId('item'),sourceId=nextId('source'),runId=nextId('run'),snapshotId=nextId('snapshot');
 const owner={userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId};
 await db.insert(intelligenceSources).values({...owner,id:sourceId,type:'rss',platform:'web',displayName:'真实隔离信源',externalKey:sourceId,adapterConfig:{type:'rss',url:'https://example.test/feed'},createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceSyncRuns).values({...owner,id:runId,sourceId,executionTaskId:nextId('source-task'),trigger:'manual',status:'succeeded',startedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(intelligenceItems).values({...owner,id:itemId,type:'article',platform:'web',canonicalUrl:`https://example.test/${itemId}`,canonicalUrlHash:itemId,title:'来自真实来源的标题',capturedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(sourceSnapshots).values({...owner,id:snapshotId,sourceId,runId,itemId,capturedAt:now(),finalUrl:`https://example.test/${itemId}`,title:'快照标题',contentHash:'sha256:fixture-body',safeExtract:'隔离来源正文'});
 return {itemId,snapshotId,sourceId,runId};
}
async function application(store=db,options:Record<string,unknown>={}){
 const module=await import('../application/projects/project-intake');
 return module.createProjectIntakeApplication(store,deps,options as never);
}
async function transport(store=db,options:Record<string,unknown>={}){
 const repo=createProjectRepository(store),intake=await application(store,options);
 return createProjectsTransport(()=>({repo,service:createProjectsService(repo,deps),intake}));
}
async function ensure(ctx:RequestContext,body:Record<string,unknown>,store=db,options:Record<string,unknown>={}){
 const endpoint=(ENDPOINTS as unknown as Record<string,Endpoint>).ensureProject??{id:'projects.ensure',method:'POST',path:'/projects/ensure'} as Endpoint;
 const envelope=await (await transport(store,options)).request(endpoint,{params:undefined,query:undefined,body} as never,ctx);
 return endpoint.response.parse((envelope as {data:unknown}).data) as {project:{id:string;source:string;brief:string;briefDetail:Record<string,unknown>;title:string};preparationTaskId:string|null;sourceReferences:Array<{itemId?:string;snapshotId?:string}>;reused:boolean};
}
async function counts(){return {projects:(await db.select().from(projects)).length,stages:(await db.select().from(projectStages)).length,activities:(await db.select().from(projectActivities)).length};}
const manual=(key='stable-action-key')=>({source:'manual',title:'用户新建项目',brief:'用户原文',idempotencyKey:key});

describe('T-1382 统一ensure公开transport与真实PGlite事务',()=>{
 it.each([false,true])('纯组/账号 account=%s 同键并发、服务重建和丢响应重放只有一个完整项目',async account=>{
  const ctx=await scope(account),before=await counts();
  const results=await Promise.all(Array.from({length:4},()=>ensure(ctx,manual())));
  expect(new Set(results.map(r=>r.project.id)).size).toBe(1);expect(results.filter(r=>!r.reused)).toHaveLength(1);
  expect(results[0]!.project.id).toMatch(/^project-intake-[a-f0-9]{32}$/);expect(results[0]!.preparationTaskId).toBeNull();
  const replay=await ensure(ctx,manual());expect(replay.reused).toBe(true);expect(replay.project).toEqual(results[0]!.project);
  expect(await counts()).toEqual({projects:before.projects+1,stages:before.stages+7,activities:before.activities+1});
  const [row]=await db.select().from(projects).where(eq(projects.id,replay.project.id));expect(row!.accountId).toBe(ctx.accountId);expect(row!.groupId).toBe(ctx.groupId);
 });
 it('同键异输入明确冲突，原项目不变；不同键允许同名有意新建',async()=>{
  const ctx=await scope(),one=await ensure(ctx,manual());
  await expect(ensure(ctx,{...manual(),brief:'换了原输入'})).rejects.toThrow(/冲突|不同|不一致/);
  expect((await ensure(ctx,manual())).project).toEqual(one.project);expect((await ensure(ctx,manual('another-action-key'))).project.id).not.toBe(one.project.id);
 });
 it('同组改变账号筛选不改变intake身份；仍核实际成员',async()=>{
  const ctx=await scope(true),one=await ensure(ctx,manual());expect((await ensure({...ctx,accountId:null},manual())).project.id).toBe(one.project.id);
  await expect(ensure({...ctx,accountId:'foreign-account'},manual())).rejects.toThrow();
 });
 it.each(['radar','quick_create'])('%s 纯组真实来源及snapshot写入独立raw表，不自动写brief或转写任务',async kind=>{
  const ctx=await scope(),f=await source(ctx),tasksBefore=await db.select().from(executionTasks),transcriptsBefore=await db.select().from(itemTranscripts);
  const body=kind==='radar'?{source:kind,itemId:f.itemId,idempotencyKey:'radar-action'}:{...manual(),source:kind,sourceItemId:f.itemId};
  const result=await ensure(ctx,body);expect(result.project.source).toBe(kind);expect(result.sourceReferences).toMatchObject([{itemId:f.itemId,snapshotId:f.snapshotId}]);expect(result.preparationTaskId).toBeNull();
  expect(result.project.briefDetail.contentRadarEvidence).toBeUndefined();expect(await db.select().from(executionTasks)).toEqual(tasksBefore);expect(await db.select().from(itemTranscripts)).toEqual(transcriptsBefore);
  if(kind==='radar')expect((await ensure(ctx,{...body,idempotencyKey:'another-click'})).project.id).toBe(result.project.id);
 });
 it('radar同item的新点击改变定位仍返回原项目，不覆盖原冻结输入',async()=>{
  const ctx=await scope(),f=await source(ctx);const one=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'radar-key'});
  const before=(await db.execute(sql`SELECT * FROM project_intakes WHERE project_id=${one.project.id}`)).rows;expect((await ensure(ctx,{source:'radar',itemId:f.itemId,positioningVersionId:'another-version',idempotencyKey:'second-key'})).project.id).toBe(one.project.id);expect((await db.execute(sql`SELECT * FROM project_intakes WHERE project_id=${one.project.id}`)).rows).toEqual(before);expect((await createProjectRepository(db).get(ctx,one.project.id)).title).toBe(one.project.title);
 });
 it.each(['radar','quick_create'])('%s 越权/不存在来源拒绝且不留半项目',async kind=>{
  const ctx=await scope(),other=await scope(),f=await source(other),before=await counts();
  for(const item of [f.itemId,'missing-item'])await expect(ensure(ctx,kind==='radar'?{source:kind,itemId:item,idempotencyKey:'radar-action'}:{...manual(),source:kind,sourceItemId:item})).rejects.toThrow();
  expect(await counts()).toEqual(before);
 });
 it.each(['imported','assistant'])('公开ensure不能伪报%s来源或trusted能力',async kind=>{
  const ctx=await scope(),before=await counts();await expect(ensure(ctx,{...manual(),source:kind,trusted:true})).rejects.toThrow();expect(await counts()).toEqual(before);
 });
 it('公开create拒绝imported及trusted标记，manual/topic/省略source仍可创建',async()=>{
  const ctx=await scope(),api=await transport(),before=await counts();
  await expect(api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'伪导入',source:'imported',trusted:true}} as never,ctx)).rejects.toThrow();expect(await counts()).toEqual(before);
  for(const origin of [undefined,'manual','topic']){const result=await api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'合法创建',...(origin?{source:origin}:{})}} as never,ctx);expect((result as {data:{source:string}}).data.source).toBe(origin??'manual');}
 });
 it('公开create稳定动作键委派同一个intake；新增source与无归属平台引用拒绝',async()=>{
  const ctx=await scope(),api=await transport(),body={title:'原创建入口',idempotencyKey:'create-key'};
  const one=await api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body} as never,ctx),two=await api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body} as never,ctx);expect(two).toEqual(one);
  for(const source of ['radar','assistant','quick_create'])await expect(api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{...body,source}} as never,ctx)).rejects.toThrow();
  await expect(api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'伪平台',platformRef:{platform:'douyin',externalId:'foreign-work'}}} as never,ctx)).rejects.toThrow();
  await expect(api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'空身份伪日期',platformRef:{platform:'',externalId:'',publishedAt:now()}}} as never,ctx)).rejects.toThrow();
 });
 it('来源表写失败和准备预约失败均回滚项目、阶段、raw及intake',async()=>{
  const ctx=await scope(),f=await source(ctx),before=await counts();
  await db.execute(sql`CREATE FUNCTION t1382_reject_raw() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'T1382_RAW_INSERT_FAULT'; END $$`);
  await db.execute(sql`CREATE TRIGGER t1382_reject_raw BEFORE INSERT ON project_source_references FOR EACH ROW EXECUTE FUNCTION t1382_reject_raw()`);
  const body={source:'radar',itemId:f.itemId,idempotencyKey:'rollback-key'};
  try{await expect(ensure(ctx,body)).rejects.toThrow(/T1382_RAW_INSERT_FAULT|Failed query/);}finally{await db.execute(sql`DROP TRIGGER t1382_reject_raw ON project_source_references`);await db.execute(sql`DROP FUNCTION t1382_reject_raw()`);}
  expect(await counts()).toEqual(before);
  await expect(ensure(ctx,body,db,{preparation:{reserve:async()=>{throw Error('T1382_PREPARATION_RESERVE_FAULT');}}})).rejects.toThrow('T1382_PREPARATION_RESERVE_FAULT');expect(await counts()).toEqual(before);
  expect((await db.execute(sql`SELECT * FROM project_intakes WHERE scope_id=${ctx.groupId!}`)).rows).toHaveLength(0);
  expect((await ensure(ctx,body)).reused).toBe(false);
 });
 it.each([false,true])('N-6 account=%s 已提交但父未写projectId：并发返回旧ID并保全所有内容',async account=>{
  const ctx=await scope(account),f=await source(ctx),taskId=nextId('legacy-parent');
  const identity=ctx.accountId?[ctx.userId,ctx.accountId,taskId]:[ctx.userId,'group',ctx.groupId,taskId];const projectId=`project-radar-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,32)}`;
  await db.insert(executionTasks).values({id:taskId,userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:taskId,payload:{itemId:f.itemId},checkpoint:{stage:'creating_project'},status:'running',leaseOwner:'old-worker',fenceToken:'old-fence',leaseExpiresAt:'2026-10-22T00:00:00Z',createdAt:now(),updatedAt:now()});
  const service=createProjectsService(createProjectRepository(db),{now,nextId:p=>p==='project'?projectId:nextId(p)});await service.createProject(ctx,{title:'原项目标题',brief:'用户保存的原稿'});
  await db.update(projects).set({briefDetail:{targetAudience:'原用户资料',contentRadarEvidence:{sourceReferences:[{intelligenceItemId:f.itemId}]}},source:'manual'}).where(eq(projects.id,projectId));
  await db.insert(contentOutputs).values({id:nextId('output'),projectId,title:'原成品',contentType:'article',status:'drafting',createdAt:now(),updatedAt:now()});
  const original=await db.select().from(projects).where(eq(projects.id,projectId)),outputs=await db.select().from(contentOutputs).where(eq(contentOutputs.projectId,projectId)),before=await counts();
  const {retireLegacyRadarUpgrades}=await import('../modules/execution/retired-radar-upgrade.service');await retireLegacyRadarUpgrades(db,now());
  const body={source:'radar',itemId:f.itemId,idempotencyKey:'new-click'};const results=await Promise.all([ensure(ctx,body),ensure(ctx,body)]);expect(results.every(r=>r.project.id===projectId&&r.reused)).toBe(true);
  expect(await counts()).toEqual(before);expect(await db.select().from(projects).where(eq(projects.id,projectId))).toEqual(original);expect(await db.select().from(contentOutputs).where(eq(contentOutputs.projectId,projectId))).toEqual(outputs);
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,taskId));expect(task!.checkpoint).toEqual({stage:'creating_project'});expect(task!.status).toBe('cancelled');expect(task!.lastErrorCode).toBe('SYSTEM_UPGRADED');
 });
 it.each(['owner','source'])('N-6命中旧ID但%s矛盾拒绝，不能再建第二项目',async mismatch=>{
  const ctx=await scope(),f=await source(ctx),taskId=nextId('legacy-parent'),projectId=`project-radar-${createHash('sha256').update(JSON.stringify([ctx.userId,'group',ctx.groupId,taskId])).digest('hex').slice(0,32)}`;
  await db.insert(executionTasks).values({id:taskId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:taskId,payload:{itemId:f.itemId},checkpoint:{stage:'creating_project'},status:'failed',createdAt:now(),updatedAt:now()});
  await createProjectsService(createProjectRepository(db),{now,nextId:p=>p==='project'?projectId:nextId(p)}).createProject(ctx,{title:'原项目'});
  if(mismatch==='owner')await db.update(projects).set({userId:'other'}).where(eq(projects.id,projectId));
  const before=await counts();await expect(ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'new-click'})).rejects.toThrow();expect(await counts()).toEqual(before);
 });
 it('N-6确实未提交的旧父不阻断合法新建，不能使用旧ID新建',async()=>{
  const ctx=await scope(),f=await source(ctx),taskId=nextId('legacy-parent');await db.insert(executionTasks).values({id:taskId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:taskId,payload:{itemId:f.itemId},checkpoint:{stage:'creating_project'},status:'failed',createdAt:now(),updatedAt:now()});
  const result=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'new-click'});expect(result.project.id).toMatch(/^project-intake-/);expect(result.reused).toBe(false);
 });
 it('topic真实candidate原子promotion；同候选重放返回同项目且不自动灌入AI稿',async()=>{
  const ctx=await scope(),projectsApi=createProjectsService(createProjectRepository(db),deps),candidateService=createCandidateService({db,...deps,projects:projectsApi,ingestion:{assertRunExists:async()=>{throw Error('本用例不读取采集');}}});
  const candidate=await candidateService.createCandidate(ctx,{title:'用户选择的选题',angle:'原角度',card:{targetAudience:'已选受众',format:'口播',oneLiner:'已选核心信息',proposal:'已选目标'}});
  const one=await ensure(ctx,{source:'topic',candidateId:candidate.id});expect(one.project.source).toBe('topic');expect(one.project.title).toBe(candidate.title);expect(one.project.briefDetail).toMatchObject({targetAudience:'已选受众',contentFormat:'口播',coreMessage:'已选核心信息',contentGoal:'已选目标'});
  expect((await ensure(ctx,{source:'topic',candidateId:candidate.id})).project.id).toBe(one.project.id);expect((await candidateService.getCandidate(ctx,candidate.id)).status).toBe('promoted');expect(one.project.briefDetail.contentRadarEvidence).toBeUndefined();
 });
 it('重放仍重核workspace；项目被删除后同键明确拒绝而不复活',async()=>{
  const ctx=await scope(),result=await ensure(ctx,manual());await db.delete(projects).where(eq(projects.id,result.project.id));await expect(ensure(ctx,manual())).rejects.toThrow();
  await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,ctx.groupId!));await expect(ensure(ctx,manual('new-key'))).rejects.toThrow();
 });
});

it('公开create平台引用只投影真实publication字段，不能注入链接/发布日期或发布项目状态',async()=>{
 const ctx=await scope(true),owner=await createProjectsService(createProjectRepository(db),deps).createProject(ctx,{title:'真实平台原项目'});
 const outputId=nextId('published-output');await db.insert(contentOutputs).values({id:outputId,projectId:owner.id,title:'真实作品',contentType:'video',status:'published',createdAt:now(),updatedAt:now()});
 await db.insert(publications).values({id:nextId('publication'),userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId!,contentOutputId:outputId,platform:'douyin',accountReference:'真实账号',status:'published',externalId:'real-work',externalUrl:'https://example.test/real-work',publishedAt:now(),createdAt:now(),updatedAt:now()});
 const result=await (await transport()).request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'带真实作品引用',brief:'',platformRef:{platform:'douyin',externalId:'real-work',shareUrl:'https://example.test/forged',publishedAt:'2000-01-01T00:00:00.000Z'}}},ctx);
 const project=ENDPOINTS.createProject.response.parse((result as {data:unknown}).data);expect(project.platformRef).toEqual({platform:'douyin',externalId:'real-work',shareUrl:'https://example.test/real-work',publishedAt:now()});expect(project.source).toBe('manual');expect(project.currentStage).toBe('brief');
});
it('来源新快照或合法转写完成后同item仍查回原项目，原raw快照不被静默替换',async()=>{
 const ctx=await scope(),f=await source(ctx),body={source:'radar',itemId:f.itemId,idempotencyKey:'original-click'},first=await ensure(ctx,body);
 const [original]=await db.select().from(sourceSnapshots).where(eq(sourceSnapshots.id,f.snapshotId));await db.insert(sourceSnapshots).values({...original!,id:nextId('new-snapshot'),capturedAt:'2026-10-21T00:00:00.000Z',contentHash:'changed-hash',safeExtract:'后来的正文'});
 await db.insert(itemTranscripts).values({userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,itemId:f.itemId,status:'done',text:'后来真实补入的逐字稿',updatedAt:now()});
 const replay=await ensure(ctx,body);expect(replay.project).toEqual(first.project);expect(replay.sourceReferences).toEqual(first.sourceReferences);expect(replay.reused).toBe(true);
});
it('N-6 优先真实旧父项目回执；已有关联ID不要求重算成旧哈希',async()=>{
 const ctx=await scope(),f=await source(ctx),taskId=nextId('legacy-parent');
 const old=await createProjectsService(createProjectRepository(db),deps).createProject(ctx,{title:'已有真实关联项目',brief:'保留原内容'});
 await db.update(projects).set({briefDetail:{contentRadarEvidence:{sourceReferences:[{intelligenceItemId:f.itemId}]}}}).where(eq(projects.id,old.id));
 await db.insert(executionTasks).values({id:taskId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:taskId,payload:{itemId:f.itemId},checkpoint:{projectId:old.id},status:'succeeded',createdAt:now(),updatedAt:now()});
 const before=await counts(),result=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'checkpoint-click'});
 expect(result.project.id).toBe(old.id);expect(result.reused).toBe(true);expect(result.project.brief).toBe('保留原内容');expect(await counts()).toEqual(before);
});

it('topic真实定位和观众任务可以ensure；定位更新后旧候选拒绝且原项目可重放',async()=>{
 const {createPositioningService}=await import('../modules/positioning/positioning.service');
 const {createTopicWorkspaceService}=await import('../modules/candidate/topic-workspace.service');
 const {assessAudienceTask}=await import('../modules/candidate/audience-task-assessment');
 const {aiTasks}=await import('../schema/ai');
 const ctx=await scope(),projectsApi=createProjectsService(createProjectRepository(db),deps);
 const positioning=createPositioningService({db,...deps,projects:{getProjectSubject:async(c,id)=>{const p=await projectsApi.getProject(c,id);return {title:p.title,brief:p.brief};}}});
 await positioning.upsertProfile(ctx,{persona:'实测教程作者',field:'录音整理',audience:'技术新手',differentiation:'展示输入到结果',capabilities:['演示','核对']});
 const firstStatement=await positioning.createStatementVersion(ctx,{oneLiner:'帮助技术新手把录音整理成待办表',keywords:['录音','整理','待办'],productAnchorIds:[]});
 const topicWorkspace={currentPositioningVersion:async(c:RequestContext)=>(await positioning.readPositioningCenter(c)).currentStatement?.id??null};
 const workspace=createTopicWorkspaceService({db,...deps,...topicWorkspace});
 const context=await workspace.recommendationContext(ctx);expect(context.positioningVersionId).toBe(firstStatement.id);
 // 隔离候选夹具，经真实采纳 service 冻结；不调用模型，也不伪造已生成正文。
 const audienceTask=assessAudienceTask({propositionKey:'录音转待办',audience:'技术新手',audienceFit:'matched',audienceReason:'有录音即可开始',job:'把录音整理成待办表',input:'用户授权的录音样例',entryUrl:'https://example.test/tool',steps:['输入录音','核对人名与日期'],output:'待办表',acceptance:'人名和日期准确',costAndLimits:'免费额度待实测',authorCanDo:'会操作并核对',viewerCanUse:'通过浏览器操作',estimatedMinutes:120,route:'test',testPlan:{sample:'授权录音',steps:['输入','核对'],visibleResult:'待办表',acceptance:'逐项核对',failureStory:'记录遗漏与限制'}},context,now());
 const candidatesApi=createCandidateService({db,...deps,projects:projectsApi,topicWorkspace,ingestion:{assertRunExists:async()=>{throw Error('本用例不读取采集');}}});
 const taskId=nextId('topic-task');await db.insert(aiTasks).values({id:taskId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,taskType:'topic.generate',status:'awaiting_confirmation',idempotencyKey:taskId,requestedAt:now()});
 const selected=await candidatesApi.createFromAIResult(ctx,{aiTaskId:`${taskId}#0`,resultType:'candidate',resultData:{source:'trend',title:'用户选择的有效观众任务',angle:'展示从录音到结果',card:{format:'口播',proposal:'让观众完成待办整理',audienceTask}}});
 const stale=await candidatesApi.createFromAIResult(ctx,{aiTaskId:`${taskId}#1`,resultType:'candidate',resultData:{source:'trend',title:'尚未采纳的旧观众任务',angle:'展示从录音到结果',card:{audienceTask}}});
 const one=await ensure(ctx,{source:'topic',candidateId:selected.id});
 expect(one.project.briefDetail).toMatchObject({targetAudience:audienceTask.audience,coreMessage:audienceTask.job,successCriteria:audienceTask.acceptance});
 expect(one.project.brief).toContain(audienceTask.input);expect(one.project.brief).toContain(audienceTask.output);
 expect((await candidatesApi.getCandidate(ctx,selected.id)).status).toBe('promoted');
 const before=await counts();
 const nextStatement=await positioning.createStatementVersion(ctx,{oneLiner:'帮助进阶用户整理复杂研究材料',keywords:['研究','材料','核对'],productAnchorIds:[]});
 expect(nextStatement.id).not.toBe(firstStatement.id);
 await expect(ensure(ctx,{source:'topic',candidateId:stale.id})).rejects.toThrow(/定位或观众任务配置已变化/);
 expect(await counts()).toEqual(before);expect((await candidatesApi.getCandidate(ctx,stale.id)).status).not.toBe('promoted');
 expect((await ensure(ctx,{source:'topic',candidateId:selected.id})).project.id).toBe(one.project.id);
});
it.each([false,true])('T1382 p2b ensure同事务准备父且无模型仍保项目 account=%s',async account=>{
 const ctx=await scope(account),raw=await source(ctx),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 const tasks=createPersistentTaskService(db,{...deps,prepareModelAuthority:async()=>{throw Object.assign(new Error('模型未配置'),{details:{domainCode:'MODEL_NOT_CONFIGURED'}});}}),intelligence=createIntelligenceService(db,{...deps,tasks});
 const {preparation}=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitBrief:async()=>{throw new Error('本测试未授权资料调用');},submitProjectTranscript:async()=>{throw new Error('没有平台项目来源');},readBrief:async()=>[]});
 const result=await ensure(ctx,{source:'radar',itemId:raw.itemId,idempotencyKey:'p2b-radar-ensure'},db,{preparation});
 expect(result.preparationTaskId).toBeTruthy();expect((await tasks.get(ctx,result.preparationTaskId!)).ownerId).toBe(result.project.id);
 await preparation.tick({shouldStop:()=>false});expect(await preparation.get(ctx,result.project.id)).toMatchObject({registration:'registered',preparationTaskId:result.preparationTaskId,steps:expect.arrayContaining([expect.objectContaining({name:'transcript',status:'waiting_user'})])});
 expect((await createProjectsService(createProjectRepository(db),deps).getProject(ctx,result.project.id)).id).toBe(result.project.id);
 const replay=await ensure(ctx,{source:'radar',itemId:raw.itemId,idempotencyKey:'p2b-radar-ensure'},db,{preparation});expect(replay.preparationTaskId).toBe(result.preparationTaskId);
});

it('T1382 公开补稿三次按当前hash生成并复用相同正文，保留旧来源且不重抓转写',async()=>{
 const ctx=await scope(true),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation'),{createArtifactsService}=await import('../modules/artifacts/artifacts.service');
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,ctx.userId));
 const tasks=createPersistentTaskService(db,deps),intelligence=createIntelligenceService(db,{...deps,tasks}),app=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitBrief:async()=>{throw Error('不得启动brief');},submitProjectTranscript:async()=>{throw Error('已有真实来源不得重复转写');},readBrief:async()=>[]});
 const owner=await createProjectsService(createProjectRepository(db),deps).createProject(ctx,{title:'真实作品'}),outputId=nextId('output'),externalId=nextId('work');
 await db.insert(contentOutputs).values({id:outputId,projectId:owner.id,title:'作品',contentType:'video',status:'published',createdAt:now(),updatedAt:now()});
 await db.insert(publications).values({id:nextId('publication'),userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId!,contentOutputId:outputId,platform:'douyin',accountReference:'真实账号',status:'published',externalId,externalUrl:'https://example.test/work',publishedAt:now(),createdAt:now(),updatedAt:now()});
 const repo=createProjectRepository(db),service=createProjectsService(repo,deps),intake=await application(db,{preparation:app.preparation}),api=createProjectsTransport(()=>({repo,service,intake,preparation:app.preparation}));
 const created=await api.request(ENDPOINTS.createProject,{params:undefined,query:undefined,body:{title:'有来源项目',brief:'',platformRef:{platform:'douyin',externalId}}},ctx),project=ENDPOINTS.createProject.response.parse((created as {data:unknown}).data);
 const request=async(endpoint:any,body?:unknown)=>(await api.request(endpoint,{params:{projectId:project.id},query:undefined,body} as never,ctx)) as {data:any};
 let resource=(await request(ENDPOINTS.getProjectPreparation)).data as any;const parentId=resource.preparationTaskId;expect(parentId).toBeTruthy();
 const artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>repo.get(c,id)});let firstSourceId='',firstChildId='';
 for(const [index,text] of ['第一份真实来源正文','第二份修订来源正文','第二份修订来源正文'].entries()){
  const reference=resource.sourceReferences[0],step=resource.steps.find((s:any)=>s.name==='transcript');
  await request(ENDPOINTS.provideProjectPreparationTranscript,{parentTaskId:parentId,referenceId:reference.id,expectedSourceDigest:reference.sourceDigest,expectedStepRevision:step.revision,submissionKey:`manual-revision-${index}`,inputMode:'paste',text});
  await app.preparation.tick({shouldStop:()=>false});resource=(await request(ENDPOINTS.getProjectPreparation)).data as any;
  expect(resource.steps.find((s:any)=>s.name==='transcript').status,JSON.stringify({index,resource,task:await tasks.get(ctx,parentId)})).toBe('done');expect(resource.steps.find((s:any)=>s.name==='transcript')).toMatchObject({reasonCode:'TRANSCRIPT_ALREADY_AVAILABLE',completedAt:now(),childTaskId:null,lastError:null});const draft=resource.steps.find((s:any)=>s.name==='source_draft');expect(draft.status,JSON.stringify(resource)).toBe('queued');
  const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,draft.childTaskId)),target=(child!.payload as any).target;expect(target.transcript.text).toBe(text);expect(target.source.kind).toBe('project_artifact');
  if(index===0){firstSourceId=target.source.artifactId;firstChildId=child!.id;}else {expect(target.source.artifactId).not.toBe(firstSourceId);expect(child!.id).not.toBe(firstChildId);}
  if(index<2){await tasks.command(ctx,{taskIds:[parentId],command:'pause',idempotencyKey:`pause-between-source-revisions-${index}`});resource=(await request(ENDPOINTS.getProjectPreparation)).data;}
 }
 expect((await artifacts.listVersions(ctx,firstSourceId)).find(v=>v.contentText==='第一份真实来源正文')).toBeTruthy();expect((await service.getProject(ctx,project.id)).brief).toBe('');
 expect((await artifacts.listProjectArtifacts(ctx,project.id)).every(a=>a.artifactType==='output_script')).toBe(true);
});

it('p2c 可信导入经ensure登记raw和回执，重复采集保原正文并且不自动准备',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},app=await application(),before=await counts();
 const input={title:'采集原题',brief:'首次真实采集正文',platform:'douyin',externalId:nextId('imported-work'),shareUrl:'https://example.test/imported'};
 const one=await (app as any).ensureImportedProject(ctx,input);
 expect((await createProjectRepository(db).get(ctx,one.projectId))).toMatchObject({source:'imported',currentStage:'review',progressPct:100,brief:input.brief});
 const rows=(await db.execute(sql`SELECT * FROM project_intakes WHERE project_id=${one.projectId}`)).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({source:'imported',preparation_task_id:null});
 const refs=(await db.execute(sql`SELECT * FROM project_source_references WHERE project_id=${one.projectId}`)).rows;
 expect(refs).toMatchObject([{source_kind:'platform_work',account_id:ctx.accountId,external_id:input.externalId}]);
 const replay=await (app as any).ensureImportedProject(ctx,{...input,brief:'后来的平台文案'});expect(replay).toMatchObject({projectId:one.projectId,outputId:one.outputId,created:false});
 expect((await counts()).projects).toBe(before.projects+1);expect((await db.select().from(executionTasks).where(eq(executionTasks.ownerId,one.projectId)))).toHaveLength(0);
});
it('p2c 可信导入拒绝错误账号平台，事务不留下项目',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},app=await application(),before=await counts();
 await expect((app as any).ensureImportedProject(ctx,{title:'错误平台',platform:'bilibili',externalId:'wrong-platform'})).rejects.toThrow();expect(await counts()).toEqual(before);
});
it('p2c assistant内部采纳动作同键ensure且服务端赋assistant，禁止模型夹带source/platformRef',async()=>{
 const ctx=await scope(),app=await application(),body={title:'编导采纳项目',brief:'用户采纳资料'};
 const one=await (app as any).ensureAssistantCreate(ctx,body,'adopted-call');expect(one.project.source).toBe('assistant');
 expect((await (app as any).ensureAssistantCreate(ctx,body,'adopted-call')).project.id).toBe(one.project.id);
 for(const extra of [{source:'imported'},{platformRef:{platform:'douyin',externalId:'forged'}}])await expect((app as any).ensureAssistantCreate(ctx,{...body,...extra},'forged')).rejects.toThrow();
});
it('p2c candidate.promote真实服务委派ensure并返回原promotion',async()=>{
 const ctx=await scope(),app=await application();
 const service=createCandidateService({db,...deps,projects:createProjectsService(createProjectRepository(db),deps),ensureProjectIntake:(c:RequestContext,id:string)=>app.ensureProject(c,{source:'topic',candidateId:id}),ingestion:{assertRunExists:async()=>{}}} as any);
 const candidate=await service.createCandidate(ctx,{title:'选择立项'}),one=await service.promote(ctx,candidate.id);
 expect((await createProjectRepository(db).get(ctx,one.projectId)).source).toBe('topic');
 expect((await db.execute(sql`SELECT * FROM project_intakes WHERE project_id=${one.projectId}`)).rows).toHaveLength(1);
 expect(await service.promote(ctx,candidate.id)).toEqual(one);
});
it('p2c 原导入正文按回执读v1，编辑brief或追加版本不替换原文；跨scope拒绝',async()=>{
 const {readImportedProjectText}=await import('../modules/projects/project-intake.service');
 const {createArtifactsService}=await import('../modules/artifacts/artifacts.service');
 const ctx={...await scope(true),source:'ingestion' as const},app=await application(),input={title:'原文回执',brief:'不可变来源原文',platform:'douyin',externalId:nextId('immutable-work')};
 const result=await app.ensureImportedProject(ctx,input),[receipt]=(await db.execute(sql`SELECT * FROM project_intakes WHERE project_id=${result.projectId}`)).rows;
 const original=await readImportedProjectText(db,deps,ctx,String(receipt!.id));expect(original).toMatchObject({projectId:result.projectId,contentText:input.brief});
 await db.update(projects).set({brief:'用户重写的正式资料'}).where(eq(projects.id,result.projectId));
 const artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)}),source=(await artifacts.listProjectArtifacts(ctx,result.projectId))[0]!;
 await artifacts.createVersion(ctx,source.id,{contentText:'后续编辑版本'});
 expect(await readImportedProjectText(db,deps,ctx,String(receipt!.id))).toEqual(original);
 await expect(readImportedProjectText(db,deps,await scope(),String(receipt!.id))).rejects.toThrow();
});
it('p2c 已有发布属主保原项目与source，不改用户brief或自动准备',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},api=createProjectsService(createProjectRepository(db),deps),owner=await api.createProject(ctx,{title:'用户标题',brief:'用户正式资料'}),output=await api.createOutput(ctx,owner.id,{title:'原稿件'});
 const externalId=nextId('canonical-work');await db.insert(publications).values({id:nextId('publication'),userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId!,contentOutputId:output.id,platform:'douyin',accountReference:'原账号',status:'published',externalId,createdAt:now(),updatedAt:now()});
 const result=await (await application()).ensureImportedProject(ctx,{title:'不同平台标题',brief:'不同采集正文',platform:'douyin',externalId});
 expect(result).toEqual({projectId:owner.id,outputId:output.id,created:false,publicationId:expect.any(String)});expect(await api.getProject(ctx,owner.id)).toMatchObject({title:'用户标题',brief:'用户正式资料',source:'manual'});
 expect((await db.select().from(executionTasks).where(eq(executionTasks.ownerId,owner.id)))).toHaveLength(0);
});
it('p2c 导入原文经公开start准备生成imported_text，原回执与正文精确冻结',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},project=await (await application()).ensureImportedProject(ctx,{title:'有原文',brief:'本次真实采集的不可变正文',platform:'douyin',externalId:nextId('prepare-import')});
 const {createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,ctx.userId));
 const tasks=createPersistentTaskService(db,deps),intelligence=createIntelligenceService(db,{...deps,tasks}),app=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitBrief:async()=>{throw Error('不得发起资料任务');},submitProjectTranscript:async()=>{throw Error('已有导入正文不转写');},readBrief:async()=>[]});
 const repo=createProjectRepository(db),transport=createProjectsTransport(()=>({repo,service:createProjectsService(repo,deps),preparation:app.preparation}));
 await transport.request(ENDPOINTS.startProjectPreparation,{params:{projectId:project.projectId},query:undefined,body:{idempotencyKey:'explicit-imported-preparation',requestedSteps:['source_draft']}},ctx);
 await app.preparation.tick({shouldStop:()=>false});
 const resource=await app.preparation.get(ctx,project.projectId),step=resource.steps.find(s=>s.name==='source_draft')!;
 expect(step.status,JSON.stringify(resource)).toBe('queued');
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,step.childTaskId!));const target=(child!.payload as any).target;
 expect(target.source).toMatchObject({kind:'imported_text',contentText:'本次真实采集的不可变正文'});expect(target.source.intakeId).toMatch(/^intake-/);
 const claim=(await tasks.claimTask({taskId:child!.id,workerId:'isolated-generation'}))!;expect(await app.generation.getContext(ctx,claim)).toEqual(target);
 await app.generation.finish(ctx,claim,{generationMode:'rewrite_only',adaptedDraft:'待采纳候选'});await tasks.finish({taskId:child!.id,...claim.lease,status:'succeeded'});
 expect(await app.generation.collect(ctx,project.projectId,child!.id)).toMatchObject([{content:{kind:'draft',text:'待采纳候选'}}]);
});
it.each([false,true])('p2c raw单独引用阻止信源永久删除破坏固定item和snapshot，observation=%s',async observation=>{
 const {createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{itemSourceObservations}=await import('../schema/intelligence');
 const ctx=await scope(),f=await source(ctx),created=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'delete-raw-source'});
 if(observation)await db.insert(itemSourceObservations).values({id:nextId('observation'),userId:ctx.userId,groupId:ctx.groupId,accountId:null,itemId:f.itemId,sourceId:f.sourceId,firstSeenAt:now(),lastSeenAt:now(),runId:f.runId,externalRef:f.itemId});
 const intelligence=createIntelligenceService(db,{...deps,tasks:createPersistentTaskService(db,deps)});
 await intelligence.deleteSource(ctx,f.sourceId,{mode:'permanent',confirmToken:f.sourceId});
 expect(await intelligence.getProjectIntakeSource(ctx,f.itemId,f.snapshotId)).toMatchObject({itemId:f.itemId,snapshotId:f.snapshotId});
 expect((await createProjectRepository(db).get(ctx,created.project.id)).id).toBe(created.project.id);
});
it('p2c raw迁组预览拒绝遗留原组活来源，不移动项目或回执',async()=>{
 const {createGroupMigrationService}=await import('../modules/platform-account/group-migration.service');
 const ctx=await scope(),target=await scope(),f=await source(ctx),created=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'migrate-raw-source'});
 const migration=createGroupMigrationService({db,...deps});
 await expect(migration.preview(ctx,{fromGroupId:ctx.groupId!,toGroupId:target.groupId!,projectIds:[created.project.id],knowledgeIds:[],conversationIds:[]})).rejects.toThrow(/雷达|来源|依赖/);
 expect((await createProjectRepository(db).get(ctx,created.project.id)).groupId).toBe(ctx.groupId);
});
it('p2c 导入服务所有受控分支先委派统一端口，既有publication不跳过ensure',async()=>{
 const {createIngestionService}=await import('../modules/ingestion/ingestion.service');
 const ctx=await scope(true),app=await application();let calls=0;
 const service=createIngestionService({db,deps,ports:{projects:{ensureProjectIntake:async(c:RequestContext,input:any)=>{calls++;return app.ensureImportedProject(c,input);},ensureImportedProject:async()=>{throw Error('旧项目旁路不得执行');}},publishing:{resolvePublication:async()=>({id:'old-publication',contentOutputId:'old-output'}),resolveCollectedPublication:async()=>({id:'old-publication',contentOutputId:'old-output'})}} as any});
 const result=await service.ensureImportedProject(ctx,{title:'受控采集入口',brief:'真实正文',platform:'douyin',externalId:nextId('ingestion-entry')});
 expect(calls).toBe(1);expect(result?.projectId).toMatch(/^project-intake-/);expect(result?.publicationId).toBeTruthy();
});
it('p2c 同组不同真实账号的相同externalId不可复用另一账号历史项目',async()=>{
 const a={...await scope(true),source:'ingestion' as const},b={...a,accountId:nextId('account')};
 await db.insert(platformAccounts).values({id:b.accountId,userId:b.userId,platform:'douyin',accountHandle:b.accountId,status:'active',createdAt:now(),updatedAt:now()});await db.insert(accountGroupMemberships).values({id:nextId('member'),userId:b.userId,groupId:b.groupId!,accountId:b.accountId,version:1,joinedAt:now()});
 const old=await createProjectsService(createProjectRepository(db),deps).createProject(a,{title:'A历史导入',source:'imported',platformRef:{platform:'douyin',externalId:'same-external'}});
 const result=await (await application()).ensureImportedProject(b,{title:'B真实作品',platform:'douyin',externalId:'same-external'});
 expect(result.projectId).not.toBe(old.id);expect((await createProjectRepository(db).get(b,result.projectId)).accountId).toBe(b.accountId);
});
it('p2c canonical项目多稿件沿publication指定output；本次可信正文保留独立v1',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},api=createProjectsService(createProjectRepository(db),deps),owner=await api.createProject(ctx,{title:'多稿件项目',brief:'用户资料'});
 await api.createOutput(ctx,owner.id,{title:'第一稿'});const canonical=await api.createOutput(ctx,owner.id,{title:'真实发布第二稿'}),externalId=nextId('second-output-work');
 await db.insert(publications).values({id:nextId('publication'),userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId!,contentOutputId:canonical.id,platform:'douyin',accountReference:'真实账号',status:'published',externalId,createdAt:now(),updatedAt:now()});
 const result=await (await application()).ensureImportedProject(ctx,{title:'采集标题',brief:'本次新采集的来源正文',platform:'douyin',externalId});
 expect(result.outputId).toBe(canonical.id);expect(result.projectId).toBe(owner.id);
 const {findImportedProjectText}=await import('../modules/projects/project-intake.service');expect(await findImportedProjectText(db,deps,ctx,owner.id)).toMatchObject({contentText:'本次新采集的来源正文'});
});
it('p2c 旧项目已有准备父时ensure返回原taskId，不重复预约',async()=>{
 const ctx=await scope(),f=await source(ctx),api=createProjectsService(createProjectRepository(db),deps),project=await api.createProject(ctx,{title:'旧雷达项目'});
 await db.update(projects).set({briefDetail:{contentRadarEvidence:{sourceReferences:[{intelligenceItemId:f.itemId}]}}}).where(eq(projects.id,project.id));
 await db.insert(executionTasks).values({id:nextId('legacy-parent'),userId:ctx.userId,groupId:ctx.groupId,accountId:null,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:nextId('legacy-key'),payload:{itemId:f.itemId},checkpoint:{projectId:project.id},status:'succeeded',createdAt:now(),updatedAt:now()});
 const preparationId=nextId('existing-preparation');await db.insert(executionTasks).values({id:preparationId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,kind:'project_preparation',ownerType:'project',ownerId:project.id,idempotencyKey:nextId('preparation-key'),payload:{schemaVersion:1,projectId:project.id},status:'waiting_user',createdAt:now(),updatedAt:now()});
 const result=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'reuse-existing-preparation'});expect(result.project.id).toBe(project.id);expect(result.preparationTaskId).toBe(preparationId);
});

it('p2c 合法迁组迁移intake scope，目标读取原始导入v1，undo恢复',async()=>{
 const {createGroupMigrationService}=await import('../modules/platform-account/group-migration.service'),{findImportedProjectText}=await import('../modules/projects/project-intake.service');
 const ctx={...await scope(true),source:'ingestion' as const},target=await scope(),created=await (await application()).ensureImportedProject(ctx,{title:'迁组原文',brief:'固定的采集正文',platform:'douyin',externalId:nextId('move-imported')});
 const original=await findImportedProjectText(db,deps,ctx,created.projectId);
 await db.update(accountGroupMemberships).set({leftAt:now()}).where(eq(accountGroupMemberships.accountId,ctx.accountId!));
 await db.insert(accountGroupMemberships).values({id:nextId('member'),userId:ctx.userId,groupId:target.groupId!,accountId:ctx.accountId!,version:2,joinedAt:now()});
 const migration=createGroupMigrationService({db,...deps}),oldCtx={...ctx,accountId:null},body={fromGroupId:ctx.groupId!,toGroupId:target.groupId!,projectIds:[created.projectId],knowledgeIds:[],conversationIds:[]};
 const preview=await migration.preview(oldCtx,body),done=await migration.apply(oldCtx,{...body,digest:preview.digest,idempotencyKey:'move-source-text'});
 expect(await findImportedProjectText(db,deps,target,created.projectId)).toEqual(original);
 await expect(findImportedProjectText(db,deps,oldCtx,created.projectId)).rejects.toThrow();
 await db.update(accountGroupMemberships).set({leftAt:now()}).where(eq(accountGroupMemberships.groupId,target.groupId!));
 await db.insert(accountGroupMemberships).values({id:nextId('member'),userId:ctx.userId,groupId:ctx.groupId!,accountId:ctx.accountId!,version:3,joinedAt:now()});
 await migration.undo(target,done.id);expect(await findImportedProjectText(db,deps,oldCtx,created.projectId)).toEqual(original);
});
it('p2c ensure重放返回后续最新准备父，不回退初次回执任务',async()=>{
 const {createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 const ctx=await scope(),f=await source(ctx),tasks=createPersistentTaskService(db,deps),intelligence=createIntelligenceService(db,{...deps,tasks}),prep=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitBrief:async()=>{throw Error('不得提交');},submitProjectTranscript:async()=>{throw Error('不得提交');},readBrief:async()=>[]});
 const app=await application(db,{preparation:prep.preparation}),body={source:'radar',itemId:f.itemId,idempotencyKey:'latest-preparation'};
 const first=await app.ensureProject(ctx,body);expect(first.preparationTaskId).toBeTruthy();
 await db.update(executionTasks).set({status:'cancelled',createdAt:'2026-10-20T14:59:00.000Z'}).where(eq(executionTasks.id,first.preparationTaskId!));
 const newer=await prep.preparation.start(ctx,first.project.id,{idempotencyKey:'second-preparation',requestedSteps:['source_draft']});
 await db.update(executionTasks).set({createdAt:'2026-10-20T15:00:01.000Z'}).where(eq(executionTasks.id,newer.preparationTaskId!));
 expect(newer.preparationTaskId).not.toBe(first.preparationTaskId);expect((await app.ensureProject(ctx,body)).preparationTaskId).toBe(newer.preparationTaskId);
 expect((await db.select().from(executionTasks).where(eq(executionTasks.ownerId,first.project.id)))).toHaveLength(2);
});
it('p2c 已有其他raw的发布项目导入只冻结本作品原文，重放保留全部来源',async()=>{
 const ctx={...await scope(true),source:'ingestion' as const},f=await source(ctx),created=await ensure(ctx,{...manual('mixed-raw'),source:'quick_create',sourceItemId:f.itemId});
 const {projectSourceReferences}=await import('../modules/projects/projects.db-schema');await db.update(projectSourceReferences).set({id:'a-first-raw-'+created.project.id}).where(eq(projectSourceReferences.projectId,created.project.id));
 const api=createProjectsService(createProjectRepository(db),deps),output=await api.createOutput(ctx,created.project.id,{title:'已发布稿件'}),externalId=nextId('mixed-raw-work');
 await db.insert(publications).values({id:nextId('publication'),userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId!,contentOutputId:output.id,platform:'douyin',accountReference:'真实账号',status:'published',externalId,createdAt:now(),updatedAt:now()});
 const app=await application(),input={title:'真实发布标题',brief:'该发布作品独立来源正文',platform:'douyin',externalId};
 const one=await app.ensureImportedProject(ctx,input),two=await app.ensureImportedProject(ctx,input);expect(one.projectId).toBe(created.project.id);expect(two).toEqual(one);
 expect((await ensure(ctx,{...manual('mixed-raw'),source:'quick_create',sourceItemId:f.itemId})).project.id).toBe(created.project.id);
 expect((await db.select().from(projectSourceReferences).where(eq(projectSourceReferences.projectId,created.project.id)))).toHaveLength(2);
 const {findImportedProjectText}=await import('../modules/projects/project-intake.service');expect(await findImportedProjectText(db,deps,ctx,created.project.id)).toMatchObject({contentText:input.brief});
});

it('p2c 真实采集收尾不归档同组另一账号的同externalId项目',async()=>{
 const {createIngestionService}=await import('../modules/ingestion/ingestion.service');
 const a=await scope(true),b={...a,accountId:nextId('account')};
 await db.insert(platformAccounts).values({id:b.accountId,userId:b.userId,platform:'douyin',accountHandle:b.accountId,status:'active',createdAt:now(),updatedAt:now()});await db.insert(accountGroupMemberships).values({id:nextId('member'),userId:b.userId,groupId:b.groupId!,accountId:b.accountId,version:1,joinedAt:now()});
 const api=createProjectsService(createProjectRepository(db),deps),old=await api.createProject(a,{title:'A历史来源',source:'imported',platformRef:{platform:'douyin',externalId:'account-collision'}}),app=await application();
 const ingestion=createIngestionService({db,deps,ports:{projects:{...api,ensureProjectIntake:(c:RequestContext,input:any)=>app.ensureImportedProject(c,input)},publishing:{resolvePublication:async()=>null}}} as any);
 const result=await ingestion.ensureImportedProject(b,{title:'B真实作品',platform:'douyin',externalId:'account-collision'});expect(result!.projectId).not.toBe(old.id);
 expect((await api.getProject(a,old.id)).status).not.toBe('archived');expect((await api.getProject(b,result!.projectId)).status).not.toBe('archived');
});
it('p2c publication合法接管后再采集遵守新canonical，不混合旧project与新output',async()=>{
 const {createPublishingService}=await import('../modules/publishing/publishing.service'),{createMembershipLockService}=await import('../modules/platform-account/membership-lock.service'),{createPlatformAccountService}=await import('../modules/platform-account/platform-account.service'),{findImportedProjectText}=await import('../modules/projects/project-intake.service');
 const ctx={...await scope(true),source:'ingestion' as const},app=await application(),api=createProjectsService(createProjectRepository(db),deps),input={title:'旧导入',brief:'最初导入正文',platform:'douyin',externalId:nextId('canonical-takeover')};
 const old=await app.ensureImportedProject(ctx,input),original=await findImportedProjectText(db,deps,ctx,old.projectId),canonical=await api.createProject(ctx,{title:'用户项目',brief:'用户正式资料'}),output=await api.createOutput(ctx,canonical.id,{title:'用户稿件'});
 const publishing=createPublishingService({db,...deps,membership:createMembershipLockService(db),assertTargetAccount:(c,t)=>createPlatformAccountService({db,...deps}).assertOwnedAccount(c,t.accountId,t.platform),resolveOutputOwner:(c,id)=>api.getOutputOwnerSummary(c,id),reconcileImportedProjections:(c,input)=>api.reconcileImportedProjections(c,input)});
 await publishing.registerOwnerPublication(ctx,output.id,{platform:input.platform,externalId:input.externalId});
 const one=await app.ensureImportedProject(ctx,{...input,brief:'重新采集的来源正文'}),two=await app.ensureImportedProject(ctx,input);
 expect(one).toMatchObject({projectId:canonical.id,outputId:output.id,created:false});expect(two).toEqual(one);expect((await api.getProject(ctx,canonical.id)).brief).toBe('用户正式资料');
 expect(await findImportedProjectText(db,deps,ctx,canonical.id)).toMatchObject({contentText:'重新采集的来源正文'});
 const [oldRow]=(await db.execute(sql`SELECT * FROM projects WHERE id=${old.projectId}`)).rows;expect(oldRow!.status).toBe('archived');
 expect((await db.execute(sql`SELECT project_id FROM project_intakes WHERE id=${original!.intakeId}`)).rows[0]!.project_id).toBe(old.projectId);
});

it.each([false,true])('旧父未知供应商结果 account=%s：重新点击先有项目与待核对步骤，重放不重发原调用',async account=>{
 const ctx=await scope(account),f=await source(ctx),parentId=nextId('legacy-unknown'),childId=nextId('legacy-topic'),callId=nextId('original-call');
 await db.insert(executionTasks).values([{id:parentId,userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,kind:'radar_project_upgrade',ownerType:'item',ownerId:f.itemId,idempotencyKey:parentId,payload:{itemId:f.itemId},checkpoint:{topicTaskId:childId},status:'running',createdAt:now(),updatedAt:now()},{id:childId,userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,kind:'topic_preview',ownerType:'transform',ownerId:f.itemId,idempotencyKey:parentId+':preview',payload:{itemId:f.itemId},status:'running',createdAt:now(),updatedAt:now()}]);
 const {executionCalls}=await import('../schema/intelligence');await db.insert(executionCalls).values({id:callId,executionTaskId:childId,sequence:1,operationKey:'original-operation',kind:'model',inputDigest:'original',status:'unknown',reservedTokens:50,createdAt:now(),updatedAt:now()});
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.id,callId));
 const {retireLegacyRadarUpgrades}=await import('../modules/execution/retired-radar-upgrade.service');await retireLegacyRadarUpgrades(db,now());
 const {createProjectPreparationService}=await import('../modules/projects/project-preparation.service'),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service');const tasks=createPersistentTaskService(db,deps),dispatch=vi.fn(async()=>{throw Error('未知结果不得重发');}),preparation=createProjectPreparationService(db,{...deps,tasks,dispatch});
 const body={source:'radar',itemId:f.itemId,idempotencyKey:'new-click'},before=await counts();const one=await ensure(ctx,body,db,{preparation}),two=await ensure(ctx,body,db,{preparation});
 expect(one.project.id).toBe(two.project.id);expect(one.preparationTaskId).toBeTruthy();expect((await counts()).projects).toBe(before.projects+1);
 expect((await preparation.get(ctx,one.project.id)).steps).toEqual(expect.arrayContaining([expect.objectContaining({name:'source_draft',status:'unknown_result',childTaskId:childId,outputReferences:[{kind:'execution_call',id:callId}]})]));
 await tasks.command(ctx,{taskIds:[one.preparationTaskId!],command:'retry',idempotencyKey:nextId('retry')});await preparation.tick({shouldStop:()=>false});expect(dispatch).not.toHaveBeenCalled();expect(await db.select().from(executionCalls).where(eq(executionCalls.id,callId))).toEqual(calls);
});

it('T1382 雷达列表与详情只读返回本组已建项目，重新进入不调用ensure',async()=>{
 const {createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service');
 const ctx=await scope(),other=await scope(),f=await source(ctx),outside=await source(other),one=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:'radar-read-projection'});
 await ensure(other,{source:'radar',itemId:outside.itemId,idempotencyKey:'radar-read-projection'});
 const intel=createIntelligenceService(db,{...deps,tasks:createPersistentTaskService(db,deps)}),before=await db.execute(sql`SELECT * FROM project_intakes ORDER BY id`);
 expect((await intel.listItems(ctx)).rows.find(row=>row.item.id===f.itemId)?.item).toMatchObject({projectId:one.project.id});
 expect((await intel.getItem(ctx,f.itemId)).item).toMatchObject({projectId:one.project.id});
 expect((await intel.listItems(ctx)).rows.some(row=>row.item.id===outside.itemId)).toBe(false);
 await expect(intel.getItem(other,f.itemId)).rejects.toThrow();expect((await db.execute(sql`SELECT * FROM project_intakes ORDER BY id`)).rows).toEqual(before.rows);
});

it('T1382 同项目追加raw不冒充该item已从雷达升级',async()=>{
 const ctx=await scope(),a=await source(ctx),b=await source(ctx),one=await ensure(ctx,{source:'radar',itemId:a.itemId,idempotencyKey:'radar-exact-identity'});
 const {projectSourceReferences}=await import('../schema/projects'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service');
 await db.insert(projectSourceReferences).values({id:nextId('raw'),projectId:one.project.id,sourceKind:'intelligence_item',sourceKey:b.itemId,itemId:b.itemId,snapshotId:b.snapshotId,url:null,bodyAvailable:true,sourceDigest:'additional-source',createdAt:now(),updatedAt:now()});
 const intel=createIntelligenceService(db,{...deps,tasks:createPersistentTaskService(db,deps)});expect((await intel.getItem(ctx,a.itemId)).item).toMatchObject({projectId:one.project.id});expect((await intel.getItem(ctx,b.itemId)).item).not.toHaveProperty('projectId');
});

it.each(['failed','paused'] as const)('T1382 原转写%s绑定项目后显式恢复原子ID，不新发转写',async status=>{
 // 同一个PGlite夹具的调度器全局claim；先结束本文件其它已验证用例遗留的父任务。
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.kind,'project_preparation'));
 const ctx=await scope(),f=await source(ctx),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 let at=Date.parse(now());const local={...deps,now:()=>new Date(at).toISOString()},tasks=createPersistentTaskService(db,local),intel=createIntelligenceService(db,{...local,tasks});
 const child=await tasks.enqueue(ctx,{kind:'transcribe',ownerType:'item',ownerId:f.itemId,idempotencyKey:nextId('old-transcript'),payload:{itemId:f.itemId}});
 await db.update(executionTasks).set({status,lastErrorCode:'TRANSCRIBE_FAILED'}).where(eq(executionTasks.id,child.id));await db.insert(itemTranscripts).values({itemId:f.itemId,userId:ctx.userId,groupId:ctx.groupId,accountId:null,status:'failed',text:null,executionTaskId:child.id,updatedAt:now()});
 const generation=createProjectPreparationApplication(db,{...local,tasks,intelligence:intel,submitBrief:vi.fn(),submitProjectTranscript:vi.fn(),readBrief:async()=>[]}),created=await ensure(ctx,{source:'radar',itemId:f.itemId,idempotencyKey:nextId('same-transcript')});
 const parent=await generation.preparation.start(ctx,created.project.id,{idempotencyKey:nextId('start'),requestedSteps:['transcript']});await generation.preparation.tick({shouldStop:()=>false});at+=5000;await generation.preparation.tick({shouldStop:()=>false});
 expect((await generation.preparation.get(ctx,created.project.id)).steps.find(s=>s.name==='transcript')).toMatchObject({childTaskId:child.id,status:status==='paused'?'paused':'failed'});
 await generation.preparation.start(ctx,created.project.id,{idempotencyKey:nextId('retry'),requestedSteps:['transcript']});await generation.preparation.tick({shouldStop:()=>false});
 expect((await tasks.get(ctx,child.id)).status).toBe('queued');expect((await tasks.list(ctx,{kind:'transcribe',ownerId:f.itemId})).rows).toHaveLength(1);expect((await generation.preparation.get(ctx,created.project.id)).preparationTaskId).toBe(parent.preparationTaskId);
});

it.each([false,true])('fb 雷达手工逐字稿读回完成且不预约转写 account=%s',async account=>{
 const ctx=await scope(account),raw=await source(ctx),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createIntelligenceService}=await import('../modules/intelligence/intelligence.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,ctx.userId));
 const tasks=createPersistentTaskService(db,deps),intelligence=createIntelligenceService(db,{...deps,tasks}),forbidden=vi.fn(async()=>{throw Error('测试禁止模型或平台调用');});
 const enqueue=vi.spyOn(intelligence,'enqueueTranscripts');
 const {preparation}=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitBrief:forbidden,submitProjectTranscript:forbidden,readBrief:forbidden});
 const result=await ensure(ctx,{source:'radar',itemId:raw.itemId,idempotencyKey:'fb-radar'}),initial=await preparation.start(ctx,result.project.id,{idempotencyKey:'fb-transcript',requestedSteps:['transcript']});
 const reference=initial.sourceReferences[0]!,step=initial.steps.find(s=>s.name==='transcript')!;
 await preparation.provideTranscript(ctx,result.project.id,{parentTaskId:initial.preparationTaskId!,referenceId:reference.id,expectedSourceDigest:reference.sourceDigest!,expectedStepRevision:step.revision,submissionKey:'fb-paste',inputMode:'paste',text:'用户手工核对后的雷达逐字稿'});
 await preparation.tick({shouldStop:()=>false});
 const ready=await preparation.get(ctx,result.project.id);
 expect(ready.steps.find(s=>s.name==='transcript')).toMatchObject({status:'done',reasonCode:'TRANSCRIPT_ALREADY_AVAILABLE',completedAt:now(),childTaskId:null,lastError:null,availableActions:[]});
 expect((await intelligence.getItem(ctx,raw.itemId)).transcript).toMatchObject({status:'done',text:'用户手工核对后的雷达逐字稿'});expect(enqueue).not.toHaveBeenCalled();expect(forbidden).not.toHaveBeenCalled();
 expect((await preparation.get(ctx,result.project.id)).steps).toEqual(ready.steps);
});
it('fb 无外部来源仍如实not_required，不伪造逐字稿完成',async()=>{
 const ctx=await scope(),{createPersistentTaskService}=await import('../modules/execution/persistent-task.service'),{createProjectPreparationApplication}=await import('../application/projects/project-preparation');
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,ctx.userId));
 const tasks=createPersistentTaskService(db,deps),forbidden=vi.fn(async()=>{throw Error('测试禁止模型或平台调用');}),{preparation}=createProjectPreparationApplication(db,{...deps,tasks,intelligence:{} as never,submitBrief:forbidden,submitProjectTranscript:forbidden,readBrief:forbidden});
 const project=(await ensure(ctx,manual('fb-no-source'))).project;await preparation.start(ctx,project.id,{idempotencyKey:'fb-no-transcript',requestedSteps:['transcript']});await preparation.tick({shouldStop:()=>false});
 expect((await preparation.get(ctx,project.id)).steps.find(s=>s.name==='transcript')).toMatchObject({status:'not_required',reasonCode:'NO_SUPPORTED_TRANSCRIPTION_SOURCE',childTaskId:null,completedAt:null});expect(forbidden).not.toHaveBeenCalled();
});
