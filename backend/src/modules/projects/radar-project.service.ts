import { createHash } from "node:crypto";
import { ConflictError, requireWorkspace, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectRepository } from "./projects.repository";
import { createProjectsService, type BriefDetail, type ServiceDeps } from "./projects.service";
import { OwnershipError } from "./projects.errors";
import { createExecutionLeaseService } from "../execution/execution-lease.service";

/** 用户已经逐项授权的雷达队列创建口；稿件只作为 brief 中的候选 seed。 */
export function createRadarProjectService(db: Db, deps: ServiceDeps) {
  const leases = createExecutionLeaseService(db, deps);
  return {
    async ensureRadarProject(ctx: RequestContext, input: {
      queueTaskId: string;
      attempt: number;
      fenceToken: string;
      workerId: string;
      itemId: string;
      topicTaskId: string;
      transformId: string;
      title: string;
      briefDetail: BriefDetail;
    }) {
      requireWorkspace(ctx);
      if (![input.queueTaskId, input.workerId, input.itemId, input.topicTaskId, input.transformId, input.title].every(value => typeof value === "string" && value.trim())) {
        throw new ConflictError("雷达项目缺少原队列、来源或执行凭证");
      }
      return leases.withLease({executionTaskId: input.queueTaskId, attempt: input.attempt, fenceToken: input.fenceToken}, "admission", async ({tx, task, context}) => {
        const payload = task.payload as Record<string, unknown>;
        const checkpoint = (task.checkpoint ?? {}) as Record<string, unknown>;
        if (task.kind !== "radar_project_upgrade" || task.ownerType !== "item" || task.ownerId !== input.itemId || payload.itemId !== input.itemId ||
            task.leaseOwner !== input.workerId || checkpoint.stage !== "creating_project" || checkpoint.topicTaskId !== input.topicTaskId || checkpoint.transformId !== input.transformId ||
            context.userId !== ctx.userId || (context.groupId ?? null) !== (ctx.groupId ?? null) || (context.accountId ?? null) !== (ctx.accountId ?? null) ||
            (context.groupVersion ?? null) !== (ctx.groupVersion ?? null) || (context.membershipVersion ?? null) !== (ctx.membershipVersion ?? null)) {
          throw new ConflictError("雷达父执行、冻结工作区或来源回执不符");
        }
        // SEMANTIC_BOUNDARY_ALLOW: 只按原父冻结范围落实幂等，不选择内容；有账号路径完整保留旧ID字节。
        const identity = task.accountId !== null
          ? [task.userId, task.accountId, task.id]
          : [task.userId, "group", task.groupId, task.id];
        const seed = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32);
        const projectId = `project-radar-${seed}`;
        if (checkpoint.projectId != null && checkpoint.projectId !== projectId) throw new ConflictError("雷达项目回执不属于原队列");
        const repo = createProjectRepository(tx as unknown as Db);
        const existing = await repo.get(context, projectId).catch(error => {
          if (error instanceof OwnershipError) return null;
          throw error;
        });
        if (existing) return existing;
        // 同父已由原execution行锁串行；命中和完整创建均在同一成员/租约事务，不用全局补读吞错。
        let counter = 0;
        const service = createProjectsService(repo, {
          now: deps.now,
          nextId: prefix => prefix === "project" ? projectId : `${prefix}-radar-${seed}-${++counter}`,
        });
        return service.createProject(context, {title: input.title.trim(), briefDetail: input.briefDetail});
      });
    },
  };
}
