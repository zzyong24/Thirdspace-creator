import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createRuntimeDb,type Db} from '@creatoros/backend';
import {createGroupMigrationService} from '../modules/platform-account/group-migration.service';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {createAiService} from '../modules/ai/ai.service';
import {createStructuredBusinessExecutionService} from '../modules/ai-runtime/structured-business-execution.service';
import {createReconstructBusinessAdapter} from '../modules/ai-runtime/reconstruct-business-adapter';
import {createExecutionGenerationPorts} from '../modules/execution/execution-generation-ports.service';
import {createExecutionWorkerCallPorts} from '../modules/execution/execution-worker-call-ports.service';
import {createArtifactsService} from '../modules/artifacts';
import {createAccountGroupService} from '../modules/platform-account/account-group.service';
import {structuredGenerationInputSchema,workerStructuredResultSchema} from '@creatoros/contract/execution-worker';
import {reconstructProjectSchema} from '@creatoros/ai-worker';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createReconstructCompletionService} from '../modules/ai/reconstruct-completion.service';
import {it,expect,describe} from 'vitest';
import {createDb,projects,contentOutputs,creativeResults,aiTasks,aiTaskResults,artifacts,platformAccounts,executionTasks,executionCalls,eq,sql} from '@creatoros/backend';
import {ENDPOINTS,successEnvelope,type RequestContext} from '@creatoros/contract';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createCreativeResultsService,type CreativeResultAdapter} from '../modules/creative-results/creative-results.service';
import {createCreativeResultsTransport} from '../modules/creative-results/creative-results.transport';
import {accountGroups,accountGroupMemberships} from '../schema/account-groups';
const now='2026-10-05T00:00:00.000Z';
it('空组公开创作结果共享，平台筛选不改owner；跨组/归档新写拒绝并保原回执',async()=>{
 const opened=await createDb(),db=opened.db;try{
 const a:RequestContext={userId:'creative-group-user',groupId:'creative-group-a',accountId:null,source:'user',requestId:'fixture'},b={...a,groupId:'creative-group-b'};
 await db.insert(accountGroups).values(['creative-group-a','creative-group-b'].map(id=>({id,userId:a.userId,name:id,status:'active',createdAt:now,updatedAt:now})));
 await db.insert(projects).values({id:'creative-real-project',userId:a.userId,groupId:a.groupId,accountId:null,title:'真实父',creationMode:'script',status:'active',currentStage:'planning',startedAt:now,createdAt:now,updatedAt:now});
 await db.insert(contentOutputs).values({id:'creative-real-output',groupId:a.groupId,projectId:'creative-real-project',contentType:'image',status:'draft',title:'图文',targetPlatform:'xiaohongshu',createdAt:now,updatedAt:now});
 const repo=createProjectRepository(db);let calls=0,ids=0;
 const adapter:CreativeResultAdapter={owner:'graphic_post',probe:async()=>({state:'supported',reasonCode:null,lastVerifiedAt:now}),enqueue:async()=>{calls++;return{candidateId:'original-candidate',taskId:'original-task',baseVersionId:'original-version',ruleSnapshotRef:null,appliedRules:'not_applied',sourceRefs:[],status:'succeeded'};},read:async()=>({status:'succeeded',value:'模型候选fixture',errorCode:null}),adopt:async()=>({versionId:'adopted-version'})};
 const service=createCreativeResultsService(db,{projects:{getProject:repo.get,getOutput:repo.getOutput},adapters:{graphic_post:adapter},nextId:()=>`creative-result-${++ids}`}),transport=createCreativeResultsTransport(()=>service);
 const input={outputId:'creative-real-output',kind:'title' as const,clientRequestId:'pure-group-title-request'};
 const result=successEnvelope(ENDPOINTS.generateResult.response).parse(await transport.request(ENDPOINTS.generateResult,{params:{outputId:input.outputId},query:undefined,body:{kind:input.kind,clientRequestId:input.clientRequestId}},a)).data;
 expect((await db.select().from(creativeResults))[0]).toMatchObject({accountId:null,groupId:a.groupId});
 expect(await service.generate({...a,accountId:'platform-filter'},input)).toMatchObject({resultId:result.resultId});expect(calls).toBe(1);
 expect(await service.get(a,result.resultId)).toMatchObject({value:'模型候选fixture'});
 await expect(service.get(b,result.resultId)).rejects.toThrow();
 const adoptInput={resultId:result.resultId,expected:{owner:'graphic_post',versionId:'original-version'},editedValue:'人工明确采用',clientRequestId:'creative-history-adopt-key'},adopted=await service.adopt(a,adoptInput);
 const before=await db.select().from(creativeResults);await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,a.groupId!));
 expect(await service.get(a,result.resultId)).toMatchObject({resultId:result.resultId});
 expect(await service.adopt(a,adoptInput)).toEqual(adopted);
 await expect(service.adopt(a,{...adoptInput,clientRequestId:'archived-different-adopt-key'})).rejects.toThrow();
 await expect(service.generate(a,{...input,clientRequestId:'archived-new-title-request'})).rejects.toThrow();
 expect(await db.select().from(creativeResults)).toEqual(before);expect(calls).toBe(1);
 }finally{await opened.client.close();}
},20000);


