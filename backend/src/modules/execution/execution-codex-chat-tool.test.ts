import {isAssistantEngineToolAllowed} from '@creatoros/contract';
import {buildChatTools,ALL_CHAT_TOOL_NAMES,type ChatToolDeps} from '../ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {createDb,executionTasks,executionCalls,executionStreamEvents,aiMessages,aiTasks,eq,asc,type Db} from '@creatoros/backend';
import {codexExecutionSpec,chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {createAiService,type ServiceDeps} from '../ai';
import {createChatTurnSubmissionService} from '../ai/chat-turn-submission.service';
import {createExternalChatTurnService} from '../ai/external-chat-turn.service';
import {createExternalTaskToolService} from '../ai/external-task-tool.service';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionAgenticToolPorts} from './execution-agentic-tool-ports.service';
import {createExecutionChatModelIdentityService} from './execution-chat-model-identity.service';
import {createAgenticToolBinding} from './agentic-tool-binding';
import {createChatToolStreamProjection} from './chat-tool-stream-projection.service';
import {createExecutionChatToolPorts} from './execution-chat-tool-ports.service';
const now=()=> '2026-10-11T08:00:00.000Z',budget={maxCalls:20,maxTokens:100000,deadlineMs:120000};
let db:Db,close:()=>Promise<void>,sequence=0;beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
async function fixture(name='topic.enrich',execution:'worker.structured-node'|'worker.script-hooks'|'host'|'host.task-submit'='worker.structured-node',definition?:z.infer<typeof chatWorkerInputSchema>['tools'][number]){
 const ctx={userId:'native-chat-tool-u',accountId:`native-chat-tool-a-${++sequence}`,requestId:'test',source:'user' as const},repo=createAiService({db,now,nextId:prefix=>`${prefix}-${++sequence}`,artifacts:{createVersion:async()=>{throw Error('禁止采纳');}},knowledge:{createKnowledge:async()=>{throw Error('禁止采纳');}},candidate:{createFromAIResult:async()=>{throw Error('禁止采纳');},enrichCard:async()=>{throw Error('禁止采纳');}},learnings:{createLearning:async()=>{throw Error('禁止采纳');}},publishing:{createPublicationFromDraft:async()=>{throw Error('禁止采纳');}},materialLinks:{link:async()=>{throw Error('禁止采纳');}},positioning:{upsertProfile:async()=>{throw Error('禁止采纳');},createStatementVersion:async()=>{throw Error('禁止采纳');}},calibration:{createDraftPrediction:async()=>{throw Error('禁止采纳');}}}),conversation=await repo.createConversation(ctx,{title:'编导',projectId:null,scope:'global'}),source=await repo.createMessage(ctx,conversation.id,{content:'生成',attachments:[]});
 const effect=(execution==='host'||execution==='host.task-submit')?'committed' as const:'proposal' as const;const def=definition??{name,execution,version:'1',effect,description:'真实节点',parameters:{type:'object'}},submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:'copilot.assist',system:'原系统',messages:[{role:'user',content:'生成'}],maxSteps:6,maxOutputTokens:128,tools:[def]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex'}),claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submission.executionTaskId,workerId:'worker'}))!,ref={executionTaskId:submission.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},chat=createExternalChatTurnService(db,{now,budget}),turn=await chat.reserve(ref,{});await chat.start(ref,{callId:turn.callId,sessionId:'real-acp-session',protocolKind:'acp',protocolVersion:1});
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId)),payload={...row!.payload as object,codexCalls:{[turn.callId]:{threadId:'real-acp-session',tools:{node:{toolCallId:'node',toolName:name.replaceAll('.','_'),input:'{}'}}}}};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,ref.executionTaskId));
 const tools={[name]:{version:'1',execution,effect,parameters:z.object({}).strict(),approve:vi.fn(async()=>({status:'not-applicable' as const})),prepareGeneration:vi.fn(async()=>{throw Error('not called');})}},ports=createExecutionAgenticToolPorts(db,{now,budget,tools});return {ctx,ref,turn,chat,payload,tools,ports,name};
}
it('真实ACP root长回合可预留worker节点父工具，身份只准Codex',async()=>{
 const f=await fixture(),parent=await f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await f.ports.start(f.ref,{callId:parent.callId});
 const identities=createExecutionChatModelIdentityService(db,{now,tools:f.tools});expect(await identities.pin(f.ref,parent.callId,codexExecutionSpec())).toEqual(codexExecutionSpec());expect(await identities.read(f.ref,parent.callId)).toMatchObject({engine:'codex',capability:'topic.enrich'});
 await expect(identities.pin(f.ref,parent.callId,{apiFormat:'openai_chat',model:'api',token:'fake',baseUrl:null})).rejects.toThrow();
});
it('ACP开场子模型沿用冻结Codex，不要求独立主API模型配置',async()=>{
 const f=await fixture('script.hooks','worker.script-hooks'),parent=await f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await f.ports.start(f.ref,{callId:parent.callId});expect(await createExecutionChatModelIdentityService(db,{now,tools:f.tools}).pinPrimary(f.ref,parent.callId)).toMatchObject({engine:'codex',capability:'copilot.assist'});
});
it('目录返回真实已装配worker节点，短读execute端口仍禁止代替生成执行',async()=>{
 const f=await fixture(),service=createExternalTaskToolService(db,{now});expect((await service.list(f.ref,{},f.tools)).tools.map(t=>t.name)).toEqual(['topic.enrich']);await expect(service.execute(f.ref,{turnCallId:f.turn.callId,toolCallId:'node',toolName:'topic.enrich',input:{}},f.tools,new AbortController().signal)).rejects.toThrow();expect(f.tools['topic.enrich']!.prepareGeneration).not.toHaveBeenCalled();
});
it('ACP绑定外来session或任务冻结改Pi，不能借started绕过来源门',async()=>{
 const f=await fixture(),payload={...f.payload,codexCalls:{[f.turn.callId]:{...f.payload.codexCalls[f.turn.callId]!,threadId:'foreign'}}};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));await expect(f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'})).rejects.toThrow();
});

