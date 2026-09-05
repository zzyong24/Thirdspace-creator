import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  and,
  eq,
  isNull,
  asc,
  executionBrowserProfileLeases,
  type Db,
} from "@creatoros/backend";
import {
  executionRefSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import {
  assertSafeWebDomain,
  webDomainFromUrl,
} from "@creatoros/ai-worker/browser/web-domain";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
export class BrowserProfileBusyError extends Error {
  readonly code = "BROWSER_PROFILE_BUSY";
  constructor() {
    super("当前用户的网站浏览器仍由另一个执行持有，等待已确认停止后再领取");
    this.name = "BrowserProfileBusyError";
  }
}
export function createExecutionBrowserProfileLeaseService(
  db: Db,
  deps: {
    now?: () => string;
  } = {},
) {
  const now = deps.now ?? (() => new Date().toISOString()),
    leases = createExecutionLeaseService(db, { now });
  async function acquireMany(ref: ExecutionRef, rawDomains: string[]) {
    const domains = [
      ...new Set(
        z
          .array(z.string().max(253))
          .min(1)
          .max(30)
          .parse(rawDomains)
          .map((raw) =>
            assertSafeWebDomain(
              webDomainFromUrl(`https://${assertSafeWebDomain(raw)}`),
            ),
          ),
      ),
    ].sort();
    return leases.withLease(ref, "admission", async ({ tx, task }) => {
      const receipts: Array<{
        leaseId: string;
        domain: string;
      }> = [];
      for (const domain of domains) {
        const identity = and(
          eq(executionBrowserProfileLeases.userId, task.userId),
          eq(executionBrowserProfileLeases.domain, domain),
        );
        const fresh = {
          userId: task.userId,
          domain,
          ownerExecutionTaskId: task.id,
          attempt: ref.attempt,
          fenceToken: ref.fenceToken,
          leaseId: randomUUID(),
          acquiredAt: now(),
          releasedAt: null,
        };
        await tx
          .insert(executionBrowserProfileLeases)
          .values(fresh)
          .onConflictDoNothing({
            target: [
              executionBrowserProfileLeases.userId,
              executionBrowserProfileLeases.domain,
            ],
          });
        const [held] = await tx
          .select()
          .from(executionBrowserProfileLeases)
          .where(identity)
          .for("update");
        if (!held) throw new ConflictError("浏览器profile租约记录不存在");
        if (held.releasedAt === null) {
          if (
            held.ownerExecutionTaskId !== task.id ||
            held.attempt !== ref.attempt ||
            held.fenceToken !== ref.fenceToken
          )
            throw new BrowserProfileBusyError();
          receipts.push({ leaseId: held.leaseId, domain });
        } else {
          await tx
            .update(executionBrowserProfileLeases)
            .set(fresh)
            .where(identity);
          receipts.push({ leaseId: fresh.leaseId, domain });
        }
      }
      return receipts;
    });
  }
  return {
    acquireMany,
    async acquire(ref: ExecutionRef, rawDomain: string) {
      return (await acquireMany(ref, [rawDomain]))[0]!;
    },
    /** 宿主清理读端口；允许读取已停止或旧attempt仍持有的租约，不授予动作权限。 */
    async listOwned(rawRef: ExecutionRef) {
      const ref = executionRefSchema.parse(rawRef);
      return db
        .select()
        .from(executionBrowserProfileLeases)
        .where(
          and(
            eq(
              executionBrowserProfileLeases.ownerExecutionTaskId,
              ref.executionTaskId,
            ),
            eq(executionBrowserProfileLeases.attempt, ref.attempt),
            eq(executionBrowserProfileLeases.fenceToken, ref.fenceToken),
            isNull(executionBrowserProfileLeases.releasedAt),
          ),
        )
        .orderBy(asc(executionBrowserProfileLeases.domain));
    },
    /** 仅宿主在确认所属Worker子树已停止后调用；不得注册为Worker可调用IPC。 */
    async releaseAfterWorkerStopped(
      rawRef: ExecutionRef,
      leaseId: string,
    ): Promise<boolean> {
      const ref = executionRefSchema.parse(rawRef);
      return db.transaction(async (tx) => {
        const [held] = await tx
          .select()
          .from(executionBrowserProfileLeases)
          .where(eq(executionBrowserProfileLeases.leaseId, leaseId))
          .for("update");
        if (
          !held ||
          held.ownerExecutionTaskId !== ref.executionTaskId ||
          held.attempt !== ref.attempt ||
          held.fenceToken !== ref.fenceToken
        )
          throw new ConflictError("浏览器profile释放凭证与实际持有者不符");
        if (held.releasedAt !== null) return false;
        await tx
          .update(executionBrowserProfileLeases)
          .set({ releasedAt: now() })
          .where(eq(executionBrowserProfileLeases.leaseId, leaseId));
        return true;
      });
    },
  };
}
