import {z} from 'zod';
import {createAiService} from '../ai/ai.service';
import {createChatTurnSubmissionService} from '../ai/chat-turn-submission.service';
import {createExternalChatTurnService} from '../ai/external-chat-turn.service';
import type {RequestContext} from '@creatoros/contract';
import {createExecutionChatToolPorts,type ChatBackendTool} from './execution-chat-tool-ports.service';
import {createExecutionCheckpointService} from './execution-checkpoint.service';
import {recoverableCodexProposalParents} from './chat-generation-recovery';
import {providerIdentityFor,structuredModeForIdentity} from '@creatoros/ai-worker/model-identity';
import {replayGenerationNode,runChatStructuredSequence,replayTextGeneration} from '@creatoros/ai-worker/chat';
import {runWithEffectiveSkillSnapshot} from '@creatoros/ai-worker';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,assets,assetFiles,aiMessages,projects,artifacts,eq,type Db} from '@creatoros/backend';
import {createExecutionRoute,codexExecutionSpec,createContinuousExecutionBudget} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionAuthorityService} from './execution-authority.service';
import {createExecutionWorkerCallPorts} from './execution-worker-call-ports.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionModelIdentityService} from './execution-model-identity.service';
import {createExecutionCodexCallService} from './execution-codex-call.service';
import {createExecutionAssetPorts} from './execution-asset-ports.service';
import {createAssetBusinessExecutionService} from '../ai-runtime/asset-business-execution.service';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {createChatWorkerDispatcher,createModelWorkerDispatcher} from './model-worker-dispatcher';
import {recoverableCodexModelCalls} from './model-call-recovery';
let db:Db,close:()=>Promise<void>,temporary:string,entry:string,auditPath:string,sequence=0;
const budget={maxCalls:10,maxTokens:200000,deadlineMs:600000};
beforeAll(async()=>{
 const opened=await createDb();db=opened.db;close=()=>opened.client.close();
 const require=createRequire(resolve('../ai-worker/package.json')),build=require('esbuild').build;
 const {piRuntimeInitializationPlugin}=await import(resolve('../ai-worker/scripts/pi-runtime-bundle.mjs'));
 temporary=await mkdtemp(resolve('../ai-worker/dist/t1238-recovery-'));entry=join(temporary,'recovery.cjs');auditPath=join(temporary,'rpc.ndjson');
 await build({entryPoints:[resolve('../ai-worker/src/execution/worker-entry.ts')],outfile:entry,bundle:true,platform:'node',target:'node24',format:'cjs',logLevel:'warning',external:['@openclaw/fs-safe','mammoth','pdf-parse','@playwright/test','jsdom','@mozilla/readability','@xenova/transformers'],define:{__RECOVERY_AUDIT_PATH__:JSON.stringify(auditPath)},plugins:[piRuntimeInitializationPlugin(),{name:'read-only-native-fixture',setup(builder:any){builder.onResolve({filter:/\/codex-app-server$/},()=>({path:resolve('src/modules/execution/codex-read-recovery.fixture.ts')}));}}]});
},180000);
afterAll(async()=>{await close?.();if(temporary)await rm(temporary,{recursive:true,force:true});});
async function original(kind:'text'|'image'='text',state:'unknown_result'|'running'|'paused'='unknown_result',pending=false){
 const id=`native-recovery-${++sequence}`,ctx={userId:id,accountId:id,requestId:id,source:'user' as const},tasks=createPersistentTaskService(db);
 const apiConfiguration=vi.fn(async()=>{throw Error('API_MODEL_CONFIGURATION_FORBIDDEN');});
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:kind==='image'?'asset.generate':'script.draft',idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:kind==='image'?{kind:'image',prompt:'原图'}:{prompt:'原文本'},runtimeData:{executionRoute:createExecutionRoute('codex')}});
 const business=createAssetBusinessExecutionService(db,{budget,assertProject:async()=>{},resolveSpec:async(_context,_capability,taskId)=>{const [original]=await db.select().from(aiTasks).where(eq(aiTasks.id,taskId));return (original!.runtimeData as {executionRoute:{engine:string}}).executionRoute.engine==='codex'?{...codexExecutionSpec(),kind:'image' as const}:apiConfiguration();}});
 const mapped=kind==='image'?await business.prepare(ctx,id):await createExecutionAuthorityService(db).bindAiTask(ctx,id);
 const taskId=mapped.executionTaskId!;
 if(kind==='text')await db.update(executionTasks).set({payload:{aiTaskId:id,executionRoute:createExecutionRoute('codex'),modelInput:{kind:'model.generate',operationKey:'original-text',prompt:'原文本',capability:'script',maxOutputTokens:128}},executionBudget:budget,deadlineAt:new Date(Date.now()+budget.deadlineMs).toISOString()}).where(eq(executionTasks.id,taskId));
 const claim=(await tasks.claimTask({taskId,workerId:'original-worker'}))!,ref={executionTaskId:taskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(temporary,id),publicBaseUrl:'/blob'},{nextKey:()=>id});
 const assetPorts=createExecutionAssetPorts({db,budget,now:()=>new Date().toISOString(),objectStorageForCtx:async()=>storage,resolveCredential:(context,owner)=>business.resolveCredential(context,owner)});
 const ports=createExecutionWorkerCallPorts(db,{budget}),ledger=createExecutionCallLedgerService(db,{budget});
 const reservation=kind==='image'?await assetPorts.invoke(ref,'reserveAssetCall',{}) as {callId:string}:await ports.reserveCall(ref,{operationKey:'original-text',maxOutputTokens:128});
 if(kind==='text'){await createExecutionModelIdentityService(db).pin(ref,'script',codexExecutionSpec());await ports.startCall(ref,{callId:reservation.callId});}
 else await assetPorts.invoke(ref,'startAssetCall',{callId:reservation.callId});
 const native=createExecutionCodexCallService(db),threadId=`recovery-${kind}${pending?'-pending':''}-thread-${id}`;
 await native.invoke(ref,'bindCodexCall',{callId:reservation.callId,threadId,turnId:threadId.replace('thread','turn')});
 await native.invoke(ref,'bindCodexCall',{callId:reservation.callId,observedUsage:{inputTokens:2,outputTokens:3,totalTokens:5}});
 await ledger.settle(ref,reservation.callId,{status:'unknown'});
 const old=(await db.select().from(executionTasks).where(eq(executionTasks.id,taskId)))[0]!;
 await db.update(executionTasks).set({status:state,...(state==='running'?{leaseExpiresAt:new Date(Date.now()-1).toISOString()}:{leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null})}).where(eq(executionTasks.id,taskId));
 return {ctx,tasks,id,taskId,ref,callId:reservation.callId,threadId,deadlineAt:old.deadlineAt,storage,apiConfiguration,business,ledger};
}
async function task(id:string){return (await db.select().from(executionTasks).where(eq(executionTasks.id,id)))[0]!;}
async function nativeAudit(){try{return (await readFile(auditPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}}
it.each([['text','resume'],['text','scan'],['image','resume'],['image','scan']] as const)('公共 %s 恢复/%s 经真实 Worker 只读取原thread/turn，同call且零新提交',async(kind,mode)=>{
 const f=await original(kind,mode==='scan'?'running':'unknown_result');
 if(mode==='resume')await f.tasks.command(f.ctx,{taskIds:[f.taskId],command:'resume',idempotencyKey:'resume-original'});
 else await f.tasks.recoverExpiredLeases({includeSafeUnknownResults:true,taskId:f.taskId});
 expect((await task(f.taskId)).status).toBe('queued');
 const hostErrors:string[]=[];const host=createModelWorkerDispatcher(db,{entryPath:entry,workerId:'recovered-worker',budget,modelConcurrency:1,onError:code=>hostErrors.push(code),resolveModelCredential:async()=>codexExecutionSpec(),resolveAssetCredential:(context,owner)=>f.business.resolveCredential(context,owner),assetStorage:async()=>f.storage,projectCandidate:(_context,input)=>({resultType:'artifact_version',artifactId:'original-artifact',resultData:{body:input.text}})});
 try{
  await host.drainOnce();const restored=await task(f.taskId);expect(restored,JSON.stringify({status:restored.status,code:restored.lastErrorCode,message:restored.lastErrorMessage,deadline:restored.deadlineAt,budget:restored.executionBudget,hostErrors,audit:await nativeAudit(),calls:await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.taskId))})).toMatchObject({status:'succeeded',attempt:2,deadlineAt:f.deadlineAt,retryOfCallId:null});
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.taskId));expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({id:f.callId,status:'settled',startedAttempt:1,retryOfCallId:null,totalTokens:5});
  expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(1);
  const reads=(await nativeAudit()).filter(row=>row.params.threadId===f.threadId);expect(reads).toHaveLength(1);expect(reads[0]).toEqual({method:'thread/read',params:{threadId:f.threadId,includeTurns:true}});
  expect(f.apiConfiguration).not.toHaveBeenCalled();
  if(kind==='image'){const ownedAssets=await db.select().from(assets).where(eq(assets.userId,f.ctx.userId));expect(ownedAssets).toHaveLength(1);const files=await db.select().from(assetFiles).where(eq(assetFiles.assetId,ownedAssets[0]!.id));expect(files).toHaveLength(1);expect((await f.storage.getObject(files[0]!.storageKey)).byteLength).toBeGreaterThan(0);expect(await db.select().from(assets).where(eq(assets.userId,f.ctx.userId))).toHaveLength(1);}
 }finally{await host.stop();}
},180000);
it.each(['无原binding','未知工具','过期限','耗尽attempt','有界null期限','错误fence','跨账号'] as const)('公共继续拒绝重发族：%s',async(mode)=>{
 const f=await original('text','paused');
 if(mode==='无原binding'){const row=await task(f.taskId);await db.update(executionTasks).set({payload:{...row.payload as object,codexCalls:{}}}).where(eq(executionTasks.id,f.taskId));}
 if(mode==='未知工具')await db.update(executionCalls).set({kind:'tool'}).where(eq(executionCalls.id,f.callId));
 if(mode==='过期限')await db.update(executionTasks).set({deadlineAt:new Date(Date.now()-1).toISOString()}).where(eq(executionTasks.id,f.taskId));
 if(mode==='耗尽attempt')await db.update(executionTasks).set({attempt:3,maxAttempts:3}).where(eq(executionTasks.id,f.taskId));
 if(mode==='有界null期限')await db.update(executionTasks).set({deadlineAt:null}).where(eq(executionTasks.id,f.taskId));
 if(mode==='错误fence')await expect(createExecutionCodexCallService(db).invoke({...f.ref,fenceToken:'wrong'},'readCodexCall',{callId:f.callId})).rejects.toThrow();
 if(mode==='跨账号'){await expect(f.tasks.command({...f.ctx,accountId:'other'},{taskIds:[f.taskId],command:'resume',idempotencyKey:'foreign'})).rejects.toThrow();return;}
 if(mode==='错误fence')return;
 await f.tasks.command(f.ctx,{taskIds:[f.taskId],command:'resume',idempotencyKey:'refuse-original'});expect((await task(f.taskId)).status).toBe('paused');
 expect((await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.taskId)))[0]!.status).toBe('unknown');
},180000);
it('continuous 原null期限可只读恢复，取消与未知回合保持原task/call且不续期',async()=>{
 const continuous=await original();await db.update(executionTasks).set({executionBudget:createContinuousExecutionBudget(),deadlineAt:null}).where(eq(executionTasks.id,continuous.taskId));
 await continuous.tasks.command(continuous.ctx,{taskIds:[continuous.taskId],command:'resume',idempotencyKey:'continuous-read'});expect(await task(continuous.taskId)).toMatchObject({status:'queued',deadlineAt:null});
 await continuous.tasks.command(continuous.ctx,{taskIds:[continuous.taskId],command:'cancel',idempotencyKey:'stop-continuous'});expect((await task(continuous.taskId)).status).toBe('cancelled');
 await continuous.tasks.command(continuous.ctx,{taskIds:[continuous.taskId],command:'resume',idempotencyKey:'never-resend'}).catch(()=>{});expect((await task(continuous.taskId)).status).toBe('cancelled');
 const pending=await original('text','unknown_result',true);await pending.tasks.command(pending.ctx,{taskIds:[pending.taskId],command:'resume',idempotencyKey:'read-unfinished'});
 const host=createModelWorkerDispatcher(db,{entryPath:entry,workerId:'pending-reader',budget,modelConcurrency:1,resolveModelCredential:async()=>codexExecutionSpec(),projectCandidate:()=>{throw Error('不能伪造结果');}});
 try{await host.drainOnce();expect(await task(pending.taskId)).toMatchObject({status:'unknown_result',deadlineAt:pending.deadlineAt,retryOfCallId:null});expect((await nativeAudit()).filter(row=>row.params.threadId===pending.threadId).map(row=>row.method)).toEqual(['thread/read']);expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,pending.taskId))).toMatchObject([{id:pending.callId,status:'unknown',startedAttempt:1}]);}finally{await host.stop();}
},180000);
it('伪造原外部root两个ID不足以获得恢复许可',async()=>{
 const f=await original(),row=await task(f.taskId),calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.taskId));
 expect(recoverableCodexModelCalls(row,calls)).toHaveLength(1);expect(recoverableCodexModelCalls(row,[{...calls[0]!,kind:'external_agent'}])).toEqual([]);expect(recoverableCodexModelCalls(row,[{...calls[0]!,executionTaskId:'foreign'}])).toEqual([]);
},180000);

