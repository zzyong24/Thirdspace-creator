import {PRIVATE_COLLECTION_SOURCE_KINDS,assertPrivateCollectorJob} from '../scheduling';
import {requireWorkspace} from "../../workspace-scope";
import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {workspaceFilter} from "../../workspace-scope";
import {executionBudgetSchema, executionBudgetDeadline} from "@creatoros/contract/execution-worker";
import { assertFrozenBrowserTaskGrant } from "./browser-task-grant";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { workerTaskInputSchema } from "@creatoros/contract/execution-worker";
import { randomUUID } from "node:crypto";
import { and, eq, aiTasks, executionTasks, OwnershipError, requireAccountId, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError } from "./execution.errors";

const preparedExecutionSchema = z.object({
  requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  modelInput: workerTaskInputSchema,
  budget: executionBudgetSchema,
  priority: z.number().int().min(0).max(100).optional(),
}).strict();
export type PreparedModelExecution = z.infer<typeof preparedExecutionSchema>;

/** 后端事务内转交执行权；业务 taskId 不变，Worker 不能指定归属或直接写库。 */
export function createExecutionAuthorityService(db: Db, deps: {now?: () => string} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async bindAiTask(ctx: RequestContext, aiTaskId: string, preparation?: PreparedModelExecution): Promise<{aiTaskId: string; executionTaskId: string}> {
      const prepared = preparation ? preparedExecutionSchema.parse(preparation) : undefined;
      requireWorkspace(ctx);
      return db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(
          eq(aiTasks.id, aiTaskId), eq(aiTasks.userId, ctx.userId), workspaceFilter(aiTasks,ctx),
        )).for("update");
        if (!task) throw new OwnershipError("AI task not found");
        const collectorKind=task.taskType.startsWith("scheduled.")?task.taskType.slice(10):"";
        const jobId=(task.inputData as Record<string,unknown>)?.jobId;
        const privateAdmission=!!task.accountId&&!!task.groupId&&PRIVATE_COLLECTION_SOURCE_KINDS.has(collectorKind)&&typeof jobId==="string";
        await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion},{allowArchived:privateAdmission});
        if(privateAdmission)await assertPrivateCollectorJob(tx as unknown as Db,{...ctx,groupId:task.groupId,accountId:task.accountId,membershipVersion:task.membershipVersion??undefined},jobId as string,collectorKind);
        if (prepared?.modelInput.kind === "model.structured" && (prepared.modelInput.skillSnapshot.userId !== task.userId || prepared.modelInput.skillSnapshot.accountId !== task.accountId || (prepared.modelInput.skillSnapshot.groupId??null)!==task.groupId)) throw new OwnershipError("Skill snapshot owner mismatch");
        if (prepared && prepared.requestFingerprint !== task.requestFingerprint) throw new ConflictError("准备输入与原任务指纹不符");
        const browserGrant = prepared?.modelInput.kind === "agentic.run" ? assertFrozenBrowserTaskGrant(task, prepared.modelInput.browserAuthorization) : null;
        if (task.executionTaskId) {
          const [execution] = await tx.select().from(executionTasks).where(and(
            eq(executionTasks.id, task.executionTaskId), eq(executionTasks.userId, task.userId),
            workspaceFilter(executionTasks,task), eq(executionTasks.ownerId, task.id),
            eq(executionTasks.ownerType, "ai_task"), eq(executionTasks.kind, "ai_task"),
          ));
          if (!execution) throw new ConflictError("任务执行映射不一致，请先核对");
          if (prepared && (!isDeepStrictEqual((execution.payload as Record<string,unknown>).modelInput,prepared.modelInput) || !isDeepStrictEqual(execution.executionBudget,prepared.budget))) {
            throw new ConflictError("已有执行输入或预算不能改写");
          }
          return {aiTaskId: task.id, executionTaskId: execution.id};
        }
        // 已有提交事实或旧租约必须走专门对账，不能用迁移把未知提交变成重试。
        if (task.status !== "queued" || task.leaseOwner || task.leaseToken || task.modelCallStartedAt) {
          throw new ConflictError("仅未执行的排队任务可直接转交执行权");
        }
        const executionTaskId = `exec_${randomUUID()}`;
        const stamp = now();
        await tx.insert(executionTasks).values({
          id: executionTaskId, userId: task.userId, accountId: task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,
          kind: "ai_task", ownerType: "ai_task", ownerId: task.id,
          idempotencyKey: `ai:${task.id}`, payload: {aiTaskId: task.id, ...(prepared ? {modelInput:prepared.modelInput} : {})},
          ...(prepared ? {priority:prepared.priority??0,executionBudget:prepared.budget,deadlineAt:executionBudgetDeadline(prepared.budget,browserGrant?.grantedAt ?? task.requestedAt)} : {}),
          createdAt: stamp, updatedAt: stamp,
        });
        await tx.update(aiTasks).set({executionTaskId}).where(eq(aiTasks.id, task.id));
        return {aiTaskId: task.id, executionTaskId};
      });
    },
  };
}
