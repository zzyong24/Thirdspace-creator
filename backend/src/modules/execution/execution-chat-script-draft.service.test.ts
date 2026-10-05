import {createStructuredBusinessExecutionService} from "../ai-runtime/structured-business-execution.service";
import {buildChatTools,type ChatToolDeps} from "../ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {resolveSubmittedChatToolParameters} from "../ai-runtime/chat-submitted-tool-parameters";
import {createSubmittedTaskPreparationService} from "./submitted-task-preparation.service";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {z} from "zod";
import {createDb,aiTasks,executionCalls,executionTasks,projects,artifacts,artifactVersions,eq,type Db} from "@creatoros/backend";
import {createAiService} from "../ai/ai.service";
import {createChatTurnSubmissionService} from "../ai/chat-turn-submission.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "./execution-agentic-tool-ports.service";
import {createExecutionChatToolPorts} from "./execution-chat-tool-ports.service";
import {createExecutionModelIdentityService} from "./execution-model-identity.service";
import {createExecutionChatScriptDraftService} from "./execution-chat-script-draft.service";
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-09-06T10:00:00.000Z",budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
async function fixture(options: { verbatim?: boolean; production?: boolean; parent?:{projectId:string;artifactId:string} } = {}) {
  const ctx = {
    userId: "hooks-u",
    accountId: `hooks-a-${++seq}`,
    requestId: "test",
    source: "user" as const,
  };
  const projectId=`fixture-project-${ctx.accountId}`,artifactId=`fixture-artifact-${ctx.accountId}`;
  await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:ctx.accountId,groupId:null,title:"真实原父项目",creationMode:"guided",status:"active",source:"manual",currentStage:"script",startedAt:now(),createdAt:now(),updatedAt:now()});
  await db.insert(artifacts).values({id:artifactId,userId:ctx.userId,accountId:ctx.accountId,groupId:null,projectId,stage:"script",artifactType:"script",title:"真实原父稿",status:"drafting",createdAt:now(),updatedAt:now()});
  const unexpectedWrite = async (): Promise<never> => {
    throw new Error("测试不允许候选采纳写入");
  };
  const ai = createAiService({
    db,
    now,
    nextId: (prefix) => `${prefix}-${++seq}`,
    artifacts: { createVersion: unexpectedWrite },
    knowledge: { createKnowledge: unexpectedWrite },
    candidate: {
      createFromAIResult: unexpectedWrite,
      enrichCard: unexpectedWrite,
    },
    learnings: { createLearning: unexpectedWrite },
    publishing: { createPublicationFromDraft: unexpectedWrite },
    materialLinks: { link: unexpectedWrite },
    positioning: {
      upsertProfile: unexpectedWrite,
      createStatementVersion: unexpectedWrite,
    },
    calibration: { createDraftPrediction: unexpectedWrite },
  });
  const production=options.production?await prepareChatToolDefinitions(buildChatTools(["script.draft"],{} as ChatToolDeps),{workerScriptDraft:true}):null;
  const check=vi.fn(async()=>({status:"not-applicable" as const}));
  const tools={"script.draft":{version:production?.definitions[0]!.version??"draft-v1",parameters:production?.parameters["script.draft"]!.parameters??z.record(z.string(),z.json()),effect:"committed" as const,execution:"worker.script-draft" as const,approve:check,
    async prepareTask(context:typeof ctx,input:unknown,scope:{attemptId:string}){
      const task=await ai.prepareTaskCommit(context,{taskType:"script.draft",attemptId:scope.attemptId,inputData:{...(input as Record<string,unknown>),projectId:options.parent?.projectId??projectId,artifactId:options.parent?.artifactId??artifactId}});
      return {task,result:(child:{id:string})=>({status:"ok" as const,summary:"整稿已提交",data:{kind:"script.draft",taskId:child.id,projectId,error:null},evidence:[],error:null,continuation:null,sideEffect:"committed" as const})};
    }} };
  const conversation = await ai.createConversation(ctx, {
    title: "开场",
    projectId: null,
    scope: "global",
  });
  const source = await ai.createMessage(ctx, conversation.id, {
    content: "生成开场",
    attachments: [],
  });
  const hostContext = {
    schemaVersion: 1 as const,
    chatContext: { surface: "topics" },
    mediaRoute: null,
    positioningScratch: false,
    trustedScriptSources: [{ref:"message:original",label:"原稿",text:"说明。第一句正文。\n最后一句。",truncated:false}],
    scriptDraftContext:{latestUserInstruction:"把完整原稿写进稿面"},
    scriptHooksGeneration: { version: 1 as const, maxOutputTokens: 2048 },
    scriptHooksContext: {
      selectionTitle: "真实选题",
      positioningBrief: "原定位",
      projectBriefHard: "",
      userMaterialHardBrief: "",
      userMaterialRefBrief: "",
      knowledgeBrief: "",
    },
    skillSnapshot: {
      snapshotVersion: 1 as const,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: "fixed",
      platformPolicyVersion: "1",
      platformPolicy: "候选",
      skills: [
        {
          skillId: "chatbox.topic",
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "策略",
            template: "",
            tools: ["script.draft"],
            requiredFacets: [],
            contextRequirements: [],
            outputSchema: null,
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    },
  };
  const task = await createChatTurnSubmissionService(db, {
    now,
    assemble: async () => ({
      system: "策略",
      messages: [{ role: "user", content: "生成开场" }],
      capability: "copilot.assist",
      maxSteps: 6,
      maxOutputTokens: 128,
      tools: production?.definitions??[
        {
          name: "script.draft",
          version: "draft-v1",
          description: "开场",
          parameters: { type: "object" },
          effect: "committed",
          execution:"worker.script-draft",
        },
      ],
      hostContext,
    }),
  }).submit(ctx, {
    conversationId: conversation.id,
    sourceMessageId: source.id,
  });
  const tasks = createPersistentTaskService(db, { now }),
    claim = (await tasks.claimTask({
      taskId: task.executionTaskId,
      workerId: "worker",
    }))!;
  const ref = {
    executionTaskId: task.executionTaskId,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  await createExecutionModelIdentityService(db, { now }).pin(
    ref,
    "copilot.assist",
    {
      apiFormat: "openai_chat",
      baseUrl: null,
      model: "fixture",
      token: "fixture",
    },
  );
  const ledger = createExecutionCallLedgerService(db, { now, budget }),
    ports = createExecutionAgenticToolPorts(db, { now, budget, tools });
  const model = await ledger.reserve(ref, {
    operationKey: "root",
    kind: "model",
    inputDigest: "sha256:" + "a".repeat(64),
    reservedTokens: 20,
  });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, {
    status: "settled",
    usage: {},
    providerResult: {
      content: [
        {
          type: "tool-call",
          toolCallId: "hooks",
          toolName: "script_draft",
          input: JSON.stringify(options.verbatim?{mode:"verbatim",sourceRef:"message:original"}:{mode:"generate",topic:"真实主题",...(options.production?{angle:"匿名案例的因果过程",extraBrief:"已有资料足以起草，缺少事实先标注待补",sourceRefs:[]}: {})}),
        },
      ],
      finishReason: { unified: "tool-calls" },
      usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } },
      warnings: [],
    },
  });
  const parent = await ports.reserve(ref, {
    modelCallId: model.id,
    toolCallId: "hooks",
  });
  await ports.start(ref, { callId: parent.callId });

  const hooks = createExecutionChatScriptDraftService(db, {
    now,
    budget,
    tools,
    check,
  });
  return { ctx, ref, parent, ledger, hooks, check, tasks, task, tools, ai,projectId,artifactId };
}
const requestFor = (prepared: {
  prompt: string;
  system: string;
  maxOutputTokens: number;
}) => ({
  prompt: [
    { role: "system", content: prepared.system },
    { role: "user", content: [{ type: "text", text: prepared.prompt }] },
  ],
  maxOutputTokens: prepared.maxOutputTokens,
  modelId: "fixture",
  provider: "openai.chat",
});
const success = {
  status: "settled" as const,
  usage: {},
  providerResult: {
    content: [{ type: "text" as const, text: "[]" }],
    finishReason: { unified: "stop" as const },
    usage: { inputTokens: { total: 4 }, outputTokens: { total: 3 } },
    warnings: [],
  },
};
async function startedChild(f: Awaited<ReturnType<typeof fixture>>) {
  const prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  const child = await f.hooks.reserve(f.ref, {
    callId: f.parent.callId,
    operationKey: `${prepared.operationKey}/model/1`,
    request: requestFor(prepared),
  });
  await f.hooks.start(f.ref, { callId: child.callId });
  return child;
}

