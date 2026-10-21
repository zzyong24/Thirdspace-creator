import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createDb,type Db} from '../../db';
import {eq} from 'drizzle-orm';
import {executionTasks,executionCalls} from '../../schema/intelligence';
import type {RequestContext} from '@creatoros/contract';
import {createProjectsService} from './projects.service';
import {createProjectRepository} from './projects.repository';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {projectIntakeDigest} from './project-intake.service';
import {createProjectIntakeApplication} from '../../application/projects/project-intake';
let db:Db,close:()=>Promise<void>,seq=0;
const clock={value:'2026-10-21T01:00:00.000Z'},now=()=>clock.value,nextId=(prefix:string)=>`${prefix}-prep-${++seq}`;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);
afterAll(async()=>close?.(),120000);
async function fixture(){
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,'prep-user'));
 clock.value='2026-10-21T01:00:00.000Z';
 const ctx:RequestContext={userId:'prep-user',accountId:nextId('account'),requestId:'prep',source:'user'};
 const projects=createProjectsService(createProjectRepository(db),{now,nextId}),project=await projects.createProject(ctx,{title:'准备项目',brief:'用户原始资料'});
 const tasks=createPersistentTaskService(db,{now,nextId});
 const module=await import('./project-preparation.service');
 const dispatch=vi.fn(async()=>({status:'waiting_user' as const,reasonCode:'CONFIGURATION_REQUIRED',message:'请配置模型后继续'}));
 const service=module.createProjectPreparationService(db,{now,nextId,tasks,dispatch});
 return {ctx,project,projects,tasks,service,dispatch};
}
it('无登记只读；显式start幂等，无配置仍保留已建项目并waiting_user',async()=>{
 const f=await fixture();expect(await f.service.get(f.ctx,f.project.id)).toMatchObject({registration:'not_registered',preparationTaskId:null});
 const input={idempotencyKey:'start-preparation-once',requestedSteps:['source_draft' as const]};
 const started=await f.service.start(f.ctx,f.project.id,input),replayed=await f.service.start(f.ctx,f.project.id,input);
 expect(replayed.preparationTaskId).toBe(started.preparationTaskId);
 await f.service.tick({shouldStop:()=>false});
 expect(await f.service.get(f.ctx,f.project.id)).toMatchObject({registration:'registered',steps:expect.arrayContaining([expect.objectContaining({name:'source_draft',status:'waiting_user'})])});
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('用户原始资料');
});
it('ensure预约与项目同事务，来源需要准备时返回真实父ID；预约异常整笔回滚',async()=>{
 const f=await fixture();
 const app=createProjectIntakeApplication(db,{now,nextId},{preparation:f.service});
 const created=await app.ensureProject(f.ctx,{source:'manual',title:'纯手工无需自动准备',idempotencyKey:'manual-no-preparation'});
 expect(created.preparationTaskId).toBeNull();
 await expect(db.transaction(async tx=>{
  const id=await f.service.reserve(f.ctx,{project:f.project,source:'topic',sourceReferences:[],intakeId:'intake-explicit'},tx);
  expect(id).toBeTruthy();throw Error('事务故障');
 })).rejects.toThrow('事务故障');
 expect((await f.tasks.list(f.ctx,{kind:'project_preparation' as never,ownerId:f.project.id})).rows).toHaveLength(0);
});
it('跨项目父ID和跨工作区读取均拒绝',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'scope-start-once',requestedSteps:['transcript']});
 await expect(f.service.get({...f.ctx,accountId:'foreign'},f.project.id)).rejects.toThrow();
 const other=await f.projects.createProject(f.ctx,{title:'其它项目'});
 await expect(f.service.provideTranscript(f.ctx,other.id,{parentTaskId:started.preparationTaskId!,referenceId:'source',expectedSourceDigest:'digest',expectedStepRevision:0,submissionKey:'transcript-provide',inputMode:'paste',text:'原文'})).rejects.toThrow();
});
it('短tick保留同一个子ID；unknown_result不新建；显式恢复先查原账本',async()=>{
 const f=await fixture();let childId='';
 f.dispatch.mockImplementation(async()=>{
  const child=await f.tasks.enqueue(f.ctx,{kind:'topic_preview',ownerType:'project',ownerId:f.project.id,idempotencyKey:'one-child',payload:{executionRoute:createExecutionRoute('codex')}});childId=child.id;
  return {status:'child',childTaskId:child.id,businessTaskId:null,shared:false,sourceDigest:'digest'} as never;
 });
 const parent=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'start-child-once',requestedSteps:['source_draft']});
 await f.service.tick({shouldStop:()=>false});expect(f.dispatch).toHaveBeenCalledTimes(1);
 expect(await f.tasks.get(f.ctx,parent.preparationTaskId!)).toMatchObject({runtimeStatus:'retry_wait'});
 await db.insert(executionCalls).values({id:nextId('unknown-call'),executionTaskId:childId,sequence:1,operationKey:'original-model',kind:'model',inputDigest:'sha256:'+'a'.repeat(64),status:'unknown',reservedTokens:100,createdAt:now(),updatedAt:now()});
 await db.update(executionTasks).set({status:'unknown_result'}).where(eq(executionTasks.id,childId));clock.value='2026-10-21T01:00:05.000Z';
 await f.service.tick({shouldStop:()=>false});
 expect(await f.tasks.get(f.ctx,parent.preparationTaskId!)).toMatchObject({attempt:2,status:'blocked'});
 expect((await f.service.get(f.ctx,f.project.id)).steps).toEqual(expect.arrayContaining([expect.objectContaining({status:'unknown_result',childTaskId:childId})]));
 expect(f.dispatch).toHaveBeenCalledTimes(1);expect((await f.tasks.get(f.ctx,parent.preparationTaskId!)).status).toBe('blocked');
});
it('候选未采纳正式资料不变；采纳幂等且过期基线拒绝',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'candidate-start-once',requestedSteps:['brief']});
 const baseline=await f.service.readBaseline(f.ctx,f.project.id);
 const candidate={id:'brief-candidate',kind:'brief',sourceTaskId:'child-receipt',transformId:null,checkpointPath:'candidates.brief-candidate',sourceDigest:'source-digest',artifactDigest:projectIntakeDigest({kind:'brief',brief:'AI候选资料',briefDetail:{targetPlatforms:[]}}),status:'pending',acceptanceReceipt:null};
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!));
 await db.update(executionTasks).set({status:'succeeded',checkpoint:{...parent!.checkpoint as object,candidates:[candidate],candidateContents:{'brief-candidate':{kind:'brief',brief:'AI候选资料',briefDetail:{targetPlatforms:[]}}},candidateBaselines:{'brief-candidate':baseline}}}).where(eq(executionTasks.id,parent!.id));
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('用户原始资料');
 // 真实子任务回执，不由客户端声称模型完成。
 await db.insert(executionTasks).values({id:'child-receipt',userId:f.ctx.userId,accountId:f.ctx.accountId,kind:'topic_preview',ownerType:'project',ownerId:f.project.id,idempotencyKey:'candidate-child',payload:{projectId:f.project.id},checkpoint:{candidates:{'brief-candidate':{kind:'brief',brief:'AI候选资料',briefDetail:{targetPlatforms:[]}}}},status:'succeeded',createdAt:now(),updatedAt:now()});
 const input={idempotencyKey:'candidate-adoption-once',candidateSourceDigest:'source-digest',baseline:{kind:'digest' as const,digest:baseline.digest}};
 const accepted=await f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,input);expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('AI候选资料');
 expect(await f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,input)).toEqual(accepted);
 clock.value='2026-10-21T01:00:01.000Z';await f.service.start(f.ctx,f.project.id,{idempotencyKey:'another-preparation-run',requestedSteps:['brief']});
 expect(await f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,input)).toEqual(accepted);
 await expect(f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,{...input,idempotencyKey:'changed-adoption',baseline:{kind:'digest',digest:'outdated'}})).rejects.toThrow();
});
it('四个公开preparation handler路由到真实服务，缺失/跨项目候选拒绝而非假成功',async()=>{
 const f=await fixture(),{ENDPOINTS}=await import('@creatoros/contract'),{createProjectsTransport}=await import('./projects.transport');
 const transport=createProjectsTransport(()=>({service:f.projects,repo:createProjectRepository(db),preparation:f.service} as never));
 const request=(endpoint:any,body?:unknown,extra={})=>transport.request(endpoint,{params:{projectId:f.project.id,...extra},query:undefined,body} as never,f.ctx);
 expect(await request(ENDPOINTS.getProjectPreparation)).toMatchObject({data:{registration:'not_registered'}});
 const result=await request(ENDPOINTS.startProjectPreparation,{idempotencyKey:'public-preparation-start',requestedSteps:['transcript']});expect(result).toMatchObject({data:{registration:'registered'}});
 await expect(request(ENDPOINTS.provideProjectPreparationTranscript,{parentTaskId:(result as any).data.preparationTaskId,referenceId:'missing',expectedSourceDigest:'old',expectedStepRevision:0,submissionKey:'missing-transcript',inputMode:'paste',text:'原文'})).rejects.not.toThrow('Unsupported');
 await expect(request(ENDPOINTS.acceptProjectPreparationCandidate,{idempotencyKey:'missing-candidate-key',candidateSourceDigest:'missing',baseline:{kind:'digest',digest:'old'}},{candidateId:'missing'})).rejects.not.toThrow('Unsupported');
});

