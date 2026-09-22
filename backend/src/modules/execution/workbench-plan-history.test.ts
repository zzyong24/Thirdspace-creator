import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, expect, it} from "vitest";
import {aiTasks, createDb, eq, executionCalls, executionTasks, type Db} from "@creatoros/backend";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {createChatWorkbenchPlanToolHost} from "../ai-runtime/chat-workbench-plan-tool-host";
import {chatWorkbenchPlanCapability} from "../ai-runtime/chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionChatToolPorts} from "./execution-chat-tool-ports.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";

let db: Db, close: () => Promise<void>;
beforeAll(async () => {const opened = await createDb(); db = opened.db; close = () => opened.client.close();});
afterAll(async () => close?.());
const step = (stepId: string) => ({stepId, title: stepId, status: "failed" as const, dependsOn: [], operationRefs: [], artifactRefs: []});
async function fixture() {
  const id = randomUUID(), owner = {userId: id, accountId: id, requestId: id, source: "user" as const};
  let tick = Date.parse("2026-09-22T00:00:00Z"), sequence = 0;
  const now = () => new Date(tick += 10).toISOString();
  const prototype = defineWorkbenchChatTool(chatWorkbenchPlanCapability, () => {throw Error("unused");});
  const prepared = await prepareChatToolDefinitions({"plan.update": prototype}, {workbenchCapabilities: [chatWorkbenchPlanCapability]});
  const input = chatWorkerInputSchema.parse({kind: "chat.run", executionEngine: "pi", operationKey: id, capability: "copilot.assist",
    userId: id, accountId: id, conversationId: id, sourceMessageId: id, system: "历史计划回放", messages: [{role: "user", content: "继续"}],
    maxSteps: 4, maxOutputTokens: 128, tools: prepared.definitions});
  const tasks = createPersistentTaskService(db, {now});
  const task = await tasks.enqueue(owner, {kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: {aiTaskId: id, modelInput: input}});
  await db.insert(aiTasks).values({id, userId: id, accountId: id, taskType: "copilot.assist", status: "running", executionTaskId: task.id,
    idempotencyKey: id, requestedAt: now(), inputData: {modelInputDigest: chatInputDigest(input)}});
  const claim = (await tasks.claimTask({taskId: task.id, workerId: id}))!;
  const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
  const budget = {maxCalls: 100, maxTokens: 10000, deadlineMs: 60000};
  const ledger = createExecutionCallLedgerService(db, {now, budget}), plans = createWorkbenchPlanService(db, {now});
  const tools = await createChatWorkbenchPlanToolHost(db, {now})(owner, input, ref, new AbortController().signal);
  const ports = createExecutionChatToolPorts(db, {now, budget, tools});
  async function model(proposal?: unknown) {
    const call = await ledger.reserve(ref, {kind: "model", operationKey: `${id}/model/${++sequence}`, inputDigest: `sha256:${"a".repeat(64)}`, reservedTokens: 20});
    await ledger.start(ref, call.id);
    await ledger.settle(ref, call.id, {status: "settled", usage: {totalTokens: 2}, providerResult: {
      content: proposal ? [{type: "tool-call", toolCallId: `provider-${sequence}`, toolName: "plan_update", input: JSON.stringify(proposal)}] : [{type: "text", text: "如实交付"}],
      finishReason: {unified: proposal ? "tool-calls" : "stop"}, usage: {inputTokens: {total: 1}, outputTokens: {total: 1}}, warnings: [],
    }});
    return call.id;
  }
  async function save(expectedRevision: number, steps = [step("first")]) {
    const modelCallId = await model({expectedRevision, steps});
    const call = await ports.reserve(ref, {modelCallId, toolCallId: `provider-${sequence}`});
    await ports.start(ref, {callId: call.callId});
    expect(await ports.execute(ref, {callId: call.callId})).toMatchObject({status: "ok", sideEffect: "committed"});
    return call.callId;
  }
  const empty = await model();
  await save(0); await save(1); const revision3 = await save(2);
  const stop3 = await model();
  const revision4 = await save(3, [step("first"), step("later")]), stop4 = await model();
  return {ref, plans, ledger, ports, model, save, empty, revision3, revision4, stop3, stop4, owner, task, tasks, tools, now, budget};
}