async function settleDecision(f:Awaited<ReturnType<typeof fixture>>,text:string){const child=await startedChild(f);await f.hooks.settle(f.ref,{callId:child.callId,...success,providerResult:{...success.providerResult,content:[{type:"text",text}]}});return child;}
it("generate 零子模型，真实任务和回执同事务，ACK 重放不重复提交",async()=>{
 const f=await fixture();expect(await f.hooks.prepare(f.ref,{callId:f.parent.callId})).toMatchObject({noModel:true});
 const result=await f.hooks.complete(f.ref,{callId:f.parent.callId});expect(result).toMatchObject({status:"ok",sideEffect:"committed"});
 expect(await f.hooks.complete(f.ref,{callId:f.parent.callId})).toEqual(result);
 const rows=await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId));expect(rows.filter(r=>r.taskType==="script.draft")).toHaveLength(1);
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("授权真回执逐字保留首句和换行",async()=>{
 const f=await fixture({verbatim:true});await settleDecision(f,JSON.stringify({authorized:true,startAnchor:"第一句正文。",endAnchor:null}));
 const result=await f.hooks.complete(f.ref,{callId:f.parent.callId});expect(result.status).toBe("ok");
 const rows=await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId));expect(rows.find(r=>r.taskType==="script.draft")?.inputData).toMatchObject({draftMode:"verbatim",verbatimSourceText:"第一句正文。\n最后一句。"});
});
it("未授权不创建子任务",async()=>{const f=await fixture({verbatim:true});await settleDecision(f,'{"authorized":false,"reason":"只提供了稿件"}');expect(await f.hooks.complete(f.ref,{callId:f.parent.callId})).toMatchObject({status:"error",sideEffect:"none"});expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);});
it("普通宿主 execute 不得绕过 Worker 授权",async()=>{const f=await fixture();const execute=vi.fn();const ports=createExecutionChatToolPorts(db,{now,budget,tools:{"script.draft":{...f.tools["script.draft"],execute}}});await expect(ports.execute(f.ref,{callId:f.parent.callId})).rejects.toThrow();expect(execute).not.toHaveBeenCalled();});
it("未知子模型不能完成或重新预留",async()=>{const f=await fixture({verbatim:true}),child=await startedChild(f);await f.hooks.settle(f.ref,{callId:child.callId,status:"unknown"});await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();const prepared=await f.hooks.prepare(f.ref,{callId:f.parent.callId});await expect(f.hooks.reserve(f.ref,{callId:f.parent.callId,operationKey:`${prepared.operationKey}/model/1`,request:requestFor(prepared)})).resolves.toMatchObject({callId:child.callId,status:"unknown"});await expect(f.hooks.reserve(f.ref,{callId:f.parent.callId,operationKey:`${prepared.operationKey}/model/2`,request:requestFor(prepared)})).rejects.toThrow();await expect(f.hooks.start(f.ref,{callId:child.callId})).rejects.toThrow();expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);});

