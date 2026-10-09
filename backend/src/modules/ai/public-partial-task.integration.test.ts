import { afterAll, beforeAll, expect, it } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { aiTasks, executionTasks, executionCalls, createDb, eq, type Db } from "@creatoros/backend";
import { createAiService } from "./ai.service";
import { createAiTransport } from "./ai.transport";
import { createChatTurnSubmissionService } from "./chat-turn-submission.service";
import { createChatTurnCompletionService } from "./chat-turn-completion.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../execution/execution-generation-ports.service";
import { createExecutionCheckpointService } from "../execution/execution-checkpoint.service";
import { validateTerminalPlanFailures, validateTerminalToolFailures } from "../execution/workbench-plan.service";

let db: Db, close: () => Promise<void>, sequence = 0;
const now = () => "2026-10-09T00:00:00.000Z";
const nextId = (prefix: string) => `${prefix}-public-partial-${++sequence}`;
const ctx: RequestContext = { userId: "partial-owner", accountId: "partial-account", requestId: "partial-read", source: "user" };
const budget = { maxCalls: 6, maxTokens: 10000, deadlineMs: 120000 };
beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); }, 180000);
afterAll(async () => { await close(); }, 180000);
const forbidden = async () => { throw Error("只读验收禁止模型或候选采用"); };
function service() {
  return createAiService({ db, now, nextId, artifacts: { createVersion: forbidden }, knowledge: { createKnowledge: forbidden },
    candidate: { createFromAIResult: forbidden, enrichCard: forbidden }, positioning: { upsertProfile: forbidden, createStatementVersion: forbidden },
    learnings: { createLearning: forbidden }, publishing: { createPublicationFromDraft: forbidden }, materialLinks: { link: forbidden },
    calibration: { createDraftPrediction: forbidden } });
}
async function completedPartial() {
  const ai = service(), conversation = await ai.createConversation(ctx, { title: "真实部分完成端口", projectId: null, scope: "global" });
  const source = await ai.createMessage(ctx, conversation.id, { content: "只读验收部分完成", attachments: [] });
  const submitter = createChatTurnSubmissionService(db, { now, nextId, assemble: async () => ({
    capability: "copilot.assist", system: "隔离回执：无模型网络", messages: [{ role: "user" as const, content: source.content }],
    tools: [], maxSteps: 6, maxOutputTokens: 128,
  }) });
  const request = { conversationId: conversation.id, sourceMessageId: source.id };
  const submitted = await submitter.submit(ctx, request);
  const claimed = (await createPersistentTaskService(db, { now }).claimTask({ taskId: submitted.executionTaskId, workerId: "partial-fixture" }))!;
  const ref = { executionTaskId: submitted.executionTaskId, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken };
  const generation = createExecutionGenerationPorts(db, { now, budget }), ledger = createExecutionCallLedgerService(db, { now, budget });
  const call = await generation.reserveGenerationCall(ref, { operationKey: `chat:${source.id}/model/1`, request: { maxOutputTokens: 128 } });
  await ledger.start(ref, call.callId);
  // 显式隔离供应商回执；验证原账本→completion→公开读合同，不声称真实模型执行。
  await generation.settleGenerationCall(ref, { callId: call.callId, status: "settled", providerResult: {
    content: [{ type: "text", text: "实际收到的部分正文" }], finishReason: { unified: "length" },
    usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [],
  }, usage: { inputTokens: 2, outputTokens: 3 } });
  await createExecutionCheckpointService(db, { now }).save(ref, { expectedRevision: 0, expectedLedgerSequence: 1, messages: [{ role: "assistant", callId: call.callId }] });
  const completion = createChatTurnCompletionService(db, { now, validateTerminalPlanFailures, validateTerminalToolFailures }), completeRequest = { lastModelCallId: call.callId, toolCallIds: [] };
  expect(await completion.commitResult(ref, completeRequest)).toMatchObject({ outcome: "partial" });
  return { ai, conversation, source, submitted, submitter, request, completion, ref, completeRequest };
}
async function read(operation: "getTask" | "listAITasks", taskId: string, context = ctx) {
  const transport = createAiTransport(service);
  if (operation === "getTask") {
    const raw = await transport.request(ENDPOINTS.getTask, { params: { taskId }, query: undefined, body: undefined }, context) as { data: unknown };
    return ENDPOINTS.getTask.response.parse(raw.data);
  }
  const raw = await transport.request(ENDPOINTS.listAITasks, { params: undefined, query: { page: 1, pageSize: 100 }, body: undefined }, context) as { data: unknown };
  return ENDPOINTS.listAITasks.response.array().parse(raw.data);
}
it("原partial完成经正式get/list/find严格合同可读，原冻结、消息、结果和同键回放不变", async () => {
  const f = await completedPartial();
  const before = { business: await db.select().from(aiTasks).where(eq(aiTasks.id, f.submitted.taskId)),
    execution: await db.select().from(executionTasks).where(eq(executionTasks.id, f.submitted.executionTaskId)),
    calls: await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, f.submitted.executionTaskId)),
    messages: await f.ai.listMessages(ctx, f.conversation.id), results: await f.ai.listResults(ctx, f.submitted.taskId) };
  expect(before.business[0]).toMatchObject({ status: "partial" });
  expect(before.execution[0]).toMatchObject({ status: "partial", leaseOwner: null, leaseExpiresAt: null });
  expect(await read("getTask", f.submitted.taskId)).toMatchObject({ id: f.submitted.taskId, status: "partial", runtimeStatus: "partial", executionTaskId: f.submitted.executionTaskId });
  const rows = await read("listAITasks", f.submitted.taskId);
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: f.submitted.taskId, status: "partial", runtimeStatus: "partial" })]));
  expect(await f.ai.findTaskByAttempt(ctx, "copilot.assist", before.business[0]!.attemptId)).toMatchObject({ id: f.submitted.taskId, status: "partial" });
  expect(await f.submitter.submit(ctx, f.request)).toEqual({ ...f.submitted, replayed: true });
  expect(await f.completion.commitResult(f.ref, f.completeRequest)).toMatchObject({ outcome: "partial" });
  expect(await db.select().from(aiTasks).where(eq(aiTasks.id, f.submitted.taskId))).toEqual(before.business);
  expect(await db.select().from(executionTasks).where(eq(executionTasks.id, f.submitted.executionTaskId))).toEqual(before.execution);
  expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, f.submitted.executionTaskId))).toEqual(before.calls);
  expect(await f.ai.listMessages(ctx, f.conversation.id)).toEqual(before.messages);
  expect(await f.ai.listResults(ctx, f.submitted.taskId)).toEqual(before.results);
});
it("partial仍守原用户与账号归属，确认不能把部分回复当可采纳候选", async () => {
  const f = await completedPartial();
  for (const foreign of [{ ...ctx, userId: "foreign" }, { ...ctx, accountId: "foreign" }]) {
    await expect(read("getTask", f.submitted.taskId, foreign)).rejects.toThrow();
    expect(await read("listAITasks", f.submitted.taskId, foreign)).toEqual([]);
  }
  await expect(f.ai.confirmTask(ctx, f.submitted.taskId)).rejects.toThrow();
  expect(await f.ai.listResults(ctx, f.submitted.taskId)).toHaveLength(1);
});
