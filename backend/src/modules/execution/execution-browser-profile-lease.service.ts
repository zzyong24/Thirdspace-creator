import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  and,
  eq,
  isNull,
  asc,
  executionBrowserProfileLeases,
  executionTasks,
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
    super("浏览器登录档案仍被其他操作占用，请等待相关窗口或任务停止后再试");
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
  type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
  type Owner = Pick<typeof executionBrowserProfileLeases.$inferInsert,
    "ownerExecutionTaskId" | "attempt" | "fenceToken" | "hostInstanceId" | "hostOperationId">;
  const profileKeySchema = z.union([z.literal(""), z.string().regex(/^[a-f0-9]{64}$/)]);
  const hostSchema = z.object({
    userId: z.string().min(1), domain: z.string().max(253),
    profileKey: profileKeySchema.default(""),
    hostInstanceId: z.string().min(1), hostOperationId: z.string().min(1),
  }).strict();
  type HostOwner = z.input<typeof hostSchema>;
  const canonical = (raw: string) => assertSafeWebDomain(webDomainFromUrl(`https://${assertSafeWebDomain(raw)}`));
  function sameOwner(held: Owner, owner: Owner) {
    return held.ownerExecutionTaskId === owner.ownerExecutionTaskId &&
      held.attempt === owner.attempt && held.fenceToken === owner.fenceToken &&
      held.hostInstanceId === owner.hostInstanceId && held.hostOperationId === owner.hostOperationId;
  }
  const workerOwner = (ref: ExecutionRef): Owner => ({
    ownerExecutionTaskId: ref.executionTaskId, attempt: ref.attempt, fenceToken: ref.fenceToken,
    hostInstanceId: null, hostOperationId: null,
  });
  const hostOwner = (host: HostOwner): Owner => ({
    ownerExecutionTaskId: null, attempt: null, fenceToken: null,
    hostInstanceId: host.hostInstanceId, hostOperationId: host.hostOperationId,
  });
  async function acquireInTransaction(tx: Transaction, userId: string, domain: string, profileKey: string, owner: Owner) {
    // 物理目录摘要全局互斥；原网站保管库继续按 user+domain 隔离。
    const identity = profileKey ? eq(executionBrowserProfileLeases.profileKey, profileKey) : and(
      eq(executionBrowserProfileLeases.userId, userId),
      eq(executionBrowserProfileLeases.domain, domain),
      eq(executionBrowserProfileLeases.profileKey, ""),
    );
    const fresh = { userId, domain, profileKey, ...owner, leaseId: randomUUID(), acquiredAt: now(), releasedAt: null };
    await tx.insert(executionBrowserProfileLeases).values(fresh).onConflictDoNothing();
    const [held] = await tx.select().from(executionBrowserProfileLeases).where(identity).for("update");
    if (!held) throw new ConflictError("浏览器profile租约记录不存在");
    if (held.releasedAt === null) {
      if (!sameOwner(held, owner) || held.userId !== userId || held.domain !== domain) throw new BrowserProfileBusyError();
      return { leaseId: held.leaseId, domain };
    }
    await tx.update(executionBrowserProfileLeases).set(fresh).where(identity);
    return { leaseId: fresh.leaseId, domain };
  }
  async function acquireMany(ref: ExecutionRef, rawDomains: string[]) {
    const domains = [...new Set(z.array(z.string().max(253)).min(1).max(30).parse(rawDomains).map(canonical))].sort();
    return leases.withLease(ref, "admission", async ({ tx, task }) => {
      const receipts: Array<{ leaseId: string; domain: string }> = [];
      for (const domain of domains) receipts.push(await acquireInTransaction(tx, task.userId, domain, "", workerOwner(ref)));
      return receipts;
    });
  }
  return {
    acquireMany,
    /** 私有宿主恢复读端口：只给出旧 attempt 或已停止任务持有的精确物理租约。 */
    async getRecoverableWorkerProfile(rawProfileKey:string) {
      const profileKey=z.string().regex(/^[a-f0-9]{64}$/).parse(rawProfileKey);
      const [held]=await db.select().from(executionBrowserProfileLeases).where(and(
        eq(executionBrowserProfileLeases.profileKey,profileKey),isNull(executionBrowserProfileLeases.releasedAt)));
      if(!held?.ownerExecutionTaskId || held.attempt===null || !held.fenceToken)return null;
      const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,held.ownerExecutionTaskId));
      if(!task || task.userId!==held.userId || !task.accountId ||
          (task.status==="running" && task.attempt===held.attempt && task.fenceToken===held.fenceToken))return null;
      return {ref:{executionTaskId:task.id,attempt:held.attempt,fenceToken:held.fenceToken},
        accountId:task.accountId,userId:task.userId,domain:held.domain,profileKey:held.profileKey,leaseId:held.leaseId};
    },
    async acquire(ref: ExecutionRef, rawDomain: string) {
      return (await acquireMany(ref, [rawDomain]))[0]!;
    },
    /** 仅宿主授权适配器可传目录摘要；不得暴露任意 profileKey 的 Worker IPC。 */
    async acquireProfile(ref: ExecutionRef, rawDomain: string, rawProfileKey: string) {
      const domain = canonical(rawDomain), profileKey = profileKeySchema.parse(rawProfileKey);
      if (!profileKey) throw new ConflictError("物理浏览器档案缺少受控目录摘要");
      return leases.withLease(ref, "admission", ({ tx, task }) =>
        acquireInTransaction(tx, task.userId, domain, profileKey, workerOwner(ref)));
    },
    /** 宿主登录窗口不是执行任务；调用方必须从真实 RequestContext 和授权路径派生范围。 */
    async acquireForHost(rawHost: HostOwner) {
      const host = hostSchema.parse(rawHost), domain = canonical(host.domain);
      return db.transaction(tx => acquireInTransaction(tx, host.userId, domain, host.profileKey, hostOwner(host)));
    },
    /** 只供宿主授权适配器诊断；不注册到 Worker IPC 或公开 RPC。 */
    async getHeldHostLease(rawScope: {userId:string;domain:string;profileKey:string}) {
      const scope=z.object({userId:z.string().min(1),domain:z.string(),profileKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(rawScope);
      const [held]=await db.select().from(executionBrowserProfileLeases).where(and(
        eq(executionBrowserProfileLeases.userId,scope.userId),eq(executionBrowserProfileLeases.domain,canonical(scope.domain)),
        eq(executionBrowserProfileLeases.profileKey,scope.profileKey),isNull(executionBrowserProfileLeases.releasedAt),
        isNull(executionBrowserProfileLeases.ownerExecutionTaskId),
      ));
      return held?.hostInstanceId&&held.hostOperationId?{...scope,domain:canonical(scope.domain),leaseId:held.leaseId,hostInstanceId:held.hostInstanceId,hostOperationId:held.hostOperationId}:null;
    },
    /** 调用方必须已从 OS 得到停止证据；事务只释放被检查的旧 host receipt，绝不覆盖新owner。 */
    async releaseVerifiedStoppedHost(rawExpected: HostOwner & {leaseId:string}) {
      const {leaseId,...rawHost}=rawExpected,host=hostSchema.parse(rawHost);
      z.string().min(1).parse(leaseId);
      return db.transaction(async tx=>{
        const [held]=await tx.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.leaseId,leaseId)).for('update');
        if(!held||held.releasedAt!==null||held.userId!==host.userId||held.domain!==canonical(host.domain)||held.profileKey!==host.profileKey||!sameOwner(held,hostOwner(host)))return false;
        await tx.update(executionBrowserProfileLeases).set({releasedAt:now()}).where(eq(executionBrowserProfileLeases.leaseId,leaseId));return true;
      });
    },
    /** 仅在宿主确认实际 context/子树停止后调用，不以 TTL 或 Worker 自报关闭替代证明。 */
    async releaseAfterHostStopped(rawHost: HostOwner, leaseId: string): Promise<boolean> {
      const host = hostSchema.parse(rawHost), domain = canonical(host.domain);
      return db.transaction(async tx => {
        const [held] = await tx.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.leaseId, leaseId)).for("update");
        if (!held || !sameOwner(held, hostOwner(host)) || held.userId !== host.userId || held.domain !== domain || held.profileKey !== host.profileKey)
          throw new ConflictError("浏览器profile释放凭证与实际持有者不符");
        if (held.releasedAt !== null) return false;
        await tx.update(executionBrowserProfileLeases).set({ releasedAt: now() }).where(eq(executionBrowserProfileLeases.leaseId, leaseId));
        return true;
      });
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