async function originalChat(node:'structured'|'hooks'|'script-draft'){
 const id=`native-chat-recovery-${++sequence}`,ctx={userId:id,accountId:id,requestId:id,source:'user' as const};
 const reject=async():Promise<never>=>{throw Error('不能采纳领域数据');};
 const ai=createAiService({db,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${++sequence}`,artifacts:{createVersion:reject},knowledge:{createKnowledge:reject},candidate:{createFromAIResult:reject,enrichCard:reject},learnings:{createLearning:reject},publishing:{createPublicationFromDraft:reject},materialLinks:{link:reject},positioning:{upsertProfile:reject,createStatementVersion:reject},calibration:{createDraftPrediction:reject}});
 const projectId=`project-${id}`,artifactId=`artifact-${id}`,stamp=new Date().toISOString();
 await db.insert(projects).values({id:projectId,userId:id,accountId:id,title:'原父项目',creationMode:'guided',status:'active',source:'manual',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
 await db.insert(artifacts).values({id:artifactId,userId:id,accountId:id,projectId,stage:'script',artifactType:'script',title:'原父稿',status:'drafting',createdAt:stamp,updatedAt:stamp});
 const conversation=await ai.createConversation(ctx,{title:'原对话',projectId:null,scope:'global'}),source=await ai.createMessage(ctx,conversation.id,{content:'把完整原稿写进稿面',attachments:[]});
 const name=node==='structured'?'topic.enrich':node==='hooks'?'script.hooks':'script.draft',execution=node==='structured'?'worker.structured-node':node==='hooks'?'worker.script-hooks':'worker.script-draft',effect=node==='script-draft'?'committed':'proposal';
 const hostDefinition={name:'context.project.detail',version:'recovery-v1',description:'原项目短读',parameters:{type:'object'},effect:'none'} as const;
 const definition={name,version:'recovery-v1',description:'原工具',parameters:{type:'object'},effect,execution} as const;
 const skill={skillId:'chatbox.topic',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'原策略',template:'',tools:[name],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}};
 const hostContext={schemaVersion:1 as const,chatContext:{surface:'topics'},mediaRoute:null,positioningScratch:false,trustedScriptSources:[{ref:'message:original',label:'原稿',text:'第一句正文。最后一句。',truncated:false}],scriptDraftContext:{latestUserInstruction:'把完整原稿写进稿面'},scriptHooksGeneration:{version:1 as const,maxOutputTokens:2048},scriptHooksContext:{selectionTitle:'原选题',positioningBrief:'原定位',projectBriefHard:'',userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:''},skillSnapshot:{snapshotVersion:1 as const,userId:id,accountId:id,resolvedAt:stamp,platformPolicyVersion:'1',platformPolicy:'原候选',skills:[skill,...(node==='structured'?[{...structuredClone(skill),skillId:name,effective:{...skill.effective,template:'{{title}}',requiredFacets:['title'],outputSchema:{type:'object',properties:{oneLiner:{type:'string'}},required:['oneLiner'],additionalProperties:false}}}]:[])]}};
 const approval=vi.fn(async()=>({status:'not-applicable' as const})),preparation=vi.fn(async()=>({node:{capability:'topic.enrich' as const,facets:{title:'原题'},candidateId:'original-candidate'},discovery:null,maxOutputTokens:2048}));
 const readHost=vi.fn(async()=>({status:'ok' as const,summary:'原项目事实',evidence:[],data:{projectId},error:null,continuation:null,sideEffect:'none' as const}));
 const tools:Record<string,ChatBackendTool>={'context.project.detail':{version:'recovery-v1',effect:'none',execution:'host',parameters:z.object({}).strict(),approve:approval,execute:readHost},[name]:{version:definition.version,effect,execution,parameters:z.record(z.string(),z.json()),approve:approval,...(node==='structured'?{prepareGeneration:preparation}:{}),...(node==='script-draft'?{async prepareTask(context:RequestContext,input:unknown,scope:{attemptId:string}){const child=await ai.prepareTaskCommit(context,{taskType:'script.draft',attemptId:scope.attemptId,inputData:{...input as object,projectId,artifactId}});return {task:child,result:(row:{id:string})=>({status:'ok' as const,summary:'原稿已提交',data:{kind:'script.draft',taskId:row.id,projectId,error:null},evidence:[],error:null,continuation:null,sideEffect:'committed' as const})};}}:{})}};
 const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({system:'原策略',messages:[{role:'user',content:'原消息'}],capability:'copilot.assist',maxSteps:6,maxOutputTokens:2048,tools:[hostDefinition,definition],workbenchPlatform:'macos',workbenchCapabilities:[{name:hostDefinition.name,schemaVersion:1,description:hostDefinition.description,inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:[],platforms:['macos']}],hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex'});
 const tasks=createPersistentTaskService(db),claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:'original-chat'}))!,ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const modelIdentity=createExecutionModelIdentityService(db);await modelIdentity.pin(ref,'copilot.assist',codexExecutionSpec());
 const external=createExternalChatTurnService(db,{budget}),root=await external.reserve(ref,{}),native=createExecutionCodexCallService(db),threadId=`recovery-chat-thread-${id}`;
 await external.start(ref,{callId:root.callId,protocolKind:'acp',protocolVersion:1,sessionId:threadId});await external.recordProviderTurn(ref,{callId:root.callId,providerTurnId:threadId.replace('thread','turn')});
 await native.invoke(ref,'bindCodexCall',{callId:root.callId,threadId,turnId:threadId.replace('thread','turn')});await native.invoke(ref,'bindCodexCall',{callId:root.callId,observedUsage:{inputTokens:2,outputTokens:3,totalTokens:5}});
 await native.invoke(ref,'recordCodexToolCall',{callId:root.callId,toolCallId:'original-tool',toolName:name.replaceAll('.','_'),input:JSON.stringify(node==='script-draft'?{mode:'verbatim',sourceRef:'message:original'}:{})});
 const ports=createExecutionChatToolPorts(db,{budget,tools,resolveGenerationCredential:async()=>codexExecutionSpec()});
 await native.invoke(ref,'recordCodexToolCall',{callId:root.callId,toolCallId:'original-host',toolName:'context_project_detail',input:'{}'});
 const previousHost=await ports.reserve(ref,{modelCallId:root.callId,toolCallId:'original-host'});await ports.start(ref,{callId:previousHost.callId});await ports.execute(ref,{callId:previousHost.callId},new AbortController().signal);
 const parent=await ports.reserve(ref,{modelCallId:root.callId,toolCallId:'original-tool'});await ports.start(ref,{callId:parent.callId});
 const service=node==='structured'?ports.generation:node==='hooks'?ports.hooks:ports.scriptDraft;
 if(node==='structured')await ports.generation.resolveCredential(ref,{callId:parent.callId});
 const prepared=await service.prepare(ref,{callId:parent.callId});
 const replay=node==='structured'?await runWithEffectiveSkillSnapshot((prepared as any).skillSnapshot,()=>replayGenerationNode({...providerIdentityFor(codexExecutionSpec()),structuredOutputMode:structuredModeForIdentity(codexExecutionSpec()),receipts:[]},model=>runChatStructuredSequence((prepared as any).node,model,(prepared as any).maxOutputTokens))):await replayTextGeneration({...providerIdentityFor(codexExecutionSpec()),system:(prepared as any).system,prompt:(prepared as any).prompt,maxOutputTokens:(prepared as any).maxOutputTokens,receipts:[]});
 if(replay.status!=='next-request')throw Error('原节点没有模型请求');
 const child=await service.reserve(ref,{callId:parent.callId,operationKey:`${prepared.operationKey}/model/1`,request:replay.request});await service.start(ref,{callId:child.callId});
 const childThread=`recovery-${node}-thread-${id}`;await native.invoke(ref,'bindCodexCall',{callId:child.callId,threadId:childThread,turnId:childThread.replace('thread','turn')});await native.invoke(ref,'bindCodexCall',{callId:child.callId,observedUsage:{inputTokens:2,outputTokens:3,totalTokens:5}});
 await service.settle(ref,{callId:child.callId,status:'unknown'});await external.settle(ref,{callId:root.callId,status:'unknown'});
 await db.update(executionTasks).set({status:'unknown_result',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null}).where(eq(executionTasks.id,submitted.executionTaskId));
 return {ctx,tasks,submitted,ports,tools,parent,child,root,threadId,childThread,preparation,approval,ref,readHost,previousHost};
}
it.each(['structured','hooks','script-draft'] as const)('公共原 %s 父工具+unknown子模型恢复：真实授权、Worker、投影及原CAS，无重复子任务',async(node)=>{
 const f=await originalChat(node),before=await task(f.submitted.executionTaskId),calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,before.id));
 expect(recoverableCodexProposalParents(before,calls)).toEqual([f.parent.callId]);
 await f.tasks.command(f.ctx,{taskIds:[before.id],command:'resume',idempotencyKey:'read-original-node'});expect((await task(before.id)).status).toBe('queued');
 const forbiddenApi=vi.fn(async()=>{throw Error('独立API不允许');}),errors:string[]=[],host=createChatWorkerDispatcher(db,{entryPath:entry,workerId:'recovery-chat',budget,tools:f.tools,onError:code=>errors.push(code),resolveModelCredential:async(_ctx,_cap,owner)=>{const frozen=await task(owner.executionTaskId);return (frozen.payload as {executionRoute:{engine:string}}).executionRoute.engine==='codex'?codexExecutionSpec():forbiddenApi();}});
 try{
  await host.drainOnce();const restored=await task(before.id),rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,before.id));
  expect(restored,JSON.stringify({restored,rows,errors,audit:await nativeAudit()})).toMatchObject({status:'succeeded',attempt:2,deadlineAt:before.deadlineAt,retryOfCallId:null});
  expect(rows).toHaveLength(4);expect(f.readHost).toHaveBeenCalledTimes(1);expect(rows.find(row=>row.id===f.previousHost.callId)).toMatchObject({status:'settled',startedAttempt:1});expect(rows.find(row=>row.id===f.child.callId)).toMatchObject({status:'settled',startedAttempt:1,retryOfCallId:null,totalTokens:5});expect(rows.find(row=>row.id===f.parent.callId)).toMatchObject({status:'settled',startedAttempt:2});
  expect((await nativeAudit()).filter(row=>[f.threadId,f.childThread].includes(row.params.threadId)).map(row=>row.method)).toEqual(['thread/read','thread/read']);expect(forbiddenApi).not.toHaveBeenCalled();
  const assistant=(await db.select().from(aiMessages).where(eq(aiMessages.conversationId,(before.payload as any).modelInput.conversationId))).filter(row=>row.role==='assistant');expect(assistant).toHaveLength(1);
  if(node==='structured')expect(f.preparation).toHaveBeenCalledTimes(1);
  if(node==='script-draft')expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(row=>row.taskType==='script.draft')).toHaveLength(1);
 }finally{await host.stop();}
},180000);

it.each(['准备摘要损坏','准备输入替换','冻结身份换Pi','原提案输入替换','原供应商turn不符','子调用跨任务','缺原子binding'] as const)('真实原节点拒绝恢复证明损坏：%s',async(mode)=>{
 const f=await originalChat('structured'),row=await task(f.submitted.executionTaskId),payload=structuredClone(row.payload) as any,calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id));
 if(mode==='准备摘要损坏')payload.nodePreparations[f.parent.callId].digest='sha256:bad';
 if(mode==='准备输入替换')payload.nodePreparations[f.parent.callId].value.node.facets.title='新输入';
 if(mode==='冻结身份换Pi')payload.chatModelIdentities[f.parent.callId].identity={schemaVersion:1,capability:'topic.enrich',apiFormat:'openai_chat',customEndpoint:false,model:'new-api'};
 if(mode==='原提案输入替换')payload.codexCalls[f.root.callId].tools['original-tool'].input='{"topic":"新提案"}';
 if(mode==='缺原子binding')delete payload.codexCalls[f.child.callId];
 if(mode==='原供应商turn不符')calls.find(call=>call.id===f.root.callId)!.providerResult={...calls.find(call=>call.id===f.root.callId)!.providerResult as object,providerTurnId:'foreign-turn'};
 if(mode==='子调用跨任务')calls.find(call=>call.id===f.child.callId)!.executionTaskId='foreign-task';
 expect(recoverableCodexProposalParents({...row,payload},calls)).toEqual([]);
 if(mode==='子调用跨任务')return; // 外部task所有权由原调用端口另有公共拒绝族覆盖。
 if(mode==='原供应商turn不符')await db.update(executionCalls).set({providerResult:calls.find(call=>call.id===f.root.callId)!.providerResult}).where(eq(executionCalls.id,f.root.callId));
 await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,row.id));
 await f.tasks.command(f.ctx,{taskIds:[row.id],command:'resume',idempotencyKey:'deny-corrupt-proof'});expect((await task(row.id)).status).not.toBe('queued');
 expect((await nativeAudit()).some(event=>event.params.threadId===f.childThread)).toBe(false);
},180000);

it.each(['structured','hooks','script-draft'] as const)('原 %s 子回执确认后ACK/身份重读仍用原父结果，unknown根不新增提交',async(node)=>{
 const f=await originalChat(node),taskId=f.submitted.executionTaskId;await f.tasks.command(f.ctx,{taskIds:[taskId],command:'resume',idempotencyKey:'read-ack'});
 const claim=(await f.tasks.claimTask({taskId,workerId:'ack-reader'}))!,ref={executionTaskId:taskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const service=node==='structured'?f.ports.generation:node==='hooks'?f.ports.hooks:f.ports.scriptDraft;await service.restore(ref,{callId:f.parent.callId});
 const text=node==='structured'?'{"oneLiner":"原节点候选"}':node==='script-draft'?'{"authorized":true,"startAnchor":"第一句正文。","endAnchor":"最后一句。"}':'[]';
 await service.settle(ref,{callId:f.child.callId,status:'settled',usage:{inputTokens:2,outputTokens:3,inputTokenDetails:{},outputTokenDetails:{}},providerResult:{content:[{type:'text',text}],finishReason:{unified:'stop'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[],providerMetadata:{codex:{threadId:f.childThread,turnId:f.childThread.replace('thread','turn')}}}});
 const first=await service.complete(ref,{callId:f.parent.callId});expect(await service.complete(ref,{callId:f.parent.callId})).toEqual(first);
 expect((await service.prepare(ref,{callId:f.parent.callId})).operationKey).toMatch(/^(structured|hooks|script-draft):/);
 if(node==='structured')expect(await f.ports.generation.resolveCredential(ref,{callId:f.parent.callId})).toMatchObject({engine:'codex'});
 expect((await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,taskId))).filter(row=>row.parentCallId===f.parent.callId)).toHaveLength(1);
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.root.callId)))[0]!.status).toBe('unknown');expect(f.readHost).toHaveBeenCalledTimes(1);
 if(node==='script-draft')expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(row=>row.taskType==='script.draft')).toHaveLength(1);
},180000);