let reconstructSeq=0;
async function reconstructionFixture(account:boolean,parentAccount:boolean,knownUsage=true,store?:{db:Db;client:{close:()=>Promise<void>}},beforeGeneration?:(ctx:RequestContext,projectId:string)=>Promise<void>,legacy=false){
 const opened=store??await createDb(),db=opened.db,id=`reconstruction-${++reconstructSeq}`,stamp=()=>new Date().toISOString(),nextId=(prefix:string)=>`${id}-${prefix}-${++reconstructSeq}`;
 const c:RequestContext={userId:id,accountId:account?`${id}-account`:null,...(legacy?{}:{groupId:`${id}-group`,groupVersion:1,...(account?{membershipVersion:1}:{})}),requestId:id,source:'user'};
 const rootGroupId=c.groupId??`grp_legacy_${c.accountId}`;
 await db.insert(accountGroups).values({id:rootGroupId,userId:c.userId,name:'原重建组',status:'active',version:1,createdAt:stamp(),updatedAt:stamp()});
 if(account||parentAccount){await db.insert(platformAccounts).values({id:`${id}-account`,userId:c.userId,platform:'douyin',accountHandle:'@isolated-reconstruct',status:'active',createdAt:stamp(),updatedAt:stamp()});await db.insert(accountGroupMemberships).values({id:`${id}-member`,userId:c.userId,groupId:rootGroupId,accountId:`${id}-account`,version:1,joinedAt:stamp()});}
 const projectId=`${id}-project`;let businessId=`${id}-business`;
 await db.insert(projects).values({id:projectId,userId:c.userId,accountId:parentAccount?`${id}-account`:null,groupId:c.groupId,title:'原导入作品',source:'imported',creationMode:'free',status:'active',currentStage:'analysis',startedAt:stamp(),createdAt:stamp(),updatedAt:stamp()});
 const repo=createProjectRepository(db),artifactService=createArtifactsService({db,now:stamp,nextId,assertProjectOwned:(ctx,p)=>repo.get(ctx,p)}),transcript=await artifactService.createArtifact(c,{projectId,title:'真实原逐字稿',artifactType:'output_script',stage:'analysis',initialContentText:'原作品主题与真实正文'});
 await beforeGeneration?.(c,projectId);
 const skillSnapshot=structuredGenerationInputSchema.shape.skillSnapshot.parse({snapshotVersion:1,userId:c.userId,accountId:c.accountId,groupId:c.groupId??null,groupVersion:legacy?null:1,membershipVersion:account&&!legacy?1:null,resolvedAt:stamp(),platformPolicyVersion:'fixture',platformPolicy:'fixture',skills:[{skillId:'reconstruct.project',baseVersion:'fixture',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'fixture神经推理替身',template:'fixture',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]});
 // 原group=NULL兼容fixture保留持久旧行；现代任务必须从公开AiService.createTask创建并冻结。
 if(legacy){await db.insert(aiTasks).values({id:businessId,userId:c.userId,accountId:c.accountId,groupId:c.groupId??null,groupVersion:legacy?null:1,membershipVersion:account&&!legacy?1:null,projectId,taskType:'reconstruct.project',status:'queued',idempotencyKey:businessId,inputData:{projectId},runtimeData:{skillSnapshot},requestFingerprint:'sha256:'+createHash('sha256').update(JSON.stringify({projectId,skillSnapshot})).digest('hex'),requestedAt:stamp()});}else{
  const unused=async():Promise<never>=>{throw Error('非本用例领域端口不得被调用');};
  const ai=createAiService({db,now:stamp,nextId,resolveTaskRuntimeData:async(owner,type,input)=>{expect(owner.userId).toBe(c.userId);expect(type).toBe('reconstruct.project');expect(input).toEqual({projectId});return{skillSnapshot};},artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
  const task=await ai.createTask(c,{taskType:'reconstruct.project',attemptId:`${id}-public-attempt`,inputData:{projectId}});businessId=task.id;
  const [persisted]=await db.select().from(aiTasks).where(eq(aiTasks.id,businessId));expect(persisted).toMatchObject({groupId:c.groupId,accountId:c.accountId,groupVersion:1,membershipVersion:account?1:null});
  expect(await ai.createTask(c,{taskType:'reconstruct.project',attemptId:`${id}-public-attempt`,inputData:{projectId}})).toEqual(task);
 }

 const budget={maxCalls:3,maxTokens:100000,deadlineMs:600000},adapter=createReconstructBusinessAdapter({positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},getProjectSource:async(ctx,p)=>(await repo.get(ctx,p)).source??null,getTranscript:async(ctx,p)=>{const list=await artifactService.listProjectArtifacts(ctx,p),found=list.find(a=>a.id===transcript.id);if(!found?.currentVersionId)return null;return(await artifactService.listVersions(ctx,found.id)).find(v=>v.id===found.currentVersionId)?.contentText??null;},getMetricsSummary:async()=>''});
 const prepared=await createStructuredBusinessExecutionService(db,{adapters:{'reconstruct.project':adapter},budget,maxOutputTokens:128}).prepare(c,businessId),tasks=createPersistentTaskService(db),claim=await tasks.claimTask({taskId:prepared.executionTaskId,workerId:'isolated-reconstruct',leaseSeconds:120});if(!claim)throw Error('原lease未实际领取');
 const ref={executionTaskId:prepared.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},generation=createExecutionGenerationPorts(db,{budget}),worker=createExecutionWorkerCallPorts(db,{budget}),ledger=createExecutionCallLedgerService(db,{budget});
 const request={operationKey:'reconstruct.project/model/1',request:{maxOutputTokens:128,prompt:[{role:'user',content:[{type:'text',text:'原作品主题与真实正文'}]}]}};
 const call=await generation.reserveGenerationCall(ref,request);await worker.startCall(ref,{callId:call.callId});
 const pkg=reconstructProjectSchema.parse({research:{coreTopic:'原神经推理回执主题'}}),providerText=JSON.stringify(pkg),text=JSON.stringify(workerStructuredResultSchema.parse({object:pkg,generation:{finishReason:'stop',usage:{inputTokens:knownUsage?10:null,outputTokens:knownUsage?5:null,cachedTokens:knownUsage?0:null,totalTokens:knownUsage?15:null},attempts:[{finishReason:'stop',usage:{inputTokens:knownUsage?10:null,outputTokens:knownUsage?5:null,cachedTokens:knownUsage?0:null,totalTokens:knownUsage?15:null},kind:'initial'}]}}));
 await generation.settleGenerationCall(ref,{callId:call.callId,status:'settled',usage:knownUsage?{totalTokens:15}:{},providerResult:{content:[{type:'text',text:providerText}],finishReason:{unified:'stop',raw:'stop'},usage:knownUsage?{inputTokens:{total:10,noCache:10},outputTokens:{total:5,text:5}}:{inputTokens:{},outputTokens:{}},warnings:[]}});await generation.saveGenerationResult(ref,{callId:call.callId,text});
 const before=await ledger.inspect(ref);expect(before.calls[0]).toMatchObject({status:'settled',resultRef:null,operationKey:request.operationKey,inputDigest:'sha256:'+createHash('sha256').update(JSON.stringify(request.request)).digest('hex')});expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,businessId))).toEqual([]);
 return{opened,db,c,rootGroupId,projectId,businessId,ref,ledger,call,input:{outcome:'succeeded' as const,callId:call.callId,text},artifactService,groups:createAccountGroupService({db,now:stamp,nextId}),completion:createReconstructCompletionService(db),before,tasks,generation,worker,request};
}
describe('T1062 完整generation协议重建结算',()=>{
 it.each([[true,true],[false,true],[false,false]])('原account=%s/父originaccount=%s已settled且无结果，组归档后一次结算与精确回放',async(account,parentAccount)=>{
  const f=await reconstructionFixture(account,parentAccount);try{
   await f.groups.archive(f.c,f.c.groupId!,1);
   const result=await f.completion.commitResult(f.ref,f.input);expect(await f.completion.commitResult(f.ref,f.input)).toEqual(result);
   expect(await f.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.businessId))).toHaveLength(1);const rows=await f.artifactService.listProjectArtifacts(f.c,f.projectId),reconstructed=rows.filter(a=>a.artifactType==='trend_analysis');expect(reconstructed).toHaveLength(1);expect(await f.artifactService.listVersions(f.c,reconstructed[0]!.id)).toHaveLength(2);expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
  }finally{await f.opened.client.close();}
 },30000);
});