it.each([false,true])('T1382 准备chat真实提交冻结只读与brief候选，保父路由和持久锚 existingRoute=%s',async existingRoute=>{
 const f=await fixture(),{createProjectPreparationChat}=await import('../../application/projects/project-preparation-chat'),{createAgenticToolBinding}=await import('../execution/agentic-tool-binding'),{z}=await import('zod');
 const definition=(name:string,effect:'none'|'proposal'|'committed')=>({name,effect,version:'1',description:name,parameters:{type:'object'}});
 const assemble=vi.fn(async(ctx:any,snapshot:any,options:any)=>({capability:'copilot.assist',system:'策略',messages:[{role:'user' as const,content:'资料候选'}],maxSteps:6,maxOutputTokens:128,tools:[definition('brief.fill','proposal'),definition('context.project.detail','none'),definition('script.draft','committed')],executionRoute:options.executionRoute??createExecutionRoute('pi'),hostContext:{schemaVersion:1 as const,chatContext:{surface:'project',projectId:f.project.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1 as const,userId:f.ctx.userId,accountId:f.ctx.accountId??null,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'原策略',skills:[{skillId:'chatbox.topic',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'原策略',template:'',tools:['brief.fill'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}}));
 const chat=createProjectPreparationChat(db,{now,nextId,assemble});
 const module=await import('./project-preparation.service'),preparation=module.createProjectPreparationService(db,{now,nextId,tasks:f.tasks,dispatch:async(ctx,input)=>({status:'child',...await chat.submit(ctx,input),shared:false,sourceDigest:'original'})});
 const started=await preparation.start(f.ctx,f.project.id,{idempotencyKey:'chat-start-once',requestedSteps:['brief']});
 if(existingRoute){const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!));await db.update(executionTasks).set({payload:{...parent!.payload as object,executionRoute:createExecutionRoute('pi')}}).where(eq(executionTasks.id,parent!.id));}
 await preparation.tick({shouldStop:()=>false});const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!)),cp=parent!.checkpoint as any;
 expect(parent!.status,JSON.stringify(cp)).toBe('retry_wait');expect(cp.chatSubmissions['brief:0'].conversationId).toBeTruthy();
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,cp.steps.find((s:any)=>s.name==='brief').childTaskId));
 expect(child!.deadlineAt).toBe(parent!.deadlineAt);expect((child!.payload as any).modelInput.tools.map((t:any)=>t.name)).toEqual(['brief.fill','context.project.detail']);
 const fakeCall={id:'proposed-call',executionTaskId:child!.id,kind:'model',status:'settled',parentCallId:null,providerResult:{content:[{type:'tool-call',toolCallId:'forbidden',toolName:'script_draft',input:'{}'}],finishReason:{unified:'tool-calls'}}};
 const binding=createAgenticToolBinding({'script.draft':{version:'1',effect:'committed',parameters:z.object({})}});
 expect(()=>binding.bind(child!,[fakeCall] as any,{modelCallId:fakeCall.id,toolCallId:'forbidden'})).toThrow(/冻结白名单/);expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('用户原始资料');
});
it('T1382 真实来源候选采纳写独立正式稿，保留来源全部版本；父resume一次唤醒原子',async()=>{
 const f=await fixture(),{createArtifactsService}=await import('../artifacts/artifacts.service'),{createProjectPreparationGenerationService}=await import('./project-preparation-generation.service'),{createProjectPreparationService}=await import('./project-preparation.service'),{createHash}=await import('node:crypto');
 const artifacts=createArtifactsService({db,now,nextId,assertProjectOwned:(c,id)=>f.projects.getProject(c,id)}),source=await artifacts.createArtifact(f.ctx,{projectId:f.project.id,title:'真实来源',stage:'script',artifactType:'output_script',initialContentText:'原始逐字稿',initialContentData:{purpose:'project_preparation_source'}}),hash=`sha256:${createHash('sha256').update('原始逐字稿').digest('hex')}`;
 const generation=createProjectPreparationGenerationService(db,{now,nextId,tasks:f.tasks}),target={ownerType:'project' as const,projectId:f.project.id,source:{kind:'project_artifact' as const,projectId:f.project.id,artifactId:source.id,artifactVersion:1,contentHash:hash,title:'来源',authorName:null,url:null},generationMode:'rewrite_only' as const,transcript:{text:'原始逐字稿',hash}};
 const service=createProjectPreparationService(db,{now,nextId,tasks:f.tasks,dispatch:async(ctx,input)=>({status:'child',...await generation.reserve(ctx,{parentClaim:input.claim,projectId:f.project.id,referenceId:null,inputRevision:0,target}),businessTaskId:null,shared:false}),collect:(ctx,input)=>generation.collect(ctx,input.project.id,input.childTaskId),readCandidate:async(ctx,id,candidate,store)=>(await createProjectPreparationGenerationService(store,{now,nextId,tasks:createPersistentTaskService(store,{now,nextId})}).collect(ctx,id,candidate.sourceTaskId))[0]!.content});
 const parent=await service.start(f.ctx,f.project.id,{idempotencyKey:'draft-adoption-real',requestedSteps:['source_draft']});await service.tick({shouldStop:()=>false});let resource=await service.get(f.ctx,f.project.id),step=resource.steps.find(s=>s.name==='source_draft')!;
 const childId=step.childTaskId!,versions=await artifacts.listVersions(f.ctx,source.id);await f.tasks.command(f.ctx,{taskIds:[parent.preparationTaskId!],command:'pause',idempotencyKey:'pause-draft'});await f.tasks.command(f.ctx,{taskIds:[parent.preparationTaskId!],command:'resume',idempotencyKey:'resume-draft'});await service.tick({shouldStop:()=>false});expect((await f.tasks.get(f.ctx,childId)).status).toBe('queued');
 const child=(await f.tasks.claimTask({taskId:childId,workerId:'draft'}))!;await generation.finish(f.ctx,child,{generationMode:'rewrite_only',adaptedDraft:'准备生成的候选稿'});await f.tasks.finish({taskId:childId,...child.lease,status:'succeeded'});clock.value='2026-10-21T01:00:05.000Z';await service.tick({shouldStop:()=>false});resource=await service.get(f.ctx,f.project.id);
 expect(await artifacts.listProjectArtifacts(f.ctx,f.project.id)).toHaveLength(1);const candidate=resource.candidates[0]!,baseline=await service.readBaseline(f.ctx,f.project.id),input={idempotencyKey:'adopt-draft-once',candidateSourceDigest:candidate.sourceDigest,baseline:{kind:'digest' as const,digest:baseline.digest}};
 const receipt=await service.acceptCandidate(f.ctx,f.project.id,candidate.id,input);expect(receipt.artifactVersion).toBeGreaterThan(0);expect(await service.acceptCandidate(f.ctx,f.project.id,candidate.id,input)).toEqual(receipt);expect(await artifacts.listVersions(f.ctx,source.id)).toEqual(versions);
 const formal=(await artifacts.listProjectArtifacts(f.ctx,f.project.id)).find(row=>row.id!==source.id)!;expect((await artifacts.listVersions(f.ctx,formal.id)).find(row=>row.id===formal.currentVersionId)?.contentText).toBe('准备生成的候选稿');
});

