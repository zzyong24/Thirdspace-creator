import { randomUUID } from "node:crypto";
import { and, eq, aiTasks, executionTasks, OwnershipError, requireAccountId, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError } from "./execution.errors";

/** 后端事务内转交执行权；业务 taskId 不变，Worker 不能指定归属或直接写库。 */
export function createExecutionAuthorityService(db: Db, deps: {now?: () => string} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async bindAiTask(ctx: RequestContext, aiTaskId: string): Promise<{aiTaskId: string; executionTaskId: string}> {
      const accountId = requireAccountId(ctx.accountId, "execution.bindAiTask");
      return db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(
          eq(aiTasks.id, aiTaskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.accountId, accountId),
        )).for("update");
        if (!task) throw new OwnershipError("AI task not found");
        if (task.executionTaskId) {
          const [execution] = await tx.select().from(executionTasks).where(and(
            eq(executionTasks.id, task.executionTaskId), eq(executionTasks.userId, task.userId),
            eq(executionTasks.accountId, task.accountId), eq(executionTasks.ownerId, task.id),
            eq(executionTasks.ownerType, "ai_task"), eq(executionTasks.kind, "ai_task"),
          ));
          if (!execution) throw new ConflictError("任务执行映射不一致，请先核对");
          return {aiTaskId: task.id, executionTaskId: execution.id};
        }
        // 已有提交事实或旧租约必须走专门对账，不能用迁移把未知提交变成重试。
        if (task.status !== "queued" || task.leaseOwner || task.leaseToken || task.modelCallStartedAt) {
          throw new ConflictError("仅未执行的排队任务可直接转交执行权");
        }
        const executionTaskId = `exec_${randomUUID()}`;
        const stamp = now();
        await tx.insert(executionTasks).values({
          id: executionTaskId, userId: task.userId, accountId: task.accountId,
          kind: "ai_task", ownerType: "ai_task", ownerId: task.id,
          idempotencyKey: `ai:${task.id}`, payload: {aiTaskId: task.id},
          createdAt: stamp, updatedAt: stamp,
        });
        await tx.update(aiTasks).set({executionTaskId}).where(eq(aiTasks.id, task.id));
        return {aiTaskId: task.id, executionTaskId};
      });
    },
  };
}
