import {createAiRepository} from '../modules/ai/ai.repository';
import {validateTerminalPlanFailures,validateTerminalToolFailures} from '../modules/execution/workbench-plan.service';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createDb,executionTasks,executionCalls,aiTasks,eq,type Db} from '@creatoros/backend';
import {createExecutionRoute,chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {createProjectsService} from '../modules/projects/projects.service';
import {createProjectRepository} from '../modules/projects/projects.repository';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createProjectPreparationChat} from '../application/projects/project-preparation-chat';
import {createProjectPreparationApplication} from '../application/projects/project-preparation';
import {buildChatTools,type ChatToolDeps} from '../modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../modules/ai-runtime/chat-tool-definitions';
import {createChatHostToolAdapter} from '../modules/ai-runtime/chat-host-tool-adapter';
import {createExecutionChatToolPorts} from '../modules/execution/execution-chat-tool-ports.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionGenerationPorts} from '../modules/execution/execution-generation-ports.service';
import {createExecutionCheckpointService} from '../modules/execution/execution-checkpoint.service';
import {createChatTurnCompletionService} from '../modules/ai/chat-turn-completion.service';
import {createAgenticToolBinding} from '../modules/execution/agentic-tool-binding';
let db:Db,close:()=>Promise<void>,seq=0;
let clock='2026-10-25T01:00:00.000Z';const now=()=>clock,nextId=(prefix:string)=>`${prefix}-brief-terminal-${++seq}`;
const budget={maxCalls:64,maxTokens:1000000,deadlineMs:1800000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);afterAll(async()=>close?.(),120000);
async function actualTerminal(kind:'empty'|'read_failure'|'mixed'|'readonly_then_empty'){
 await db.update(executionTasks).set({status:'cancelled',leaseOwner:null,leaseExpiresAt:null}).where(eq(executionTasks.userId,'brief-terminal-user'));
 clock='2026-10-25T01:00:00.000Z';
 const ctx={userId:'brief-terminal-user',accountId:nextId('account'),requestId:'brief-terminal-fixture',source:'user' as const};
 const projects=createProjectsService(createProjectRepository(db),{now,nextId}),project=await projects.createProject(ctx,{title:'隔离完成链路项目',brief:'保留原资料'}),tasks=createPersistentTaskService(db,{now,nextId});
 const native=buildChatTools(['brief.fill','context.project.detail'],{humanizeError:()=>null,getProjectBrief:async()=>{if(kind!=='empty')throw Error('401 unauthorized');return null;}} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(native)).definitions,host=await createChatHostToolAdapter(native,async()=>native,{'brief.fill':'proposal','context.project.detail':'none'},{toolFailureReceiptVersion:1});
 const chat=createProjectPreparationChat(db,{now,nextId,assemble:async(_ctx,_snapshot,options)=>({capability:'copilot.assist',system:'隔离测试',messages:[{role:'user',content:'仅验证结构边界'}],maxSteps:6,maxOutputTokens:128,tools:definitions,executionRoute:options.executionRoute??createExecutionRoute('pi'),hostContext:{schemaVersion:1,chatContext:{surface:'project',projectId:project.id},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'隔离策略',skills:[{skillId:'chatbox.topic',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'隔离策略',template:'',tools:['brief.fill'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}})});
 const submitBrief=vi.fn(chat.submit),{preparation}=createProjectPreparationApplication(db,{now,nextId,tasks,intelligence:{} as never,submitBrief,readBrief:chat.read,submitProjectTranscript:async()=>{throw Error('禁止转写');}});
 const start=await preparation.start(ctx,project.id,{idempotencyKey:nextId('start'),requestedSteps:['brief']});await preparation.tick({shouldStop:()=>false});
 const history=await createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId}).listConversations({scope:`project:${project.id}`,limit:100,offset:0});expect(history.rows).toHaveLength(1);expect(history.rows[0]!.scope).toBe(`project:${project.id}`);
 const state=await preparation.get(ctx,project.id),childId=state.steps.find(s=>s.name==='brief')!.childTaskId!,claim=await tasks.claimTask({taskId:childId,workerId:'brief-terminal-fixture'});expect(claim).toBeTruthy();
 const ref={executionTaskId:childId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
 const [child]=await db.select().from(executionTasks).where(eq(executionTasks.id,childId));const frozen=chatWorkerInputSchema.parse((child!.payload as Record<string,unknown>).modelInput);
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget}),ports=createExecutionChatToolPorts(db,{now,budget,tools:host});
 const first=await generation.reserveGenerationCall(ref,{operationKey:`${frozen.operationKey}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,first.callId);
 const inputs=kind==='mixed'?[{},{coreMessage:'合法但读取被拒'}]:[kind==='empty'||kind==='readonly_then_empty'?{}:{coreMessage:'合法但读取被拒'}];
 const commands=inputs.map(input=>({toolName:'brief_fill',input}));if(kind==='readonly_then_empty')commands.unshift({toolName:'context_project_detail',input:{}});
 await generation.settleGenerationCall(ref,{callId:first.callId,status:'settled',usage:{inputTokens:1,outputTokens:1},providerResult:{content:commands.map((command,index)=>({type:'tool-call',toolCallId:`actual-brief-${index}`,toolName:command.toolName,input:JSON.stringify(command.input)})),finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 const toolIds:string[]=[];
 for(let index=0;index<commands.length;index++){
  const tool=await ports.reserve(ref,{modelCallId:first.callId,toolCallId:`actual-brief-${index}`});await ports.start(ref,{callId:tool.callId});const actual=await ports.execute(ref,{callId:tool.callId});toolIds.push(tool.callId);
  if(commands[index]!.toolName==='context_project_detail')expect(actual).toMatchObject({status:'ok',sideEffect:'none'});else expect(actual).toMatchObject({status:'error',sideEffect:'none',error:{code:Object.keys(commands[index]!.input).length?'no_evidence':'invalid_input'}});
 }
 const last=await generation.reserveGenerationCall(ref,{operationKey:`${frozen.operationKey}/model/2`,request:{maxOutputTokens:128}});await ledger.start(ref,last.callId);
 await generation.settleGenerationCall(ref,{callId:last.callId,status:'settled',usage:{inputTokens:1,outputTokens:1},providerResult:{content:[{type:'text',text:'尚未形成可采纳资料，请保留原记录。'}],finishReason:{unified:'stop'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 await createExecutionCheckpointService(db,{now}).save(ref,{expectedRevision:0,expectedLedgerSequence:2+toolIds.length,messages:[{role:'assistant',callId:first.callId},...toolIds.map(callId=>({role:'tool' as const,callId})),{role:'assistant',callId:last.callId}]});
 const binding=createAgenticToolBinding(host),completion=await createChatTurnCompletionService(db,{now,validateTerminalPlanFailures,validateTerminalToolFailures}).commitResult(ref,{lastModelCallId:last.callId,toolCallIds:toolIds},(task,calls,call)=>binding.forCall(task,calls,call));
 expect(completion!.outcome).toBe('partial');
 const [partial]=await db.select().from(executionTasks).where(eq(executionTasks.id,childId));const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,partial!.ownerId));expect(partial!.status).toBe('partial');expect(business!.status).toBe('partial');
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