it('旧雷达未知原调用先登记项目待核对，显式retry也不新增付费子任务',async()=>{
 const f=await fixture(),itemId=nextId('legacy-item'),parentId=nextId('legacy-parent'),childId=nextId('legacy-topic');
 await db.insert(executionTasks).values([{id:parentId,userId:f.ctx.userId,accountId:f.ctx.accountId,kind:'radar_project_upgrade',ownerType:'item',ownerId:itemId,idempotencyKey:parentId,payload:{itemId},checkpoint:{topicTaskId:childId},status:'cancelled',lastErrorCode:'SYSTEM_UPGRADED',createdAt:now(),updatedAt:now()},{id:childId,userId:f.ctx.userId,accountId:f.ctx.accountId,kind:'topic_preview',ownerType:'transform',ownerId:itemId,idempotencyKey:parentId+':preview',payload:{itemId},status:'unknown_result',lastErrorCode:'SYSTEM_UPGRADED',createdAt:now(),updatedAt:now()}]);
 await db.insert(executionCalls).values({id:nextId('original-call'),executionTaskId:childId,sequence:1,operationKey:'original-charge',kind:'model',inputDigest:'original',status:'unknown',reservedTokens:99,createdAt:now(),updatedAt:now()});
 const reference={id:nextId('reference'),projectId:f.project.id,sourceKey:itemId,sourceKind:'intelligence_item' as const,itemId,snapshotId:nextId('snapshot'),url:null,bodyAvailable:false,sourceDigest:'source',transcriptHash:null,createdAt:now(),updatedAt:now()};
 const {projectSourceReferences}=await import('./projects.db-schema');await db.insert(projectSourceReferences).values(reference);
 const calls=await db.select().from(executionCalls);
 const id=await db.transaction(tx=>f.service.reserve(f.ctx,{project:f.project,source:'radar',sourceReferences:[reference],intakeId:nextId('intake')},tx));
 expect(await f.service.get(f.ctx,f.project.id)).toMatchObject({steps:expect.arrayContaining([expect.objectContaining({name:'source_draft',status:'unknown_result',childTaskId:childId})])});
 await f.service.tick({shouldStop:()=>false});
 await f.tasks.command(f.ctx,{taskIds:[id!],command:'retry',idempotencyKey:nextId('retry')});await f.service.tick({shouldStop:()=>false});
 expect(f.dispatch).not.toHaveBeenCalled();expect(await db.select().from(executionCalls)).toEqual(calls);
 await db.update(executionCalls).set({status:'settled'}).where(eq(executionCalls.executionTaskId,childId));
 await f.tasks.command(f.ctx,{taskIds:[id!],command:'retry',idempotencyKey:nextId('after-reconciliation')});await f.service.tick({shouldStop:()=>false});expect(f.dispatch).toHaveBeenCalled();
});

