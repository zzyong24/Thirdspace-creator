import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, aiConversations, aiMessages, aiTasks, aiTaskResults, executionTasks, executionCalls, eq, sql, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService } from "./chat-turn-submission.service";
import { createChatTurnCompletionService } from "./chat-turn-completion.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../execution/execution-generation-ports.service";
import { createExecutionCheckpointService } from "../execution/execution-checkpoint.service";
let db: Db, close: () => Promise<void>, sequence = 0;
const now = () => "2026-09-05T22:00:00.000Z", budget = { maxCalls: 6, maxTokens: 10000, deadlineMs: 60000 };
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close());
async function fixture(options: {
    text?: string;
    content?: Array<Record<string,unknown>>;
    finishReason?: string;
    checkpoint?: boolean;
    unknownUsage?: boolean;
} = {}) {
    const ctx = { userId: "chat-completion-u", accountId: `chat-completion-a-${++sequence}`, requestId: "test", source: "user" as const };
    const repo = createAiRepository(db, { userId: ctx.userId, accountId: ctx.accountId, now, nextId: prefix => `${prefix}-${++sequence}` });
    const conversation = await repo.createConversation({ title: "会话", projectId: null, scope: "global" });
    const source = await repo.createMessage(conversation.id, { role: "user", content: "问题", attachments: [], modelMetadata: {} });
    const submit = await createChatTurnSubmissionService(db, { now, assemble: async () => ({ capability: "copilot.assist", system: "策略", messages: [{ role: "user", content: "问题" }], maxSteps: 6, maxOutputTokens: 128, tools: [] }) }).submit(ctx, { conversationId: conversation.id, sourceMessageId: source.id });
    const tasks = createPersistentTaskService(db, { now }), claim = (await tasks.claimTask({ taskId: submit.executionTaskId, workerId: "worker" }))!;
    const ref = { executionTaskId: submit.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
    const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, submit.executionTaskId));
    const frozen = chatWorkerInputSchema.parse((task!.payload as {
        modelInput: unknown;
    }).modelInput);
    const ledger = createExecutionCallLedgerService(db, { now, budget }), generation = createExecutionGenerationPorts(db, { now, budget });
    const call = await generation.reserveGenerationCall(ref, { operationKey: `${frozen.operationKey}/model/1`, request: { maxOutputTokens: 128 } });
    await ledger.start(ref, call.callId);
    await generation.settleGenerationCall(ref, { callId: call.callId, status: "settled", providerResult: { content: options.content ?? [{ type: "text", text: options.text ?? "真实回复" }], finishReason: { unified: options.finishReason ?? "stop" }, usage: { inputTokens: options.unknownUsage ? {} : { total: 2 }, outputTokens: options.unknownUsage ? {} : { total: 3 } }, warnings: [] }, usage: options.unknownUsage ? {} : { inputTokens: 2, outputTokens: 3 } });
    if (options.checkpoint !== false)
        await createExecutionCheckpointService(db, { now }).save(ref, { expectedRevision: 0, expectedLedgerSequence: 1, messages: [{ role: "assistant", callId: call.callId }] });
    const service = createChatTurnCompletionService(db, { now }), request = { lastModelCallId: call.callId, toolCallIds: [] as string[] };
    const rows = async () => ({ messages: await repo.listMessages(conversation.id), results: await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, submit.taskId)), business: (await db.select().from(aiTasks).where(eq(aiTasks.id, submit.taskId)))[0]!, task: (await db.select().from(executionTasks).where(eq(executionTasks.id, submit.executionTaskId)))[0]!, call: (await db.select().from(executionCalls).where(eq(executionCalls.id, call.callId)))[0]! });
    return { ctx, repo, source, conversation, submit, ref, task: task!, call, service, request, rows };
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
});
it("长度截断保留真实回复并投影 partial；未知用量保留 null", async () => {
    const f = await fixture({ finishReason: "length", unknownUsage: true });
    expect(await f.service.commitResult(f.ref, f.request)).toMatchObject({ outcome: "partial" });
    const rows = await f.rows();
    expect(rows.messages[1]).toMatchObject({ content: "真实回复", inputTokens: null, outputTokens: null, cachedTokens: null, modelMetadata: { completeness: "partial", stopReason: "length" } });
    expect(rows.business.status).toBe("partial");
    expect(rows.task.status).toBe("partial");
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