async function expectNoReconstruction(f:Awaited<ReturnType<typeof reconstructionFixture>>){expect(await f.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.businessId))).toEqual([]);expect((await f.artifactService.listProjectArtifacts(f.c,f.projectId)).filter(a=>a.artifactType==='trend_analysis')).toEqual([]);}
it('T1062 原tokens账本已settled但usage未知仍收口，不偷换accountingBasis或放开新paid调用',async()=>{
 const f=await reconstructionFixture(false,true,false);try{
  expect(f.before.spentTokens).toBeNull();expect(f.before.calls[0]?.accountingBasis).toBe('tokens');
  await expect(f.generation.reserveGenerationCall(f.ref,{...f.request,operationKey:'reconstruct.project/model/2'})).rejects.toThrow();
  await f.groups.archive(f.c,f.c.groupId!,1);const result=await f.completion.commitResult(f.ref,f.input);expect(await f.completion.commitResult(f.ref,f.input)).toEqual(result);expect((await f.ledger.inspect(f.ref)).spentTokens).toBeNull();expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);expect((await f.ledger.inspect(f.ref)).calls[0]?.accountingBasis).toBe('tokens');
 }finally{await f.opened.client.close();}
},30000);
it.each(['cancel','lease-expired','deadline-expired','foreign-ref','mutated-input','moved-parent','foreign-parent','non-imported','member-moved','unknown-call','missing-provider'] as const)('T1062 原重建结算拒绝%s，零新结果并保留原paid ledger',async family=>{
 const f=await reconstructionFixture(true,true);try{
  let completion=f.completion,ref=f.ref;
  if(family==='cancel')await f.tasks.command(f.c,{taskIds:[f.ref.executionTaskId],command:'cancel',idempotencyKey:'cancel-original-reconstruction'});
  if(family==='lease-expired')completion=createReconstructCompletionService(f.db,{now:()=>new Date(Date.now()+121000).toISOString()});
  if(family==='deadline-expired')completion=createReconstructCompletionService(f.db,{now:()=>new Date(Date.now()+601000).toISOString()});
  if(family==='foreign-ref')ref={...f.ref,fenceToken:'foreign-fence'};
  if(family==='mutated-input'){const [task]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));const payload=z.record(z.string(),z.unknown()).parse(task?.payload),modelInput=structuredGenerationInputSchema.parse(payload.modelInput);await f.db.update(executionTasks).set({payload:{...payload,modelInput:{...modelInput,skillSnapshot:{...modelInput.skillSnapshot,groupVersion:999}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));}
  if(family==='moved-parent')await f.db.update(projects).set({groupId:'foreign-group'}).where(eq(projects.id,f.projectId));
  if(family==='foreign-parent')await f.db.update(projects).set({userId:'foreign-user'}).where(eq(projects.id,f.projectId));
  if(family==='non-imported')await f.db.update(projects).set({source:'manual'}).where(eq(projects.id,f.projectId));
  if(family==='member-moved')await f.db.update(accountGroupMemberships).set({groupId:'foreign-group',version:2}).where(eq(accountGroupMemberships.accountId,f.c.accountId!));
  if(family==='unknown-call'){const another=await f.generation.reserveGenerationCall(f.ref,{...f.request,operationKey:'reconstruct.project/model/2'});await f.worker.startCall(f.ref,{callId:another.callId});await f.generation.settleGenerationCall(f.ref,{callId:another.callId,status:'unknown'});}
  if(family==='missing-provider')await f.db.update(executionCalls).set({providerResult:null}).where(eq(executionCalls.id,f.call.callId));
  await f.groups.archive(f.c,f.c.groupId!,1);const before=await f.ledger.inspect(f.ref);await expect(completion.commitResult(ref,f.input)).rejects.toThrow();
  expect(await f.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.businessId))).toEqual([]);expect((await f.db.select().from(artifacts).where(eq(artifacts.projectId,f.projectId))).filter(a=>a.artifactType==='trend_analysis')).toEqual([]);expect(await f.ledger.inspect(f.ref)).toEqual(before);
 }finally{await f.opened.client.close();}
},30000);
it('T1062 原已settled物化失败同tx回滚，重试只用原ledger；普通用户AI/type标记不能写归档组',async()=>{
 const f=await reconstructionFixture(false,false);try{
  await f.groups.archive(f.c,f.c.groupId!,1);const before=await f.ledger.inspect(f.ref);
  await f.db.execute(sql`CREATE FUNCTION t1062_fail_reconstruct_result() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''isolated reconstruction result failure''; END';`);await f.db.execute(sql`CREATE TRIGGER t1062_fail_reconstruct_result BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION t1062_fail_reconstruct_result()`);
  try{await expect(f.completion.commitResult(f.ref,f.input)).rejects.toThrow('isolated reconstruction result failure');}finally{await f.db.execute(sql`DROP TRIGGER t1062_fail_reconstruct_result ON ai_task_results`);await f.db.execute(sql`DROP FUNCTION t1062_fail_reconstruct_result()`);}
  await expectNoReconstruction(f);expect(await f.ledger.inspect(f.ref)).toEqual(before);
  await expect(f.artifactService.createArtifact({...f.c,source:'ai'},{projectId:f.projectId,title:'假豁免',artifactType:'trend_analysis',stage:'research',origin:'reconstructed'})).rejects.toThrow();
  const result=await f.completion.commitResult(f.ref,f.input);expect(await f.completion.commitResult(f.ref,f.input)).toEqual(result);const rebuilt=(await f.artifactService.listProjectArtifacts(f.c,f.projectId)).find(a=>a.artifactType==='trend_analysis')!;
  await expect(f.artifactService.createVersion({...f.c,source:'ai'},rebuilt.id,{contentText:'用户伪造',createdByType:'ai',origin:'reconstructed'})).rejects.toThrow();expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
 }finally{await f.opened.client.close();}
},30000);