it('T1382 GET返回核实的候选正文与冻结采纳基线，读取不写正式资料',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'read-candidate',requestedSteps:['brief']}),baseline=await f.service.readBaseline(f.ctx,f.project.id);
 const child=await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'project',ownerId:f.project.id,idempotencyKey:'brief-read-child',payload:{}}),content={kind:'brief',brief:'待采纳建议',briefDetail:{targetAudience:'读者',targetPlatforms:[]}};
 const candidate={id:'read-brief',kind:'brief',sourceTaskId:child.id,transformId:null,checkpointPath:'candidates.read-brief',sourceDigest:'original-source',artifactDigest:projectIntakeDigest(content),status:'pending',acceptanceReceipt:null};
 await db.update(executionTasks).set({status:'succeeded',checkpoint:{candidates:{'read-brief':content}}}).where(eq(executionTasks.id,child.id));
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!));
 await db.update(executionTasks).set({status:'succeeded',checkpoint:{...parent!.checkpoint as object,candidates:[candidate],candidateBaselines:{'read-brief':baseline}}}).where(eq(executionTasks.id,parent!.id));
 const result=await f.service.get(f.ctx,f.project.id);
 expect(result.candidates[0]).toMatchObject({content,baseline:{kind:'digest',digest:baseline.digest}});
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('用户原始资料');
});
it('T1382 POST preparation恢复原失败步骤，保父ID期限与已完成步骤',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'retry-original',requestedSteps:['source_draft','brief']});
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!)),cp=parent!.checkpoint as any;
 cp.steps.find((s:any)=>s.name==='source_draft').status='done';cp.steps.find((s:any)=>s.name==='brief').status='failed';
 await db.update(executionTasks).set({status:'blocked',checkpoint:cp}).where(eq(executionTasks.id,parent!.id));
 const result=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'retry-only-brief',requestedSteps:['brief']});
 expect(result.preparationTaskId).toBe(parent!.id);expect((await f.tasks.get(f.ctx,parent!.id)).status).toBe('queued');
 const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,parent!.id));expect(after!.deadlineAt).toBe(parent!.deadlineAt);
 expect(result.steps.find(s=>s.name==='source_draft')?.status).toBe('done');expect((await f.tasks.list(f.ctx,{kind:'project_preparation',ownerId:f.project.id})).rows).toHaveLength(1);
});
it('T1382 项目brief子任务经真实应用collect读取，GET候选后采纳才写正式资料',async()=>{
 const f=await fixture(),{createProjectPreparationApplication}=await import('../../application/projects/project-preparation');
 let childId='';const content={kind:'brief' as const,brief:'用户可审阅的建议',briefDetail:{targetAudience:'真实目标读者',targetPlatforms:[]}};
 const readBrief=vi.fn(async()=>[{candidate:{id:'application-brief',kind:'brief' as const,sourceTaskId:childId,transformId:null,checkpointPath:'briefSuggestion',sourceDigest:'brief-source',artifactDigest:projectIntakeDigest(content),status:'pending' as const,acceptanceReceipt:null},content}]);
 const {preparation}=createProjectPreparationApplication(db,{now,nextId,tasks:f.tasks,intelligence:{} as never,submitProjectTranscript:vi.fn(),submitBrief:async()=>{const child=await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'project',ownerId:f.project.id,idempotencyKey:'application-brief-child',payload:{}});childId=child.id;return {childTaskId:child.id,businessTaskId:child.id};},readBrief});
 await preparation.start(f.ctx,f.project.id,{idempotencyKey:'application-brief-start',requestedSteps:['brief']});await preparation.tick({shouldStop:()=>false});
 await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,childId));clock.value='2026-10-21T01:00:05.000Z';await preparation.tick({shouldStop:()=>false});
 const state=await preparation.get(f.ctx,f.project.id);expect(state.candidates).toHaveLength(1);expect(readBrief).toHaveBeenCalled();
 const candidate=state.candidates[0]!;expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe('用户原始资料');
 await preparation.acceptCandidate(f.ctx,f.project.id,candidate.id,{idempotencyKey:'accept-application-brief',candidateSourceDigest:candidate.sourceDigest,baseline:(candidate as any).baseline});
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe(content.brief);
});

