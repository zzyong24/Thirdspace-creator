import {createAiRepository} from '../modules/ai/ai.repository';
import {validateTerminalPlanFailures,validateTerminalToolFailures} from '../modules/execution/workbench-plan.service';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createDb,executionTasks,executionCalls,aiTasks,aiMessages,eq,type Db} from '@creatoros/backend';
import {createExecutionRoute,chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {createProjectsService} from '../modules/projects/projects.service';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createProjectsTransport} from '../modules/projects/projects.transport';
import {ENDPOINTS} from '@creatoros/contract';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createProjectPreparationChat} from '../application/projects/project-preparation-chat';
import {createProjectPreparationApplication} from '../application/projects/project-preparation';
import {buildChatTools,type ChatToolDeps} from '../modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../modules/ai-runtime/chat-tool-definitions';
import {createChatTaskToolHost} from '../modules/ai-runtime/chat-task-tool-host';
import {createChatHostContextReader} from '../modules/ai/chat-host-context.service';
import type {ContextReaders} from '../modules/ai-runtime/chat-assembly-types';
import {createExecutionChatToolPorts} from '../modules/execution/execution-chat-tool-ports.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionGenerationPorts} from '../modules/execution/execution-generation-ports.service';
import {createExecutionCheckpointService} from '../modules/execution/execution-checkpoint.service';
import {createChatTurnCompletionService} from '../modules/ai/chat-turn-completion.service';
import {createAgenticToolBinding} from '../modules/execution/agentic-tool-binding';
import {prepareChatModelMessages} from '../modules/ai-runtime/chat-model-messages';
let db:Db,close:()=>Promise<void>,seq=0;
let clock='2026-10-25T01:00:00.000Z';const now=()=>clock,nextId=(prefix:string)=>`${prefix}-brief-terminal-${++seq}`;
const budget={maxCalls:64,maxTokens:1000000,deadlineMs:1800000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);afterAll(async()=>close?.(),120000);
async function actualTerminal(kind:'empty'|'read_failure'|'mixed'|'readonly_then_empty'|'legacy_empty'){
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,'brief-terminal-user'));
 clock='2026-10-25T01:00:00.000Z';
 const ctx={userId:'brief-terminal-user',accountId:nextId('account'),requestId:'brief-terminal-fixture',source:'user' as const};
 const projects=createProjectsService(createProjectRepository(db),{now,nextId}),project=await projects.createProject(ctx,{title:'隔离完成链路项目',brief:'保留原资料'}),tasks=createPersistentTaskService(db,{now,nextId});
 const native=buildChatTools(['brief.fill','context.project.detail'],{humanizeError:()=>null,getProjectBrief:async()=>{if(kind!=='empty')throw Error('401 unauthorized');return null;}} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(native)).definitions;
 const chat=createProjectPreparationChat(db,{now,nextId,assemble:async(_ctx,snapshot,options)=>({capability:'copilot.assist',system:'隔离测试',messages:chatWorkerInputSchema.shape.messages.parse(await prepareChatModelMessages([{id:snapshot.sourceMessage.id,role:'user',parts:[{type:'text',text:snapshot.sourceMessage.content}]}],{system:'隔离测试',tools:native})),maxSteps:6,maxOutputTokens:128,tools:definitions,executionRoute:options.executionRoute??createExecutionRoute('pi'),hostContext:{schemaVersion:1,chatContext:{surface:'project',projectId:project.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'隔离策略',skills:[{skillId:'chatbox.topic',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'隔离策略',template:'',tools:['brief.fill'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}})});
 const submitBrief=vi.fn(chat.submit),{preparation}=createProjectPreparationApplication(db,{now,nextId,tasks,intelligence:{} as never,submitBrief,readBrief:chat.read,submitProjectTranscript:async()=>{throw Error('禁止转写');}});
 const start=await preparation.start(ctx,project.id,{idempotencyKey:nextId('start'),requestedSteps:['brief']});await preparation.tick({shouldStop:()=>false});
 const history=await createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId}).listConversations({scope:`project:${project.id}`,limit:100,offset:0});expect(history.rows).toHaveLength(1);expect(history.rows[0]!.scope).toBe(`project:${project.id}`);
 const state=await preparation.get(ctx,project.id),childId=state.steps.find(s=>s.name==='brief')!.childTaskId!,claim=await tasks.claimTask({taskId:childId,workerId:'brief-terminal-fixture'});expect(claim).toBeTruthy();
 const ref={executionTaskId:childId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,childId));const frozen=chatWorkerInputSchema.parse((child!.payload as Record<string,unknown>).modelInput);
 // 明确模拟旧任务缺失回执版本；只改隔离测试DB的兼容元数据，不改模型输入或原始账本。
 if(kind==='legacy_empty'){const payload={...child!.payload as Record<string,unknown>};delete payload.toolFailureReceiptVersion;await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,childId));}
 const readers={getProjectBrief:async()=>{if(kind==='read_failure'||kind==='mixed')throw Error('401 unauthorized');return null;},getProjectDetail:async()=>null} as unknown as ContextReaders;
 // 与安装版同一组合工厂和真实冻结租约reader；不得在测试里直接给adapter硬塞版本1。
 const host=await createChatTaskToolHost(createChatHostContextReader(db,{now}),readers)(ctx,frozen,ref,new AbortController().signal);
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget}),ports=createExecutionChatToolPorts(db,{now,budget,tools:host});
 const first=await generation.reserveGenerationCall(ref,{operationKey:`${frozen.operationKey}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,first.callId);
 const inputs=kind==='mixed'?[{},{coreMessage:'合法但读取被拒'}]:[kind==='empty'||kind==='readonly_then_empty'||kind==='legacy_empty'?{}:{coreMessage:'合法但读取被拒'}];
 const commands=inputs.map(input=>({toolName:'brief_fill',input}));if(kind==='readonly_then_empty')commands.unshift({toolName:'context_project_detail',input:{}});
 await generation.settleGenerationCall(ref,{callId:first.callId,status:'settled',usage:{inputTokens:1,outputTokens:1},providerResult:{content:commands.map((command,index)=>({type:'tool-call',toolCallId:`actual-brief-${index}`,toolName:command.toolName,input:JSON.stringify(command.input)})),finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 const toolIds:string[]=[];
 for(let index=0;index<commands.length;index++){
  const tool=await ports.reserve(ref,{modelCallId:first.callId,toolCallId:`actual-brief-${index}`});await ports.start(ref,{callId:tool.callId});const actual=await ports.execute(ref,{callId:tool.callId});toolIds.push(tool.callId);
  if(commands[index]!.toolName==='context_project_detail')expect(actual).toMatchObject({status:'ok',sideEffect:'none'});else expect(actual).toMatchObject({status:'error',sideEffect:'none',error:{code:Object.keys(commands[index]!.input).length||kind==='legacy_empty'?'no_evidence':'invalid_input'}});
 }
 const last=await generation.reserveGenerationCall(ref,{operationKey:`${frozen.operationKey}/model/2`,request:{maxOutputTokens:128}});await ledger.start(ref,last.callId);
 await generation.settleGenerationCall(ref,{callId:last.callId,status:'settled',usage:{inputTokens:1,outputTokens:1},providerResult:{content:[{type:'text',text:'尚未形成可采纳资料，请保留原记录。'}],finishReason:{unified:'stop'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 await createExecutionCheckpointService(db,{now}).save(ref,{expectedRevision:0,expectedLedgerSequence:2+toolIds.length,messages:[{role:'assistant',callId:first.callId},...toolIds.map(callId=>({role:'tool' as const,callId})),{role:'assistant',callId:last.callId}]});
 const binding=createAgenticToolBinding(host),completion=await createChatTurnCompletionService(db,{now,validateTerminalPlanFailures,validateTerminalToolFailures}).commitResult(ref,{lastModelCallId:last.callId,toolCallIds:toolIds},(task,calls,call)=>binding.forCall(task,calls,call));
 expect(completion!.outcome).toBe(kind==='legacy_empty'?'succeeded':'partial');
 const [partial]=await db.select().from(executionTasks).where(eq(executionTasks.id,childId));const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,partial!.ownerId));expect(partial!.status).toBe(kind==='legacy_empty'?'succeeded':'partial');expect(business!.status).toBe(kind==='legacy_empty'?'succeeded':'partial');
 clock='2026-10-25T01:00:05.000Z';
 return {ctx,project,projects,tasks,preparation,parentId:start.preparationTaskId!,childId,submitBrief};
}
it('T1406 真实host→完成partial→父等待补资料；不篡改child成功，显式补充只新建一次',async()=>{
 const f=await actualTerminal('empty');await f.preparation.tick({shouldStop:()=>false});
 const state=await f.preparation.get(f.ctx,f.project.id);expect(state.steps.find(s=>s.name==='brief')).toMatchObject({status:'waiting_user',reasonCode:'BRIEF_INPUT_REQUIRED',childTaskId:f.childId,availableActions:['resume']});
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));expect(parent!.status).toBe('waiting_user');
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId));
 for(let i=0;i<2;i++){clock=new Date(Date.parse(clock)+3000).toISOString();await f.preparation.tick({shouldStop:()=>false});}expect(f.submitBrief).toHaveBeenCalledTimes(1);
 await f.projects.patchProject(f.ctx,f.project.id,{briefDetail:{coreMessage:'用户实际补充的资料'}});const input={idempotencyKey:'actual-partial-supplement',requestedSteps:['brief' as const]};await f.preparation.start(f.ctx,f.project.id,input);await f.preparation.tick({shouldStop:()=>false});
 const next=await f.preparation.get(f.ctx,f.project.id);expect(next.preparationTaskId).toBe(f.parentId);expect(next.steps.find(s=>s.name==='brief')!.childTaskId).not.toBe(f.childId);expect(f.submitBrief).toHaveBeenCalledTimes(2);
 const [retained]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.childId)),[after]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));expect(retained!.status).toBe('partial');expect(after!.deadlineAt).toBe(parent!.deadlineAt);expect(after!.executionBudget).toEqual(parent!.executionBudget);expect((after!.payload as {inputRevision?:number}).inputRevision).toBe(1);
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId))).toEqual(calls);
 await f.preparation.start(f.ctx,f.project.id,input);await f.preparation.tick({shouldStop:()=>false});expect(f.submitBrief).toHaveBeenCalledTimes(2);
});
it('T1406 真实读取错误partial继续原阻断，不当作空资料或允许重发',async()=>{
 const f=await actualTerminal('read_failure');await f.preparation.tick({shouldStop:()=>false});expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')).toMatchObject({status:'blocked',reasonCode:'CHILD_PARTIAL',availableActions:[]});expect(f.submitBrief).toHaveBeenCalledTimes(1);
});

it('T1406 空资料错误夹杂其它失败仍partial阻断，不吞额外错误自动恢复',async()=>{
 const f=await actualTerminal('mixed');await f.preparation.tick({shouldStop:()=>false});
 expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')).toMatchObject({status:'blocked',reasonCode:'CHILD_PARTIAL',availableActions:[]});expect(f.submitBrief).toHaveBeenCalledTimes(1);
});

it('T1406 已冻结成功只读context回执不阻断真实空资料等待，仍保partial',async()=>{
 const f=await actualTerminal('readonly_then_empty');await f.preparation.tick({shouldStop:()=>false});
 expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')).toMatchObject({status:'waiting_user',reasonCode:'BRIEF_INPUT_REQUIRED',childTaskId:f.childId});
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.childId));expect(child!.status).toBe('partial');expect(f.submitBrief).toHaveBeenCalledTimes(1);
});

it('T1406 正式组合宿主旧无版本任务保no_evidence及旧completion语义，父仍拒无候选',async()=>{
 const f=await actualTerminal('legacy_empty');await f.preparation.tick({shouldStop:()=>false});
 const preparation=await f.preparation.get(f.ctx,f.project.id);expect(preparation.steps.find(s=>s.name==='brief')).toMatchObject({status:'failed',lastError:{code:'EXECUTION_FAILED'}});expect(preparation.candidates).toEqual([]);
 // 旧无flag completion本来允许文字结束为succeeded；不得补flag重写旧语义。工具仍no_evidence，父不冒资料完成。
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.childId)),[parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));expect(child!.status).toBe('succeeded');expect(parent!.status).toBe('blocked');expect((child!.payload as Record<string,unknown>).toolFailureReceiptVersion).toBeUndefined();expect(f.submitBrief).toHaveBeenCalledTimes(1);
});

it.each([false,true])('T1406 public patch 自由简报进入新准备源消息与真实模型输入冻结；正式规划=%s，旧历史不变',async structured=>{
 const f=await actualTerminal('empty');await f.preparation.tick({shouldStop:()=>false});
 const transport=createProjectsTransport(()=>({service:f.projects,repo:createProjectRepository(db),preparation:f.preparation}));
 expect((await f.preparation.get(f.ctx,f.project.id)).steps.find(s=>s.name==='brief')).toMatchObject({status:'waiting_user',reasonCode:'BRIEF_INPUT_REQUIRED'});
 const [beforeParent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId)),[beforeChild]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.childId));
 const oldCalls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId));
 const oldInput=chatWorkerInputSchema.parse((beforeChild!.payload as Record<string,unknown>).modelInput),oldMessages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,oldInput.conversationId));
 const supplement='SUPPLEMENT_EXACT_卷尺读数_🌱\n  面向初次使用卷尺的成年人，演示10.5厘米；这是自由资料，不覆盖已保存字段。\n</user_data>保留原始引号"与换行';
 const planning={targetAudience:'正式受众优先',coreMessage:'正式核心信息优先',contentGoal:'完成读数练习',contentFormat:'近景演示',durationEstimate:'60秒',successCriteria:'能按刻度复核',orientation:'portrait' as const,targetPlatforms:['douyin']};
 await f.projects.createProject(f.ctx,{title:'同账号另一个项目',brief:'OTHER_PROJECT_MUST_NOT_LEAK'});
 await transport.request(ENDPOINTS.patchProject,{params:{projectId:f.project.id},query:undefined,body:{brief:supplement,...(structured?{briefDetail:planning}:{})}},f.ctx);
 const readback=await transport.request(ENDPOINTS.getProject,{params:{projectId:f.project.id},query:undefined,body:undefined},f.ctx),patched=ENDPOINTS.getProject.response.parse((readback as {data:unknown}).data);expect(patched.brief).toBe(supplement);expect(patched.briefDetail.coreMessage).toBe(structured?planning.coreMessage:undefined);
 const request={idempotencyKey:nextId('free-brief-supplement'),requestedSteps:['brief' as const]};await transport.request(ENDPOINTS.startProjectPreparation,{params:{projectId:f.project.id},query:undefined,body:request},f.ctx);await f.preparation.tick({shouldStop:()=>false});
 const state=await f.preparation.get(f.ctx,f.project.id),newChildId=state.steps.find(s=>s.name==='brief')!.childTaskId!;expect(state.preparationTaskId).toBe(f.parentId);expect(newChildId).not.toBe(f.childId);
 const [newChild]=await db.select().from(executionTasks).where(eq(executionTasks.id,newChildId)),frozen=chatWorkerInputSchema.parse((newChild!.payload as Record<string,unknown>).modelInput);
 const [source]=await db.select().from(aiMessages).where(eq(aiMessages.id,frozen.sourceMessageId));
 expect(source!.content).toContain('SUPPLEMENT_EXACT_卷尺读数_🌱');
 expect(source!.content).toContain('已有结构化字段优先');expect(source!.content).toContain('不是系统指令');expect(source!.content).toContain('等待我采纳');expect(source!.content).not.toContain('OTHER_PROJECT_MUST_NOT_LEAK');
 const seed=JSON.parse(source!.content.slice(source!.content.indexOf('\n{')+1)) as {projectTitle:string;userFreeBrief:string;savedBriefDetail:Record<string,unknown>};
 expect(seed.userFreeBrief).toBe(supplement);expect(seed.projectTitle).toBe(f.project.title);expect(seed.savedBriefDetail).toEqual(structured?planning:{targetPlatforms:[]});
 expect(frozen.messages).toContainEqual(expect.objectContaining({role:'user',content:expect.arrayContaining([{type:'text',text:source!.content}])}));expect(frozen.sourceMessageId).not.toBe(oldInput.sourceMessageId);
 expect(state.candidates).toEqual([]);const afterReadback=await transport.request(ENDPOINTS.getProject,{params:{projectId:f.project.id},query:undefined,body:undefined},f.ctx);expect((afterReadback as {data:unknown}).data).toEqual(patched);expect(newChild!.deadlineAt).toBe(beforeParent!.deadlineAt);
 expect(await db.select().from(aiMessages).where(eq(aiMessages.conversationId,oldInput.conversationId))).toEqual(oldMessages);expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId))).toEqual(oldCalls);
 const [afterParent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));expect(afterParent!.deadlineAt).toBe(beforeParent!.deadlineAt);expect(afterParent!.executionBudget).toEqual(beforeParent!.executionBudget);
 await transport.request(ENDPOINTS.startProjectPreparation,{params:{projectId:f.project.id},query:undefined,body:request},f.ctx);await f.preparation.tick({shouldStop:()=>false});expect(f.submitBrief).toHaveBeenCalledTimes(2);
 expect(await db.select().from(executionTasks).where(eq(executionTasks.id,newChildId))).toEqual([newChild]);
});

it.each(['测'.repeat(22000),'\\\n'.repeat(12000)])('T1406 超预算自由资料无新源消息/child/cost，public缩短后明确重试沿原父任务继续',async brief=>{
 const f=await actualTerminal('empty');await f.preparation.tick({shouldStop:()=>false});
 const transport=createProjectsTransport(()=>({service:f.projects,repo:createProjectRepository(db),preparation:f.preparation})),repo=createAiRepository(db,{userId:f.ctx.userId,accountId:f.ctx.accountId,now,nextId});
 const history=await repo.listConversations({scope:`project:${f.project.id}`,limit:100,offset:0}),[parentBefore]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));
 const oldMessages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,history.rows[0]!.id)),oldCalls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId));
 await transport.request(ENDPOINTS.patchProject,{params:{projectId:f.project.id},query:undefined,body:{brief}},f.ctx);
 await transport.request(ENDPOINTS.startProjectPreparation,{params:{projectId:f.project.id},query:undefined,body:{idempotencyKey:nextId('oversize'),requestedSteps:['brief']}},f.ctx);await f.preparation.tick({shouldStop:()=>false});
 const blocked=await f.preparation.get(f.ctx,f.project.id);expect(blocked.preparationTaskId).toBe(f.parentId);expect(blocked.steps.find(s=>s.name==='brief')).toMatchObject({status:'failed',childTaskId:null,availableActions:['retry'],lastError:{message:expect.stringContaining('64 KiB')}});expect(blocked.candidates).toEqual([]);
 expect((await f.projects.getProject(f.ctx,f.project.id)).brief).toBe(brief);expect((await repo.listConversations({scope:`project:${f.project.id}`,limit:100,offset:0})).rows).toHaveLength(1);expect(await db.select().from(aiTasks).where(eq(aiTasks.projectId,f.project.id))).toHaveLength(1);
 expect(await db.select().from(aiMessages).where(eq(aiMessages.conversationId,history.rows[0]!.id))).toEqual(oldMessages);expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.childId))).toEqual(oldCalls);
 await transport.request(ENDPOINTS.patchProject,{params:{projectId:f.project.id},query:undefined,body:{brief:'SHORT_EXPLICIT_缩短后保留真实卷尺练习资料'}},f.ctx);
 await transport.request(ENDPOINTS.startProjectPreparation,{params:{projectId:f.project.id},query:undefined,body:{idempotencyKey:nextId('shortened'),requestedSteps:['brief']}},f.ctx);await f.preparation.tick({shouldStop:()=>false});
 const recovered=await f.preparation.get(f.ctx,f.project.id),newChildId=recovered.steps.find(s=>s.name==='brief')!.childTaskId!;expect(recovered.preparationTaskId).toBe(f.parentId);expect(newChildId).toBeTruthy();expect(newChildId).not.toBe(f.childId);expect(await db.select().from(aiTasks).where(eq(aiTasks.projectId,f.project.id))).toHaveLength(2);
 const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));expect(after!.deadlineAt).toBe(parentBefore!.deadlineAt);expect(after!.executionBudget).toEqual(parentBefore!.executionBudget);
});
