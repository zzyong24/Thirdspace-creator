import { z } from "zod";
import { createExecutionAgenticToolPorts } from "../execution/execution-agentic-tool-ports.service";
import { createChatToolStreamProjection } from "../execution/chat-tool-stream-projection.service";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, aiConversations, aiMessages, aiTasks, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, eq, sql, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService,chatInputDigest } from "./chat-turn-submission.service";
import { createChatTurnCompletionService } from "./chat-turn-completion.service";
import { validateTerminalPlanFailures, validateTerminalToolFailures } from "../execution/workbench-plan.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../execution/execution-generation-ports.service";
import { createExecutionCheckpointService } from "../execution/execution-checkpoint.service";
let db: Db, close: () => Promise<void>, sequence = 0;
const now = () => "2026-09-05T22:00:00.000Z", budget = { maxCalls: 6, maxTokens: 10000, deadlineMs: 60000 };
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close());
async function fixture(options: {
    tools?: ReturnType<typeof chatWorkerInputSchema.parse>["tools"];
    text?: string;
    content?: Array<Record<string,unknown>>;
    finishReason?: string;
    checkpoint?: boolean;
    unknownUsage?: boolean;
    displayLegacy?:boolean;
    supersededPrefix?: boolean;

} = {}) {
    const ctx = { userId: "chat-completion-u", accountId: `chat-completion-a-${++sequence}`, requestId: "test", source: "user" as const };
    const repo = createAiRepository(db, { userId: ctx.userId, accountId: ctx.accountId, now, nextId: prefix => `${prefix}-${++sequence}` });
    const conversation = await repo.createConversation({ title: "会话", projectId: null, scope: "global" });
    const source = await repo.createMessage(conversation.id, { role: "user", content: "问题", attachments: [], modelMetadata: {} });
    const submit = await createChatTurnSubmissionService(db, { now, assemble: async () => ({ capability: "copilot.assist", system: "策略", messages: [{ role: "user", content: "问题" }], maxSteps: 6, maxOutputTokens: 128, tools: options.tools ?? [] }) }).submit(ctx, { conversationId: conversation.id, sourceMessageId: source.id });
    if(options.displayLegacy){
      // 合成升级前持久输入的形状，仅核兼容；不是安装版历史证据。
      const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submit.executionTaskId));
      const payload=task!.payload as Record<string,unknown>,modelInput={...payload.modelInput as Record<string,unknown>};delete modelInput.toolOutcomeProjectionVersion;
      await db.update(executionTasks).set({payload:{...payload,modelInput}}).where(eq(executionTasks.id,submit.executionTaskId));
      const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,submit.taskId));
      await db.update(aiTasks).set({inputData:{...business!.inputData as Record<string,unknown>,modelInputDigest:chatInputDigest(modelInput)}}).where(eq(aiTasks.id,submit.taskId));
    }
    const tasks = createPersistentTaskService(db, { now }), claim = (await tasks.claimTask({ taskId: submit.executionTaskId, workerId: "worker" }))!;
    const ref = { executionTaskId: submit.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
    const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, submit.executionTaskId));
    const frozen = chatWorkerInputSchema.parse((task!.payload as {
        modelInput: unknown;
    }).modelInput);
    const ledger = createExecutionCallLedgerService(db, { now, budget }), generation = createExecutionGenerationPorts(db, { now, budget });
    let supersededCallId:string|undefined;
    if(options.supersededPrefix){
        const first=await generation.reserveGenerationCall(ref,{operationKey:`${frozen.operationKey}/model/1`,request:{maxOutputTokens:128}});
        await ledger.start(ref,first.callId);await generation.settleGenerationCall(ref,{callId:first.callId,status:"superseded"});
        supersededCallId=first.callId;await db.update(executionTasks).set({retryOfCallId:first.callId}).where(eq(executionTasks.id,submit.executionTaskId));
    }
    const call = await generation.reserveGenerationCall(ref, { operationKey: `${frozen.operationKey}/model/1`, request: { maxOutputTokens: 128 } });
    await ledger.start(ref, call.callId);
    await generation.settleGenerationCall(ref, { callId: call.callId, status: "settled", providerResult: { content: options.content ?? [{ type: "text", text: options.text ?? "真实回复" }], finishReason: { unified: options.finishReason ?? "stop" }, usage: { inputTokens: options.unknownUsage ? {} : { total: 2 }, outputTokens: options.unknownUsage ? {} : { total: 3 } }, warnings: [] }, usage: options.unknownUsage ? {} : { inputTokens: 2, outputTokens: 3 } });
    if (options.checkpoint !== false)
        await createExecutionCheckpointService(db, { now }).save(ref, { expectedRevision: 0, expectedLedgerSequence: options.supersededPrefix?2:1, messages: [{ role: "assistant", callId: call.callId }] });
    const service = createChatTurnCompletionService(db, { now, validateTerminalPlanFailures, validateTerminalToolFailures }), request = { lastModelCallId: call.callId, toolCallIds: [] as string[] };
    const rows = async () => ({ messages: await repo.listMessages(conversation.id), results: await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, submit.taskId)), business: (await db.select().from(aiTasks).where(eq(aiTasks.id, submit.taskId)))[0]!, task: (await db.select().from(executionTasks).where(eq(executionTasks.id, submit.executionTaskId)))[0]!, call: (await db.select().from(executionCalls).where(eq(executionCalls.id, call.callId)))[0]! });
    return { ctx, repo, source, conversation, submit, ref, task: task!, call, supersededCallId, service, request, rows, ledger, generation, frozen };
}
it("同一完成请求并发或回放只有一条消息，消息/任务/回执一起完成", async () => {
    const f = await fixture();
    const results = await Promise.all([f.service.commitResult(f.ref, f.request), f.service.commitResult(f.ref, f.request)]);
    expect(results[0]).toEqual(results[1]);
    const rows = await f.rows();
    expect(rows.messages).toHaveLength(2);
    expect(rows.messages[1]).toMatchObject({ content: "真实回复", inputTokens: 2, outputTokens: 3, cachedTokens: null });
    expect(rows.results).toHaveLength(1);
    expect(rows.business.status).toBe("succeeded");
    expect(rows.task.status).toBe("succeeded");
    expect(rows.call.resultRef).toBe(results[0]!.resultId);
    const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({callId:f.call.callId,callIndex:0,sequence:1,chunk:{type:"finish",finishReason:"stop",messageMetadata:rows.messages[1]!.modelMetadata}});
});
it("模型断流后的废弃调用不阻断重试结果提交",async()=>{
    const f=await fixture({supersededPrefix:true});
    expect(f.supersededCallId).toBeTruthy();
    await expect(f.service.commitResult(f.ref,f.request)).resolves.toMatchObject({outcome:"succeeded"});
    expect((await f.rows()).messages.at(-1)).toMatchObject({content:"真实回复"});
});
it("长度截断保留真实回复并投影 partial；未知用量保留 null", async () => {
    const f = await fixture({ finishReason: "length", unknownUsage: true });
    expect(await f.service.commitResult(f.ref, f.request)).toMatchObject({ outcome: "partial" });
    const rows = await f.rows();
    expect(rows.messages[1]).toMatchObject({ content: "真实回复", inputTokens: null, outputTokens: null, cachedTokens: null, modelMetadata: { completeness: "partial", stopReason: "length" } });
    expect(rows.business.status).toBe("partial");
    expect(rows.task.status).toBe("partial");
});
it("终态失败计划即使模型正文为空也原子保存可信partial说明、流事件和task状态",async()=>{
    const f=await fixture({content:[]});
    const plan={planRevision:1,steps:[{stepId:"research",title:"来源检索失败",dependsOn:[],status:"failed",operationRefs:[],artifactRefs:[]}]};
    await db.update(executionTasks).set({payload:{...(f.task.payload as Record<string,unknown>),workbenchPlan:plan}}).where(eq(executionTasks.id,f.task.id));
    const request={...f.request,partialPlanFailureStepIds:["research"]};
    const first=await f.service.commitResult(f.ref,request),second=await f.service.commitResult(f.ref,request);
    expect(second).toEqual(first);expect(first.outcome).toBe("partial");
    const rows=await f.rows(),expected="本次部分完成。失败步骤：来源检索失败。";
    expect(rows.messages[1]).toMatchObject({content:`\n\n${expected}`,parts:[{type:"step-start"},{type:"text",text:`\n\n${expected}`,state:"done"}],modelMetadata:{completeness:"partial",stopReason:"stop"}});
    expect(rows.business.status).toBe("partial");expect(rows.task.status).toBe("partial");
    const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id)).orderBy(executionStreamEvents.sequence);
    expect(events.map(event=>event.chunk)).toEqual([
      {type:"text-start",id:`${f.call.callId}:terminal-partial`},
      {type:"text-delta",id:`${f.call.callId}:terminal-partial`,delta:`\n\n${expected}`},
      {type:"text-end",id:`${f.call.callId}:terminal-partial`},
      {type:"finish",finishReason:"stop",messageMetadata:rows.messages[1]!.modelMetadata},
    ]);
});
it.each(["cancelled","skipped"] as const)("终态%s计划不能冒充完成，生成可信partial说明",async status=>{
 const f=await fixture({content:[{type:"text",text:"计划状态已收口"}]}),plan={planRevision:1,steps:[{stepId:"abandoned",title:"交付报告",dependsOn:[],status,operationRefs:[],artifactRefs:[]}]};
 await db.update(executionTasks).set({payload:{...(f.task.payload as Record<string,unknown>),workbenchPlan:plan}}).where(eq(executionTasks.id,f.task.id));
 const request={...f.request,partialPlanFailureStepIds:["abandoned"]};
 expect(await f.service.commitResult(f.ref,request)).toMatchObject({outcome:"partial"});
 const rows=await f.rows();
 expect(rows.messages[1]).toMatchObject({content:"计划状态已收口\n\n本次部分完成。未成功步骤：交付报告。",modelMetadata:{completeness:"partial",stopReason:"stop"}});
 expect(rows.business.status).toBe("partial");expect(rows.task.status).toBe("partial");
});
it("v1终态失败缺ID或ID与计划不符时拒绝提交且不留半成品",async()=>{
 const f=await fixture({content:[]}),plan={planRevision:1,steps:[{stepId:"research",title:"来源检索失败",dependsOn:[],status:"failed",operationRefs:[],artifactRefs:[]}]};
 await db.update(executionTasks).set({payload:{...(f.task.payload as Record<string,unknown>),workbenchPlan:plan}}).where(eq(executionTasks.id,f.task.id));
 for(const request of [f.request,{...f.request,partialPlanFailureStepIds:["other"]}]){
  await expect(f.service.commitResult(f.ref,request)).rejects.toThrow();
  expect((await f.rows()).messages).toHaveLength(1);expect((await f.rows()).results).toHaveLength(0);
  expect((await f.rows()).task.status).toBe("running");expect((await f.rows()).business.status).toBe("queued");
 }
});
it("终态失败计划的length截断沿既有partial路径提交，不伪称 stop 收口",async()=>{
 const f=await fixture({finishReason:"length"}),plan={planRevision:1,steps:[{stepId:"research",title:"来源检索失败",dependsOn:[],status:"failed",operationRefs:[],artifactRefs:[]}]};
 await db.update(executionTasks).set({payload:{...(f.task.payload as Record<string,unknown>),workbenchPlan:plan}}).where(eq(executionTasks.id,f.task.id));
 await expect(f.service.commitResult(f.ref,f.request)).resolves.toMatchObject({outcome:"partial"});
 expect((await f.rows()).messages[1]).toMatchObject({content:"真实回复",modelMetadata:{completeness:"partial",stopReason:"length"}});
});
it.each(["cancelled", "pause_requested", "expired", "fence", "source", "account", "frozen", "missing-reference", "extra-reference", "unknown", "checkpoint"])("拒绝 %s，不留下半套回复", async (mode) => {
    const f = await fixture({ checkpoint: mode !== "checkpoint" });
    let ref = f.ref, request = f.request;
    if (mode === "cancelled" || mode === "pause_requested")
        await db.update(executionTasks).set({ status: mode }).where(eq(executionTasks.id, f.task.id));
    if (mode === "expired")
        await db.update(executionTasks).set({ leaseExpiresAt: "2026-09-05T21:00:00.000Z" }).where(eq(executionTasks.id, f.task.id));
    if (mode === "fence")
        ref = { ...ref, fenceToken: "wrong" };
    if (mode === "source")
        await db.update(aiMessages).set({ content: "新问题" }).where(eq(aiMessages.id, f.source.id));
    if (mode === "account")
        await db.update(aiConversations).set({ accountId: "foreign" }).where(eq(aiConversations.id, f.conversation.id));
    if (mode === "frozen") {
        const payload = f.task.payload as {
            modelInput: object;
        };
        await db.update(executionTasks).set({ payload: { ...payload, modelInput: { ...payload.modelInput, system: "被修改" } } }).where(eq(executionTasks.id, f.task.id));
    }
    if (mode === "missing-reference")
        request = { ...request, lastModelCallId: "wrong" };
    if (mode === "extra-reference")
        request = { ...request, toolCallIds: ["invented"] };
    if (mode === "unknown")
        await db.update(executionCalls).set({ status: "unknown" }).where(eq(executionCalls.id, f.call.callId));
    await expect(f.service.commitResult(ref, request)).rejects.toThrow();
    const results = await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, f.submit.taskId));
    expect(results).toHaveLength(0);
    const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, f.conversation.id));
    expect(messages).toHaveLength(1);
});
it("纯空输出不被保存为成功", async () => { const f = await fixture({ text: "" }); await expect(f.service.commitResult(f.ref, f.request)).rejects.toThrow("没有可保存产物"); expect((await f.rows()).results).toHaveLength(0); });
it("终态更新失败回滚消息与结果，修复数据库后沿原调用完成", async () => {
    const f = await fixture();
    await db.execute(sql.raw(`CREATE FUNCTION fail_chat_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${f.task.id}' AND NEW.status = 'succeeded' THEN RAISE EXCEPTION 'chat finish failed'; END IF; RETURN NEW; END $$;`));
    await db.execute(sql.raw("CREATE TRIGGER fail_chat_finish BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION fail_chat_finish();"));
    try {
        await expect(f.service.commitResult(f.ref, f.request)).rejects.toThrow();
        const rows = await f.rows();
        expect(rows.messages).toHaveLength(1);
        expect(rows.results).toHaveLength(0);
        expect(rows.task.status).toBe("running");
        expect(rows.call.resultRef).toBeNull();
        expect(await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id))).toHaveLength(0);
    }
    finally {
        await db.execute(sql.raw("DROP TRIGGER fail_chat_finish ON execution_tasks;"));
        await db.execute(sql.raw("DROP FUNCTION fail_chat_finish();"));
    }
    expect(await f.service.commitResult(f.ref, f.request)).toMatchObject({ outcome: "succeeded" });
    expect((await f.rows()).messages).toHaveLength(2);
});
it("已完成消息被改写后不返回伪幂等成功", async () => {
    const f = await fixture();
    const result = await f.service.commitResult(f.ref, f.request);
    await db.update(aiMessages).set({ content: "另一个回复" }).where(eq(aiMessages.id, result.messageId));
    await expect(f.service.commitResult(f.ref, f.request)).rejects.toThrow("完成回执不一致");
    expect((await f.rows()).results).toHaveLength(1);
});