it('T1382 运行中追加资料步骤保原父期限，不重复已完成步骤',async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 f.dispatch.mockImplementationOnce(async()=>{await gate;return {status:'not_required',reasonCode:'ALREADY_AVAILABLE'} as never;}).mockResolvedValue({status:'not_required',reasonCode:'TEST_COMPLETED'} as never);
 const one=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'append-start',requestedSteps:['transcript']});
 const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,one.preparationTaskId!));
 const tick=f.service.tick({shouldStop:()=>false});await vi.waitFor(()=>expect(f.dispatch).toHaveBeenCalledOnce(),{timeout:120000});
 try {const added=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'append-brief',requestedSteps:['brief']});expect(added.preparationTaskId).toBe(one.preparationTaskId);expect(added.steps.find(s=>s.name==='brief')).toMatchObject({required:true,status:'pending'});}finally{release();await tick;}
 clock.value='2026-10-21T01:00:05.000Z';await f.service.tick({shouldStop:()=>false});
 expect(f.dispatch.mock.calls.map((call:any)=>call[1].step)).toEqual(['transcript','brief']);
 const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,one.preparationTaskId!));expect(after!.deadlineAt).toBe(before!.deadlineAt);
});
it('T1382 运行中采纳候选不被后续tick覆盖，采纳回执可重放',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'accept-during-tick',requestedSteps:['source_draft','brief']}),baseline=await f.service.readBaseline(f.ctx,f.project.id);
 const content={kind:'brief',brief:'用户明确采纳',briefDetail:{targetPlatforms:[]}},child=await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'project',ownerId:f.project.id,idempotencyKey:'concurrent-child',payload:{}});
 const candidate={id:'concurrent-candidate',kind:'brief',sourceTaskId:child.id,transformId:null,checkpointPath:'candidates.concurrent-candidate',sourceDigest:'source',artifactDigest:projectIntakeDigest(content),status:'pending',acceptanceReceipt:null};
 await db.update(executionTasks).set({status:'succeeded',checkpoint:{candidates:{[candidate.id]:content}}}).where(eq(executionTasks.id,child.id));
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!)),cp=parent!.checkpoint as any;cp.steps.find((s:any)=>s.name==='source_draft').status='candidate_ready';cp.candidates=[candidate];cp.candidateBaselines={[candidate.id]:baseline};
 await db.update(executionTasks).set({checkpoint:cp}).where(eq(executionTasks.id,parent!.id));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.dispatch.mockImplementation(async()=>{await gate;return {status:'not_required',reasonCode:'TEST_COMPLETED'} as never;});
 const ticking=f.service.tick({shouldStop:()=>false});await vi.waitFor(()=>expect(f.dispatch).toHaveBeenCalledOnce(),{timeout:120000});
 const input={idempotencyKey:'concurrent-accept',candidateSourceDigest:'source',baseline:{kind:'digest' as const,digest:baseline.digest}};
 let receipt;try{receipt=await f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,input);}finally{release();await ticking;}
 expect((await f.service.get(f.ctx,f.project.id)).candidates[0]).toMatchObject({status:'accepted',acceptanceReceipt:receipt});expect(await f.service.acceptCandidate(f.ctx,f.project.id,candidate.id,input)).toEqual(receipt);expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe(content.brief);
});

