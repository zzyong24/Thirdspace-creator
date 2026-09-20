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
    expect(await f.plan.status(f.ref)).toEqual({revision: 1, progressToken: JSON.stringify(first), steps: [{title: "research", status: "pending"}]});
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
  });

  it("拒绝不存在或成环的依赖", async () => {
    const f = await fixture("graph");
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["missing"]})]})).rejects.toThrow();
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["b"]}), step("b", {dependsOn: ["a"]})]})).rejects.toThrow();
  });
});
