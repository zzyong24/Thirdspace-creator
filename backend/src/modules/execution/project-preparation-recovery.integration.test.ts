import {createExecutionWorkerOutcomeService} from './execution-worker-outcome.service';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {inspect} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {createDb,executionTasks,executionCalls,eq,type Db} from '@creatoros/backend';
import {projectPreparationGenerationTargetSchema,codexExecutionSpec,createExecutionRoute,structuredGenerationInputSchema,intelligenceRewriteInputSchema} from '@creatoros/contract/execution-worker';
import {generateIntelligenceInWorker} from '../../../../ai-worker/src/execution/intelligence-generation-worker';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionWorkerCallPorts} from './execution-worker-call-ports.service';
import {createIntelligenceGenerationBridge} from '../intelligence/intelligence-generation-bridge';
import {createProjectsService} from '../projects/projects.service';
import {createProjectRepository} from '../projects';
import {createArtifactsService} from '../artifacts/artifacts.service';
let db:Db,close:()=>Promise<void>,temporary:string,entry:string,auditPath:string,sequence=0;
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-p2b-recovery-${++sequence}`;
const budget={maxCalls:16,maxTokens:1000000,deadlineMs:1800000};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
beforeAll(async()=>{
 const opened=await createDb();db=opened.db;close=()=>opened.client.close();
 const require=createRequire(resolve('../ai-worker/package.json')),build=require('esbuild').build;
 const {piRuntimeInitializationPlugin}=await import(resolve('../ai-worker/scripts/pi-runtime-bundle.mjs'));
 temporary=await mkdtemp(resolve('../ai-worker/dist/t1382-p2b-'));entry=join(temporary,'recovery.cjs');auditPath=join(temporary,'rpc.ndjson');
 await build({entryPoints:[resolve('../ai-worker/src/execution/intelligence-generation-worker-entry.ts')],outfile:entry,bundle:true,platform:'node',target:'node24',format:'cjs',logLevel:'warning',external:['@openclaw/fs-safe','mammoth','pdf-parse','@playwright/test','jsdom','@mozilla/readability','@xenova/transformers'],define:{__RECOVERY_AUDIT_PATH__:JSON.stringify(auditPath)},plugins:[piRuntimeInitializationPlugin(),{name:'read-only-original-thread',setup(builder:any){builder.onResolve({filter:/\/codex-app-server$/},()=>({path:resolve('src/modules/execution/codex-read-recovery.fixture.ts')}));}}]});
},180000);
afterAll(async()=>{await close?.();if(temporary)await rm(temporary,{recursive:true,force:true});},120000);
async function task(id:string){return (await db.select().from(executionTasks).where(eq(executionTasks.id,id)))[0]!;}
async function audit(){try{return (await readFile(auditPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}}
it.each(['strategy_backed','rewrite_only'] as const)('T1382 project-owner %s 原回合真实Worker读取；宿主重建不新增槽、不续期',async generationMode=>{
 const ctx={userId:nextId('user'),accountId:nextId('account'),requestId:'recovery',source:'user' as const},deps={now,nextId},tasks=createPersistentTaskService(db,deps);
 const project=await createProjectsService(createProjectRepository(db),deps).createProject(ctx,{title:'真实来源项目'}),artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)}),text='真实项目来源正文',contentHash=`sha256:${createHash('sha256').update(text).digest('hex')}`;
 const artifact=await artifacts.createArtifact(ctx,{projectId:project.id,title:'来源',artifactType:'output_script',stage:'script',initialContentText:text,initialContentData:{purpose:'project_preparation_source'}});
 const target=projectPreparationGenerationTargetSchema.parse({ownerType:'project' as const,projectId:project.id,source:{kind:'project_artifact' as const,projectId:project.id,artifactId:artifact.id,artifactVersion:1,contentHash,title:'来源',authorName:null,url:null},generationMode,transcript:{text,hash:contentHash}});
 const created=await tasks.enqueue(ctx,{kind:'topic_preview',ownerType:'project',ownerId:project.id,idempotencyKey:'original',payload:{schemaVersion:1,projectId:project.id,source:target.source,target,executionRoute:createExecutionRoute('codex')},executionBudget:budget});
 const claim=(await tasks.claimTask({taskId:created.id,workerId:'original'}))!,ref={executionTaskId:created.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const skill=(skillId:string)=>({
  skillId,baseVersion:'1',overlayRevision:null,overlayVersion:null,
  effective:{methodSystem:'来源只产候选',template:'{{transcript}}',tools:[],requiredFacets:['transcript'],contextRequirements:[],
   outputSchema:generationMode==='rewrite_only'?null:{type:'object',properties:{
    hook:{type:'string'},structureSteps:{type:'array',items:{type:'string'}},coreClaims:{type:'array',items:{type:'string'}},reusablePattern:{type:'string'},factRisks:{type:'array',items:{type:'string'}},
   },required:['hook','structureSteps','coreClaims','reusablePattern','factRisks'],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null,
  },
 });
 const snapshot={snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'候选',skills:generationMode==='rewrite_only'?[skill('intelligence.topic-adapted-draft')]:[skill('intelligence.topic-decompose'),skill('intelligence.topic-from-decomposition'),skill('intelligence.topic-adapted-draft')].sort((a,b)=>a.skillId.localeCompare(b.skillId))};
 const raw={kind:'model.structured',operationKey:`intelligence:${created.id}`,capability:'topic.generate',skillId:generationMode==='rewrite_only'?'intelligence.topic-adapted-draft':'intelligence.topic-decompose',skillSnapshot:snapshot,maxOutputTokens:8192,timeoutMs:600000,facets:{mode:'topic_preview',target:JSON.stringify(target)}};
 const input=generationMode==='rewrite_only'?intelligenceRewriteInputSchema.parse({...raw,intelligenceText:'rewrite_only'}):structuredGenerationInputSchema.parse(raw);
 const identity={schemaVersion:1,capability:'topic.generate',...codexExecutionSpec()};
 const row=await task(created.id);await db.update(executionTasks).set({payload:{...row.payload as object,intelligenceGeneration:{sourceDigest:hash(target),input,identity}}}).where(eq(executionTasks.id,row.id));
 // 在原 Worker 生成确切请求后，于预留前中断；不启动任何模型，用该请求构造已有未知账本。
 const storedInput=((await task(created.id)).payload as any).intelligenceGeneration.input;
 const originalInput=generationMode==='rewrite_only'?intelligenceRewriteInputSchema.parse(storedInput):structuredGenerationInputSchema.parse(storedInput);
 const errors=await import('../../../../ai-worker/src/execution/generation-error');const errorSpy=vi.spyOn(errors,'generationFailure');let captured:any,captureError:unknown;await generateIntelligenceInWorker(originalInput,codexExecutionSpec(),new AbortController().signal,async(port,value)=>{if(port==='reserveGenerationCall')captured=value;throw Error('CAPTURE_ORIGINAL_REQUEST_ONLY');}).catch(error=>{captureError=error;});const underlying=errorSpy.mock.calls.at(-1)?.[0];errorSpy.mockRestore();expect(captured?.request,inspect({captureError,underlying},{depth:8})).toBeTruthy();
 const ledger=createExecutionCallLedgerService(db,{budget}),ports=createExecutionWorkerCallPorts(db,{budget}),encoded=JSON.stringify(captured.request);
 const call=await ledger.reserve(ref,{operationKey:captured.operationKey,kind:'model',inputDigest:`sha256:${hash(captured.request)}`,reservedTokens:Buffer.byteLength(encoded)+1024+captured.request.maxOutputTokens});
 await ports.startCall(ref,{callId:call.id});const threadId=`recovery-${generationMode==='strategy_backed'?'preparation-decomposition':'preparation-text'}-thread-${created.id}`;
 const frozen=await task(created.id);await db.update(executionTasks).set({payload:{...frozen.payload as object,codexCalls:{[call.id]:{threadId,turnId:threadId.replace('thread','turn'),observedUsage:{inputTokens:2,outputTokens:3,totalTokens:5}}}}}).where(eq(executionTasks.id,created.id));
 await ledger.settle(ref,call.id,{status:'unknown'});await db.update(executionTasks).set({status:'unknown_result',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null}).where(eq(executionTasks.id,created.id));
 const deadlineAt=(await task(created.id)).deadlineAt;
 await tasks.command(ctx,{taskIds:[created.id],command:'resume',idempotencyKey:'read-original'});expect((await task(created.id)).status).toBe('queued');
 const recovered=(await tasks.claimTask({taskId:created.id,workerId:'reader'}))!,forbidden=vi.fn(async()=>{throw Error('不得重新解析或提交模型');});
 const bridge=createIntelligenceGenerationBridge(db,{entryPath:entry,tasks,resolveModelSpec:forbidden,resolveSkillSnapshot:forbidden});
 try{
  const result=bridge.topicPreviewGenerator.generate(ctx,target,async()=>{},recovered);
  if(generationMode==='strategy_backed')await expect(result).rejects.toMatchObject({runtimeStatus:'unknown_result'});
  else {const completed=await result.catch(async error=>{throw new Error(inspect({error,task:await task(created.id),calls:await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,created.id)),audit:await audit()},{depth:5}));});expect(completed).toMatchObject({generationMode:'rewrite_only',adaptedDraft:'原线程文本'});await createExecutionWorkerOutcomeService(db,{allowedKinds:['topic_preview']}).recordFailure({executionTaskId:created.id,attempt:recovered.lease.attempt,fenceToken:recovered.lease.fenceToken},{outcome:'unknown_result',errorCode:'FINAL_ACK_LOST'});
   await tasks.command(ctx,{taskIds:[created.id],command:'resume',idempotencyKey:'replay-final-result'});const replay=(await tasks.claimTask({taskId:created.id,workerId:'final-reader'}))!;expect(replay).toBeTruthy();expect(await bridge.topicPreviewGenerator.generate(ctx,target,async()=>{},replay)).toEqual(completed);await tasks.finish({taskId:created.id,...replay.lease,status:'succeeded'});}
 }finally{await bridge.stop();}
 const after=await task(created.id),calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,created.id));
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({id:call.id,status:'settled',startedAttempt:1,retryOfCallId:null});expect(after.deadlineAt).toBe(deadlineAt);expect((after.payload as any).generationReadRecovery.callIds).toEqual([call.id]);
 expect((await audit()).filter(r=>r.params.threadId===threadId).map(r=>r.method)).toEqual(['thread/read']);expect(forbidden).not.toHaveBeenCalled();
 if(generationMode==='strategy_backed'){
  const restarted=createIntelligenceGenerationBridge(db,{entryPath:entry,tasks,resolveModelSpec:forbidden,resolveSkillSnapshot:forbidden});
  try{await tasks.command(ctx,{taskIds:[created.id],command:'resume',idempotencyKey:'read-again'});await tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:created.id});expect((await task(created.id)).status).toBe('unknown_result');expect(await tasks.claimTask({taskId:created.id,workerId:'must-not-submit'})).toBeNull();expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,created.id))).toHaveLength(1);}finally{await restarted.stop();}
 }
},180000);
