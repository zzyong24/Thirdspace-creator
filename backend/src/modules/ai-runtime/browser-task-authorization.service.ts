import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  and,
  eq,
  aiTasks,
  requireAccountId,
  OwnershipError,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError } from "../execution/execution.errors";
import { readBrowserTaskGrant } from "../execution/browser-task-grant";
import { prepareBrowserAuthorization } from "./browser-authorization";
export const browserTaskAuthorizationRequestSchema = z
  .object({
    authorization: z
      .object({
        allowedDomains: z.array(z.string()).min(1).max(30),
        allowInteraction: z.boolean(),
      })
      .strict()
      .nullable(),
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict();
/** 仅由专用用户确认入口调用，不能注册为模型工具或通用任务输入。 */
export function createBrowserTaskAuthorizationService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  return {
    async requireGrant(ctx: RequestContext, aiTaskId: string) {
      const [task] = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.id, aiTaskId),
            eq(aiTasks.userId, ctx.userId),
            workspaceFilter(aiTasks,ctx),
          ),
        );
      if (!task) throw new OwnershipError("任务不存在");
      if (!readBrowserTaskGrant(task))
        throw new ConflictError("尚未确认浏览器权限");
    },
    async grant(ctx: RequestContext, aiTaskId: string, raw: unknown) {
      const input = browserTaskAuthorizationRequestSchema.parse(raw),
        accountId = (requireWorkspace(ctx),ctx.accountId??null);
      await assertWritableWorkspace(db,ctx);
      const authorization =
        input.authorization === null
          ? null
          : prepareBrowserAuthorization({
              browserAuthorization: input.authorization,
            });
      return db.transaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(aiTasks)
          .where(
            and(
              eq(aiTasks.id, aiTaskId),
              eq(aiTasks.userId, ctx.userId),
              workspaceFilter(aiTasks,ctx),
            ),
          )
          .for("update");
        if (!task) throw new OwnershipError("任务不存在");
        await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion});
        if (task.taskType !== "exec.agentic.research")
          throw new ConflictError("任务不支持浏览器授权");
        if (
          (task.inputData as { spec?: { params?: Record<string, unknown> } })
            ?.spec?.params?.browserAuthorization === undefined
        )
          throw new ConflictError("任务没有待确认的浏览器请求");
        const existing = readBrowserTaskGrant(task);
        if (existing) {
          if (
            existing.idempotencyKey !== input.idempotencyKey ||
            !isDeepStrictEqual(existing.authorization, authorization)
          )
            throw new ConflictError("已确认的浏览器授权不能改写");
          return {
            status: existing.authorization
              ? ("granted" as const)
              : ("denied" as const),
          };
        }
        if (
          task.status !== "queued" ||
          task.executionTaskId ||
          task.leaseOwner ||
          task.leaseToken ||
          task.modelCallStartedAt
        )
          throw new ConflictError("任务已开始或结束，不能追加浏览器授权");
        const grant = {
          grantId: randomUUID(),
          aiTaskId: task.id,
          userId: task.userId,
          accountId: task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,
          requestFingerprint: task.requestFingerprint,
          grantedAt: (deps.now ?? (() => new Date().toISOString()))(),
          idempotencyKey: input.idempotencyKey,
          authorization,
        };
        await tx
          .update(aiTasks)
          .set({
            runtimeData: {
              ...((task.runtimeData as Record<string, unknown>) ?? {}),
              browserAuthorizationGrant: grant,
            },
          })
          .where(eq(aiTasks.id, task.id));
        return {
          status: authorization ? ("granted" as const) : ("denied" as const),
        };
      });
    },
  };
}
