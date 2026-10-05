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

import {createCurrentArtifactReader,extractArtifactText} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/context/current-artifact.ts';
import {runExternalChatInWorker} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/execution/external-chat-worker-run.ts';
const root=await mkdtemp('/tmp/t1060-ai-business/continue-codex/business-');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString(),deps={now,nextId:(p:string)=>`${p}-t1060-${randomUUID()}`};
const opened=await createDb({dataDir:join(root,'db')});
const unavailable=async()=>{throw Error('UNUSED_PORT_NOT_INSTALLED');};
let ctx:any,repo:any,conversation:any;
let report:any={verification:'formal-codex-saved-script-content-followup-cancel',observedAt:now(),isolatedRoot:root,model:'original default; no sessionModel override',adopted:false,published:false,articleWorkbenchEntryVerified:false,graphicWorkbenchEntryVerified:false,rounds:[]};
try{

 const identity=createIdentityService(createIdentityRepository(opened.db,deps),deps);
 const user=await identity.register({email:`${randomUUID()}@t1060.invalid`,password:randomUUID(),displayName:'T1060 正式默认 v2 验证'});
 const base=await identity.resolveContextFromToken(user.rawToken);
 const account=await createPlatformAccountService({db:opened.db,...deps}).createAccount(base,{platform:'xiaohongshu',accountHandle:'T1060 隔离 v2 业务验证'});
 ctx={...base,accountId:account.id};
 const projects=createProjectsService(createProjectRepository(opened.db),deps);
 // 真领域实体；随机后缀只在创建项目时提供，未向模型的消息或system泄露真实标题。
 const title=`夜航灯塔 · ${randomUUID().slice(0,8)}`;
 const project=await projects.createProject(ctx,{title,brief:'本项目用于默认模型读取和图片候选验证；禁止采纳与发布。'});
 const artifacts=createArtifactsService({db:opened.db,...deps,assertProjectOwned:(c,id)=>projects.getProject(c,id)});
 const publishing=createPublishingService({db:opened.db,...deps,listOutputIdsByProject:(c,id)=>projects.listOutputIdsByProject(c,id)});
const inherited={title,summary:'用灯塔与夜航说明先确认内容，再衍生成文章和图文。',tags:['夜航','内容创作']};
 const scriptText=`标题：${inherited.title}\n简介：${inherited.summary}\n标签：${inherited.tags.join('、')}\n\n第一段：小船在夜里出航。海面是蓝的，灯塔的光是暖橙色的。\n第二段：船长先确认航线，文章和图文如同不同航图，来自同一份已确认脚本。\n第三段：抵达前还要检查航图。AI给出候选，人可以继续修改，不代表已经发布。`;
 const script=await artifacts.createArtifact(ctx,{projectId:project.id,title:inherited.title,artifactType:'output_script',stage:'script',initialContentText:scriptText});
 const originalVersions=await artifacts.listVersions(ctx,script.id);
 const currentReader=createCurrentArtifactReader({projectsService:projects,artifactsService:artifacts});
 const review=createReviewSubjectContext({projectsService:projects,publishingService:publishing,artifactsService:artifacts,analyticsService:{getPublicationAnalytics:unavailable},candidateService:{listCommentsForPublication:unavailable},selectReadableProjectScriptArtifact:()=>{throw Error('UNUSED_PORT_NOT_INSTALLED');},readProjectRadarDraftSeed:unavailable} as any);
 const readers=createChatProjectsReaders({projectsService:projects,publishingService:publishing,artifactsService:artifacts,listRecentProjects:unavailable,searchProjects:unavailable,contentRadarDraftSeedOf:()=>null,extractArtifactText,makeReviewSubjectReader:()=>review,readProjectRadarDraftSeed:unavailable,readCurrentArtifactTruth:currentReader} as any);
 const prototypes=buildChatTools(['context.project.detail','context.artifact.text'],createChatReadToolBindings(ctx,readers as any,{boundProjectId:project.id}) as any);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;assert.equal(definitions[0]?.effect,'none');
 registerAllTemplates();
 const settings=createSettingsRepository(opened.db,deps);
 const resolveSnapshot=createEffectiveSkillSnapshotResolver({officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'creatoros-platform-policy-v1',text:['AI 只能产生候选；真实数据写入必须经过用户确认和后端服务端口。','不得编造指标、来源、执行结果或已保存状态；缺失数据必须如实标空。','工具只允许使用 effective Skill 白名单与当前账号授权范围的交集。'].join('\n')})},accountOverlays:{listBySkillIds:(c,ids)=>settings.listAccountSkillOverlays(c,ids)},now});
 const skillSnapshot=await resolveSnapshot(ctx,['chatbox.topic']);
 const hostContext={schemaVersion:1,chatContext:{surface:'project',projectId:project.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot};
 repo=createAiRepository(opened.db,{...deps,userId:ctx.userId,accountId:ctx.accountId});
 conversation=await repo.createConversation({title:'真实已保存脚本的衍生与后续修改',projectId:project.id,scope:'project'});

 report.projectId=project.id;report.artifactId=script.id;report.sourceVersionId=script.currentVersionId;report.expectedMetadata=inherited;
 const storage=createLocalFsObjectStorage({rootPath:join(root,'objects'),publicBaseUrl:'/blob'},{nextKey:()=>`t1060-${randomUUID()}`});
 const turns=createExternalChatTurnService(opened.db,{now,budget:{maxCalls:12,maxTokens:100000,deadlineMs:180000},objectStorageForCtx:async()=>storage});
 const tasks=createPersistentTaskService(opened.db,{now});
 const tools=createExternalTaskToolService(opened.db,{now});
 async function round(label:string,prompt:string,cancel=false){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
  let cancelTimer:ReturnType<typeof setTimeout>|undefined;
  const entry:any={label,events:[],toolCalls:[],cancelRequested:false,startedAt:now()};report.rounds.push(entry);
  try{
   const source=await repo.createMessage(conversation.id,{role:'user',content:prompt,attachments:[],modelMetadata:{}});
   const persisted=await repo.listMessages(conversation.id);
   const messages=persisted.filter((m:any)=>m.role==='user'||m.role==='assistant').map((m:any)=>({role:m.role,content:m.content}));
   const submission=await createChatTurnSubmissionService(opened.db,{now,assertProject:(c,id)=>projects.getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'这是隔离的真实编导创作验证。使用只读工具读取已保存的主脚本；只输出聊天候选，禁止采用或发布。需要结构化结果时直接输出JSON，不添加代码围栏或前言。',messages,maxSteps:8,maxOutputTokens:2048,tools:cancel?[]:definitions,...(cancel?{}:{hostContext})}) as any}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex'});
   const workerId=`t1060-continue-${label}`;
   const claim=await tasks.claimTask({taskId:submission.executionTaskId,workerId,leaseSeconds:600});assert.ok(claim);
   const ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
   const frozen=chatWorkerInputSchema.parse(claim.payload.modelInput);
   assert.equal(frozen.externalAgentBinding?.policy,'creatoros-acp-readonly-v2');
   entry.executionTaskId=submission.executionTaskId;entry.businessTaskId=submission.taskId;entry.historyMessageCount=messages.length;
   const host=cancel?{}:await createChatReadTaskToolHost(createChatHostContextReader(opened.db,{now}),readers as any)(ctx,frozen,ref,controller.signal);
   let receivedText='';
   const call=async(port:string,data:any,signal?:AbortSignal)=>{
    entry.events.push(port);console.log(JSON.stringify({label,event:port,at:now()}));
    if(port==='reserveExternalChatTurn')return turns.reserve(ref,data);
    if(port==='startExternalChatTurn')return turns.start(ref,data);
    if(port==='recordExternalChatProviderTurn'){
     const saved=await turns.recordProviderTurn(ref,data);
     if(cancel&&!cancelTimer)cancelTimer=setTimeout(()=>{entry.cancelRequested=true;entry.cancelAt=now();controller.abort();},500);
     return saved;
    }
    if(port==='settleExternalChatTurn')return turns.settle(ref,data);
    if(port==='listExternalTaskTools')return tools.list(ref,data,host);
    if(port==='executeExternalTaskTool'){const result=await tools.execute(ref,data,host,signal??controller.signal);entry.toolCalls.push({toolName:data.toolName,toolCallId:data.toolCallId,input:data.input,result});return result;}
    if(port==='recoverExternalChatImage')return turns.recoverImage(ref,data,signal);
    if(port==='saveExternalChatImage')throw Error('UNREQUESTED_IMAGE');
    throw Error('UNEXPECTED_PORT');
   };
   let result:any,error:any;
   const start=Date.now();
   try{result=await runExternalChatInWorker(frozen,controller.signal,call as any,chunk=>{receivedText+=chunk;});}
   catch(e){error=e;}
   entry.elapsedMs=Date.now()-start;
   if(cancel){
    assert.ok(entry.cancelRequested,'CANCEL_NOT_TRIGGERED');assert.ok(error,'CANCEL_DID_NOT_STOP');
    entry.errorCode=error.errorCode;entry.errorClass=error.failureClass;
    const before=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
    assert.equal(before.length,1);assert.equal(before[0]?.status,'unknown');
    const provider=before[0]?.providerResult as any;assert.ok(provider.sessionId);assert.ok(provider.providerTurnId);
    let retryError:any;const retryEvents:string[]=[];
    try{await runExternalChatInWorker(frozen,new AbortController().signal,(async(port:string,data:any)=>{retryEvents.push(port);if(port==='reserveExternalChatTurn')return turns.reserve(ref,data);throw Error('REPLAY_MUST_NOT_ENTER_PROVIDER');}) as any);}catch(e){retryError=e;}
    assert.equal(retryError?.errorCode,'CODEX_ACP_RESTORE_REQUIRES_RECONCILIATION');assert.deepEqual(retryEvents,['reserveExternalChatTurn']);
    const after=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));assert.equal(after.length,1);assert.equal(after[0]?.status,'unknown');
    entry.receipt={callId:before[0]?.id,sessionId:provider.sessionId,providerTurnId:provider.providerTurnId,callStatus:'unknown'};
    entry.replay={errorCode:retryError.errorCode,events:retryEvents,providerResent:false,callCount:after.length};
    entry.remoteCancellationConfirmed=false;entry.receivedText=receivedText;entry.outcome='passed';
    return;
   }
   if(error)throw error;
   const committed=await turns.commit(ref,{callId:result.callId});
   const calls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   const native=calls.find(c=>c.id===result.callId),provider=native?.providerResult as any;
   assert.equal(native?.status,'settled');assert.equal(provider.stopReason,'end_turn');assert.ok(provider.sessionId);assert.ok(provider.providerTurnId);
   const task=await tasks.get(ctx,submission.executionTaskId);assert.equal(task.status,'succeeded');
   const messagesAfter=await repo.listMessages(conversation.id);assert.ok(messagesAfter.some((m:any)=>m.role==='assistant'&&m.content===receivedText));
   const reads=entry.toolCalls.filter((c:any)=>c.toolName==='context.artifact.text'&&c.result.status==='settled'&&c.result.outcome.status==='ok');
   assert.ok(reads.length,'REAL_SAVED_SCRIPT_NOT_READ');
   const raw=reads[0].result.outcome.data;assert.equal(raw.currentVersionId,script.currentVersionId);assert.equal(raw.contentHash,hash(scriptText));
   const startJson=receivedText.indexOf('{'),endJson=receivedText.lastIndexOf('}');
   const draft=JSON.parse(receivedText.slice(startJson,endJson+1));
   assert.deepEqual(draft.metadata,inherited);assert.ok(Array.isArray(draft.articleSections));assert.ok(draft.articleSections.length>=2);
   const pages=label==='initial'?3:2;assert.equal(draft.graphicPages.length,pages);
   assert.ok(draft.articleSections.every((section:any)=>typeof section.body==='string'&&section.body.trim()));assert.ok(draft.graphicPages.every((page:any)=>page.title&&page.text));
   entry.receipt={callId:result.callId,sessionId:provider.sessionId,providerTurnId:provider.providerTurnId,stopReason:provider.stopReason};
   entry.committed=committed;entry.executionStatus=task.status;entry.assistantText=receivedText;entry.draft=draft;
   entry.checks={realSavedScriptRead:true,exactMetadataInherited:true,articleSectionsNonempty:true,graphicPageCount:pages,assistantPersisted:true,originalSourceUnchanged:true};entry.outcome='passed';
  }finally{clearTimeout(timeout);if(cancelTimer)clearTimeout(cancelTimer);entry.finishedAt=now();await writeFile(join(root,'evidence.partial.json'),JSON.stringify(report,null,2));}
 }
 await round('initial','请先用 context.project.detail 查看当前项目产物类型，再用 context.artifact.text 读取已保存脚本。仅依据脚本，在聊天中生成可继续编辑的文章与图文候选。输出JSON，类型固定：metadata={title:string,summary:string,tags:string[]}。title和summary逐字沿用；tags必须是字符串数组，每个标签与脚本一致，不能返回拼接字符串。articleSections为至少2段heading/body；graphicPages恰好3页，每页有title/text。不添加事实数字，不保存到正式稿、不发布。');
 await round('followup','基于上一条候选继续修改，同时重新读取已保存脚本确认来源。保留metadata的title、summary、tags不变，类型固定为title:string、summary:string、tags:string[]；文章改成2段heading/body并用更口语化的表达；图文压成恰好2页title/text。输出与上一条相同字段的JSON，保留“AI给候选、用户可修改”的意思，不保存正式稿、不发布。');
 await round('cancel','请写一篇3000字的夜航故事，只输出正文、不调用工具。',true);
 const saved=await artifacts.getArtifact(ctx,script.id),versions=await artifacts.listVersions(ctx,script.id);assert.equal(saved.currentVersionId,script.currentVersionId);assert.equal(versions.length,originalVersions.length);assert.equal(versions[0]?.contentText,scriptText);
 report.outcome='passed';report.checks={formalExecutionRoute:true,defaultRealModel:true,savedScriptImmutable:true,originalVersionCount:versions.length,consecutiveChatContext:true,cancelPreservedUnknown:true,noUnknownReplay:true,adopted:false,published:false};
}catch(error){report.outcome='failed';report.errorCode=(error as any)?.errorCode??(error as any)?.name;report.errorMessage=String((error as any)?.message??'').slice(0,1200);process.exitCode=1;}
finally{await writeFile(join(root,'evidence.json'),JSON.stringify(report,null,2));await writeFile('/tmp/t1060-ai-business/continue-codex/evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify({outcome:report.outcome,errorCode:report.errorCode,errorMessage:report.errorMessage,root,rounds:report.rounds.map((r:any)=>({label:r.label,outcome:r.outcome,receipt:r.receipt,elapsedMs:r.elapsedMs}))}));await opened.client.close();}