it("新租约只恢复已结算授权回执，不重发子模型，原提交 ACK 可重放",async()=>{
 const f=await fixture({verbatim:true});await settleDecision(f,'{"authorized":true,"startAnchor":"第一句正文。","endAnchor":null}');
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"pause",idempotencyKey:"pause"});
 await f.tasks.acknowledgeControl({taskId:f.task.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"resume",idempotencyKey:"resume"});
 const claim=(await f.tasks.claimTask({taskId:f.task.executionTaskId,workerId:"worker"}))!;
 const ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const restored=createExecutionChatScriptDraftService(db,{now,budget,tools:f.tools,check:f.check});
 await restored.restore(ref,{callId:f.parent.callId});
 const result=await restored.complete(ref,{callId:f.parent.callId});
 expect(result).toMatchObject({status:"ok",sideEffect:"committed"});
 expect(await restored.complete(ref,{callId:f.parent.callId})).toEqual(result);
 expect((await f.ledger.inspect(ref)).calls).toHaveLength(3);
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(1);
});
it("授权已结算后取消，不能创建子任务",async()=>{
 const f=await fixture({verbatim:true});await settleDecision(f,'{"authorized":true}');
 await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);
});
it("授权真但锚点伪造，返回原错误卡且零子任务",async()=>{
 const f=await fixture({verbatim:true});await settleDecision(f,'{"authorized":true,"startAnchor":"伪造锚点"}');
 expect(await f.hooks.complete(f.ref,{callId:f.parent.callId})).toMatchObject({status:"error",sideEffect:"none",data:{kind:"script.draft",taskId:null,error:"起始锚点在原稿中找不到，请重新选择精确边界。"}});
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);
});
it("事务任务准备期间取消，准备返回后仍不得提交",async()=>{
 const f=await fixture({verbatim:true});await settleDecision(f,'{"authorized":true}');
 const original=f.tools["script.draft"].prepareTask;
 f.tools["script.draft"].prepareTask=async(...args)=>{const prepared=await original(...args);await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"cancel",idempotencyKey:"cancel-in-prepare"});return prepared;};
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);
});

