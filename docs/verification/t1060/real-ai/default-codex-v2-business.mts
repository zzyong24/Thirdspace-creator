import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createDb,executionCalls,aiTasks,aiTaskResults,assets,assetFiles,eq} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/index.ts';
import {createIdentityRepository,createIdentityService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/identity/index.ts';
import {createPlatformAccountService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/platform-account/index.ts';
import {createProjectRepository,createProjectsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/projects/index.ts';
import {createArtifactsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/artifacts/index.ts';
import {createPublishingService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/publishing/index.ts';
import {createSettingsRepository} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/settings/settings.repository.ts';
import {createAiRepository,createChatTurnSubmissionService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/index.ts';
import {createExternalChatTurnService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/external-chat-turn.service.ts';
import {createExternalTaskToolService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/external-task-tool.service.ts';
import {createChatHostContextReader} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/chat-host-context.service.ts';
import {createPersistentTaskService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/execution/index.ts';
import {createLocalFsObjectStorage,createAssetsService,createAssetRepository,readCommittedGeneratedAssetFile} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/assets/index.ts';
import {createChatProjectsReaders} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/chat/projects-readers.ts';
import {createReviewSubjectContext} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/context/review-subject.ts';
import {buildChatTools} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/chat-tools.ts';
import {createChatReadToolBindings} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/chat-read-tool-bindings.ts';
import {prepareChatToolDefinitions} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/chat-tool-definitions.ts';
import {createChatReadTaskToolHost} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/chat-read-tool-resolver.ts';
import {createEffectiveSkillSnapshotResolver} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/effective-skill-snapshot.ts';
import {getOfficialSkillBase,listOfficialSkillBases,registerAllTemplates} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/index.ts';
import {runCodexAcpInWorker} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/execution/codex-acp-worker-run.ts';
import {chatWorkerInputSchema} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/contract/src/internal/execution-worker.ts';

const mode=process.argv[2];assert.ok(['read','image'].includes(mode));
const hash=(x:Uint8Array|string)=>createHash('sha256').update(x).digest('hex');
const root=await mkdtemp(`/tmp/t1060-ai-business/default-codex-v2-${mode}-`);
const now=()=>new Date().toISOString(),deps={now,nextId:(p:string)=>`${p}-t1060-${randomUUID()}`};
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),mode==='image'?240000:150000);
const opened=await createDb({dataDir:join(root,'db')});
let report:any={verification:`original-v2-default-codex-${mode}-business`,observedAt:now(),isolatedRoot:root,modelSelection:'当前默认；未设置sessionModel',adopted:false,published:false,events:[],toolCalls:[],imageSaves:[]};
let ref:any,submission:any,ctx:any,repo:any,conversation:any,turns:any,tasks:any,receivedText='';
const unavailable=async()=>{throw Error('UNUSED_PORT_NOT_INSTALLED');};
try{
 const identity=createIdentityService(createIdentityRepository(opened.db,deps),deps);
 const user=await identity.register({email:`${randomUUID()}@t1060.invalid`,password:randomUUID(),displayName:'T1060 正式默认 v2 验证'});
 const base=await identity.resolveContextFromToken(user.rawToken);
 const account=await createPlatformAccountService({db:opened.db,...deps}).createAccount(base,{platform:'xiaohongshu',accountHandle:'T1060 隔离 v2 业务验证'});
 ctx={...base,accountId:account.id};
 const projects=createProjectsService(createProjectRepository(opened.db),deps);
 // 真领域实体；随机后缀只在创建项目时提供，未向模型的消息或system泄露真实标题。
 const title=`隔离项目 · 琥珀灯塔 ${randomUUID().slice(0,8)}`;
 const project=await projects.createProject(ctx,{title,brief:'本项目用于默认模型读取和图片候选验证；禁止采纳与发布。'});
 const artifacts=createArtifactsService({db:opened.db,...deps,assertProjectOwned:(c,id)=>projects.getProject(c,id)});
 const publishing=createPublishingService({db:opened.db,...deps,listOutputIdsByProject:(c,id)=>projects.listOutputIdsByProject(c,id)});
 // 当前项目没有outputs；这些端口不会调用。若意外调用明确失败，绝不制造指标或内容。
 const review=createReviewSubjectContext({projectsService:projects,publishingService:publishing,artifactsService:artifacts,analyticsService:{getPublicationAnalytics:unavailable},candidateService:{listCommentsForPublication:unavailable},selectReadableProjectScriptArtifact:()=>{throw Error('UNUSED_PORT_NOT_INSTALLED');},readProjectRadarDraftSeed:unavailable} as any);
 const readers=createChatProjectsReaders({projectsService:projects,publishingService:publishing,artifactsService:artifacts,listRecentProjects:unavailable,searchProjects:unavailable,contentRadarDraftSeedOf:()=>null,extractArtifactText:()=>{throw Error('UNUSED_PORT_NOT_INSTALLED');},makeReviewSubjectReader:()=>review,readProjectRadarDraftSeed:unavailable,readCurrentArtifactTruth:unavailable} as any);
 const prototypes=buildChatTools(['context.project.detail'],createChatReadToolBindings(ctx,readers as any,{boundProjectId:project.id}) as any);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;assert.equal(definitions[0]?.effect,'none');
 registerAllTemplates();
 const settings=createSettingsRepository(opened.db,deps);
 const resolveSnapshot=createEffectiveSkillSnapshotResolver({officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'creatoros-platform-policy-v1',text:['AI 只能产生候选；真实数据写入必须经过用户确认和后端服务端口。','不得编造指标、来源、执行结果或已保存状态；缺失数据必须如实标空。','工具只允许使用 effective Skill 白名单与当前账号授权范围的交集。'].join('\n')})},accountOverlays:{listBySkillIds:(c,ids)=>settings.listAccountSkillOverlays(c,ids)},now});
 const skillSnapshot=await resolveSnapshot(ctx,['chatbox.topic']);
 const hostContext={schemaVersion:1,chatContext:{surface:'project',projectId:project.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot};
 repo=createAiRepository(opened.db,{...deps,userId:ctx.userId,accountId:ctx.accountId});
 conversation=await repo.createConversation({title:`v2 实际 ${mode==='read'?'项目读取':'图片候选'}`,projectId:project.id,scope:'project'});
 const prompt=mode==='read'?'请调用 context.project.detail 读取当前绑定项目，然后只根据该工具结果告诉我：项目标题、阶段、是否已发布。不要猜测标题，不读文件，不运行命令。':'请先调用 context.project.detail 读取当前绑定项目，然后实际调用原生 image_gen 生成一张方形图片：暖橙色灯塔在蓝色海面照亮夜航小船，扁平插画，画面不要文字。请务必实际生成图片而非仅描述提示词。图片只保留为候选，不采用、不发布；不读文件、不运行命令。';
 const source=await repo.createMessage(conversation.id,{role:'user',content:prompt,attachments:[],modelMetadata:{}});
 submission=await createChatTurnSubmissionService(opened.db,{now,assertProject:(c,id)=>projects.getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'这是 CreatorOS 绑定项目的真实工具业务验证。当前项目身份由只读工具后端绑定。请遵照用户要求，调用已提供的 context.project.detail，不要从提示词猜测项目内容。仅在用户明确要求生成图片时使用原生 image_gen；不要调用任何命令或文件工具。不得采纳或发布。',messages:[{role:'user',content:source.content}],maxSteps:6,maxOutputTokens:512,tools:definitions,hostContext}) as any}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex'});
 tasks=createPersistentTaskService(opened.db,{now});const claim=await tasks.claimTask({taskId:submission.executionTaskId,workerId:`t1060-v2-real-${mode}`,leaseSeconds:600});assert.ok(claim);
 ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const frozen=chatWorkerInputSchema.parse(claim.payload.modelInput);assert.equal(frozen.externalAgentBinding?.policy,'creatoros-acp-readonly-v2');
 const toolHost=await createChatReadTaskToolHost(createChatHostContextReader(opened.db,{now}),readers as any)(ctx,frozen,ref,controller.signal);
 const storage=createLocalFsObjectStorage({rootPath:join(root,'objects'),publicBaseUrl:'/blob'},{now:()=>Date.now(),nextKey:()=>`t1060-${randomUUID()}`});
 const owner=createAssetsService(createAssetRepository(opened.db,deps),async()=>storage,deps);
 turns=createExternalChatTurnService(opened.db,{now,budget:{maxCalls:8,maxTokens:100000,deadlineMs:mode==='image'?240000:150000},objectStorageForCtx:async()=>storage});
 const tools=createExternalTaskToolService(opened.db,{now});
 const call=async(port:string,data:any,signal?:AbortSignal)=>{
  report.events.push(port);console.log(JSON.stringify({event:port,at:now()}));
  if(port==='reserveExternalChatTurn')return turns.reserve(ref,data);
  if(port==='startExternalChatTurn')return turns.start(ref,data);
  if(port==='recordExternalChatProviderTurn')return turns.recordProviderTurn(ref,data);
  if(port==='settleExternalChatTurn'){if(data.receipt)report.observedReceipt={sessionId:data.receipt.sessionId,providerTurnId:data.receipt.providerTurnId,stopReason:data.receipt.stopReason,imageCount:data.receipt.images.length,imageFailures:data.receipt.imageFailures};return turns.settle(ref,data);}
  if(port==='recoverExternalChatImage')return turns.recoverImage(ref,data,signal);
  if(port==='saveExternalChatImage'){
   const first=await turns.saveImage(ref,data,signal);assert.equal(first.status,'committed');
   const repeated=await turns.saveImage(ref,data,signal);assert.deepEqual(repeated,first);
   const recovered=await turns.recoverImage(ref,{callId:data.callId,sessionId:data.sessionId,toolCallId:data.toolCallId,imageIndex:data.imageIndex},signal);assert.deepEqual(recovered,first);
   const {toolCallId,imageIndex,...receipt}=first.receipt;assert.equal(receipt.checksum,hash(data.bytes));assert.equal(receipt.byteLength,data.bytes.byteLength);
   const exact=await owner.readImageReference(ctx,receipt.assetId,receipt.fileId,receipt.checksum);assert.deepEqual(Buffer.from(exact.bytes),Buffer.from(data.bytes));
   const path=join(root,`${receipt.checksum}.png`);await writeFile(path,data.bytes);
   report.imageSaves.push({callId:data.callId,sessionId:data.sessionId,toolCallId,imageIndex,receipt,path,saveRecoverIdempotent:true,pngSignature:Buffer.from(data.bytes).subarray(0,8).toString('hex')==='89504e470d0a1a0a'});return first;
  }
  if(port==='listExternalTaskTools')return tools.list(ref,data,toolHost);
  if(port==='executeExternalTaskTool'){
   const result=await tools.execute(ref,data,toolHost,signal??controller.signal);
   report.toolCalls.push({turnCallId:data.turnCallId,toolCallId:data.toolCallId,toolName:data.toolName,input:data.input,result});return result;
  }
  throw Error('OUT_OF_SCOPE_PORT');
 };
 report.projectId=project.id;report.expectedProjectTitle=title;report.taskId=submission.taskId;report.executionTaskId=submission.executionTaskId;report.policy=frozen.externalAgentBinding?.policy;report.frozenTools=definitions.map(d=>({name:d.name,effect:d.effect,version:d.version}));
 await writeFile(join(root,'admission.json'),JSON.stringify({projectId:project.id,taskId:submission.taskId,executionTaskId:submission.executionTaskId,policy:report.policy,frozenTools:report.frozenTools},null,2));
 const result=await runCodexAcpInWorker(frozen,controller.signal,call as any,chunk=>{receivedText+=chunk;});
 // 窄真实回执检查在commit前，失败不伪称业务完成。
 const successful=report.toolCalls.filter((c:any)=>c.toolName==='context.project.detail'&&c.result.status==='settled'&&c.result.outcome.status==='ok');
 assert.ok(successful.length>0,'REAL_PROJECT_TOOL_NOT_EXECUTED');const toolProject=successful[0].result.outcome.data.project;assert.equal(toolProject.id,project.id);assert.equal(toolProject.title,title);
 const committed=await turns.commit(ref,{callId:result.callId});
 const messages=await repo.listMessages(conversation.id),task=await tasks.get(ctx,submission.executionTaskId);
 const [business]=await opened.db.select({status:aiTasks.status}).from(aiTasks).where(eq(aiTasks.id,submission.taskId));
 const calls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
 const results=await opened.db.select({id:aiTaskResults.id,executionCallId:aiTaskResults.executionCallId,resultType:aiTaskResults.resultType}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId));
 const native=calls.find(c=>c.id===result.callId);assert.equal(native?.kind,'external_agent');assert.equal(native?.status,'settled');const provider=native?.providerResult as any;assert.ok(provider.sessionId);assert.ok(provider.providerTurnId);assert.equal(provider.stopReason,'end_turn');assert.equal(task.status,'succeeded');assert.equal(business?.status,'succeeded');
 const assistants=messages.filter(m=>m.role==='assistant');assert.ok(assistants.length>=1);assert.ok(assistants.some(m=>m.content===receivedText));
 const imageChecks=[];
 if(mode==='image'){
  assert.ok(report.imageSaves.length>0,'NO_NATIVE_IMAGE_SAVED');assert.equal(provider.imageFailures.length,0);
  for(const image of report.imageSaves){assert.equal(image.callId,result.callId);assert.equal(image.sessionId,provider.sessionId);assert.ok(provider.images.some((i:any)=>i.toolCallId===image.toolCallId&&i.imageIndex===image.imageIndex&&i.assetId===image.receipt.assetId&&i.fileId===image.receipt.fileId));
   const asset=await owner.getAsset(ctx,image.receipt.assetId);assert.equal(asset.status,'pending');assert.equal(asset.currentFileId,image.receipt.fileId);
   const bytes=await owner.readImageReference(ctx,image.receipt.assetId,image.receipt.fileId,image.receipt.checksum);assert.equal(hash(bytes.bytes),image.receipt.checksum);
   const imageKey=`chat-image-${hash(JSON.stringify([result.callId,image.toolCallId,image.imageIndex]))}`;
   const file=await readCommittedGeneratedAssetFile(opened.db,ctx,imageKey,image.receipt);assert.equal(file.assetStatus,'pending');assert.deepEqual(file.receipt,image.receipt);
   let rejected=false;try{await owner.readImageReference({...ctx,accountId:'t1060-other'},image.receipt.assetId,image.receipt.fileId,image.receipt.checksum);}catch{rejected=true;}assert.equal(rejected,true);
   imageChecks.push({assetId:image.receipt.assetId,fileId:image.receipt.fileId,pending:true,byteChecksumMatch:true,executionAssetReceiptMatch:true,otherAccountRejected:true});
  }
  const rows=await opened.db.select({id:assets.id}).from(assets),files=await opened.db.select({id:assetFiles.id}).from(assetFiles);assert.equal(rows.length,report.imageSaves.length);assert.equal(files.length,report.imageSaves.length);
 }
 report={...report,outcome:'passed',committed,executionStatus:task.status,businessStatus:business?.status,assistantText:receivedText,sessionId:provider.sessionId,providerTurnId:provider.providerTurnId,stopReason:provider.stopReason,usage:provider.usage,toolOutcomes:calls.filter(c=>c.kind==='external_tool').map(c=>({id:c.id,status:c.status,providerResult:c.providerResult,resultText:c.resultText})),calls:calls.map(c=>({id:c.id,kind:c.kind,status:c.status})),candidateResults:results,imageChecks,checks:{formalRunCodexAcpInWorker:true,formalHostDist:true,v2FrozenByOriginalSubmission:true,actualDefaultRequest:true,actualProjectServiceThroughOriginalReadHost:true,originalApprovalLeaseOwnerChecks:true,actualToolOutcomePersisted:true,providerSessionAndTurnPersisted:true,taskAndBusinessSucceeded:true,assistantMessageReadback:true,sameTaskNativeImageChain:mode==='image'}};
}catch(error){
 const calls=submission?await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId)):[];
 report={...report,outcome:'failed',errorCode:(error as any)?.errorCode??(error as any)?.code??(error as any)?.name??'UNKNOWN',errorMessage:String((error as any)?.message??'').slice(0,600),timeout:controller.signal.aborted,receivedText,calls:calls.map(c=>({id:c.id,kind:c.kind,status:c.status,rejectionCode:c.rejectionCode,providerResult:c.providerResult,resultText:c.kind==='external_tool'?c.resultText:undefined}))};process.exitCode=1;
}finally{
 clearTimeout(timer);await writeFile(join(root,'evidence.json'),JSON.stringify(report,null,2));await writeFile(`/tmp/t1060-ai-business/default-codex-v2-${mode}-evidence.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await opened.client.close();
}