it('T1382 首次准备动作登记输入，原键不能改步骤或重开后来失败的父',async()=>{
 const f=await fixture(),input={idempotencyKey:'first-intent-receipt',requestedSteps:['source_draft' as const]},first=await f.service.start(f.ctx,f.project.id,input);
 await expect(f.service.start(f.ctx,f.project.id,{...input,requestedSteps:['brief']})).rejects.toThrow('准备动作键对应不同步骤');
 await db.update(executionTasks).set({status:'failed'}).where(eq(executionTasks.id,first.preparationTaskId!));
 await f.service.start(f.ctx,f.project.id,input);expect((await f.tasks.get(f.ctx,first.preparationTaskId!)).status).toBe('failed');
 await f.service.start(f.ctx,f.project.id,{...input,idempotencyKey:'explicit-new-retry'});expect((await f.tasks.get(f.ctx,first.preparationTaskId!)).status).toBe('queued');
});
it('T1382 准备追加与恢复控制同事务，控制收据故障不吞掉重试动作',async()=>{
 const f=await fixture(),first=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'atomic-first',requestedSteps:['source_draft']});
 await db.update(executionTasks).set({status:'failed'}).where(eq(executionTasks.id,first.preparationTaskId!));
 let fail=true;const {createProjectPreparationService}=await import('./project-preparation.service');
 const service=createProjectPreparationService(db,{now,nextId:(prefix)=>{if(fail&&prefix==='control-receipt')throw Error('控制回执写入故障');return nextId(prefix);},tasks:f.tasks,dispatch:f.dispatch});
 const input={idempotencyKey:'atomic-retry',requestedSteps:['brief' as const]};
 await expect(service.start(f.ctx,f.project.id,input)).rejects.toThrow('控制回执写入故障');
 const [rolledBack]=await db.select().from(executionTasks).where(eq(executionTasks.id,first.preparationTaskId!));
 expect(rolledBack!.status).toBe('failed');expect((rolledBack!.checkpoint as import('./project-preparation.service').PreparationCheckpoint).startRequests?.[input.idempotencyKey]).toBeUndefined();
 fail=false;const retried=await service.start(f.ctx,f.project.id,input);expect(retried.steps.find(s=>s.name==='brief')).toMatchObject({required:true,status:'pending'});expect((await f.tasks.get(f.ctx,first.preparationTaskId!)).status).toBe('queued');
});
it.each(['cancelled','partial'])('T1382 %s子项不展示无效retry，连续POST保原ID账本且不重发',async(status)=>{
 const f=await fixture();let childId='';f.dispatch.mockImplementation(async()=>{const child=await f.tasks.enqueue(f.ctx,{kind:'topic_preview',ownerType:'project',ownerId:f.project.id,idempotencyKey:'terminal-child',payload:{}});childId=child.id;return {status:'child',childTaskId:child.id,businessTaskId:null,shared:false,sourceDigest:'original'} as never;});
 await f.service.start(f.ctx,f.project.id,{idempotencyKey:'terminal-start',requestedSteps:['source_draft']});await f.service.tick({shouldStop:()=>false});
 await db.update(executionTasks).set({status}).where(eq(executionTasks.id,childId));
 await db.insert(executionCalls).values({id:nextId('settled-call'),executionTaskId:childId,sequence:1,operationKey:'original-settled',kind:'model',inputDigest:'original',status:'settled',reservedTokens:9,createdAt:now(),updatedAt:now()});
 const ledger=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,childId)),command=vi.spyOn(f.tasks,'command');clock.value='2026-10-21T01:00:05.000Z';await f.service.tick({shouldStop:()=>false});
 for(let i=0;i<2;i++){const state=await f.service.get(f.ctx,f.project.id);expect(state.steps.find(s=>s.name==='source_draft')).toMatchObject({childTaskId:childId,availableActions:[]});expect(state.availableActions).not.toContain('retry');await f.service.start(f.ctx,f.project.id,{idempotencyKey:'terminal-observation-'+i,requestedSteps:['source_draft']});await f.service.tick({shouldStop:()=>false});}
 expect(command.mock.calls.some(([_,input])=>input.taskIds.includes(childId))).toBe(false);expect(f.dispatch).toHaveBeenCalledOnce();expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,childId))).toEqual(ledger);
});

