import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createDb,executionTasks,executionCalls,aiTasks,aiTaskResults,eq} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/index.ts';
import {createIdentityRepository,createIdentityService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/identity/index.ts';
import {createPlatformAccountService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/platform-account/index.ts';
import {createProjectRepository,createProjectsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/projects/index.ts';
import {createAiRepository,createChatTurnSubmissionService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/index.ts';
import {createExternalChatTurnService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/external-chat-turn.service.ts';
import {createExternalTaskToolService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/external-task-tool.service.ts';
import {createPersistentTaskService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/execution/index.ts';
import {createLocalFsObjectStorage} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/assets/index.ts';
import {runCodexAcpInWorker} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/execution/codex-acp-worker-run.ts';
import {chatWorkerInputSchema} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/contract/src/internal/execution-worker.ts';

const root=await mkdtemp('/tmp/t1060-ai-business/v2-default-codex-text-');
const now=()=>new Date().toISOString(),deps={now,nextId:(prefix:string)=>`${prefix}-t1060-${randomUUID()}`};
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
const opened=await createDb({dataDir:join(root,'db')});
let report:any={verification:'original-worker-default-codex-v2-public-text-chain',observedAt:now(),isolatedRoot:root,modelSelection:'当前本地Codex默认；没有设置sessionModel',adopted:false,published:false,toolMap:'empty',events:[]};
try{
 const identity=createIdentityService(createIdentityRepository(opened.db,deps),deps);
 const user=await identity.register({email:`${randomUUID()}@t1060.invalid`,password:randomUUID(),displayName:'T1060 默认编导真实回执'});
 const base=await identity.resolveContextFromToken(user.rawToken);
 const account=await createPlatformAccountService({db:opened.db,...deps}).createAccount(base,{platform:'xiaohongshu',accountHandle:'T1060 隔离文本验证'});
 const ctx={...base,accountId:account.id};
 const projects=createProjectsService(createProjectRepository(opened.db),deps);
 const project=await projects.createProject(ctx,{title:'T1060 临时真实 AI 验证',brief:'仅验证默认编导的文本请求回执，不采用作品、不发布。'});
 const repo=createAiRepository(opened.db,{...deps,userId:ctx.userId,accountId:ctx.accountId});
 const conversation=await repo.createConversation({title:'默认 Codex 实际文本',projectId:project.id,scope:'project'});
 const source=await repo.createMessage(conversation.id,{role:'user',content:'这是隔离的真实请求验证。请只回复一句：临时项目文本验证完成。不要调用工具、不要访问或修改任何文件。',attachments:[],modelMetadata:{}});
 const submission=await createChatTurnSubmissionService(opened.db,{now,assertProject:(c,id)=>projects.getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'验证原默认编导纯文本完整执行链。仅回答当前消息，所有工具为空。',messages:[{role:'user',content:source.content}],maxSteps:6,maxOutputTokens:256,tools:[]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex'});
 const tasks=createPersistentTaskService(opened.db,{now}),claim=await tasks.claimTask({taskId:submission.executionTaskId,workerId:'t1060-real-text',leaseSeconds:300});assert.ok(claim);
 const ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const frozen=chatWorkerInputSchema.parse(claim.payload.modelInput);
 const storage=createLocalFsObjectStorage({rootPath:join(root,'objects'),publicBaseUrl:'/blob'},{nextKey:()=>`t1060-${randomUUID()}`});
 const turns=createExternalChatTurnService(opened.db,{now,budget:{maxCalls:6,maxTokens:100000,deadlineMs:120000},objectStorageForCtx:async()=>storage});
 const tools=createExternalTaskToolService(opened.db,{now});
 const call=async(port:string,data:any,signal?:AbortSignal)=>{
  report.events.push(port);
  if(port==='reserveExternalChatTurn')return turns.reserve(ref,data);
  if(port==='startExternalChatTurn')return turns.start(ref,data);
  if(port==='recordExternalChatProviderTurn')return turns.recordProviderTurn(ref,data);
  if(port==='settleExternalChatTurn')return turns.settle(ref,data);
  if(port==='recoverExternalChatImage')return turns.recoverImage(ref,data,signal);
  if(port==='saveExternalChatImage')return turns.saveImage(ref,data,signal);
  if(port==='listExternalTaskTools')return tools.list(ref,data,{});
  if(port==='executeExternalTaskTool')return tools.execute(ref,data,{},signal??controller.signal);
  throw Error('OUT_OF_SCOPE_PORT');
 };
 report.projectId=project.id;report.taskId=submission.taskId;report.executionTaskId=submission.executionTaskId;
 let receivedText='';let result:any;
 try{result=await runCodexAcpInWorker(frozen,controller.signal,call as any,chunk=>{receivedText+=chunk;});}
 catch(error){
  const calls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  const task=await tasks.get(ctx,submission.executionTaskId);
  report={...report,outcome:'failed',errorCode:(error as any)?.errorCode??'UNKNOWN',timeout:controller.signal.aborted,receivedTextLength:receivedText.length,taskStatus:task.status,calls:calls.map(c=>({id:c.id,kind:c.kind,status:c.status,rejectionCode:c.rejectionCode,providerTurnRecorded:Boolean((c.providerResult as any)?.providerTurnId),protocolKind:(c.providerResult as any)?.protocolKind,sessionId:(c.providerResult as any)?.sessionId}))};throw error;
 }
 const committed=await turns.commit(ref,{callId:result.callId});
 const messages=await repo.listMessages(conversation.id);
 const task=await tasks.get(ctx,submission.executionTaskId);
 const [business]=await opened.db.select({status:aiTasks.status}).from(aiTasks).where(eq(aiTasks.id,submission.taskId));
 const results=await opened.db.select({id:aiTaskResults.id,executionCallId:aiTaskResults.executionCallId,resultType:aiTaskResults.resultType}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submission.taskId));
 const calls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
 const assistant=messages.filter(m=>m.role==='assistant');assert.equal(assistant.length,1);assert.equal(task.status,'succeeded');assert.equal(business?.status,'succeeded');assert.equal(calls.length,1);assert.equal(calls[0]?.status,'settled');assert.equal(calls[0]?.kind,'external_agent');assert.equal(results.length,1);assert.equal(results[0]?.executionCallId,result.callId);assert.ok(assistant[0]?.content.trim());assert.equal(assistant[0]?.content,receivedText);
 const provider=(calls[0]?.providerResult??{}) as any;assert.equal(provider.stopReason,'end_turn');assert.ok(provider.sessionId);assert.ok(provider.providerTurnId);
 report={...report,outcome:'passed',committed,executionStatus:task.status,businessStatus:business?.status,conversationMessageCount:messages.length,assistantText:assistant[0]?.content,actualEngine:(assistant[0]?.modelMetadata as any)?.actualEngine,protocolKind:provider.protocolKind,protocolVersion:provider.protocolVersion,sessionId:provider.sessionId,providerTurnId:provider.providerTurnId,stopReason:provider.stopReason,usage:provider.usage,callCount:calls.length,externalToolCallCount:0,candidateResultCount:results.length,checks:{actualDefaultRequest:true,originalRunCodexAcpInWorker:true,originalReserveStartTurnSettleCommit:true,providerIdentityPersisted:true,taskAndBusinessSucceeded:true,assistantReadbackMatchesStream:true,realIsolatedProjectAndAccount:true}};
}catch(error){if(report.outcome!=='failed')report={...report,outcome:'failed',errorCode:(error as any)?.code??(error as any)?.errorCode??(error as any)?.name??'UNKNOWN'};process.exitCode=1;}
finally{clearTimeout(timer);await writeFile(join(root,'evidence.json'),JSON.stringify(report,null,2));await writeFile('/tmp/t1060-ai-business/v2-default-codex-text-evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await opened.client.close();}