it("两个历史stop分别读取rev3/rev4；更早的无计划状态可证明为null且不改账本费用", async () => {
  const f = await fixture(), before = await f.ledger.inspect(f.ref);
  expect(await f.plans.status(f.ref, {modelCallId: f.empty})).toBeNull();
  expect(await f.plans.status(f.ref, {modelCallId: f.stop3})).toMatchObject({revision: 3, steps: [{stepId: "first"}]});
  expect(await f.plans.status(f.ref, {modelCallId: f.stop4})).toMatchObject({revision: 4, steps: [{stepId: "first"}, {stepId: "later"}]});
  expect(await f.plans.status(f.ref)).toMatchObject({revision: 4});
  expect(await f.ledger.inspect(f.ref)).toEqual(before);
});

it("正式host保存后结算前中断：实际recover转reserved后可回放旧stop，再沿原call补结算", async () => {
  const f = await fixture(), request = {expectedRevision: 4, steps: [step("first"), step("later"), step("recovered")]};
  const modelCallId = await f.model(request);
  const source = (await f.ledger.inspect(f.ref)).calls.find(call => call.id === modelCallId)!;
  const provider = source.providerResult as {content: Array<{toolCallId: string}>};
  const toolCallId = provider.content[0]!.toolCallId;
  const interrupted = createExecutionChatToolPorts(db, {now: f.now, budget: f.budget, tools: {...f.tools, "plan.update": {
    ...f.tools["plan.update"]!, execute: async () => {await f.plans.save(f.ref, request); throw Error("AFTER_SAVE_BEFORE_RECEIPT");},
  }}});
  const pending = await interrupted.reserve(f.ref, {modelCallId, toolCallId});
  await interrupted.start(f.ref, {callId: pending.callId});
  await expect(interrupted.execute(f.ref, {callId: pending.callId})).rejects.toThrow();
  await db.update(executionTasks).set({status: "unknown_result", leaseOwner: null, leaseExpiresAt: null}).where(eq(executionTasks.id, f.task.id));
  expect(await f.tasks.recoverExpiredLeases({includeSafeUnknownResults: true, taskId: f.task.id})).toMatchObject({requeued: 1});
  const next = (await f.tasks.claimTask({taskId: f.task.id, workerId: "resumed"}))!;
  const ref = {executionTaskId: f.task.id, attempt: next.lease.attempt, fenceToken: next.lease.fenceToken};
  const before = (await f.ledger.inspect(ref)).calls;
  expect(before.find(call => call.id === pending.callId)).toMatchObject({status: "reserved", startedAttempt: null, toolExecutionClaimId: null, resultText: null});
  expect(await f.plans.status(ref, {modelCallId: f.stop3})).toMatchObject({revision: 3});
  expect(await f.plans.status(ref, {modelCallId: f.stop4})).toMatchObject({revision: 4});
  expect((await f.ledger.inspect(ref)).calls).toEqual(before);
  const pendingRow = before.find(call => call.id === pending.callId)!;
  for (const patch of [{inputDigest: `sha256:${"b".repeat(64)}`}, {status: "unknown"}, {toolExecutionClaimId: "other-writer"}]) {
    await db.update(executionCalls).set(patch).where(eq(executionCalls.id, pending.callId));
    await expect(f.plans.status(ref, {modelCallId: f.stop3})).rejects.toThrow("WORKBENCH_PLAN_HISTORY_UNPROVEN");
    await db.update(executionCalls).set({inputDigest: pendingRow.inputDigest, status: pendingRow.status, toolExecutionClaimId: null}).where(eq(executionCalls.id, pending.callId));
  }
  const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, f.task.id));
  const payload = task!.payload as Record<string, unknown>;
  await db.update(executionTasks).set({payload: {...payload, workbenchPlan: {planRevision: 5, steps: [step("different")]}}}).where(eq(executionTasks.id, f.task.id));
  await expect(f.plans.status(ref, {modelCallId: f.stop3})).rejects.toThrow("WORKBENCH_PLAN_HISTORY_UNPROVEN");
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id, f.task.id));
  const retry = await f.ports.reserve(ref, {modelCallId, toolCallId});
  expect(retry.callId).toBe(pending.callId); await f.ports.start(ref, {callId: retry.callId});
  expect(await f.ports.execute(ref, {callId: retry.callId})).toMatchObject({status: "ok", sideEffect: "committed"});
  expect(await f.plans.status(ref, {modelCallId: f.stop4})).toMatchObject({revision: 4});
  const after = (await f.ledger.inspect(ref)).calls;
  expect(after.filter(call => call.id !== pending.callId)).toEqual(before.filter(call => call.id !== pending.callId));
  expect(after.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0)).toBe(before.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0));
});

