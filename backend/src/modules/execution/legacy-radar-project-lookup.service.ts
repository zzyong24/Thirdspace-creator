import { and, asc, eq, or, sql, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { executionTasks } from "../../schema/intelligence";
import { requireWorkspace, workspaceFilter } from "../../workspace-scope";
import { ConflictError } from "./execution.errors";

export interface LegacyRadarProjectIdentity {
  id: string;
  userId: string;
  groupId: string | null;
  accountId: string | null;
  itemId: string;
  projectId: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** 仅定位旧项目的原父身份；不领取、恢复或修改旧升级任务。 */
export function createLegacyRadarProjectLookupService(db: Db) {
  return {
    async listForItem(ctx: RequestContext, itemId: string): Promise<LegacyRadarProjectIdentity[]> {
      requireWorkspace(ctx);
      if (!itemId.trim()) throw new ConflictError("旧项目查找缺少真实作品标识");
      // SEMANTIC_BOUNDARY_ALLOW: 只按真实 item 身份核对历史关联；不按标题、URL 或内容猜项目。
      const rows = await db.select({
        id: executionTasks.id, userId: executionTasks.userId,
        groupId: executionTasks.groupId, accountId: executionTasks.accountId,
        ownerType: executionTasks.ownerType, ownerId: executionTasks.ownerId,
        payload: executionTasks.payload, checkpoint: executionTasks.checkpoint,
      }).from(executionTasks).where(and(
        eq(executionTasks.userId, ctx.userId), workspaceFilter(executionTasks, ctx),
        eq(executionTasks.kind, "radar_project_upgrade"),
        or(eq(executionTasks.ownerId, itemId), sql`${executionTasks.payload}->>'itemId' = ${itemId}`),
      )).orderBy(asc(executionTasks.id)).for("share");
      return rows.map(row => {
        const payload = object(row.payload);
        const checkpoint = row.checkpoint == null ? null : object(row.checkpoint);
        if (row.ownerType !== "item" || row.ownerId !== itemId || payload?.itemId !== itemId ||
            (row.checkpoint != null && !checkpoint)) {
          throw new ConflictError("旧雷达任务的作品归属或来源回执冲突，请核对原记录");
        }
        const projectId = checkpoint?.projectId;
        if (projectId != null && (typeof projectId !== "string" || !projectId.trim() || projectId !== projectId.trim())) {
          throw new ConflictError("旧雷达任务的项目回执无效，请核对原记录");
        }
        return {
          id: row.id, userId: row.userId, groupId: row.groupId, accountId: row.accountId,
          itemId, projectId: projectId == null ? null : projectId as string,
        };
      });
    },
  };
}
