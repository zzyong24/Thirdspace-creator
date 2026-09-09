import { createHash } from "node:crypto";
import type { Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectRepository } from "./projects.repository";
import { createProjectsService, type BriefDetail, type ServiceDeps } from "./projects.service";
import { OwnershipError, requireAccountId } from "./projects.errors";

/** 用户已经逐项授权的雷达队列创建口；稿件只作为 brief 中的候选 seed。 */
export function createRadarProjectService(db: Db, deps: ServiceDeps) {
  return {
    async ensureRadarProject(ctx: RequestContext, input: {
      queueTaskId: string;
      title: string;
      briefDetail: BriefDetail;
    }) {
      const accountId = requireAccountId(ctx.accountId, "projects.ensureRadarProject");
      if (!input.queueTaskId.trim() || !input.title.trim()) throw new Error("雷达队列与项目标题不能为空");
      // SEMANTIC_BOUNDARY_ALLOW: 稳定业务 ID 只防重复创建，不判断创作内容。
      const seed = createHash("sha256").update(JSON.stringify([ctx.userId, accountId, input.queueTaskId])).digest("hex").slice(0, 32);
      const projectId = `project-radar-${seed}`;
      const repo = createProjectRepository(db);
      const existing = await repo.get(ctx, projectId).catch(error => {
        if (error instanceof OwnershipError) return null;
        throw error;
      });
      if (existing) return existing;
      try {
        return await db.transaction(async tx => {
          let counter = 0;
          const service = createProjectsService(createProjectRepository(tx as unknown as Db), {
            now: deps.now,
            nextId: prefix => prefix === "project" ? projectId : `${prefix}-radar-${seed}-${++counter}`,
          });
          return service.createProject(ctx, { title: input.title.trim(), briefDetail: input.briefDetail });
        });
      } catch (error) {
        // 同键并发由项目主键裁决；整个项目创建事务已提交才可读到既有项目。
        const raced = await repo.get(ctx, projectId).catch(() => null);
        if (raced) return raced;
        throw error;
      }
    },
  };
}