it('Codex原external回合混合普通tool结算、真实流及最终卡片闭环，只追加一次',async()=>{
 const f=await fixture(),parent=await f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await f.ports.start(f.ref,{callId:parent.callId});
 const outcome={status:'error' as const,summary:'真实参数错误',evidence:[],data:{kind:'topic.enrich',error:'真实参数错误'},error:{code:'invalid_input' as const,retryable:false,recovery:'修正输入'},continuation:null,sideEffect:'none' as const};
 await f.ports.settle(f.ref,{callId:parent.callId,status:'settled',output:outcome});
 const project=createChatToolStreamProjection(db,{now,tools:f.tools});await project(f.ref,parent.callId);await project(f.ref,parent.callId);
 expect((await f.chat.reserve(f.ref,{})).callId).toBe(f.turn.callId);
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:'settled',receipt:{schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,sessionId:'real-acp-session',turnId:f.turn.callId,stopReason:'end_turn',text:'真实失败已返回',usage:null}});
 await expect(f.chat.commit(f.ref,{callId:f.turn.callId})).rejects.toThrow('受信');
 const binding=createAgenticToolBinding(f.tools),first=await f.chat.commit(f.ref,{callId:f.turn.callId},binding.forCall);expect(await f.chat.commit(f.ref,{callId:f.turn.callId},binding.forCall)).toEqual(first);
 const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId)).orderBy(asc(executionStreamEvents.sequence));expect(events.filter(e=>e.chunk.type==='tool-input-available')).toHaveLength(1);expect(events.filter(e=>e.chunk.type==='tool-output-available')).toHaveLength(1);expect(events.filter(e=>e.chunk.type==='finish')).toHaveLength(1);
 const [message]=await db.select().from(aiMessages).where(eq(aiMessages.id,first.messageId));expect((message!.parts as any[]).find(p=>p.toolCallId==='node')).toMatchObject({type:'tool-topic_enrich',output:{error:'真实参数错误'}});
});
it('同一原生长回合后续ordinarytool输入只追加实际新前缀',async()=>{
 const f=await fixture(),project=createChatToolStreamProjection(db,{now,tools:f.tools}),output={status:'ok',summary:'事实',evidence:[],data:{kind:'topic.enrich',draft:{}},error:null,continuation:null,sideEffect:'proposal'};
 const first=await f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await f.ports.start(f.ref,{callId:first.callId});await f.ports.settle(f.ref,{callId:first.callId,status:'settled',output});await project(f.ref,first.callId);
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)),payload=task!.payload as any;payload.codexCalls[f.turn.callId].tools.next={toolCallId:'next',toolName:'topic_enrich',input:'{}'};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const next=await f.ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'next'});await f.ports.start(f.ref,{callId:next.callId});await f.ports.settle(f.ref,{callId:next.callId,status:'settled',output});await project(f.ref,next.callId);await project(f.ref,first.callId);
 const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.ref.executionTaskId)).orderBy(asc(executionStreamEvents.sequence));expect(events.filter(e=>e.chunk.type==='tool-input-available').map(e=>e.chunk.toolCallId)).toEqual(['node','next']);
});

