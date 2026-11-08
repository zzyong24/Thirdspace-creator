import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {beforeAll,it,expect,vi} from 'vitest';
import {createDb,intelligenceItems,intelligenceSources,intelligenceSyncRuns,sourceSnapshots,itemTranscripts,projectSourceReferences,executionTasks,executionCalls,eq} from '@creatoros/backend';
import {getOfficialSkillBase,listOfficialSkillBases} from '@creatoros/ai-worker';
import {createAccountGroupService} from '../platform-account';
import {createProjectsService,createProjectRepository} from '../projects';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createProjectPreparationApplication} from '../../application/projects/project-preparation';
import {createEffectiveSkillSnapshotResolver} from '../ai-runtime/effective-skill-snapshot';
import {createIntelligenceService} from './intelligence.service';
import {createIntelligenceGenerationBridge} from './intelligence-generation-bridge';
import {runIntelligenceTopicPreviewTask} from './topic-preview-runner';

const trace=vi.hoisted(()=>[] as unknown[]);
const fault=vi.hoisted(()=>({rejectReservation:false}));
vi.mock('../execution/worker-supervisor',async original=>{
 const actual=await original<typeof import('../execution/worker-supervisor')>();
 return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>actual.createWorkerSupervisor({...options,ports:{...options.ports,invoke:async(ref,port,input)=>{try{if(fault.rejectReservation&&port==='reserveGenerationCall')throw Error('fixture-reservation-conflict');const result=await options.ports.invoke(ref,port,input);trace.push({port,input:port==='commitResult'?input:undefined});return result;}catch(error){trace.push({port,error:String(error)});throw error;}}}})};
});
beforeAll(async()=>{await promisify(execFile)(process.execPath,[resolve('../ai-worker/scripts/build.mjs')],{timeout:180000,maxBuffer:4*1024*1024});},240000);
const decomposition={hook:'先给桌面留一点记录空间',structureSteps:['确认桌面上的物品','按顺序留出空白'],coreClaims:['一次只移动一件物品'],reusablePattern:'观察已有物品，再说明顺序',factRisks:['不得补造效果数字']};
const topic={title:'先留一个记录想法的位置',angle:'从杯子和笔记本说明整理顺序',differentiation:'用桌面动作说明准备',sourceSummary:'描述桌面空白',targetAudience:'希望记录想法的人',audiencePain:'不知道从哪一步开始',coreConflict:'物品与记录空间的取舍',format:'口播',contentRole:null,contentRoleReason:'没有业务目标',adaptationStrategy:{keep:['按顺序操作'],replace:['重新组织表达'],add:['先观察再移动'],avoid:['效果数字']}};
const draft='先看看桌面上现有的东西：一只杯子，一本合上的笔记本。把杯子放稳，再把笔记本移到一旁，留出写下一句想法的位置。';
it.each(['normal','legacy-empty-unknown','reservation-rejected'] as const)('T1445 %s：纯账号组已转写来源→真实Worker→父流程终态',async mode=>{
 trace.length=0;fault.rejectReservation=mode==='reservation-rejected';
 const opened=await createDb(),db=opened.db;let seq=0;const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-t1445-${++seq}`,deps={now,nextId};
 const base={userId:'t1445-isolated',requestId:'integration',source:'user' as const},group=await createAccountGroupService({db,...deps}).create(base,{name:'隔离改写',idempotencyKey:'group'}),ctx={...base,groupId:group.id,groupVersion:group.version,accountId:null};
 const tasks=createPersistentTaskService(db,deps),intelligence=createIntelligenceService(db,{...deps,tasks});
 const projects=createProjectsService(createProjectRepository(db),deps),project=await projects.createProject(ctx,{title:'来源升级项目',brief:'原资料'}),stamp=now();
 const owner={userId:ctx.userId,groupId:ctx.groupId,accountId:null},itemId=nextId('item'),snapshotId=nextId('snapshot');
 await db.insert(intelligenceSources).values({...owner,id:'t1445-source',type:'rss',platform:'web',displayName:'隔离来源',externalKey:'t1445',adapterConfig:{type:'rss',url:'https://example.com/t1445.xml'},createdAt:stamp,updatedAt:stamp});
 await db.insert(intelligenceSyncRuns).values({...owner,id:'t1445-sync',sourceId:'t1445-source',executionTaskId:'t1445-source-task',trigger:'manual',status:'succeeded',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
 await db.insert(intelligenceItems).values({...owner,id:itemId,type:'article',platform:'example.com',canonicalUrl:'https://example.com/t1445',canonicalUrlHash:'t1445-item',title:'桌面整理',capturedAt:stamp,createdAt:stamp,updatedAt:stamp});
 await db.insert(sourceSnapshots).values({...owner,id:snapshotId,itemId,sourceId:'t1445-source',runId:'t1445-sync',capturedAt:stamp,finalUrl:'https://example.com/t1445',title:'桌面整理',contentHash:'source-hash'});
 await intelligence.uploadManualTranscript(ctx,{itemId,inputMode:'paste',text:'桌上有一只杯子和一本合上的笔记本，先留出一点空白，再写下想法。'});
 const source=await intelligence.getProjectIntakeSource(ctx,itemId,snapshotId);
 await db.insert(projectSourceReferences).values({id:nextId('reference'),projectId:project.id,sourceKind:'intelligence_item',sourceKey:itemId,itemId,snapshotId,sourceDigest:source.sourceDigest,createdAt:stamp,updatedAt:stamp});
 const forbidden=async():Promise<never>=>{throw Error('不应执行其它准备能力');};
 const app=createProjectPreparationApplication(db,{...deps,tasks,intelligence,submitProjectTranscript:forbidden,submitBrief:forbidden,readBrief:forbidden});
 const requests:Array<{maxTokens:number;responseFormat:unknown}>=[];
 const server=createServer((req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
  const body=JSON.parse(raw),sequence=requests.length;requests.push({maxTokens:body.max_tokens??body.max_completion_tokens,responseFormat:body.response_format});
  const content=sequence===0?JSON.stringify(decomposition):sequence===1?JSON.stringify(topic):draft;
  res.writeHead(200,{'content-type':'text/event-stream'});const common={id:`fixture-${sequence}`,object:'chat.completion.chunk',created:1,model:'isolated'};
  res.end(`data: ${JSON.stringify({...common,choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]})}\n\ndata: ${JSON.stringify({...common,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:24,total_tokens:36}})}\n\ndata: [DONE]\n\n`);
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const resolver=createEffectiveSkillSnapshotResolver({officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'test',text:'只产候选'})},accountOverlays:{listBySkillIds:async()=>[]},now});
 const bridge=createIntelligenceGenerationBridge(db,{...deps,tasks,entryPath:resolve('../ai-worker/dist/intelligence-generation-worker.cjs'),resolveSkillSnapshot:resolver,resolveModelSpec:async()=>({apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'isolated',token:'fixture',displayModelKey:'channel-managed'})});
 try{
  const start=await app.preparation.start(ctx,project.id,{idempotencyKey:'start',requestedSteps:['transcript','source_draft']});
  await app.preparation.tick({shouldStop:()=>false});
  const queued=await app.preparation.get(ctx,project.id),step=queued.steps.find(s=>s.name==='source_draft')!;
  expect(queued.steps.find(s=>s.name==='transcript')?.status).toBe('done');expect(step.childTaskId).toBeTruthy();
  if(mode==='legacy-empty-unknown'){
   await db.update(executionTasks).set({status:'unknown_result',lastErrorCode:'MODEL_RESULT_UNKNOWN',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.id,step.childTaskId!));
   await new Promise(r=>setTimeout(r,2100));await app.preparation.tick({shouldStop:()=>false});
   expect(await tasks.get(ctx,step.childTaskId!)).toMatchObject({status:'queued'});
  }
  await runIntelligenceTopicPreviewTask(ctx,{taskId:step.childTaskId!},{tasks,intelligence,generator:bridge.topicPreviewGenerator});
  const task=await tasks.get(ctx,step.childTaskId!);
  if(mode==='reservation-rejected'){
   expect(task).toMatchObject({status:'failed',errorCode:'MODEL_RESERVATION_REJECTED'});expect(requests).toHaveLength(0);
   await new Promise(r=>setTimeout(r,2100));await app.preparation.tick({shouldStop:()=>false});
   const stopped=await app.preparation.get(ctx,project.id);
   expect(stopped.steps.find(s=>s.name==='source_draft')).toMatchObject({status:'failed',childTaskId:step.childTaskId});
   expect(stopped.steps.find(s=>s.name==='transcript')?.status).toBe('done');
   expect(stopped.candidates).toHaveLength(0);return;
  }
  expect(task,JSON.stringify({task,requests,trace,calls:await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id))})).toMatchObject({status:'succeeded'});
  await new Promise(r=>setTimeout(r,2100));await app.preparation.tick({shouldStop:()=>false});
  const completed=await app.preparation.get(ctx,project.id);
  expect(completed.preparationTaskId).toBe(start.preparationTaskId);
  expect(completed.steps.find(s=>s.name==='source_draft')).toMatchObject({status:'candidate_ready',childTaskId:step.childTaskId});
  expect(completed.candidates[0]?.content).toEqual({kind:'draft',text:draft});expect(requests).toHaveLength(3);
  const candidate=completed.candidates[0]!;
  const acceptance={idempotencyKey:'adopt',candidateSourceDigest:candidate.sourceDigest,baseline:candidate.baseline!};
  const receipt=await app.preparation.acceptCandidate(ctx,project.id,candidate.id,acceptance);
  expect(await app.preparation.acceptCandidate(ctx,project.id,candidate.id,acceptance)).toEqual(receipt);
  const adopted=await app.preparation.get(ctx,project.id);
  expect(adopted.steps.find(s=>s.name==='source_draft')?.status).toBe('done');expect(requests).toHaveLength(3);

  expect((await projects.getProject(ctx,project.id)).brief).toBe('原资料');
  expect((await db.select().from(itemTranscripts).where(eq(itemTranscripts.itemId,itemId)))[0]?.status).toBe('done');
 }finally{await bridge.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await opened.client.close();}
},240000);
