import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDb, aiConversations, aiMessages, aiTasks, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, eq, type Db } from "@creatoros/backend";
import { chatToolProviderName, chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { createAiRepository } from "./ai.repository";
import { createChatTurnSubmissionService, type ChatTurnSnapshot } from "./chat-turn-submission.service";
import { createChatTurnCompletionService } from "./chat-turn-completion.service";
import { createChatHostContextReader } from "./chat-host-context.service";
import { createChatProposalSourceService, sealChatProposal } from "./chat-proposal-source.service";
import { createExternalChatTurnService } from "./external-chat-turn.service";
import { createExternalTaskToolService } from "./external-task-tool.service";
import type { ChatHostContext } from "./chat-host-context";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionGenerationPorts } from "../execution/execution-generation-ports.service";
import { createExecutionChatToolPorts } from "../execution/execution-chat-tool-ports.service";
import { createExecutionCheckpointService } from "../execution/execution-checkpoint.service";
import { validateTerminalPlanFailures, validateTerminalToolFailures } from "../execution/workbench-plan.service";

let db: Db, close: () => Promise<void>, sequence = 0;
const budget = { maxCalls: 12, maxTokens: 10000, deadlineMs: 180000 };
const toolName = "system.action.propose", toolVersion = "frozen-history-test-v1";
const parameters = z.object({ kind: z.literal("project.create"), title: z.string().min(1) }).strict();
const parameterSchema = { type: "object", properties: { kind: { const: "project.create", type: "string" }, title: { type: "string", minLength: 1 } }, required: ["kind", "title"], additionalProperties: false };
const candidateSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal("system.action.proposal"), request: parameters }).strict();
beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); });
afterAll(async () => close());