it.each([false, true])("历史读取不因未来未完成计划提案阻断（已预留=%s）", async reserved => {
  const f = await fixture();
  const proposal = await f.model({expectedRevision: 4, steps: [step("first"), step("later"), step("future")]});
  if (reserved) {
    const model = (await f.ledger.inspect(f.ref)).calls.find(call => call.id === proposal)!;
    const provider = model.providerResult as {content: Array<{toolCallId: string}>};
    await f.ports.reserve(f.ref, {modelCallId: proposal, toolCallId: provider.content[0]!.toolCallId});
  }
  expect(await f.plans.status(f.ref, {modelCallId: f.stop3})).toMatchObject({revision: 3});
});

it("同参数正式复用保留原operationId；rev4后读取旧rev3回执不能倒退历史计划", async () => {
  const f = await fixture();
  const reused = await f.save(2), model = await f.model();
  const row = (await f.ledger.inspect(f.ref)).calls.find(call => call.id === reused)!;
  expect(JSON.parse(row.resultText!)).toMatchObject({reusedCallId: f.revision3, output: {data: {result: {operationId: f.revision3}}}});
  expect(await f.plans.status(f.ref, {modelCallId: f.stop3})).toMatchObject({revision: 3});
  expect(await f.plans.status(f.ref, {modelCallId: model})).toMatchObject({revision: 4});
  const receipt = JSON.parse(row.resultText!); receipt.reusedCallId = f.revision4;
  await db.update(executionCalls).set({resultText: JSON.stringify(receipt)}).where(eq(executionCalls.id, row.id));
  await expect(f.plans.status(f.ref, {modelCallId: model})).rejects.toThrow("WORKBENCH_PLAN_HISTORY_UNPROVEN");
});

it.each(["absent", "foreign", "tool", "child", "unknown", "operationKey"])("历史锚点%s不可静默回退current", async mode => {
  const f = await fixture(); let modelCallId = f.stop3;
  if (mode === "absent") modelCallId = "missing-model";
  if (mode === "foreign") modelCallId = (await fixture()).stop3;
  if (mode === "tool") modelCallId = f.revision3;
  if (mode === "child") await db.update(executionCalls).set({parentCallId: f.revision3}).where(eq(executionCalls.id, modelCallId));
  if (mode === "unknown") await db.update(executionCalls).set({status: "unknown"}).where(eq(executionCalls.id, modelCallId));
  if (mode === "operationKey") await db.update(executionCalls).set({operationKey: "unrelated/model/1"}).where(eq(executionCalls.id, modelCallId));
  await expect(f.plans.status(f.ref, {modelCallId})).rejects.toThrow("WORKBENCH_PLAN_HISTORY_UNPROVEN");
});

it.each(["missing", "receipt-id", "provider-id", "steps", "feedback", "late", "direct-save", "unrelated-tool"])("历史计划%s不能伪装正式提交或借未来计划修补", async mode => {
  const f = await fixture();
  const [row] = await db.select().from(executionCalls).where(eq(executionCalls.id, f.revision3));
  const receipt = JSON.parse(row!.resultText!);
  if (mode === "missing") await db.update(executionCalls).set({resultText: null}).where(eq(executionCalls.id, row!.id));
  if (mode === "receipt-id") receipt.output.data.result.operationId = "another-call";
  if (mode === "provider-id") receipt.toolCallId = "another-provider-id";
  if (mode === "steps") {const plan = JSON.parse(receipt.output.data.result.content[0].text); plan.steps[0].title = "forged"; receipt.output.data.result.content[0].text = JSON.stringify(plan);}
  if (mode === "feedback") receipt.output = {...receipt.output, status: "error", sideEffect: "none", data: {kind: "workbench.plan.validation", currentPlan: JSON.parse(receipt.output.data.result.content[0].text)}};
  if (["receipt-id", "provider-id", "steps", "feedback"].includes(mode)) await db.update(executionCalls).set({resultText: JSON.stringify(receipt)}).where(eq(executionCalls.id, row!.id));
  if (mode === "late") await db.update(executionCalls).set({updatedAt: "2026-09-23T00:00:00.000Z"}).where(eq(executionCalls.id, row!.id));
  if (mode === "direct-save") await f.plans.save(f.ref, {expectedRevision: 4, steps: [step("first"), step("later"), step("no-receipt")]});
  if (mode === "unrelated-tool") {
    const source = (await f.ledger.inspect(f.ref)).calls.find(call => call.sequence === row!.sequence - 1)!;
    const result = source.providerResult as {content: Array<{toolName: string}>}; result.content[0]!.toolName = "unrelated_tool";
    await db.update(executionCalls).set({providerResult: result}).where(eq(executionCalls.id, source.id));
  }
  await expect(f.plans.status(f.ref, {modelCallId: f.stop3})).rejects.toThrow("WORKBENCH_PLAN_HISTORY_UNPROVEN");
});
