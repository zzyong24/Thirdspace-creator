import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createWorkbenchPlanService } from "./workbench-plan.service";
import type { WorkbenchPlan } from "@creatoros/contract/agent-workbench";

const now = () => "2026-09-19T00:00:00.000Z";
const ctx = {userId: "plan-user", accountId: "plan-account", requestId: "test", source: "user" as const};
const step = (stepId: string, overrides: Partial<WorkbenchPlan["steps"][number]> = {}): WorkbenchPlan["steps"][number] => ({stepId, title: stepId, dependsOn: [], status: "pending", operationRefs: [], artifactRefs: [], ...overrides});

describe("T-1005 计划作为原 execution_tasks 的投影", () => {
  let db: Db; let close: () => Promise<void>;
  beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); });
  afterAll(async () => close?.());
  async function fixture(suffix: string) {
    const tasks = createPersistentTaskService(db, {now});
    const task = await tasks.enqueue(ctx, {kind: "ai_task", ownerType: "ai_task", ownerId: suffix, idempotencyKey: suffix, payload: {source: "original"}});
    const claim = await tasks.claimTask({taskId: task.id, workerId: "plan-worker"});
    if (!claim) throw new Error("missing claim");
    return {task, tasks, ref: {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken}, plan: createWorkbenchPlanService(db, {now})};
  }

  it("同请求幂等，冲突版本拒绝，且读回只归属本账号", async () => {
    const f = await fixture("cas");
    const input = {expectedRevision: 0, steps: [step("research")]};
    const [first, retry] = await Promise.all([f.plan.save(f.ref, input), f.plan.save(f.ref, input)]);
    expect(first.planRevision).toBe(1);
    expect(retry).toEqual(first);
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("different")]})).rejects.toMatchObject({name: "ConflictError"});
    expect(await f.plan.read(ctx, f.task.id)).toEqual(first);
    expect(await f.plan.status(f.ref)).toEqual({revision: 1, progressToken: "[]", steps: [{stepId: "research", title: "research", status: "pending"}]});
    await expect(f.plan.read({...ctx, accountId: "foreign"}, f.task.id)).rejects.toThrow();
    const [stored] = await db.select().from(executionTasks).where(eq(executionTasks.id, f.task.id));
    expect(stored?.payload).toMatchObject({source: "original", workbenchPlan: first});
  });

  it("无回执不得把步骤标为成功；已结算操作、重规划和恢复保留事实与成本", async () => {
    const f = await fixture("receipt");
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("read")]});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step("read", {status: "succeeded", operationRefs: ["fake"]})]})).rejects.toMatchObject({name: "ConflictError"});
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "read", kind: "tool", inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: "{\"status\":\"ok\"}"});
    const completed = await f.plan.save(f.ref, {expectedRevision: 1, steps: [step("read", {status: "succeeded", operationRefs: [call.id]})]});
    expect(completed.planRevision).toBe(2);
    await expect(f.plan.save(f.ref, {expectedRevision: 2, steps: [step("read", {status: "pending"})]})).rejects.toMatchObject({name: "ConflictError"});
    const revised = await f.plan.save(f.ref, {expectedRevision: 2, steps: [completed.steps[0]!, step("report", {dependsOn: ["read"]})]});
    expect(revised.steps[0]).toEqual(completed.steps[0]);
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause"});
    await f.tasks.acknowledgeControl({taskId: f.task.id, workerId: "plan-worker", attempt: f.ref.attempt});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "resume", idempotencyKey: "resume"});
    expect(await f.plan.read(ctx, f.task.id)).toEqual(revised);
    await expect(f.plan.save(f.ref, {expectedRevision: 3, steps: revised.steps})).rejects.toMatchObject({name: "ConflictError"});
    await expect(f.plan.status(f.ref)).rejects.toMatchObject({name: "ConflictError"});
    const claimed = await f.tasks.claimTask({taskId: f.task.id, workerId: "plan-worker-new"});
    if (!claimed) throw new Error("resumed task was not claimable");
    const resumed = {executionTaskId: f.task.id, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken};
    expect((await f.plan.status(resumed))?.revision).toBe(3);
    expect((await f.plan.save(resumed, {expectedRevision: 3, steps: [...revised.steps, step("verify", {dependsOn: ["report"]})]})).steps[0]).toEqual(completed.steps[0]);
  });

  it("拒绝不存在或成环的依赖", async () => {
    const f = await fixture("graph");
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["missing"]})]})).rejects.toThrow();
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["b"]}), step("b", {dependsOn: ["a"]})]})).rejects.toThrow();
  });

  it("重规划不能擦除已有操作引用，替换步骤必须指向旧步骤", async () => {
    const f = await fixture("replan-receipts");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "research", kind: "tool", inputDigest: "sha256:" + "b".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: '{"status":"ok"}'});
    const first = await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("research", {status: "running", operationRefs: [call.id]})]});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step("research"), step("retry", {supersedes: "research"})]})).rejects.toMatchObject({name: "ConflictError"});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [first.steps[0]!, step("retry", {supersedes: "missing"})]})).rejects.toMatchObject({name: "ConflictError"});
    const revised = await f.plan.save(f.ref, {expectedRevision: 1, steps: [first.steps[0]!, step("retry", {supersedes: "research"})]});
    expect(revised.steps[0]?.operationRefs).toEqual([call.id]);
  });

  it("重命名和状态摆动不计为计划执行进展", async () => {
    const f = await fixture("progress-facts");
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("research")]});
    const before = await f.plan.status(f.ref);
    await f.plan.save(f.ref, {expectedRevision: 1, steps: [step("research", {title: "新的标题", status: "running"})]});
    const after = await f.plan.status(f.ref);
    expect(after?.revision).toBe(2);
    expect(after?.progressToken).toBe(before?.progressToken);
  });

  it("未知在途工具在停止恢复后不能补写成功或换操作键重发", async () => {
    const f = await fixture("unknown-action");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("external", {status: "running"})]});
    const call = await ledger.reserve(f.ref, {operationKey: "external-write", kind: "tool", inputDigest: "sha256:" + "c".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "unknown"});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause-unknown"});
    await f.tasks.acknowledgeControl({taskId: f.task.id, workerId: "plan-worker", attempt: f.ref.attempt});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "resume", idempotencyKey: "resume-unknown"});
    const claimed = await f.tasks.claimTask({taskId: f.task.id, workerId: "plan-worker-new"});
    if (!claimed) throw new Error("resumed task was not claimable");
    const resumed = {executionTaskId: f.task.id, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken};
    await expect(f.plan.save(resumed, {expectedRevision: 1, steps: [step("external", {status: "succeeded", operationRefs: [call.id]})]})).rejects.toMatchObject({name: "ConflictError"});
    await expect(ledger.reserve(resumed, {operationKey: "external-write-again", kind: "tool", inputDigest: "sha256:" + "d".repeat(64), reservedTokens: 0})).rejects.toMatchObject({name: "ConflictError"});
    expect((await f.plan.read(ctx, f.task.id))?.steps[0]?.status).toBe("running");
  });

  it("已结算但声明未知副作用的回执不能支撑成功步骤", async () => {
    const f = await fixture("unknown-receipt");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "suspicious", kind: "tool", inputDigest: "sha256:" + "e".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: '{"status":"ok","sideEffect":"unknown","error":{"code":"unknown_commit"}}'});
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("external", {status: "succeeded", operationRefs: [call.id]})]})).rejects.toMatchObject({name: "ConflictError"});
  });
});
