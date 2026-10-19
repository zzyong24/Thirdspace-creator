import {workspaceFilter} from "../../workspace-scope";
import { assertFrozenBrowserTaskGrant } from "./browser-task-grant";
import { and, eq, aiTasks, type Db } from "@creatoros/backend";
import {
  browserAuthorizationSnapshotSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import {
  assertSafeWebDomain,
  webDomainFromUrl,
  webSessionLookupDomains,
} from "@creatoros/ai-worker/browser/web-domain";
import type { BrowserSessionsService } from "../browser-sessions";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import { validateBrowserStorageState } from "./execution-browser-session.service";

export class BrowserLoginSnapshotInvalidError extends Error {
  readonly code = "BROWSER_LOGIN_SNAPSHOT_INVALID";
  constructor() {
    super("网站登录态无法安全读取，请通过现有登录入口重新登录后恢复");
    this.name = "BrowserLoginSnapshotInvalidError";
  }
}
/** 任务内只读登录快照；域由宿主冻结授权决定。调用前宿主必须已原子领取全部profile锁。 */
export function createExecutionBrowserLoginSnapshotService(
  db: Db,
  deps: {
    now?: () => string;
    sessions: Pick<BrowserSessionsService, "getStateVersioned">;
  },
) {
  const leases = createExecutionLeaseService(db, { now: deps.now });
  return {
    async read(
      ref: ExecutionRef,
    ): Promise<Array<{ domain: string; stateJson: string | null }>> {
      return leases.withLease(
        ref,
        "admission",
        async ({ tx, task, context }) => {
          if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
            throw new ConflictError("登录快照缺少真实AI任务归属");
          const [business] = await tx
            .select()
            .from(aiTasks)
            .where(
              and(
                eq(aiTasks.id, task.ownerId),
                eq(aiTasks.executionTaskId, task.id),
                eq(aiTasks.userId, context.userId),
                workspaceFilter(aiTasks,context),
              ),
            )
            .for("update");
          if (!business || !["queued", "running"].includes(business.status))
            throw new ConflictError("登录快照任务映射或状态不符");
          const modelInput = (
            task.payload as {
              modelInput?: { kind?: string; browserAuthorization?: unknown };
            }
          ).modelInput;
          if (modelInput?.kind !== "agentic.run")
            throw new ConflictError("登录快照仅支持自主执行任务");
          const authorization = browserAuthorizationSnapshotSchema.parse(
            modelInput.browserAuthorization,
          );
          assertFrozenBrowserTaskGrant(business, authorization);
          const domains = [
            ...new Set(
              authorization.allowedDomains.map((domain) =>
                assertSafeWebDomain(
                  webDomainFromUrl(`https://${assertSafeWebDomain(domain)}`),
                ),
              ),
            ),
          ];
          const snapshots: Array<{ domain: string; stateJson: string | null }> =
            [];
          for (const domain of domains) {
            let stateJson: string | null = null;
            for (const key of webSessionLookupDomains(domain)) {
              const record = await deps.sessions.getStateVersioned(
                context,
                key,
                tx,
              );
              if (record.revision === null) continue;
              if (record.stateJson === null)
                throw new BrowserLoginSnapshotInvalidError();
              try {
                validateBrowserStorageState(
                  record.stateJson,
                  new URL(`https://${domain}`),
                  domain,
                );
              } catch {
                throw new BrowserLoginSnapshotInvalidError();
              }
              stateJson = record.stateJson;
              break;
            }
            snapshots.push({ domain, stateJson });
          }
          return snapshots;
        },
      );
    },
  };
}