it('T1382 旧父动作键迟到重放不能恢复或追加新父',async()=>{
 const f=await fixture(),input={idempotencyKey:'old-parent-intent',requestedSteps:['source_draft' as const]},old=await f.service.start(f.ctx,f.project.id,input);
 await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,old.preparationTaskId!));clock.value='2026-10-21T01:00:05.000Z';
 const latest=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'new-parent-intent',requestedSteps:['brief']});await db.update(executionTasks).set({status:'failed'}).where(eq(executionTasks.id,latest.preparationTaskId!));
 await f.service.start(f.ctx,f.project.id,input);expect((await f.tasks.get(f.ctx,latest.preparationTaskId!)).status).toBe('failed');
 expect((await f.service.get(f.ctx,f.project.id)).steps.find(s=>s.name==='source_draft')).toMatchObject({required:false,status:'not_required'});
 await expect(f.service.start(f.ctx,f.project.id,{...input,requestedSteps:['brief']})).rejects.toThrow('准备动作键对应不同步骤');
});

it.each(['tool','external_tool'] as const)('fb %s 全等brief提案成功无变化，父完成且没有采纳或正式写入',async kind=>{
 const f=await briefReceiptFixture(kind,{targetAudience:'当前观众',coreMessage:'当前信息'});
 await f.preparation.tick({shouldStop:()=>false});
 const state=await f.preparation.get(f.ctx,f.project.id);
 expect(state.steps.find(s=>s.name==='brief')).toMatchObject({status:'done',reasonCode:'BRIEF_UNCHANGED',completedAt:now(),availableActions:[],lastError:null});
 expect(state.candidates).toEqual([]);expect(state.lastError).toBeNull();expect((await f.tasks.get(f.ctx,f.parentId)).status).toBe('succeeded');
 expect(await f.projects.getProject(f.ctx,f.project.id)).toEqual(f.before);
});
it.each(['tool','external_tool'] as const)('fb %s 部分不同brief保留真实候选，用户采纳前正式值不变',async kind=>{
 const f=await briefReceiptFixture(kind,{targetAudience:'当前观众',coreMessage:'新的信息'});
 await f.preparation.tick({shouldStop:()=>false});const state=await f.preparation.get(f.ctx,f.project.id);
 expect(state.steps.find(s=>s.name==='brief')?.status).toBe('candidate_ready');expect(state.candidates).toHaveLength(1);
 expect(state.candidates[0]).toMatchObject({status:'pending',acceptanceReceipt:null,content:{kind:'brief',briefDetail:{targetAudience:'当前观众',coreMessage:'新的信息'}}});
 expect(await f.projects.getProject(f.ctx,f.project.id)).toEqual(f.before);
 const candidate=state.candidates[0]!,input={idempotencyKey:'fb-accept',candidateSourceDigest:candidate.sourceDigest,baseline:candidate.baseline!};
 const receipt=await f.preparation.acceptCandidate(f.ctx,f.project.id,candidate.id,input);
 expect((await f.projects.getProject(f.ctx,f.project.id)).briefDetail).toMatchObject({targetAudience:'当前观众',coreMessage:'新的信息',targetPlatforms:['douyin']});
 expect(await f.preparation.acceptCandidate(f.ctx,f.project.id,candidate.id,input)).toEqual(receipt);
 expect((await f.preparation.get(f.ctx,f.project.id)).candidates[0]).toMatchObject({status:'accepted',acceptanceReceipt:receipt});
});
it.each((['tool','external_tool'] as const).flatMap(kind=>[undefined,null,{},[],{targetAudience:7},{madeUp:'不存在字段'}].map(suggestion=>({kind,suggestion}))))('fb $kind 无提案或非法brief不能冒成功 $suggestion',async ({kind,suggestion})=>{
 const f=await briefReceiptFixture(kind,suggestion);await f.preparation.tick({shouldStop:()=>false});
 expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')).toMatchObject({status:'failed',lastError:{message:expect.stringContaining('未返回可采纳')}});
 expect(await f.projects.getProject(f.ctx,f.project.id)).toEqual(f.before);
});
it('fb external brief回执的父调用身份不匹配时仍拒绝',async()=>{
 const f=await briefReceiptFixture('external_tool',{coreMessage:'新建议'});
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.callId));
 await db.update(executionCalls).set({providerResult:{...call!.providerResult as object,turnCallId:'foreign-turn'}}).where(eq(executionCalls.id,f.callId));
 await f.preparation.tick({shouldStop:()=>false});expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')?.status).toBe('failed');
});
async function briefReceiptFixture(kind:'tool'|'external_tool',suggestion:unknown){
 const f=await fixture(),{createProjectPreparationChat}=await import('../../application/projects/project-preparation-chat'),{createProjectPreparationApplication}=await import('../../application/projects/project-preparation');
 await f.projects.patchProject(f.ctx,f.project.id,{briefDetail:{targetAudience:'当前观众',coreMessage:'当前信息',targetPlatforms:['douyin']}});
 const before=await f.projects.getProject(f.ctx,f.project.id),chat=createProjectPreparationChat(db,{now,nextId,assemble:async()=>{throw Error('测试禁止模型装配');}});
 const child=await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'project',ownerId:f.project.id,idempotencyKey:nextId('brief-child'),payload:{hostContext:{chatContext:{projectId:f.project.id}}}});
 const {preparation}=createProjectPreparationApplication(db,{now,nextId,tasks:f.tasks,intelligence:{} as never,submitBrief:async()=>({childTaskId:child.id,businessTaskId:child.id}),submitProjectTranscript:async()=>{throw Error('测试禁止转写');},readBrief:chat.read});
 const started=await preparation.start(f.ctx,f.project.id,{idempotencyKey:nextId('brief-start'),requestedSteps:['brief']});await preparation.tick({shouldStop:()=>false});
 const callId=nextId('brief-call'),turnId=nextId('turn');
 const outcome={status:'ok',summary:'模型给出的资料候选',evidence:[],data:{kind:'brief.fill',suggestion},error:null,continuation:null,sideEffect:'proposal'};
 if(suggestion!==undefined){
  if(kind==='external_tool')await db.insert(executionCalls).values({id:turnId,executionTaskId:child.id,sequence:1,operationKey:turnId,kind:'external_agent',inputDigest:'original-turn',status:'settled',reservedTokens:0,createdAt:now(),updatedAt:now()});
  await db.insert(executionCalls).values({id:callId,executionTaskId:child.id,sequence:2,operationKey:callId,kind,parentCallId:kind==='external_tool'?turnId:null,inputDigest:'original-brief',status:'settled',reservedTokens:0,providerResult:kind==='external_tool'?{schemaVersion:1,kind,turnCallId:turnId,toolCallId:'brief-tool',toolName:'brief.fill',toolVersion:'1'}:null,resultText:JSON.stringify(kind==='tool'?{schemaVersion:1,kind:'tool',toolCallId:'brief-tool',toolName:'brief_fill',output:outcome}:outcome),createdAt:now(),updatedAt:now()});
 }
 await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,child.id));clock.value='2026-10-21T01:00:05.000Z';
 return {...f,preparation,before,parentId:started.preparationTaskId!,callId};
}

it('fb 历史逐字稿已就绪checkpoint读为done，继续准备不重转写或编造历史完成时间',async()=>{
 const f=await fixture(),started=await f.service.start(f.ctx,f.project.id,{idempotencyKey:'legacy-transcript',requestedSteps:['transcript','brief']});
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,started.preparationTaskId!));
 const cp=parent!.checkpoint as import('./project-preparation.service').PreparationCheckpoint,transcript=cp.steps.find(s=>s.name==='transcript')!;
 transcript.status='not_required';transcript.reasonCode='TRANSCRIPT_ALREADY_AVAILABLE';
 await db.update(executionTasks).set({checkpoint:cp}).where(eq(executionTasks.id,parent!.id));
 expect((await f.service.get(f.ctx,f.project.id)).steps.find(s=>s.name==='transcript')).toMatchObject({status:'done',completedAt:null,childTaskId:null});
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,parent!.id)))[0]!.checkpoint).toEqual(cp);
 await f.service.tick({shouldStop:()=>false});expect(f.dispatch.mock.calls).toHaveLength(1);
 expect((await f.service.get(f.ctx,f.project.id)).steps.find(s=>s.name==='transcript')).toMatchObject({status:'done',completedAt:null,childTaskId:null});
});
