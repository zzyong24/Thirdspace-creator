import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { ConflictError } from "./execution.errors";
const authorizationSchema = z
  .object({
    allowedDomains: z.array(z.string()).min(1).max(30),
    allowInteraction: z.boolean(),
  })
  .strict();
const grantSchema = z
  .object({
    grantId: z.string().min(1),
    aiTaskId: z.string(),
    userId: z.string(),
    accountId: z.string(),
    requestFingerprint: z.string(),
    grantedAt: z.string().datetime(),
    idempotencyKey: z.string().min(1),
    authorization: authorizationSchema.nullable(),
  })
  .strict();
export type BrowserGrantTask = {
  id: string;
  userId: string;
  accountId: string;
  requestFingerprint: string;
  runtimeData: unknown;
};
export function readBrowserTaskGrant(task: BrowserGrantTask) {
  const runtime = task.runtimeData as Record<string, unknown> | null;
  if (!runtime?.browserAuthorizationGrant) return null;
  const grant = grantSchema.parse(runtime.browserAuthorizationGrant);
  if (
    grant.aiTaskId !== task.id ||
    grant.userId !== task.userId ||
    grant.accountId !== task.accountId ||
    grant.requestFingerprint !== task.requestFingerprint
  )
    throw new ConflictError("浏览器授权与任务归属或输入不一致");
  return grant;
}
export function assertFrozenBrowserTaskGrant(
  task: BrowserGrantTask,
  frozen: unknown,
) {
  const grant = readBrowserTaskGrant(task);
  const scope = frozen as
    | { source?: unknown; allowedDomains?: unknown; allowInteraction?: unknown }
    | undefined;
  if (!scope) {
    if (grant?.authorization)
      throw new ConflictError("冻结权限与用户授权不一致");
    return grant;
  }
  if (
    !grant?.authorization ||
    scope.source !== "user_task" ||
    !isDeepStrictEqual(grant.authorization, {
      allowedDomains: scope.allowedDomains,
      allowInteraction: scope.allowInteraction,
    })
  )
    throw new ConflictError("浏览器权限缺少用户确认记录，请重新创建并授权任务");
  return grant;
}