it("提交准备期间子回执变化必须拒绝，不能提交旧授权",async()=>{
 const f=await fixture({verbatim:true}),child=await settleDecision(f,'{"authorized":true}');
 const original=f.tools["script.draft"].prepareTask;
 f.tools["script.draft"].prepareTask=async(...args)=>{const prepared=await original(...args);await db.update(executionCalls).set({providerResult:{...success.providerResult,content:[{type:"text",text:'{"authorized":false}'}]}}).where(eq(executionCalls.id,child.callId));return prepared;};
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);
});
it("子任务事务写入返回时停止，子任务与父回执一起回滚",async()=>{
 const f=await fixture(),controller=new AbortController(),original=f.tools["script.draft"].prepareTask;
 f.tools["script.draft"].prepareTask=async(...args)=>{const prepared=await original(...args);const commit=prepared.task.commit;return {...prepared,task:{async commit(...params:Parameters<typeof commit>){const child=await commit(...params);controller.abort();return child;}}};};
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId},controller.signal)).rejects.toThrow();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(0);
});

it("已提交整稿的准备 503 可原任务补偿，重建服务不重置计数",async()=>{
 const f=await fixture(),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 let time=Date.parse(now());const prepare=vi.fn(async(_ctx:unknown,_id:string,_signal:AbortSignal)=>{}).mockRejectedValueOnce(Object.assign(new Error("fixture temporary"),{statusCode:503,responseHeaders:{"retry-after":"2"}}));
 const options={deadlineMs:60000,now:()=>time,random:()=>0,prepare,fail:vi.fn(f.ai.markFailed)};
 let recovery=createSubmittedTaskPreparationService(db,options);
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(1);await recovery.stop();
 recovery=createSubmittedTaskPreparationService(db,options);await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(1);
 time+=2000;await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(2);expect(prepare.mock.calls[1]?.[1]).toBe(id);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(r=>r.taskType==="script.draft")).toHaveLength(1);
 const task=await f.ai.getTaskRuntimeData(f.ctx,id);expect(task).toMatchObject({hostTaskPreparation:{attempts:2}});await recovery.stop();
});
it("普通 host.task-submit 伪整稿声明不能接管 Worker 提交",async()=>{
 const f=await fixture(),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 const payload=structuredClone(parent!.payload) as {modelInput:{tools:Array<{execution:string}>}};payload.modelInput.tools[0]!.execution="host.task-submit";
 await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const prepare=vi.fn();const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,now:()=>Date.parse(now()),prepare,fail:vi.fn()});
 await expect(recovery.prepare(f.ctx,id)).rejects.toThrow();expect(prepare).not.toHaveBeenCalled();await recovery.stop();
});