it('正式编导全工具由实际装配目录逐项获Codex支持，所有执行位置与效果保持原定义',async()=>{
 const prepared=await prepareChatToolDefinitions(buildChatTools(ALL_CHAT_TOOL_NAMES,{} as ChatToolDeps),{workerScriptDraft:true,workerWebRead:true,workerResearch:true,workerScriptHooks:true,atomicCoverGenerate:true,atomicAgenticResearch:true,atomicPlanningThesis:true,atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,workerStructuredNodes:true});
 expect(prepared.definitions.filter(def=>!isAssistantEngineToolAllowed('codex',def)).map(def=>def.name)).toEqual([]);
});

it('已审原Host提交走真实ChatToolPorts claim/approval/settle，Worker不得伪造成功且回放不重复副作用',async()=>{
 const f=await fixture('material.screenshot','host'),outcome={status:'ok' as const,summary:'隔离宿主已执行一次',evidence:[],data:{kind:'material.screenshot',asset:{id:'isolated-asset'}},error:null,continuation:null,sideEffect:'committed' as const};
 const execute=vi.fn(async()=>outcome),tools={[f.name]:{...f.tools[f.name]!,execute,prepareGeneration:undefined}},ports=createExecutionChatToolPorts(db,{now,budget,tools}),parent=await ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await ports.start(f.ref,{callId:parent.callId});
 await expect(ports.settle(f.ref,{callId:parent.callId,status:'settled',output:outcome})).rejects.toThrow('实际执行');
 expect(await ports.execute(f.ref,{callId:parent.callId},new AbortController().signal)).toEqual(outcome);expect(await ports.execute(f.ref,{callId:parent.callId},new AbortController().signal)).toEqual(outcome);expect(execute).toHaveBeenCalledTimes(1);
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:'settled',receipt:{schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,sessionId:'real-acp-session',turnId:f.turn.callId,stopReason:'end_turn',text:'已保存一次真实回执',usage:null}});
 await f.chat.commit(f.ref,{callId:f.turn.callId},createAgenticToolBinding(tools).forCall);
});