it("完成结果引用被篡改后拒绝幂等成功", async () => {
 const f=await fixture();const result=await f.service.commitResult(f.ref,f.request);
 await db.update(aiTaskResults).set({resultData:{messageId:"foreign"}}).where(eq(aiTaskResults.id,result.resultId));
 await expect(f.service.commitResult(f.ref,f.request)).rejects.toThrow("完成回执不一致");
 expect((await f.rows()).messages).toHaveLength(2);
});

it.each([
 {type:"source",sourceType:"url",id:"source-1",url:"https://example.com/article",title:"来源"},
 {type:"source",sourceType:"document",id:"document-1",mediaType:"application/pdf",title:"文档",filename:"source.pdf"},
 {type:"file",mediaType:"image/png",data:{type:"data",data:"aGVsbG8="}},
 {type:"file",mediaType:"audio/mpeg",data:{type:"url",url:"https://example.com/audio.mp3"}},
 {type:"reasoning-file",mediaType:"image/png",data:{type:"data",data:"aGVsbG8="}},
])("检查点与提交保留非文本回执 %j",async part=>{
 const f=await fixture({content:[{type:"text",text:"真实回复"},part]});
 await f.service.commitResult(f.ref,f.request);
 const rows=await f.rows();
 const parts=rows.messages[1]!.parts as Array<Record<string,unknown>>;
 expect(parts).toEqual(expect.arrayContaining([expect.objectContaining(part.type==="source"?{type:part.sourceType==="url"?"source-url":"source-document",sourceId:part.id}:{type:part.type,mediaType:part.mediaType,url:part.data?.type==="data"?`data:${part.mediaType};base64,${part.data.data}`:part.data?.url})]));
});
it("纯文件回复能提交，来源和推理文件不能冒充最终产物",async()=>{
 const file={type:"file",mediaType:"image/png",data:{type:"data",data:"AQID"}};
 const f=await fixture({content:[file]});
 await expect(f.service.commitResult(f.ref,f.request)).resolves.toMatchObject({outcome:"succeeded"});
 expect((await f.rows()).messages[1]).toMatchObject({content:"",parts:[{type:"step-start"},{type:"file",mediaType:"image/png",url:"data:image/png;base64,AQID"}]});
 for(const part of [{...file,type:"reasoning-file"},{type:"source",sourceType:"url",id:"s",url:"https://example.com"}]){
  const empty=await fixture({content:[part]});
  await expect(empty.service.commitResult(empty.ref,empty.request)).rejects.toThrow("没有可保存产物");
  expect((await empty.rows()).results).toHaveLength(0);
 }
});
it.each([
 {type:"source",sourceType:"url",id:"s"},
 {type:"source",sourceType:"document",id:"s",title:"缺少类型"},
 {type:"file",mediaType:"image/png",data:{type:"data",data:123}},
 {type:"file",mediaType:"image/png",data:{type:"reference",id:"不可恢复"}},
 {type:"custom",kind:"未经支持"},
])("损坏或不支持的非文本回执不能进入检查点：%j",async part=>{
 await expect(fixture({content:[part]})).rejects.toThrow("尚不能恢复");
});

