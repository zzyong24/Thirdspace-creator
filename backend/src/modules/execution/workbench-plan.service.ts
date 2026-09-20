import { isDeepStrictEqual } from "node:util";
import { and, eq, executionCalls, executionTasks, OwnershipError, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workbenchPlanSchema, type WorkbenchPlan } from "@creatoros/contract/agent-workbench";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

type Step = WorkbenchPlan["steps"][number];
function storedPlan(payload: unknown): WorkbenchPlan | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ConflictError("任务载荷已损坏");
  const value = (payload as Record<string, unknown>).workbenchPlan;
  if (value === undefined) return null;
  const parsed = workbenchPlanSchema.safeParse(value);
  if (!parsed.success) throw new ConflictError("历史计划格式不兼容，须先核对");
  return parsed.data;
}
function successfulToolReceipt(text: string | null): boolean {
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const candidate = record.output && typeof record.output === "object" && !Array.isArray(record.output)
      ? record.output as Record<string, unknown> : record;
    return candidate.status === "ok" || candidate.status === "succeeded";
  } catch { return false; }
}

/** 计划只是原 execution_tasks 的投影；租约、调用回执和费用仍由既有服务控制。 */
export function createWorkbenchPlanService(db: Db, deps: {
  now?: () => string;
  verifyArtifacts?: (scope: {userId: string; accountId: string; taskId: string}, refs: string[]) => Promise<boolean>;
} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const leases = createExecutionLeaseService(db, {now});
  return {
    async save(ref: ExecutionRef, input: {expectedRevision: number; steps: Step[]}): Promise<WorkbenchPlan> {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ConflictError("计划版本无效");
      const proposed = workbenchPlanSchema.parse({planRevision: input.expectedRevision + 1, steps: input.steps});
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        if (task.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
        const previous = storedPlan(task.payload);
        if (previous?.planRevision === proposed.planRevision && isDeepStrictEqual(previous, proposed)) return previous;
        if ((previous?.planRevision ?? 0) !== input.expectedRevision) throw new ConflictError("计划版本已改变，请重新读取");
        const old = new Map(previous?.steps.map(step => [step.stepId, step]) ?? []);
        const next = new Map(proposed.steps.map(step => [step.stepId, step]));
        for (const [id, step] of old) {
          if (step.status === "succeeded" && !isDeepStrictEqual(next.get(id), step)) throw new ConflictError("已成功步骤及回执不可改写");
          if (step.status !== "succeeded" && !next.has(id)) throw new ConflictError("旧步骤不可删除；替换时保留 supersedes 引用");
        }
        for (const step of proposed.steps) {
          if (step.status !== "succeeded") continue;
          const earlier = old.get(step.stepId);
          if (earlier?.status === "succeeded") continue;
          if (!step.operationRefs.length && !step.artifactRefs.length) throw new ConflictError("步骤成功缺少真实回执或产物");
          for (const callId of step.operationRefs) {
            const [call] = await tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, task.id)));
            if (!call || call.kind !== "tool" || call.status !== "settled" || !successfulToolReceipt(call.resultText)) throw new ConflictError("步骤引用的工具回执未确认成功");
          }
          if (step.artifactRefs.length && !(await deps.verifyArtifacts?.({userId: task.userId, accountId: task.accountId, taskId: task.id}, step.artifactRefs))) throw new ConflictError("步骤引用的产物尚未核实");
          if (step.dependsOn.some(dependency => next.get(dependency)?.status !== "succeeded")) throw new ConflictError("前置步骤尚未成功");
        }
        const payload = {...task.payload as Record<string, unknown>, workbenchPlan: proposed};
        await tx.update(executionTasks).set({payload, updatedAt: now()}).where(eq(executionTasks.id, task.id));
        return proposed;
      });
    },
    async read(ctx: RequestContext, taskId: string): Promise<WorkbenchPlan | null> {
      const [task] = await db.select().from(executionTasks).where(and(eq(executionTasks.id, taskId), eq(executionTasks.userId, ctx.userId), eq(executionTasks.accountId, ctx.accountId ?? "")));
      if (!task) throw new OwnershipError("执行任务不存在");
      return storedPlan(task.payload);
    },
  };
}