it('Codex原实际计划Host保存后结算external根，历史读取同原回执且拒绝外来绑定',async()=>{
 const {chatWorkbenchPlanCapability}=await import('../ai-runtime/chat-workbench-plan-tool'),{defineWorkbenchChatTool}=await import('../ai-runtime/chat-tool-gate'),{createChatWorkbenchPlanToolHost}=await import('../ai-runtime/chat-workbench-plan-tool-host'),{createWorkbenchPlanService}=await import('./workbench-plan.service');
 const prepared=await prepareChatToolDefinitions({'plan.update':defineWorkbenchChatTool(chatWorkbenchPlanCapability,()=>{throw Error('不可直接调用');})},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
 const f=await fixture('plan.update','host',prepared.definitions[0]),request={expectedRevision:0,steps:[{stepId:'original-step',title:'真实步骤',status:'failed',dependsOn:[],operationRefs:[],artifactRefs:[]}]};
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)),payload=row!.payload as any;payload.codexCalls[f.turn.callId].tools.node.input=JSON.stringify(request);await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,row!.id));
 const tools=await createChatWorkbenchPlanToolHost(db,{now})(f.ctx,payload.modelInput,f.ref,new AbortController().signal),ports=createExecutionChatToolPorts(db,{now,budget,tools}),parent=await ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await ports.start(f.ref,{callId:parent.callId});expect(await ports.execute(f.ref,{callId:parent.callId})).toMatchObject({status:'ok',sideEffect:'committed'});
 await f.chat.settle(f.ref,{callId:f.turn.callId,status:'settled',receipt:{schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,sessionId:'real-acp-session',turnId:f.turn.callId,stopReason:'end_turn',text:'原计划已保存',usage:null}});
 const plans=createWorkbenchPlanService(db,{now});expect(await plans.status(f.ref,{modelCallId:f.turn.callId})).toMatchObject({revision:1,hasSuccessor:false});
 const [final]=await db.select().from(executionTasks).where(eq(executionTasks.id,row!.id)),bad=final!.payload as any;bad.codexCalls[f.turn.callId].threadId='foreign';await db.update(executionTasks).set({payload:bad}).where(eq(executionTasks.id,row!.id));await expect(plans.status(f.ref,{modelCallId:f.turn.callId})).rejects.toThrow('WORKBENCH_PLAN_HISTORY_UNPROVEN');
});

it('原Codex聊天父任务创建后当前偏好改Pi且无API凭据，实际子任务原子提交仍冻结Codex',async()=>{
 const {createExecutionRoute}=await import('@creatoros/contract/execution-worker'),f=await fixture('planning.thesis','host.task-submit');
 const {createProjectsService,createProjectRepository}=await import('../projects'),project=await createProjectsService(createProjectRepository(db),{now,nextId:(p:string)=>`${p}-${++sequence}`}).createProject(f.ctx,{title:'原父任务归属项目'});
 let preference:'pi'|'codex'='codex';preference='pi';
 const resolveTaskRuntimeData=vi.fn(async()=>({executionRoute:createExecutionRoute(preference),skillSnapshot:{revision:'isolated-fixture'},modelAuthority:'current-no-api-key'})),api=createAiService({db,now,nextId:(p:string)=>`${p}-${++sequence}`,resolveTaskRuntimeData} as unknown as ServiceDeps);
 const tools={'planning.thesis':{version:'1',execution:'host.task-submit' as const,effect:'committed' as const,parameters:z.object({}).strict(),approve:async()=>({status:'not-applicable' as const}),prepareTask:async(context:any,_input:any,scope:any)=>({task:await api.prepareTaskCommit(context,{taskType:'planning.thesis',attemptId:scope.attemptId,inputData:{projectId:project.id,topic:'原主题'}}),result:(child:any)=>({status:'ok' as const,summary:'原子子任务已创建',evidence:[],data:{kind:'planning.thesis',taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:'committed' as const})})}},ports=createExecutionChatToolPorts(db,{now,budget,tools});
 const parent=await ports.reserve(f.ref,{modelCallId:f.turn.callId,toolCallId:'node'});await ports.start(f.ref,{callId:parent.callId});const first=await ports.execute(f.ref,{callId:parent.callId},new AbortController().signal);expect(await ports.execute(f.ref,{callId:parent.callId},new AbortController().signal)).toEqual(first);
 const childId=(first.data as any).taskId,[child]=await db.select().from(aiTasks).where(eq(aiTasks.id,childId));expect(child).toMatchObject({modelKey:'codex',runtimeData:{executionRoute:{engine:'codex',source:'parent'},hostTaskSubmission:{executionTaskId:f.ref.executionTaskId,callId:parent.callId}}});expect(child!.runtimeData).not.toHaveProperty('modelAuthority');expect(resolveTaskRuntimeData).toHaveBeenCalledTimes(1);
});