const reconstructPgUrl=process.env.CREATOROS_TEST_POSTGRES_URL;
it.skipIf(!reconstructPgUrl).each(['archive-first','completion-first','migration-first','completion-first-migration'] as const)('T1062真实PG重建根/父/任务锁顺序 %s',async order=>{
 const url=new URL(reconstructPgUrl!);if(url.hostname!=='127.0.0.1'||url.port!=='55422')throw Error('仅隔离PG服务');const name='t1062_reconstruct_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE DATABASE ${name}`);url.pathname='/'+name;const runtime=await createRuntimeDb({connectionString:url.toString()}),blocker=await runtime.pool.connect();let held=false;
 try{
  let move:()=>Promise<unknown>=async()=>{throw Error('无原预览');},freshMove:()=>Promise<unknown>=async()=>{throw Error('无新预览');};let toGroup='';
  const f=await reconstructionFixture(false,true,true,{db:runtime.db,client:{close:async()=>{}}},order.includes('migration')?async(c,projectId)=>{
   let seq=0;const stamp=()=>new Date().toISOString(),groups=createAccountGroupService({db:runtime.db,now:stamp,nextId:p=>`${p}-${randomUUID()}`}),target=await groups.create(c,{name:'显式迁移目标',idempotencyKey:'reconstruction-destination'});toGroup=target.id;
   const service=createGroupMigrationService({db:runtime.db,now:stamp,nextId:p=>`${p}-${randomUUID()}`}),selection={fromGroupId:c.groupId!,toGroupId:target.id,projectIds:[projectId],knowledgeIds:[],conversationIds:[]},preview=await service.preview(c,selection);
   move=()=>service.apply(c,{...selection,digest:preview.digest,idempotencyKey:'original-preview-move'});freshMove=async()=>{const current=await service.preview(c,selection);return service.apply(c,{...selection,digest:current.digest,idempotencyKey:'fresh-completed-move-'+(++seq)});};
  }:undefined);
  const wait=async(count:number)=>{for(let i=0;i<400;i++){const rows=await runtime.pool.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type=$2',[name,'Lock']);if(rows.rows[0].n>=count)return;await new Promise(r=>setTimeout(r,10));}throw Error('未观察到真实PG锁等待');};
  await blocker.query('BEGIN');held=true;
  if(order==='archive-first'||order==='migration-first')await blocker.query('SELECT id FROM account_groups WHERE id=$1 FOR UPDATE',[f.c.groupId]);else await blocker.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[f.projectId]);
  if(order==='archive-first'){
   const archive=f.groups.archive(f.c,f.c.groupId!,1);await wait(1);const complete=f.completion.commitResult(f.ref,f.input);await wait(2);await blocker.query('COMMIT');held=false;await archive;expect(await complete).toMatchObject({aiTaskId:f.businessId});
  }else if(order==='completion-first'){
   const complete=f.completion.commitResult(f.ref,f.input);await wait(1);const archive=f.groups.archive(f.c,f.c.groupId!,1);await wait(2);await blocker.query('COMMIT');held=false;expect(await complete).toMatchObject({aiTaskId:f.businessId});await archive;
  }else if(order==='migration-first'){
   const moved=expect(move()).rejects.toThrow('在途');await wait(1);const complete=f.completion.commitResult(f.ref,f.input);await wait(2);await blocker.query('COMMIT');held=false;await moved;expect(await complete).toMatchObject({aiTaskId:f.businessId});
  }else{
   const complete=f.completion.commitResult(f.ref,f.input);await wait(1);const moved=expect(move()).rejects.toThrow(/变化|预览/);await wait(2);await blocker.query('COMMIT');held=false;expect(await complete).toMatchObject({aiTaskId:f.businessId});await moved;await freshMove();expect((await runtime.db.select().from(projects).where(eq(projects.id,f.projectId)))[0]?.groupId).toBe(toGroup);
  }
  const results=await runtime.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.businessId));expect(results).toHaveLength(1);expect(await f.completion.commitResult(f.ref,f.input)).toMatchObject({resultId:results[0]!.id});expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);expect((await runtime.db.select().from(aiTasks).where(eq(aiTasks.id,f.businessId)))[0]).toMatchObject({groupId:f.c.groupId,accountId:null,groupVersion:1,membershipVersion:null});
 }finally{if(held)await blocker.query('ROLLBACK');blocker.release();await runtime.pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}
},30000);