it("JSONB 重排真实整稿 schema 后，恢复沿用生产解析器与原任务摘要",async()=>{
 const f=await fixture({production:true}),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const before=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!.inputDigest;
 const prepare=vi.fn(async()=>{});
 const legacy=createSubmittedTaskPreparationService(db,{deadlineMs:60000,now:()=>Date.parse(now()),prepare,fail:vi.fn()});
 await expect(legacy.prepare(f.ctx,id)).rejects.toThrow("工具调用与冻结参数不符");
 expect(prepare).not.toHaveBeenCalled();await legacy.stop();
 const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,now:()=>Date.parse(now()),prepare,fail:vi.fn(),resolveToolParameters:resolveSubmittedChatToolParameters});
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledExactlyOnceWith(f.ctx,id,expect.any(AbortSignal),expect.objectContaining({policy:"continuous",deadlineMs:null}));
 expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!.inputDigest).toBe(before);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.accountId,f.ctx.accountId))).filter(row=>row.taskType==="script.draft").map(row=>row.id)).toEqual([id]);
 await recovery.stop();
});
it("恢复解析器参数契约不符仍拒绝执行原子子任务",async()=>{
 const f=await fixture({production:true}),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const prepare=vi.fn(),recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,now:()=>Date.parse(now()),prepare,fail:vi.fn(),resolveToolParameters:async definition=>({...await resolveSubmittedChatToolParameters(definition),schema:{type:"object"}})});
 await expect(recovery.prepare(f.ctx,id)).rejects.toThrow("SUBMITTED_TOOL_SCHEMA_MISMATCH");expect(prepare).not.toHaveBeenCalled();await recovery.stop();
});

it("已验证 continuous 父任务给准备端传递原预算，不再新建十分钟总期限",async()=>{
 const f=await fixture(),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const continuous={policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:null};
 await db.update(executionTasks).set({executionBudget:continuous,deadlineAt:null}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const prepare=vi.fn(),recovery=createSubmittedTaskPreparationService(db,{deadlineMs:600000,now:()=>Date.parse(now())+3600000,prepare,fail:vi.fn()});
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledExactlyOnceWith(f.ctx,id,expect.any(AbortSignal),continuous);await recovery.stop();
});
it.each([false,true])("原任务零调用 deadline 缺陷可修复；存在调用=%s 时不恢复",async(hasCall)=>{
 const f=await fixture(),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
 const continuous={policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:null},executionId=`repair-${++seq}`;
 await db.update(executionTasks).set({executionBudget:continuous,deadlineAt:null}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await db.insert(executionTasks).values({id:executionId,userId:f.ctx.userId,accountId:f.ctx.accountId,ownerId:id,ownerType:"ai_task",kind:"ai_task",idempotencyKey:`ai:${id}`,status:"failed",executionBudget:{maxCalls:6,maxTokens:1000000,deadlineMs:600000},deadlineAt:new Date(Date.parse(task!.requestedAt)+600000).toISOString(),lastErrorCode:"EXECUTION_DEADLINE",lastErrorMessage:"原任务截止时间已到",payload:{modelInput:{kind:"model.structured",skillId:"script.draft"}},createdAt:now(),updatedAt:now()});
 await db.update(aiTasks).set({executionTaskId:executionId,status:"failed"}).where(eq(aiTasks.id,id));
 if(hasCall){const [source]=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));await db.insert(executionCalls).values({...source!,id:`repair-call-${++seq}`,executionTaskId:executionId});}
 const prepare=vi.fn(),recovery=createSubmittedTaskPreparationService(db,{deadlineMs:600000,now:()=>Date.parse(now())+3600000,prepare,fail:vi.fn()});
 await recovery.recover(new AbortController().signal);
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,executionId));
 expect(execution!.status).toBe(hasCall?"failed":"queued");expect(execution!.deadlineAt).toBe(hasCall?new Date(Date.parse(task!.requestedAt)+600000).toISOString():null);
 expect(prepare.mock.calls.some(call=>call[1]===id)).toBe(false);
 const [updated]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));expect(updated!.executionTaskId).toBe(executionId);
 if(!hasCall)expect(updated!.runtimeData).toHaveProperty("submittedBudgetRepair.previousErrorCode","EXECUTION_DEADLINE");
 await recovery.stop();
});

