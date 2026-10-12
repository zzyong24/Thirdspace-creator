import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {createDb,type Db,aiTasks,aiTaskResults,executionTasks,executionCalls,eq} from '@creatoros/backend';
import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createAiService} from '../ai/ai.service';
import {createModelWorkerDispatcher} from '../execution/model-worker-dispatcher';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask} from './effective-skill-snapshot';
import {createStructuredBusinessExecutionService} from './structured-business-execution.service';
import {createKnowledgeGenerationBusinessAdapters} from './knowledge-generation-business-adapters';
import {createKnowledgeGenerationService,KnowledgeGenerationPendingError} from './knowledge-generation.service';
import {runKnowledgeClassify} from './knowledge-classify-runner';
import {runKnowledgeDistill} from './knowledge-distill-runner';
import {runKnowledgeRelate} from './knowledge-relate-runner';
import {runCommentQaSift} from './comment-qa-sift-runner';
const ctx={userId:'knowledge-integration',accountId:'knowledge-integration',requestId:'sync-public-request',source:'user' as const};
const budget={maxCalls:6,maxTokens:1_000_000,deadlineMs:180_000};
const atoms=[{id:'k1',knowledgeType:'claim',title:'真实观点',sourceNote:null},{id:'k2',knowledgeType:'evidence',title:'真实证据',sourceNote:null}];
const comments=[{signalId:'s1',rawText:'如何使用？',likeCount:5}];
const outputs={
 'knowledge.classify':{knowledgeType:'note',title:' 本地归类 ',tags:['a','a'],summary:' 摘要 '},
 'knowledge.distill':{atoms:[{type:'claim',title:'完整原文观点',note:'',sourceNote:''}],suggestedTags:['知识']},
 'knowledge.relate':{candidates:[{sourceId:'k1',targetId:'k2',relationType:'supports',reason:'实际材料支持'}]},
 'comment.qa-sift':{candidates:[{title:'如何使用？',note:'',sourceNote:'',signalIds:['s1']}]},
};
type Skill=keyof typeof outputs;
describe('T-1238 公共同步知识→原aiTask→真实Worker子进程→Pi HTTP→候选闭环',()=>{
 let db:Db,closeDb:()=>Promise<void>,sequence=0;
 beforeAll(async()=>{const created=await createDb();db=created.db;closeDb=()=>created.client.close();execFileSync(process.execPath,[resolve('../ai-worker/scripts/build.mjs')],{stdio:'pipe',timeout:180_000});},300_000);
 afterAll(async()=>closeDb?.(),300_000);
 function services(skill:Skill,port:number){
  const snapshot=createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(base=>base.skillId===id)??null,list:()=>listOfficialSkillBases(),platformPolicy:()=>({version:'1',text:'只产候选，用户采纳才创建知识'})},accountOverlays:{listBySkillIds:async()=>[]},now:()=>new Date().toISOString()});
  const createKnowledge=vi.fn(async()=>({id:'must-not-create'}));
  const ai=createAiService({db,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-knowledge-${++sequence}`,artifacts:{createVersion:async()=>({})},knowledge:{createKnowledge},candidate:{createFromAIResult:async()=>({}),enrichCard:async()=>({})},learnings:{createLearning:async()=>({})},publishing:{createPublicationFromDraft:async()=>({})},materialLinks:{link:async()=>({})},positioning:{upsertProfile:async()=>({}),createStatementVersion:async()=>({})},calibration:{createDraftPrediction:async()=>({})},resolveTaskRuntimeData:async(owner,taskType,inputData)=>({skillSnapshot:await snapshot(owner,requiredSkillIdsForTask(taskType,inputData)),executionRoute:{schemaVersion:1,engine:'pi',source:'legacy',protocolKind:'pi'}})});
  const business=createStructuredBusinessExecutionService(db,{adapters:createKnowledgeGenerationBusinessAdapters({readAtoms:async()=>atoms,readComments:async()=>comments}),budget,maxOutputTokens:2000});
  const resolveCredential=vi.fn(async()=>({apiFormat:'openai_chat' as const,baseUrl:`http://127.0.0.1:${port}/v1`,model:'pi-knowledge-fixture',token:'fixture',structuredOutputs:true}));
  const host=createModelWorkerDispatcher(db,{entryPath:resolve('../ai-worker/dist/execution-worker.cjs'),workerId:`knowledge-worker-${skill}`,budget,pollMs:100,modelConcurrency:1,resolveModelCredential:resolveCredential,projectCandidate:(_owner,input)=>business.projectCandidate(input)});
  const sync=createKnowledgeGenerationService(db,{ai,prepareTask:(owner,taskId)=>business.prepare(owner,taskId),wakeWorker:()=>host.start()});
  return {host,sync,createKnowledge,resolveCredential,ai,business};
 }
 it.each(Object.keys(outputs) as Skill[])('%s 原公共响应成立且只留唯一父任务/候选，不创建知识或第二执行',{timeout:300_000,retry:0},async skill=>{
  let requests=0;const server=createServer(async(req,res)=>{for await(const _chunk of req){}requests++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:'pi-knowledge-fixture',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(outputs[skill])},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const s=services(skill,(server.address() as {port:number}).port);
  const previous=(await db.select().from(aiTasks)).length;
  try{
   const deps={runKnowledgeGeneration:s.sync.runKnowledgeGeneration},signal=AbortSignal.timeout(180_000);
   const output=skill==='knowledge.classify'?await runKnowledgeClassify(ctx,{content:'完整原文',signal},deps):skill==='knowledge.distill'?await runKnowledgeDistill(ctx,{content:'原文段落。'.repeat(2200),signal},deps):skill==='knowledge.relate'?await runKnowledgeRelate(ctx,{atoms,signal},deps):await runCommentQaSift(ctx,{comments,signal},deps);
   const tasks=await db.select().from(aiTasks);expect(tasks).toHaveLength(previous+1);const task=tasks.at(-1)!;
   const executions=await db.select().from(executionTasks).where(eq(executionTasks.ownerId,task.id));expect(executions).toHaveLength(1);expect(executions[0]).toMatchObject({id:task.executionTaskId,status:'succeeded',ownerType:'ai_task'});
   expect(Date.parse(executions[0]!.deadlineAt!)-Date.parse(task.requestedAt)).toBe(budget.deadlineMs);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.executionTaskId!));expect(calls).toHaveLength(requests);expect(calls.every(call=>call.status==='settled')).toBe(true);
   const candidates=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id));expect(candidates).toHaveLength(1);expect(candidates[0]!.resultType).toBe('knowledge_sync_candidate');expect(candidates[0]!.resultData).toMatchObject({skillId:skill,output});
   expect((await s.ai.getTask(ctx,task.id)).status).toBe('awaiting_confirmation');expect(s.createKnowledge).not.toHaveBeenCalled();
   if(skill==='knowledge.distill'){expect(requests).toBeGreaterThan(1);expect(output).toMatchObject({atoms:[{title:'完整原文观点'}],coverage:{inputChars:11000,processedChars:11000,truncatedChars:0,chunkCount:requests}});expect(executions[0]!.executionBudget).toMatchObject({maxCalls:budget.maxCalls+requests-1,deadlineMs:budget.deadlineMs});}
   if(skill==='knowledge.classify')expect(output).toEqual({knowledgeType:'note',title:'本地归类',tags:['a'],summary:'摘要'});
   if(skill==='knowledge.relate')expect(output).toEqual(outputs[skill]);
   if(skill==='comment.qa-sift')expect(output).toMatchObject({candidates:[{signalIds:['s1'],sourceNote:'抖音评论,赞 5'}]});
  }finally{await s.host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('请求观察停止保留原ID/queued状态/绝对期限，不复制重发任务',{timeout:300_000,retry:0},async()=>{
  const s=services('knowledge.classify',1),controller=new AbortController();const previous=(await db.select().from(aiTasks)).length;
  const sync=createKnowledgeGenerationService(db,{ai:s.ai,prepareTask:async(owner,taskId)=>{const mapped=await s.business.prepare(owner,taskId);controller.abort();return mapped;},wakeWorker:vi.fn()});
  let failure:unknown;try{await sync.runKnowledgeGeneration(ctx,{skillId:'knowledge.classify',inputData:{content:'原任务原文'}},controller.signal);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(KnowledgeGenerationPendingError);const pending=failure as KnowledgeGenerationPendingError;expect(pending).toMatchObject({runtimeStatus:'queued',errorCode:null});
  expect((await db.select().from(aiTasks)).length).toBe(previous+1);const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,pending.executionTaskId));expect(execution).toMatchObject({ownerId:pending.taskId,status:'queued'});expect(s.resolveCredential).not.toHaveBeenCalled();expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,pending.executionTaskId))).toEqual([]);
  await s.host.stop();
 });
 it('Worker唤醒出错仍报告已绑定原任务真实状态，不伪造准备失败',{timeout:300_000,retry:0},async()=>{
  const s=services('knowledge.classify',1),sync=createKnowledgeGenerationService(db,{ai:s.ai,prepareTask:(owner,id)=>s.business.prepare(owner,id),wakeWorker:()=>{throw Error('worker-wake-fixture');}});
  await expect(sync.runKnowledgeGeneration(ctx,{skillId:'knowledge.classify',inputData:{content:'原任务保留'}})).rejects.toMatchObject({name:'KnowledgeGenerationPendingError',runtimeStatus:'queued',executionTaskId:expect.stringMatching(/^exec_/),errorCode:null});
  expect(s.resolveCredential).not.toHaveBeenCalled();await s.host.stop();
 });

});