async function fixture(engine: "pi" | "codex" = "pi") {
  const ctx = { userId: "t1090-user", accountId: `t1090-account-${++sequence}`, requestId: "test", source: "user" as const };
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 9) + tick).toISOString();
  const repo = createAiRepository(db, { ...ctx, now, nextId: prefix => `${prefix}-t1090-${++sequence}` });
  const conversation = await repo.createConversation({ title: "中性历史回放", projectId: null, scope: "global" });
  const message = (role: "user" | "assistant", content: string) => repo.createMessage(conversation.id, { role, content, attachments: [], modelMetadata: {} });
  tick = 1; const first = await message("user", "上一轮问题");
  tick = 2; const answer = await message("assistant", "上一轮回答");
  tick = 3; const source = await message("user", "本轮指令");
  // 本轮完成与后续消息共享 source 毫秒；原历史先用真实有序写入冻结。
  const host: ChatHostContext = { schemaVersion: 1, chatContext: { surface: "topics" }, mediaRoute: null, positioningScratch: false, trustedScriptSources: [], skillSnapshot: { snapshotVersion: 1, userId: ctx.userId, accountId: ctx.accountId, resolvedAt: now(), platformPolicyVersion: "1", platformPolicy: "仅产候选", skills: [{ skillId: "chatbox.topic", baseVersion: "1", overlayRevision: null, overlayVersion: null, effective: { methodSystem: "候选", template: "", tools: [toolName], requiredFacets: [], contextRequirements: [], outputSchema: null, completionPolicy: null, completionPolicyAdapter: null } }] } };
  const assemble = vi.fn(async (_ctx: unknown, snapshot: ChatTurnSnapshot) => ({ capability: "copilot.assist", system: "原策略", messages: snapshot.messages.map(row => ({ role: row.role as "user" | "assistant", content: row.content })), maxSteps: 8, maxOutputTokens: 128, hostContext: host, tools: [{ name: toolName, version: toolVersion, description: "准备中性项目候选", parameters: parameterSchema, effect: "proposal" as const }] }));
  const submission = createChatTurnSubmissionService(db, { now, assemble });
  const request = { conversationId: conversation.id, sourceMessageId: source.id, executionEngine: engine };
  const submitted = await submission.submit(ctx, request);
  const claim = (await createPersistentTaskService(db, { now }).claimTask({ taskId: submitted.executionTaskId, workerId: "t1090-worker" }))!;
  const ref = { executionTaskId: submitted.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
  const ledger = createExecutionCallLedgerService(db, { now, budget }), generation = createExecutionGenerationPorts(db, { now, budget });
  const reader = createChatHostContextReader(db, { now });
  const completion = createChatTurnCompletionService(db, { now, validateTerminalPlanFailures, validateTerminalToolFailures });
  const external = createExternalChatTurnService(db, { now, budget });
  const rows = async () => ({
    messages: await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation.id)).orderBy(aiMessages.id),
    business: (await db.select().from(aiTasks).where(eq(aiTasks.id, submitted.taskId)))[0]!,
    task: (await db.select().from(executionTasks).where(eq(executionTasks.id, submitted.executionTaskId)))[0]!,
    calls: await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, submitted.executionTaskId)).orderBy(executionCalls.sequence),
    results: await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, submitted.taskId)).orderBy(aiTaskResults.id),
    events: await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId, submitted.executionTaskId)).orderBy(executionStreamEvents.sequence),
  });
  const initial = await rows(), frozen = structuredClone({ inputData: initial.business.inputData, payload: initial.task.payload });
  expect((initial.business.inputData as { historyMessageIds: string[] }).historyMessageIds).toEqual([first.id, answer.id, source.id]);
  const modelInput = chatWorkerInputSchema.parse((initial.task.payload as { modelInput: unknown }).modelInput);
  let modelIndex = 0;
  async function settleModel(content: Array<Record<string, unknown>>, finishReason: "stop" | "tool-calls") {
    const call = await generation.reserveGenerationCall(ref, { operationKey: `${modelInput.operationKey}/model/${++modelIndex}`, request: { maxOutputTokens: 128 } });
    await ledger.start(ref, call.callId);
    await generation.settleGenerationCall(ref, { callId: call.callId, status: "settled", usage: { inputTokens: 2, outputTokens: 3 }, providerResult: { content, finishReason: { unified: finishReason }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
    return call;
  }
  async function finishPi() {
    const last = await settleModel([{ type: "text", text: "本轮真实回执" }], "stop"), calls = (await rows()).calls;
    await createExecutionCheckpointService(db, { now }).save(ref, { expectedRevision: 0, expectedLedgerSequence: calls.at(-1)!.sequence, messages: calls.map(call => ({ role: call.kind === "model" ? "assistant" as const : "tool" as const, callId: call.id })) });
    const request = { lastModelCallId: last.callId, toolCallIds: calls.filter(call => call.kind === "tool").map(call => call.id) };
    return { request, result: await completion.commitResult(ref, request) };
  }
  async function startExternal() {
    const turn = await external.reserve(ref, {});
    await external.start(ref, { callId: turn.callId, sessionId: "t1090-session", protocolKind: "acp", protocolVersion: 1 });
    return turn;
  }
  const externalReceipt = (callId: string) => ({ schemaVersion: 1 as const, engine: "codex" as const, protocolKind: "acp" as const, protocolVersion: 1, sessionId: "t1090-session", turnId: callId, stopReason: "end_turn" as const, text: "外部真实回执", usage: null });
  async function perturb(messageId: string) {
    // 合成数据库的区分性实验：仅令后续行排到 source 前，原冻结ID/摘要/正文/回执保持。
    await db.update(aiMessages).set({ createdAt: "2026-10-08T23:59:59.000Z" }).where(eq(aiMessages.id, messageId));
  }
  async function assertFrozen() {
    const current = await rows(); expect({ inputData: current.business.inputData, payload: current.task.payload }).toEqual(frozen);
    expect(assemble).toHaveBeenCalledTimes(1);
  }
  return { ctx, repo, source, conversation, message, submission, submitted, request, ref, reader, completion, external, rows, frozen, first, answer, now, modelInput, settleModel, startExternal, externalReceipt, finishPi, perturb, assertFrozen };
}

it("T1090 提交与宿主恢复按原冻结ID读真实历史，后续时间排序扰动不重复装配", async () => {
  const f = await fixture(), later = await f.message("assistant", "后续消息不属于本轮");
  await f.perturb(later.id); const before = await f.rows();
  expect(await f.submission.submit(f.ctx, f.request)).toEqual({ ...f.submitted, replayed: true });
  const snapshot = (await f.reader.read(f.ref)).snapshot;
  expect(snapshot.messages.map(row => row.id)).toEqual([f.first.id, f.answer.id, f.source.id]);
  expect(snapshot.messages.map(row => row.content)).toEqual(["上一轮问题", "上一轮回答", "本轮指令"]);
  expect(await f.rows()).toEqual(before); await f.assertFrozen();
});

it("T1090 Pi首次合法完成后原回执回放不被assistant时间排序扰动，零完成写", async () => {
  const f = await fixture(), finished = await f.finishPi();
  expect(finished.result.outcome).toBe("succeeded");
  await f.perturb(finished.result.messageId); const before = await f.rows();
  expect(await f.completion.commitResult(f.ref, finished.request)).toEqual(finished.result);
  expect(await f.submission.submit(f.ctx, f.request)).toEqual({ ...f.submitted, replayed: true });
  expect((await f.reader.read(f.ref, "settlement")).snapshot.messages.map(row => row.id)).toEqual([f.first.id, f.answer.id, f.source.id]);
  expect(await f.rows()).toEqual(before); expect(before.results).toHaveLength(1); expect(before.messages).toHaveLength(4); expect(before.events.filter(row => row.chunk.type === "finish")).toHaveLength(1);
  await f.assertFrozen();
});

it("T1090 外部引擎首次完成和原回放保持原任务/回执，后续排序不增加调用", async () => {
  const f = await fixture("codex"), turn = await f.startExternal();
  await f.external.settle(f.ref, { callId: turn.callId, status: "settled", receipt: f.externalReceipt(turn.callId) });
  const finished = await f.external.commit(f.ref, { callId: turn.callId });
  await f.perturb(finished.messageId); const before = await f.rows();
  expect(await f.external.commit(f.ref, { callId: turn.callId })).toEqual(finished);
  expect(await f.submission.submit(f.ctx, f.request)).toEqual({ ...f.submitted, replayed: true });
  expect((await f.reader.read(f.ref, "settlement")).snapshot.messages.map(row => row.id)).toEqual([f.first.id, f.answer.id, f.source.id]);
  expect(await f.rows()).toEqual(before); expect(before.results).toHaveLength(1); expect(before.calls).toHaveLength(1); await f.assertFrozen();
});

it.each(["pi", "codex"] as const)("T1090 %s真实宿主候选读取保留原来源，后续时间扰动不重发候选", async engine => {
  const f = await fixture(engine), input = { kind: "project.create" as const, title: "中性候选" }, toolCallId = `t1090-tool-${++sequence}`;
  const tool = { version: toolVersion, parameters, parameterSchema, effect: "proposal" as const, approve: async () => ({ status: "not-applicable" as const }), execute: async (_ctx: unknown, request: unknown, scope: { aiTaskId: string; callId: string; toolCallId: string }) => ({ status: "ok" as const, summary: "候选待采用", evidence: [], data: sealChatProposal({ taskId: scope.aiTaskId, callId: scope.callId, toolCallId: scope.toolCallId }, candidateSchema.parse({ schemaVersion: 1, kind: "system.action.proposal", request })), error: null, continuation: null, sideEffect: "proposal" as const }) };
  const tools = { [toolName]: tool }; let data: unknown;
  if (engine === "pi") {
    const model = await f.settleModel([{ type: "tool-call", toolCallId, toolName: chatToolProviderName(toolName), input: JSON.stringify(input) }], "tool-calls");
    const ports = createExecutionChatToolPorts(db, { now: f.now, budget, tools }), call = await ports.reserve(f.ref, { modelCallId: model.callId, toolCallId });
    await ports.start(f.ref, { callId: call.callId }); data = (await ports.execute(f.ref, { callId: call.callId })).data;
  } else {
    const turn = await f.startExternal();
    data = (await createExternalTaskToolService(db, { now: f.now }).execute(f.ref, { turnCallId: turn.callId, toolCallId, toolName, input }, tools, new AbortController().signal)).outcome!.data;
  }
  const source = (data as { source: unknown }).source, reader = createChatProposalSourceService(db, { tools, parseCandidate: (_name, value) => candidateSchema.parse(value) });
  const expected = await reader.read(f.ctx, source), later = await f.message("assistant", "后来的独立讨论"); await f.perturb(later.id); const before = await f.rows();
  expect(await reader.read(f.ctx, source)).toEqual(expected); expect(await f.rows()).toEqual(before); await f.assertFrozen();
});

it.each(["empty", "duplicate", "bad-type", "missing", "foreign", "source-not-last", "content", "parts", "attachments", "source-binding", "project", "account", "user", "frozen", "host", "fence"] as const)("T1090仍拒绝%s，不改原task/payload/消息/回执", async mode => {
  const f = await fixture(); let ref = f.ref;
  const businessInput = f.frozen.inputData as Record<string, unknown>, ids = businessInput.historyMessageIds as string[];
  const altered: Record<string, unknown> = { empty: [], duplicate: [ids[0], ids[0], f.source.id], "bad-type": [null, f.source.id], missing: ["missing", f.source.id], "source-not-last": [...ids, f.first.id] };
  if (Object.hasOwn(altered, mode)) await db.update(aiTasks).set({ inputData: { ...businessInput, historyMessageIds: altered[mode] } }).where(eq(aiTasks.id, f.submitted.taskId));
  if (mode === "foreign") { const other = await fixture(); await db.update(aiTasks).set({ inputData: { ...businessInput, historyMessageIds: [other.source.id, f.source.id] } }).where(eq(aiTasks.id, f.submitted.taskId)); }
  if (mode === "content") await db.update(aiMessages).set({ content: "被改过的历史" }).where(eq(aiMessages.id, f.first.id));
  if (mode === "parts") await db.update(aiMessages).set({ parts: [{ type: "text", text: "被改过的part" }] }).where(eq(aiMessages.id, f.answer.id));
  if (mode === "attachments") await db.update(aiMessages).set({ attachments: [{ assetId: "changed" }] }).where(eq(aiMessages.id, f.source.id));
  if (mode === "source-binding") await db.update(aiMessages).set({ modelMetadata: { chatTaskId: "missing-task" } }).where(eq(aiMessages.id, f.source.id));
  if (mode === "project") await db.update(aiConversations).set({ projectId: "changed-project" }).where(eq(aiConversations.id, f.conversation.id));
  if (mode === "account") await db.update(aiConversations).set({ accountId: "foreign-account" }).where(eq(aiConversations.id, f.conversation.id));
  if (mode === "user") await db.update(aiConversations).set({ userId: "foreign-user" }).where(eq(aiConversations.id, f.conversation.id));
  if (mode === "frozen") { const payload = f.frozen.payload as { modelInput: Record<string, unknown> }; await db.update(executionTasks).set({ payload: { ...payload, modelInput: { ...payload.modelInput, system: "changed-system" } } }).where(eq(executionTasks.id, f.submitted.executionTaskId)); }
  if (mode === "host") { const payload = f.frozen.payload as { hostContext: Record<string, unknown> }; await db.update(executionTasks).set({ payload: { ...payload, hostContext: { ...payload.hostContext, positioningScratch: true } } }).where(eq(executionTasks.id, f.submitted.executionTaskId)); }
  if (mode === "fence") ref = { ...ref, fenceToken: "old-fence" };
  const before = await f.rows(); await expect(f.reader.read(ref)).rejects.toThrow(); expect(await f.rows()).toEqual(before);
  if (mode !== "fence") { await expect(f.submission.submit(f.ctx, f.request)).rejects.toThrow(); expect(await f.rows()).toEqual(before); }
});