it('T1062 真实legacy groupNULL原generation paid后member转新组，旧freeze不重签且不能新增物化',async()=>{
 const f=await reconstructionFixture(true,true,true,undefined,undefined,true);try{
  const [original]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(original).toMatchObject({groupId:null,groupVersion:null,membershipVersion:null,accountId:f.c.accountId});
  await f.db.insert(accountGroups).values({id:'legacy-new-owner-group',userId:f.c.userId,name:'现新组',status:'active',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await f.db.update(accountGroupMemberships).set({groupId:'legacy-new-owner-group',version:2}).where(eq(accountGroupMemberships.accountId,f.c.accountId!));
  await expect(f.completion.commitResult(f.ref,f.input)).rejects.toThrow();await expectNoReconstruction(f);expect(await f.ledger.inspect(f.ref)).toEqual(f.before);expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]).toEqual(original);
 }finally{await f.opened.client.close();}
},30000);

// 原持久旧谱系兼容fixture；不声称当前group public create会产生group=NULL。
it.each([false,true])('T1062 legacy groupNULL原generation 合法active/archived=%s可收口且freeze仍NULL',async archived=>{
 const f=await reconstructionFixture(true,true,true,undefined,undefined,true);try{
  if(archived)await f.groups.archive(f.c,f.rootGroupId,1);const result=await f.completion.commitResult(f.ref,f.input);expect(await f.completion.commitResult(f.ref,f.input)).toEqual(result);expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);
  expect((await f.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]).toMatchObject({groupId:null,groupVersion:null,membershipVersion:null,accountId:f.c.accountId});
  expect((await f.artifactService.listProjectArtifacts(f.c,f.projectId)).filter(a=>a.artifactType==='trend_analysis')).toHaveLength(1);
 }finally{await f.opened.client.close();}
},30000);
it('T1062 legacy尚无group/member的原独立account持久任务保持合法，无group且无account损坏仍拒',async()=>{
 const f=await reconstructionFixture(true,true,true,undefined,undefined,true);try{
  await f.db.delete(accountGroupMemberships).where(eq(accountGroupMemberships.accountId,f.c.accountId!));await f.db.delete(accountGroups).where(eq(accountGroups.id,f.rootGroupId));const result=await f.completion.commitResult(f.ref,f.input);expect(await f.completion.commitResult(f.ref,f.input)).toEqual(result);expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(15);
 }finally{await f.opened.client.close();}
 const broken=await reconstructionFixture(false,false);try{
  await broken.db.update(executionTasks).set({groupId:null}).where(eq(executionTasks.id,broken.ref.executionTaskId));await expect(broken.completion.commitResult(broken.ref,broken.input)).rejects.toThrow();await expectNoReconstruction(broken);expect((await broken.ledger.inspect(broken.ref)).spentTokens).toBe(15);
 }finally{await broken.opened.client.close();}
},30000);