it("continuous 父提交整稿在一小时排队后绑定真实执行仍无总期限",async()=>{
 const f=await fixture(),result=await f.hooks.complete(f.ref,{callId:f.parent.callId}),id=(result.data as {taskId:string}).taskId;
 const continuous={policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:null};
 await db.update(executionTasks).set({executionBudget:continuous,deadlineAt:null}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const [unprepared]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
 await db.update(aiTasks).set({runtimeData:{...unprepared!.runtimeData as Record<string,unknown>,skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId,resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"规则",skills:[{skillId:"script.draft",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"写稿",template:"{{topic}}",tools:[],requiredFacets:["topic"],contextRequirements:[],outputSchema:{type:"object"},completionPolicy:null,completionPolicyAdapter:null}}]}}}).where(eq(aiTasks.id,id));
 const business=createStructuredBusinessExecutionService(db,{budget:{maxCalls:6,maxTokens:1000000,deadlineMs:600000},maxOutputTokens:100,adapters:{"script.draft":{skillId:"script.draft",capability:"script.draft",prepare:async()=>({topic:"fixture"}),project:()=>{throw new Error("不写候选");}}}});
 const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:600000,now:()=>Date.parse(now())+3600000,prepare:(ctx,id,signal,budget)=>business.prepare(ctx,id,signal,budget),fail:vi.fn()});
 await recovery.prepare(f.ctx,id);
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));expect(task!.executionTaskId).toBeTruthy();
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task!.executionTaskId!));expect(execution!.executionBudget).toEqual(continuous);expect(execution!.deadlineAt).toBeNull();
 await recovery.stop();
});

it("实际foreign账号父存在仍拒绝宿主提交，原工具回执/digest及版本零新写",async()=>{
 const foreign=await fixture(),f=await fixture({parent:{projectId:foreign.projectId,artifactId:foreign.artifactId}});
 const beforeTasks=await db.select().from(aiTasks),beforeVersions=await db.select().from(artifactVersions),beforeCalls=await db.select().from(executionCalls);
 await expect(f.hooks.complete(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect(await db.select().from(aiTasks)).toEqual(beforeTasks);expect(await db.select().from(artifactVersions)).toEqual(beforeVersions);expect(await db.select().from(executionCalls)).toEqual(beforeCalls);
 await expect(foreign.ai.createTask(f.ctx,{taskType:'script.draft',attemptId:'foreign-inverse-parent-request',inputData:{projectId:foreign.projectId,artifactId:foreign.artifactId}})).rejects.toThrow();
 expect(await db.select().from(aiTasks)).toEqual(beforeTasks);
});