it("结束事件被篡改后拒绝伪幂等成功",async()=>{
 const f=await fixture();await f.service.commitResult(f.ref,f.request);
 await db.update(executionStreamEvents).set({chunk:{type:"finish",finishReason:"length"}}).where(eq(executionStreamEvents.executionTaskId,f.task.id));
 await expect(f.service.commitResult(f.ref,f.request)).rejects.toThrow("结束事件不一致");
});

it("旧已完成任务缺结束事件时仅补事件，不重复消息或结果",async()=>{
 const f=await fixture();await f.service.commitResult(f.ref,f.request);
 await db.delete(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id));
 await Promise.all([f.service.commitResult(f.ref,f.request),f.service.commitResult(f.ref,f.request)]);
 expect(await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id))).toHaveLength(1);
 expect((await f.rows()).messages).toHaveLength(2);expect((await f.rows()).results).toHaveLength(1);
});

it("内部模型不进入最终消息，但真实用量计入整个聊天回合",async()=>{
 const tools={"web.read":{version:"1",parameters:z.object({}).strict(),effect:"none" as const}};
 const f=await fixture({checkpoint:false,finishReason:"tool-calls",content:[{type:"tool-call",toolCallId:"read",toolName:"web_read",input:"{}"}],tools:[{name:"web.read",version:"1",description:"测试读取",parameters:{type:"object"},effect:"none"}]});
 const ports=createExecutionAgenticToolPorts(db,{now,budget,tools});
 const parent=await ports.reserve(f.ref,{modelCallId:f.call.callId,toolCallId:"read"});await ports.start(f.ref,{callId:parent.callId});
 const child=await f.ledger.reserve(f.ref,{operationKey:"internal",kind:"model",parentCallId:parent.callId,inputDigest:"sha256:"+"c".repeat(64),reservedTokens:20});await f.ledger.start(f.ref,child.id);
 await f.ledger.settle(f.ref,child.id,{status:"settled",usage:{},providerResult:{content:[{type:"text",text:"内部内容不可显示"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:4},outputTokens:{total:3}},warnings:[]}});
 await ports.settle(f.ref,{callId:parent.callId,status:"settled",output:{status:"ok",summary:"完成",evidence:[],data:{kind:"read.result"},error:null,continuation:null,sideEffect:"none"}});
 await createChatToolStreamProjection(db,{now,tools})(f.ref,parent.callId);
 const last=await f.generation.reserveGenerationCall(f.ref,{operationKey:`${f.frozen.operationKey}/model/2`,request:{maxOutputTokens:128}});await f.ledger.start(f.ref,last.callId);
 await f.generation.settleGenerationCall(f.ref,{callId:last.callId,status:"settled",usage:{},providerResult:{content:[{type:"text",text:"外层最终回复"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 await createExecutionCheckpointService(db,{now}).save(f.ref,{expectedRevision:0,expectedLedgerSequence:4,messages:[{role:"assistant",callId:f.call.callId},{role:"tool",callId:parent.callId},{role:"assistant",callId:last.callId}]});
 await expect(f.service.commitResult(f.ref,{lastModelCallId:child.id,toolCallIds:[parent.callId]})).rejects.toThrow();
 const request={lastModelCallId:last.callId,toolCallIds:[parent.callId]};
 await f.service.commitResult(f.ref,request);await f.service.commitResult(f.ref,request);
 const rows=await f.rows();expect(rows.messages).toHaveLength(2);
 expect(rows.messages[1]).toMatchObject({content:"外层最终回复",inputTokens:8,outputTokens:9});
 expect(JSON.stringify(rows.messages[1]!.parts)).not.toContain("内部内容不可显示");
});

it.each([false,true])("Pi 展示旧版=%s：公共工具流与完成消息一致，历史读取和完成重放不改写",async displayLegacy=>{
 for(const status of ["ok","error","blocked","partial"] as const){
  const tools={"context.projects":{version:"1",parameters:z.object({}).strict(),effect:"none" as const}};
  const f=await fixture({displayLegacy,checkpoint:false,finishReason:"tool-calls",content:[{type:"tool-call",toolCallId:"real-read",toolName:"context_projects",input:"{}"}],tools:[{name:"context.projects",version:"1",description:"真实读取",parameters:{type:"object"},effect:"none"}]});
  const ports=createExecutionAgenticToolPorts(db,{now,budget,tools}),tool=await ports.reserve(f.ref,{modelCallId:f.call.callId,toolCallId:"real-read"});await ports.start(f.ref,{callId:tool.callId});
  const data={kind:"context.projects",items:[],total:0},outcome={status,summary:status==="ok"?"读取完成":"账号权限已变更",evidence:[],data,error:status==="error"||status==="blocked"?{code:"permission" as const,retryable:false,recovery:"重新选择有权限的账号组"}:null,continuation:null,sideEffect:"none" as const};
  await ports.settle(f.ref,{callId:tool.callId,status:"settled",output:outcome});
  await createChatToolStreamProjection(db,{now,tools})(f.ref,tool.callId);
  const last=await f.generation.reserveGenerationCall(f.ref,{operationKey:`${f.frozen.operationKey}/model/2`,request:{maxOutputTokens:128}});await f.ledger.start(f.ref,last.callId);
  await f.generation.settleGenerationCall(f.ref,{callId:last.callId,status:"settled",usage:{},providerResult:{content:[{type:"text",text:"已核对原操作"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  await createExecutionCheckpointService(db,{now}).save(f.ref,{expectedRevision:0,expectedLedgerSequence:3,messages:[{role:"assistant",callId:f.call.callId},{role:"tool",callId:tool.callId},{role:"assistant",callId:last.callId}]});
  const request={lastModelCallId:last.callId,toolCallIds:[tool.callId]},result=await f.service.commitResult(f.ref,request),rows=await f.rows();
  const part=(rows.messages[1]!.parts as Array<Record<string,unknown>>).find(part=>part.toolCallId==="real-read")!;
  const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id)).orderBy(executionStreamEvents.sequence);
  expect(events.find(row=>row.chunk.type==="tool-output-available")?.chunk.output).toEqual(part.output);
  if(displayLegacy)expect(part.output).toEqual(data);else expect(part.output).toMatchObject({...data,__creatorosOutcome:{callId:tool.callId,status,summary:outcome.summary,error:outcome.error,sideEffect:"none"}});
  const before=JSON.stringify({rows,events});expect(await f.service.commitResult(f.ref,request)).toEqual(result);
  expect(JSON.stringify({rows:await f.rows(),events:await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,f.task.id)).orderBy(executionStreamEvents.sequence)})).toBe(before);
 }
});
