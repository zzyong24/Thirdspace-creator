import { createHash, randomUUID } from "node:crypto";
import { and, or, asc, desc, eq, lt, inArray, count, isNotNull } from "drizzle-orm";
import type { Db } from "../../db";
import type { RequestContext, CollectionPageCommit, CollectionRunResource, PlatformCapabilityState } from "@creatoros/contract";
import { collectionPageCommit, collectionStartRequest, platformWorksListQuery, platformMetricsReadQuery,
  platformBindBeginRequest, platformBindConfirmRequest, platformId, platformCapability } from "@creatoros/contract";
import { platformAccounts } from "../../schema/platform-account";
import { publications } from "../../schema/publishing";
import { projects, contentOutputs } from "../../schema/projects";
import {
  platformCollectionBindings, platformCollectionRuns, platformCollectionPages,
  platformCatalogs, platformWorks, platformVisibilityTombstones,
  platformAccountMetricSnapshots, platformWorkMetricSnapshots, platformBindAttempts,
} from "../../schema/platform-collection";

type Capability = "accountOverview" | "workCatalog" | "workMetrics";
type MetricMapping = { metricKey: string; unit: "count" };
type SourceWork = CollectionPageCommit["works"][number];
type SourceMetric = CollectionPageCommit["accountMetrics"][number];
type BindingTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface VerifiedAccountBindingPort {
  // PlatformAccount's owner implements this service port over the supplied transaction.
  // Account creation/reconnect and the identity claim commit or roll back together.
  claimVerifiedAccount(tx: BindingTx, input: {
    userId: string; platform: string; platformIdentity: string; existingAccountId: string | null;
  }): Promise<{ accountId: string }>;
}

export interface TrustedPlatformIdentityProof {
  bindAttemptId: string;
  platform: string;
  platformIdentity: string;
  proofSource: string;
  scopes: Capability[];
  verifiedAt: string;
  expiresAt: string | null;
}

export class PlatformCollectionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export interface PlatformCollectionServiceDeps {
  db: Db;
  now?: () => string;
  nextId?: (prefix: string) => string;
  leaseMs?: number;
  bindAttemptMs?: number;
  accountBindingPort?: VerifiedAccountBindingPort;
  /** 内部只读端口：AI owner核真实调度执行归属，公开clientRequestId不构成证明。 */
  readScheduledOwner?: (ctx: RequestContext, taskId: string, accountId: string) => Promise<{status: string} | null>;
  revokeTemporaryProfile?: (bindAttemptId: string, attempt: {
    userId: string; platform: string; platformIdentity: string | null; status: string;
  }) => Promise<void>;
  // Platform adapters provide an explicit, reviewed field dictionary. Unknown fields are rejected.
  metricDictionary?: Record<string, Record<string, MetricMapping>>;
  // Only verified source classes receive a trust priority. Unknown evidence remains local and frozen.
  visibilitySourcePriority?: Record<string, number>;
  // Present only when a real source adapter is wired. Absent capability is shown
  // unavailable and cannot create a pending bind or collection run.
  sourceAdapters?: Partial<Record<string, readonly PlatformCapabilityState[]>>;
}

function deny(code: string, message: string): never { throw new PlatformCollectionError(code, message); }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function computeProbeDigest(probe: { requestCursor: string; nextCursor: string | null;
  recordIds: string[]; observedAt: string }) {
  return `sha256:${digest(probe)}`;
}
const isPrivate = (visibility: string) => visibility !== "public";

export function createPlatformCollectionService(deps: PlatformCollectionServiceDeps) {
  const { db } = deps;
  const rawNow = deps.now ?? (() => new Date().toISOString());
  // Keep all service-owned timestamps in UTC, including injected test clocks.
  const now = () => new Date(rawNow()).toISOString();
  const nextId = deps.nextId ?? ((prefix: string) => `${prefix}-${randomUUID()}`);
  const leaseMs = deps.leaseMs ?? 60_000;
  const bindAttemptMs = deps.bindAttemptMs ?? 10 * 60_000;
  const expired = (value: string) => !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.parse(now());
  const stillValid = (value: string) => Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.parse(now());

  function capabilityState(platform: string, capability: string): PlatformCapabilityState | null {
    return deps.sourceAdapters?.[platform]?.find(state => state.platform === platform && state.capability === capability) ?? null;
  }

  function assertAdapterReady(platform: string, capability: string) {
    const state = capabilityState(platform, capability);
    if (!state?.supported || state.runtimeState !== "ready") deny("SOURCE_UNMAPPED", "该平台能力尚未接入可用的数据适配器");
  }

  function listCapabilities(ctx: RequestContext) {
    if (!ctx.userId) deny("FORBIDDEN_ACCOUNT", "需要先登录");
    const items: PlatformCapabilityState[] = [];
    for (const platform of platformId.options) {
      for (const capability of platformCapability.options) {
        items.push(capabilityState(platform, capability) ?? { platform, capability,
          supported: false, authState: "notRequired", runtimeState: "unavailable",
          reasonCode: "SOURCE_UNMAPPED", lastVerifiedAt: null });
      }
    }
    return { items };
  }

  function bindResource(attempt: typeof platformBindAttempts.$inferSelect) {
    return { bindAttemptId: attempt.id, platform: attempt.platform,
      status: attempt.status, accountId: attempt.accountId,
      verifiedPlatformIdentity: attempt.platformIdentity, expiresAt: attempt.expiresAt };
  }

  async function bindBegin(ctx: RequestContext, raw: unknown) {
    const input = platformBindBeginRequest.parse(raw);
    assertAdapterReady(input.platform, "bind");
    return db.transaction(async tx => {
      const [existing] = await tx.select().from(platformBindAttempts).where(and(
        eq(platformBindAttempts.userId, ctx.userId), eq(platformBindAttempts.platform, input.platform),
        eq(platformBindAttempts.clientRequestId, input.clientRequestId)));
      if (existing) return bindResource(existing);
      const time = now();
      const [attempt] = await tx.insert(platformBindAttempts).values({ id: nextId("bind"), userId: ctx.userId,
        platform: input.platform, clientRequestId: input.clientRequestId, status: "pending",
        expiresAt: new Date(Date.parse(time) + bindAttemptMs).toISOString(),
        createdAt: time, updatedAt: time }).returning();
      return bindResource(attempt!);
    });
  }

  // Trusted adapter port only. A public caller cannot provide identity/proof to bindConfirm.
  async function recordVerifiedIdentity(proof: TrustedPlatformIdentityProof) {
    if (!proof.platformIdentity || !proof.proofSource ||
      !proof.scopes.length || proof.scopes.some(scope => !["accountOverview", "workCatalog", "workMetrics"].includes(scope)) ||
      !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) > Date.parse(now()) ||
      (proof.expiresAt !== null && expired(proof.expiresAt))) {
      deny("WRONG_PLATFORM_IDENTITY", "平台身份证明无效");
    }
    return db.transaction(async tx => {
      const [attempt] = await tx.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, proof.bindAttemptId)).for("update");
      if (!attempt || attempt.status === "cancelled" || attempt.status === "expired" || expired(attempt.expiresAt)) {
        deny("BIND_EXPIRED", "绑定尝试已失效");
      }
      if (attempt.platform !== proof.platform || Date.parse(proof.verifiedAt) < Date.parse(attempt.createdAt)) {
        deny("WRONG_PLATFORM_IDENTITY", "平台身份证明不属于本次绑定尝试");
      }
      if (attempt.status === "bound" || attempt.status === "identityVerified") {
        if (attempt.platformIdentity !== proof.platformIdentity || attempt.proofSource !== proof.proofSource ||
          JSON.stringify(attempt.scopes) !== JSON.stringify([...new Set(proof.scopes)].sort())) {
          deny("WRONG_PLATFORM_IDENTITY", "同一尝试不能切换平台身份或授权范围");
        }
        return bindResource(attempt);
      }
      if (attempt.status !== "pending") deny("BIND_EXPIRED", "绑定尝试不可更新");
      const [updated] = await tx.update(platformBindAttempts).set({ status: "identityVerified",
        platformIdentity: proof.platformIdentity, proofSource: proof.proofSource,
        scopes: [...new Set(proof.scopes)].sort(), proofVerifiedAt: new Date(proof.verifiedAt).toISOString(),
        proofExpiresAt: proof.expiresAt === null ? null : new Date(proof.expiresAt).toISOString(), updatedAt: now(),
      }).where(eq(platformBindAttempts.id, attempt.id)).returning();
      return bindResource(updated!);
    });
  }

  /** 内部受信端口：沿调用者现有事务登记同一真实账号的身份授权，不创建第二绑定尝试。 */
  async function commitVerifiedBinding(tx:BindingTx,ctx:RequestContext,input:{accountId:string;platform:string;platformIdentity:string;proofSource:string;scopes:Capability[];verifiedAt:string;expiresAt:string|null},adapterAlreadyVerified=false):Promise<void>{
    if(!input.platformIdentity||!input.proofSource||!input.scopes.length||input.scopes.some(scope=>!["accountOverview","workCatalog","workMetrics"].includes(scope))||!Number.isFinite(Date.parse(input.verifiedAt))||Date.parse(input.verifiedAt)>Date.parse(now())||(input.expiresAt!==null&&expired(input.expiresAt)))deny("WRONG_PLATFORM_IDENTITY","平台身份证明无效");
    // 旧begin已验证端口；confirm保留其既有完成语义，不因后来的能力状态变化反杀真实身份证明。
    if(!adapterAlreadyVerified)assertAdapterReady(input.platform,"bind");
    const [existing]=await tx.select().from(platformCollectionBindings).where(and(eq(platformCollectionBindings.userId,ctx.userId),eq(platformCollectionBindings.platform,input.platform),eq(platformCollectionBindings.platformIdentity,input.platformIdentity))).for("update");
    if(existing&&existing.accountId!==input.accountId)deny("WRONG_PLATFORM_IDENTITY","已绑定身份不能转移到其他账号");
      const [account] = await tx.select().from(platformAccounts).where(and(eq(platformAccounts.id, input.accountId),
        eq(platformAccounts.userId, ctx.userId))).for("update");
      if (!account || account.status !== "active" || account.platform !== input.platform || account.externalAccountId !== input.platformIdentity) {
        deny("WRONG_PLATFORM_IDENTITY", "账号所有权或平台身份核验失败");
      }
      if (existing) await tx.update(platformCollectionBindings).set({ scopes: input.scopes,
        proofSource: input.proofSource, verifiedAt: input.verifiedAt,
        expiresAt: input.expiresAt, revokedAt: null,
      }).where(eq(platformCollectionBindings.accountId, existing.accountId));
      else await tx.insert(platformCollectionBindings).values({ accountId:input.accountId, userId: ctx.userId,
        platform: input.platform, platformIdentity: input.platformIdentity,
        scopes: input.scopes, proofSource: input.proofSource, verifiedAt: input.verifiedAt,
        expiresAt: input.expiresAt });
  }

  async function bindConfirm(ctx: RequestContext, raw: unknown) {
    const { bindAttemptId } = platformBindConfirmRequest.parse(raw);
    const result = await db.transaction(async tx => {
      const [attempt] = await tx.select().from(platformBindAttempts).where(and(
        eq(platformBindAttempts.id, bindAttemptId), eq(platformBindAttempts.userId, ctx.userId))).for("update");
      if (!attempt) deny("FORBIDDEN_ACCOUNT", "绑定尝试不属于当前用户");
      if (attempt.status === "bound") return { resource: bindResource(attempt), expired: false };
      if (attempt.status === "cancelled" || attempt.status === "expired" || expired(attempt.expiresAt) ||
        (attempt.proofExpiresAt !== null && attempt.proofExpiresAt !== undefined && expired(attempt.proofExpiresAt))) {
        await tx.update(platformBindAttempts).set({ status: "expired", updatedAt: now(), cleanupPendingAt: now() }).where(eq(platformBindAttempts.id, attempt.id));
        return { resource: bindResource({ ...attempt, status: "expired" }), expired: true };
      }
      if (attempt.status !== "identityVerified" || !attempt.platformIdentity || !attempt.proofSource || !attempt.proofVerifiedAt || !attempt.scopes?.length) {
        deny("WRONG_PLATFORM_IDENTITY", "平台身份尚未由受信适配器核验");
      }
      if (!deps.accountBindingPort) deny("SCOPE_MISSING", "平台账号绑定端口未配置");
      const [existing] = await tx.select().from(platformCollectionBindings).where(and(
        eq(platformCollectionBindings.userId, ctx.userId), eq(platformCollectionBindings.platform, attempt.platform),
        eq(platformCollectionBindings.platformIdentity, attempt.platformIdentity))).for("update");
      const { accountId } = await deps.accountBindingPort.claimVerifiedAccount(tx, {
        userId: ctx.userId, platform: attempt.platform, platformIdentity: attempt.platformIdentity,
        existingAccountId: existing?.accountId ?? null,
      });
      if (existing && existing.accountId !== accountId) deny("WRONG_PLATFORM_IDENTITY", "已绑定身份不能转移到其他账号");
      await commitVerifiedBinding(tx,ctx,{accountId,platform:attempt.platform,platformIdentity:attempt.platformIdentity,proofSource:attempt.proofSource,scopes:attempt.scopes as Capability[],verifiedAt:attempt.proofVerifiedAt,expiresAt:attempt.proofExpiresAt??null},true);
      const [bound] = await tx.update(platformBindAttempts).set({ status: "bound", accountId,
        cleanupPendingAt: now(), updatedAt: now() }).where(eq(platformBindAttempts.id, attempt.id)).returning();
      return { resource: bindResource(bound!), expired: false };
    });
    if (result.expired) {
      await retryBindCleanup(bindAttemptId);
      deny("BIND_EXPIRED", "绑定尝试或平台证明已过期");
    }
    await retryBindCleanup(bindAttemptId);
    return result.resource;
  }

  async function bindCancel(ctx: RequestContext, raw: unknown) {
    const { bindAttemptId } = platformBindConfirmRequest.parse(raw);
    const resource = await db.transaction(async tx => {
      const [attempt] = await tx.select().from(platformBindAttempts).where(and(
        eq(platformBindAttempts.id, bindAttemptId), eq(platformBindAttempts.userId, ctx.userId))).for("update");
      if (!attempt) deny("FORBIDDEN_ACCOUNT", "绑定尝试不属于当前用户");
      if (attempt.status === "bound") deny("WRONG_PLATFORM_IDENTITY", "已绑定账号不能取消历史尝试");
      if (attempt.status === "cancelled") return bindResource(attempt);
      const [cancelled] = await tx.update(platformBindAttempts).set({ status: "cancelled", cleanupPendingAt: now(), updatedAt: now() })
        .where(eq(platformBindAttempts.id, attempt.id)).returning();
      return bindResource(cancelled!);
    });
    await retryBindCleanup(bindAttemptId);
    return resource;
  }

  async function retryBindCleanup(bindAttemptId: string): Promise<boolean> {
    if (!deps.revokeTemporaryProfile) return false;
    const [attempt] = await db.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, bindAttemptId));
    if (!attempt?.cleanupPendingAt) return true;
    try {
      await deps.revokeTemporaryProfile(bindAttemptId, attempt);
      await db.update(platformBindAttempts).set({ cleanupPendingAt: null, updatedAt: now() })
        .where(eq(platformBindAttempts.id, bindAttemptId));
      return true;
    } catch {
      // The verified binding remains committed. A durable pending marker allows
      // the background worker to retry cleanup without misleading the user.
      return false;
    }
  }

  async function ownedAccount(ctx: RequestContext, accountId: string) {
    if (ctx.accountId && ctx.accountId !== accountId) deny("FORBIDDEN_ACCOUNT", "当前账号与请求账号不一致");
    const [account] = await db.select().from(platformAccounts).where(and(eq(platformAccounts.id, accountId), eq(platformAccounts.userId, ctx.userId)));
    if (!account || account.status !== "active") deny("FORBIDDEN_ACCOUNT", "账号不存在或不可用");
    return account;
  }

  function toStatus(run: typeof platformCollectionRuns.$inferSelect): CollectionRunResource {
    return {
      attemptId: run.id, accountId: run.accountId, capability: run.capability as Capability,
      status: run.status as CollectionRunResource["status"], generation: run.generation,
      committedPages: run.committedPages, completeCatalogGeneration: run.completeCatalogGeneration,
      reasonCode: run.reasonCode, startedAt: run.startedAt, updatedAt: run.updatedAt,
    };
  }

  async function expireRunLease(attemptId: string, scope?: {
    userId?: string; accountId?: string; generation?: number; leaseToken?: string;
    platformIdentity?: string;
  }): Promise<boolean> {
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(and(
        eq(platformCollectionRuns.id, attemptId),
        ...(scope?.userId ? [eq(platformCollectionRuns.userId, scope.userId)] : []),
        ...(scope?.accountId ? [eq(platformCollectionRuns.accountId, scope.accountId)] : []),
        ...(scope?.generation !== undefined ? [eq(platformCollectionRuns.generation, scope.generation)] : []),
        ...(scope?.leaseToken ? [eq(platformCollectionRuns.leaseToken, scope.leaseToken)] : []),
        ...(scope?.platformIdentity ? [eq(platformCollectionRuns.platformIdentity, scope.platformIdentity)] : []),
      )).for("update");
      if (!run || run.status !== "running" || !run.leaseExpiresAt || stillValid(run.leaseExpiresAt)) return false;
      await tx.update(platformCollectionRuns).set({ status: "partial", reasonCode: "LEASE_EXPIRED",
        generation: run.generation + 1, leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
        .where(eq(platformCollectionRuns.id, attemptId));
      return true;
    });
  }

  async function sweepExpiredLeases(): Promise<number> {
    const running = await db.select({ id: platformCollectionRuns.id, leaseExpiresAt: platformCollectionRuns.leaseExpiresAt })
      .from(platformCollectionRuns).where(eq(platformCollectionRuns.status, "running"));
    let expiredCount = 0;
    for (const run of running) if (run.leaseExpiresAt && expired(run.leaseExpiresAt) && await expireRunLease(run.id)) expiredCount += 1;
    return expiredCount;
  }

  async function start(ctx: RequestContext, raw: unknown): Promise<CollectionRunResource> {
    const input = collectionStartRequest.parse(raw);
    const account = await ownedAccount(ctx, input.accountId);
    assertAdapterReady(account.platform, input.capability);
    const [binding] = await db.select().from(platformCollectionBindings).where(and(
      eq(platformCollectionBindings.accountId, input.accountId), eq(platformCollectionBindings.userId, ctx.userId),
    ));
    if (!binding || binding.platform !== account.platform || binding.platformIdentity !== account.externalAccountId ||
      binding.revokedAt || (binding.expiresAt && expired(binding.expiresAt))) {
      deny("SCOPE_MISSING", "此账号需要重新完成平台身份核验");
    }
    if (!(binding.scopes as string[]).includes(input.capability)) deny("SCOPE_MISSING", "平台授权不包含此采集能力");
    const running = await db.select({ id: platformCollectionRuns.id, leaseExpiresAt: platformCollectionRuns.leaseExpiresAt })
      .from(platformCollectionRuns).where(and(eq(platformCollectionRuns.userId, ctx.userId),
        eq(platformCollectionRuns.accountId, input.accountId),
        eq(platformCollectionRuns.capability, input.capability), eq(platformCollectionRuns.status, "running")));
    for (const run of running) if (run.leaseExpiresAt && expired(run.leaseExpiresAt)) {
      await expireRunLease(run.id, { userId: ctx.userId, accountId: input.accountId });
    }
    await releaseTerminatedScheduledRuns(ctx, input.accountId);
    return db.transaction(async tx => {
      const [existing] = await tx.select().from(platformCollectionRuns).where(and(
        eq(platformCollectionRuns.userId, ctx.userId), eq(platformCollectionRuns.accountId, input.accountId),
        eq(platformCollectionRuns.capability, input.capability), eq(platformCollectionRuns.clientRequestId, input.clientRequestId),
      ));
      if (existing) return toStatus(existing);
      const [active] = await tx.select().from(platformCollectionRuns).where(and(
        eq(platformCollectionRuns.accountId, input.accountId), eq(platformCollectionRuns.capability, input.capability),
        inArray(platformCollectionRuns.status, ["queued", "running"]),
      ));
      if (active) deny("LEASE_EXPIRED", "此账号已有采集任务，请先查看任务状态");
      const t = now();
      const [run] = await tx.insert(platformCollectionRuns).values({
        id: nextId("collection"), userId: ctx.userId, accountId: input.accountId,
        platform: account.platform, platformIdentity: binding.platformIdentity,
        capability: input.capability, clientRequestId: input.clientRequestId,
        status: "queued", generation: 1, startedAt: t, updatedAt: t,
      }).onConflictDoNothing().returning();
      if (run) return toStatus(run);
      const [sameRequest] = await tx.select().from(platformCollectionRuns).where(and(
        eq(platformCollectionRuns.userId, ctx.userId), eq(platformCollectionRuns.accountId, input.accountId),
        eq(platformCollectionRuns.capability, input.capability), eq(platformCollectionRuns.clientRequestId, input.clientRequestId)));
      if (sameRequest) return toStatus(sameRequest);
      deny("LEASE_EXPIRED", "此账号已有采集任务，请先查看任务状态");
    });
  }

  // Worker-only service port. The caller receives a lease token; no public RPC should expose it.
  async function claim(attemptId: string, workerId: string) {
    if (!workerId) deny("LEASE_EXPIRED", "缺少 Worker 身份");
    await expireRunLease(attemptId);
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(eq(platformCollectionRuns.id, attemptId)).for("update");
      if (!run || !["queued", "running", "partial"].includes(run.status)) deny("GENERATION_STALE", "采集任务不可领取");
      const [other] = await tx.select().from(platformCollectionRuns).where(and(
        eq(platformCollectionRuns.accountId, run.accountId), eq(platformCollectionRuns.capability, run.capability),
        inArray(platformCollectionRuns.status, ["queued", "running"])));
      if (other && other.id !== run.id) deny("LEASE_EXPIRED", "同一账号和能力已有有效采集任务");
      if (run.status === "running" && run.leaseExpiresAt && stillValid(run.leaseExpiresAt)) deny("LEASE_EXPIRED", "租约仍由其他 Worker 持有");
      // Restart/expiry invalidates every previously issued page token and staging generation.
      const generation = run.status === "queued" ? run.generation : run.generation + 1;
      const leaseToken = randomUUID();
      const leaseExpiresAt = new Date(Date.parse(now()) + leaseMs).toISOString();
      await tx.update(platformCollectionRuns).set({ status: "running", generation, leaseToken,
        leaseExpiresAt, committedPages: 0, sourceSnapshotKey: null, updatedAt: now(), reasonCode: null,
      }).where(eq(platformCollectionRuns.id, attemptId));
      return { attemptId, accountId: run.accountId, platform: run.platform,
        expectedPlatformIdentity: run.platformIdentity, capability: run.capability as Capability,
        generation, leaseToken, leaseExpiresAt };
    });
  }

  async function renewLease(attemptId: string, generation: number, leaseToken: string) {
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(eq(platformCollectionRuns.id, attemptId)).for("update");
      if (!run || run.generation !== generation || run.status !== "running") deny("GENERATION_STALE", "旧采集世代不可续租");
      if (run.leaseToken !== leaseToken || !run.leaseExpiresAt || expired(run.leaseExpiresAt)) deny("LEASE_EXPIRED", "采集租约已失效");
      const leaseExpiresAt = new Date(Date.parse(now()) + leaseMs).toISOString();
      await tx.update(platformCollectionRuns).set({ leaseExpiresAt, updatedAt: now() }).where(eq(platformCollectionRuns.id, attemptId));
      return { attemptId, generation, leaseExpiresAt };
    });
  }

  async function status(ctx: RequestContext, accountId: string, attemptId: string): Promise<CollectionRunResource> {
    await ownedAccount(ctx, accountId);
    const [run] = await db.select().from(platformCollectionRuns).where(and(eq(platformCollectionRuns.id, attemptId),
      eq(platformCollectionRuns.accountId, accountId), eq(platformCollectionRuns.userId, ctx.userId)));
    if (!run) deny("FORBIDDEN_ACCOUNT", "采集任务不属于当前账号");
    await expireRunLease(attemptId, { userId: ctx.userId, accountId });
    const [current] = await db.select().from(platformCollectionRuns).where(and(
      eq(platformCollectionRuns.id, attemptId), eq(platformCollectionRuns.accountId, accountId),
      eq(platformCollectionRuns.userId, ctx.userId)));
    return toStatus(current ?? run);
  }

  /** 账号级最近一次运行，供后台定期采集判断到期与恢复；不暴露跨账号扫描。 */
  async function latestRun(ctx: RequestContext, accountId: string, capability: Capability): Promise<CollectionRunResource | null> {
    await ownedAccount(ctx, accountId);
    const [run] = await db.select().from(platformCollectionRuns).where(and(
      eq(platformCollectionRuns.userId, ctx.userId),
      eq(platformCollectionRuns.accountId, accountId),
      eq(platformCollectionRuns.capability, capability),
    )).orderBy(desc(platformCollectionRuns.startedAt), desc(platformCollectionRuns.id)).limit(1);
    return run ? toStatus(run) : null;
  }

  /** 内部恢复归属：从持久请求协议识别原调度任务，防旧周期恢复重启被暂停/取消的任务。 */
  async function scheduledOwnerTaskId(ctx:RequestContext,accountId:string,attemptId:string):Promise<string|null>{
    await ownedAccount(ctx,accountId);
    const read=async(id:string)=>{const [row]=await db.select().from(platformCollectionRuns).where(and(eq(platformCollectionRuns.id,id),eq(platformCollectionRuns.userId,ctx.userId),eq(platformCollectionRuns.accountId,accountId)));return row;};
    let row=await read(attemptId);if(!row)deny('FORBIDDEN_ACCOUNT','采集任务不属于当前账号');
    // SEMANTIC_BOUNDARY_ALLOW: 解析内部幂等请求协议和父任务ID，不做语义分类。
    if(row.capability==='workMetrics'&&row.clientRequestId.endsWith('-metrics'))row=await read(row.clientRequestId.slice(0,-8));
    else if(row.capability==='accountOverview'&&row.clientRequestId.endsWith('-overview'))row=await read(row.clientRequestId.slice(0,-9));
    const key=row?.capability==='workCatalog'?row.clientRequestId:'';
    const taskId=key.startsWith('scheduled-')&&key.endsWith('-catalog')?key.slice(10,-8):null;
    return taskId&&await deps.readScheduledOwner?.(ctx,taskId,accountId)?taskId:null;
  }

  /** 只有真实持久owner已取消/失败才释放原run；暂停、控制中和未知均保留。 */
  async function releaseTerminatedScheduledRuns(ctx:RequestContext,accountId:string):Promise<void>{
    await ownedAccount(ctx,accountId);
    if(!deps.readScheduledOwner)return;
    const rows=await db.select({id:platformCollectionRuns.id}).from(platformCollectionRuns).where(and(
      eq(platformCollectionRuns.userId,ctx.userId),eq(platformCollectionRuns.accountId,accountId),
      inArray(platformCollectionRuns.status,['queued','running','partial','needsAuth'])));
    for(const row of rows){
      const taskId=await scheduledOwnerTaskId(ctx,accountId,row.id);
      if(!taskId)continue;
      const owner=await deps.readScheduledOwner(ctx,taskId,accountId);
      if(owner?.status==='cancelled')await cancel(ctx,accountId,row.id);
      else if(owner?.status==='failed')await db.transaction(async tx=>{
        const [run]=await tx.select().from(platformCollectionRuns).where(and(eq(platformCollectionRuns.id,row.id),eq(platformCollectionRuns.userId,ctx.userId),eq(platformCollectionRuns.accountId,accountId))).for('update');
        if(!run||!['queued','running'].includes(run.status))return;
        await tx.update(platformCollectionRuns).set({status:'partial',generation:run.generation+1,leaseToken:null,leaseExpiresAt:null,reasonCode:'OWNER_FAILED',updatedAt:now()}).where(eq(platformCollectionRuns.id,row.id));
      });
    }
  }

  /** 只读凭据证明供旧绑定升级补计划；手填外部ID不构成授权。 */
  async function hasCredentialEvidence(ctx:RequestContext,accountId:string):Promise<boolean>{
    const account=await ownedAccount(ctx,accountId);const [binding]=await db.select().from(platformCollectionBindings).where(and(eq(platformCollectionBindings.accountId,accountId),eq(platformCollectionBindings.userId,ctx.userId)));
    return !!binding&&binding.platform===account.platform&&binding.platformIdentity===account.externalAccountId&&!binding.revokedAt&&(!binding.expiresAt||!expired(binding.expiresAt))&&['workCatalog','workMetrics'].every(scope=>binding.scopes.includes(scope));
  }
  /** 原调度任务在重新扫码核验后恢复原run；被取消任务与旧证明不能被动重启。 */
  async function resumeScheduledAuthorization(ctx:RequestContext,accountId:string,attemptId:string,taskId:string):Promise<void>{
    if(await scheduledOwnerTaskId(ctx,accountId,attemptId)!==taskId)deny('FORBIDDEN_ACCOUNT','采集恢复必须属于原调度任务');
    const account=await ownedAccount(ctx,accountId);
    await db.transaction(async tx=>{
      const [run]=await tx.select().from(platformCollectionRuns).where(and(eq(platformCollectionRuns.id,attemptId),eq(platformCollectionRuns.userId,ctx.userId),eq(platformCollectionRuns.accountId,accountId))).for('update');
      if(!run||run.status!=='needsAuth')return;
      const [binding]=await tx.select().from(platformCollectionBindings).where(and(eq(platformCollectionBindings.accountId,accountId),eq(platformCollectionBindings.userId,ctx.userId)));
      if(!binding||binding.platform!==run.platform||binding.platformIdentity!==run.platformIdentity||account.externalAccountId!==run.platformIdentity||binding.revokedAt||(binding.expiresAt&&expired(binding.expiresAt))||!binding.scopes.includes(run.capability)||Date.parse(binding.verifiedAt)<=Date.parse(run.updatedAt))return;
      await tx.update(platformCollectionRuns).set({status:'partial',reasonCode:'AUTH_REVERIFIED',leaseToken:null,leaseExpiresAt:null,updatedAt:now()}).where(eq(platformCollectionRuns.id,attemptId));
    });
  }

  async function cancel(ctx: RequestContext, accountId: string, attemptId: string): Promise<CollectionRunResource> {
    await ownedAccount(ctx, accountId);
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(and(eq(platformCollectionRuns.id, attemptId),
        eq(platformCollectionRuns.accountId, accountId), eq(platformCollectionRuns.userId, ctx.userId))).for("update");
      if (!run) deny("FORBIDDEN_ACCOUNT", "采集任务不属于当前账号");
      if (["cancelled", "complete"].includes(run.status)) return toStatus(run);
      const [updated] = await tx.update(platformCollectionRuns).set({ status: "cancelled", generation: run.generation + 1,
        leaseToken: null, leaseExpiresAt: null, reasonCode: "CANCELLED", updatedAt: now(),
      }).where(eq(platformCollectionRuns.id, attemptId)).returning();
      return toStatus(updated!);
    });
  }

  // Worker-only failure port. Keep the previous complete catalog visible, and
  // invalidate the lease so late pages from this attempt cannot be committed.
  async function failRun(attemptId: string, generation: number, leaseToken: string,
    status: "partial" | "needsAuth" | "failed", reasonCode: string): Promise<CollectionRunResource> {
    if (!reasonCode || reasonCode.length > 100) deny("SOURCE_UNMAPPED", "采集失败原因无效");
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(eq(platformCollectionRuns.id, attemptId)).for("update");
      if (!run || run.generation !== generation || run.leaseToken !== leaseToken || run.status !== "running") {
        deny("GENERATION_STALE", "旧采集世代不可更新");
      }
      const [updated] = await tx.update(platformCollectionRuns).set({ status, reasonCode,
        leaseToken: null, leaseExpiresAt: null, generation: run.generation + 1, updatedAt: now(),
      }).where(eq(platformCollectionRuns.id, attemptId)).returning();
      return toStatus(updated!);
    });
  }

  async function commitPage(raw: unknown) {
    const page = collectionPageCommit.parse(raw);
    if (page.works.length > 1000 || page.pageIndex >= 1000) deny("INCOMPLETE_CATALOG", "目录页超过保护上限");
    if (await expireRunLease(page.attemptId, { accountId: page.accountId, generation: page.generation,
      leaseToken: page.leaseToken, platformIdentity: page.expectedPlatformIdentity })) {
      deny("LEASE_EXPIRED", "采集租约已超时，目录保持上一完整版本");
    }
    return db.transaction(async tx => {
      const [run] = await tx.select().from(platformCollectionRuns).where(eq(platformCollectionRuns.id, page.attemptId)).for("update");
      if (!run || run.generation !== page.generation || run.status !== "running") deny("GENERATION_STALE", "采集世代已失效");
      if (run.leaseToken !== page.leaseToken || !run.leaseExpiresAt || expired(run.leaseExpiresAt)) deny("LEASE_EXPIRED", "采集租约已失效");
      if (run.accountId !== page.accountId || run.platform !== page.platform || run.platformIdentity !== page.expectedPlatformIdentity || run.capability !== page.capability) {
        deny("WRONG_PLATFORM_IDENTITY", "采集来源与绑定账号不一致");
      }
      const [binding] = await tx.select().from(platformCollectionBindings).where(eq(platformCollectionBindings.accountId, run.accountId));
      if (!binding || binding.userId !== run.userId || binding.platformIdentity !== run.platformIdentity ||
        !(binding.scopes as string[]).includes(run.capability) || binding.revokedAt ||
        (binding.expiresAt && expired(binding.expiresAt))) deny("SCOPE_MISSING", "平台授权已失效");
      if (page.capability !== "workCatalog" && page.scanPass !== 1) deny("INCOMPLETE_CATALOG", "指标不需要二次扫描");
      if (page.scanPass === 2 && page.sourceSnapshotKey !== null) deny("INCOMPLETE_CATALOG", "稳定快照不需要二次扫描");
      if (page.hasMore && (!page.nextCursor || page.nextCursor === page.requestCursor)) deny("INCOMPLETE_CATALOG", "目录游标未前进");
      if (!page.hasMore && page.terminalEvidence?.kind === "platformHasMoreFalse" && page.nextCursor !== null) deny("INCOMPLETE_CATALOG", "平台明确终页不能带下一游标");
      const metricRecords = page.capability === "accountOverview" ? page.accountMetrics : page.workMetrics;
      for (const metric of metricRecords) {
        const mapping = deps.metricDictionary?.[page.platform]?.[metric.sourceField];
        if (!mapping) deny("SOURCE_UNMAPPED", `未登记的指标字段: ${metric.sourceField}`);
        if (metric.sourceUnit !== mapping.unit) deny("SOURCE_UNIT_UNKNOWN", `指标单位不匹配: ${metric.sourceUnit}`);
        if (page.capability === "accountOverview" && (mapping.metricKey !== "follower_count" || metric.window.kind !== "lifetime")) {
          deny("SOURCE_UNMAPPED", "账号概况必须是粉丝总数，区间涨粉不可充当总数");
        }
        if (page.capability === "workMetrics" && mapping.metricKey === "follower_count") deny("SOURCE_UNMAPPED", "粉丝总数不能作为作品指标");
      }
      // The backend hashes the full accepted payload. The adapter's pageDigest is informational,
      // never an authority for deciding whether a replay changed its contents.
      const payloadDigest = digest({ works: page.works, metrics: metricRecords, observedAt: page.observedAt,
        sourceSnapshotKey: page.sourceSnapshotKey, hasMore: page.hasMore, requestCursor: page.requestCursor,
        nextCursor: page.nextCursor, platformReportedTotal: page.platformReportedTotal,
        totalSource: page.totalSource, totalObservedAt: page.totalObservedAt,
        terminalEvidence: page.terminalEvidence });
      const [existing] = await tx.select().from(platformCollectionPages).where(and(eq(platformCollectionPages.runId, run.id),
        eq(platformCollectionPages.generation, run.generation), eq(platformCollectionPages.scanPass, page.scanPass),
        eq(platformCollectionPages.pageIndex, page.pageIndex)));
      if (existing) {
        if (existing.payloadDigest !== payloadDigest) deny("PAGE_DIGEST_CONFLICT", "同页内容发生变化");
        return { attemptId: run.id, generation: run.generation, scanPass: page.scanPass, pageIndex: page.pageIndex,
          disposition: "replayed" as const, nextCursor: page.nextCursor, completeCatalogGeneration: run.completeCatalogGeneration };
      }
      const passPages = await tx.select().from(platformCollectionPages).where(and(eq(platformCollectionPages.runId, run.id),
        eq(platformCollectionPages.generation, run.generation), eq(platformCollectionPages.scanPass, page.scanPass)))
        .orderBy(asc(platformCollectionPages.pageIndex));
      if (page.pageIndex !== passPages.length || page.requestCursor !== (passPages.at(-1)?.nextCursor ?? null)) deny("INCOMPLETE_CATALOG", "采集页顺序或游标不连续");
      if (page.scanPass === 2) {
        const firstPass = await tx.select().from(platformCollectionPages).where(and(eq(platformCollectionPages.runId, run.id),
          eq(platformCollectionPages.generation, run.generation), eq(platformCollectionPages.scanPass, 1))).orderBy(asc(platformCollectionPages.pageIndex));
        if (!firstPass.length || firstPass.at(-1)?.hasMore !== 0 || firstPass[0]?.sourceSnapshotKey !== null) deny("INCOMPLETE_CATALOG", "首轮目录尚未完整");
      }
      if (passPages.length && passPages[0]!.sourceSnapshotKey !== page.sourceSnapshotKey) deny("INCOMPLETE_CATALOG", "平台快照标识变化");
      if (passPages.length && passPages[0]!.platformReportedTotal !== page.platformReportedTotal) deny("INCOMPLETE_CATALOG", "平台报告总数在扫描中变化");
      if (passPages.length && passPages[0]!.totalSource !== page.totalSource) deny("INCOMPLETE_CATALOG", "平台总数来源在扫描中变化");
      const previousCursor = new Set(passPages.flatMap(p => [p.requestCursor, p.nextCursor]).filter((v): v is string => !!v));
      if (page.nextCursor && previousCursor.has(page.nextCursor)) deny("INCOMPLETE_CATALOG", "目录游标循环");
      const seenIds = new Set(passPages.flatMap(p => p.recordIds));
      for (const work of page.works) if (seenIds.has(work.externalId)) deny("INCOMPLETE_CATALOG", "同一次扫描出现重复作品 ID");
      if (page.terminalEvidence?.kind === "reportedTotalAndProbe") {
        const probe = page.terminalEvidence.probe;
        if (probe.responseDigest !== computeProbeDigest({ requestCursor: probe.requestCursor,
          nextCursor: probe.nextCursor, recordIds: probe.recordIds, observedAt: probe.observedAt })) {
          deny("INCOMPLETE_CATALOG", "终页后继探测摘要不一致");
        }
        const ids = new Set([...seenIds, ...page.works.map(w => w.externalId)]);
        if (page.platformReportedTotal !== ids.size || probe.recordIds.some(id => !ids.has(id))) {
          deny("INCOMPLETE_CATALOG", "终页探测发现新作品或报告总数不符");
        }
      }
      await tx.insert(platformCollectionPages).values({ id: nextId("page"), runId: run.id, generation: run.generation,
        scanPass: page.scanPass, pageIndex: page.pageIndex, requestCursor: page.requestCursor,
        nextCursor: page.nextCursor, sourceSnapshotKey: page.sourceSnapshotKey, pageDigest: payloadDigest,
        platformReportedTotal: page.platformReportedTotal, totalSource: page.totalSource,
        totalObservedAt: page.totalObservedAt, terminalEvidence: page.terminalEvidence,
        payloadDigest, hasMore: page.hasMore ? 1 : 0, recordIds: page.works.map(w => w.externalId),
        works: page.works, metrics: metricRecords, observedAt: page.observedAt, createdAt: now(),
      });
      // Visibility is a safety watermark independent of catalog publication.
      for (const work of page.works) {
        const priority = deps.visibilitySourcePriority?.[work.visibility.source];
        if (!priority || work.visibility.visibility === "unknown") {
          const [current] = await tx.select().from(platformWorks).where(and(eq(platformWorks.userId, run.userId),
            eq(platformWorks.accountId, run.accountId), eq(platformWorks.platform, run.platform), eq(platformWorks.externalId, work.externalId)));
          if (current && (!current.uncertainVisibilityAt || current.uncertainVisibilityAt < work.visibility.observedAt)) {
            await tx.update(platformWorks).set({ outboundFrozenAt: now(),
              uncertainVisibilityAt: work.visibility.observedAt }).where(eq(platformWorks.id, current.id));
          }
          continue;
        }
        if (work.visibility.visibility === "public") continue;
        const [current] = await tx.select().from(platformWorks).where(and(eq(platformWorks.userId, run.userId),
          eq(platformWorks.accountId, run.accountId), eq(platformWorks.platform, run.platform), eq(platformWorks.externalId, work.externalId)));
        if (current && current.visibility !== "public" &&
          (current.visibilityObservedAt > work.visibility.observedAt ||
            (current.visibilityObservedAt === work.visibility.observedAt && current.visibilityPriority > priority))) continue;
        await tx.insert(platformVisibilityTombstones).values({ id: nextId("tombstone"), userId: run.userId,
          accountId: run.accountId, platform: run.platform, externalId: work.externalId,
          visibility: work.visibility.visibility, source: work.visibility.source, sourcePriority: priority,
          observedAt: work.visibility.observedAt, createdAt: now(),
        }).onConflictDoNothing();
        if (current) await tx.update(platformWorks).set({ visibility: work.visibility.visibility,
          visibilitySource: work.visibility.source, visibilityPriority: priority,
          visibilityObservedAt: work.visibility.observedAt, outboundFrozenAt: now(),
        }).where(eq(platformWorks.id, current.id));
      }
      let completeCatalogGeneration: number | null = null;
      let catalogMismatch = false;
      if (!page.hasMore) {
        if (page.capability === "workCatalog") {
          const first = page.scanPass === 1 ? [...passPages, { works: page.works, recordIds: page.works.map(w => w.externalId), platformReportedTotal: page.platformReportedTotal }] :
            await tx.select().from(platformCollectionPages).where(and(eq(platformCollectionPages.runId, run.id),
              eq(platformCollectionPages.generation, run.generation), eq(platformCollectionPages.scanPass, 1))).orderBy(asc(platformCollectionPages.pageIndex));
          if (page.sourceSnapshotKey !== null || page.scanPass === 2) {
            const ids1 = first.flatMap(p => p.recordIds).sort();
            const uncertainSecond = new Map<string, string>();
            if (page.scanPass === 2) {
              for (const secondWork of [...passPages.flatMap(p => p.works as SourceWork[]), ...page.works]) {
                if (secondWork.visibility.visibility === "unknown" ||
                  !deps.visibilitySourcePriority?.[secondWork.visibility.source]) {
                  const previous = uncertainSecond.get(secondWork.externalId);
                  if (!previous || previous < secondWork.visibility.observedAt) {
                    uncertainSecond.set(secondWork.externalId, secondWork.visibility.observedAt);
                  }
                }
              }
            }
            if (page.platformReportedTotal !== null && page.platformReportedTotal !==
              (page.scanPass === 2 ? [...passPages.flatMap(p => p.recordIds), ...page.works.map(w => w.externalId)].length : ids1.length)) {
              catalogMismatch = true;
            }
            if (page.scanPass === 2) {
              const ids2 = [...passPages.flatMap(p => p.recordIds), ...page.works.map(w => w.externalId)].sort();
              if (ids1.length !== ids2.length || ids1.some((id, i) => id !== ids2[i])) catalogMismatch = true;
              if (first[0]?.platformReportedTotal !== page.platformReportedTotal) catalogMismatch = true;
            }
            if (!catalogMismatch) {
            const [catalog] = await tx.select().from(platformCatalogs).where(eq(platformCatalogs.accountId, run.accountId)).for("update");
            completeCatalogGeneration = (catalog?.generation ?? 0) + 1;
            for (const work of first.flatMap(p => p.works as SourceWork[])) {
              const priority = deps.visibilitySourcePriority?.[work.visibility.source] ?? 0;
              const [current] = await tx.select().from(platformWorks).where(and(eq(platformWorks.userId, run.userId),
                eq(platformWorks.accountId, run.accountId), eq(platformWorks.platform, run.platform), eq(platformWorks.externalId, work.externalId)));
              let visibility: string = work.visibility.visibility;
              let visibilitySource = work.visibility.source;
              let visibilityPriority = priority;
              let visibilityObservedAt = work.visibility.observedAt;
              let outboundFrozenAt: string | null = priority && !isPrivate(visibility) ? null : now();
              let uncertainVisibilityAt: string | null = !priority || visibility === "unknown" ? work.visibility.observedAt : null;
              if (current) {
                const older = work.visibility.observedAt <= current.visibilityObservedAt;
                const weaker = priority < current.visibilityPriority;
                if (older || (weaker && current.visibility !== "public")) {
                  visibility = current.visibility; visibilitySource = current.visibilitySource;
                  visibilityPriority = current.visibilityPriority; visibilityObservedAt = current.visibilityObservedAt;
                  outboundFrozenAt = current.outboundFrozenAt;
                }
                uncertainVisibilityAt = current.uncertainVisibilityAt;
                if (current.uncertainVisibilityAt && work.visibility.observedAt <= current.uncertainVisibilityAt) {
                  outboundFrozenAt = current.outboundFrozenAt ?? now();
                } else if (priority && visibility === "public" && work.visibility.observedAt > (current.uncertainVisibilityAt ?? "")) {
                  uncertainVisibilityAt = null;
                }
              }
              const [nonpublicWatermark] = await tx.select().from(platformVisibilityTombstones).where(and(
                eq(platformVisibilityTombstones.userId, run.userId),
                eq(platformVisibilityTombstones.accountId, run.accountId),
                eq(platformVisibilityTombstones.platform, run.platform),
                eq(platformVisibilityTombstones.externalId, work.externalId),
              )).orderBy(desc(platformVisibilityTombstones.observedAt), desc(platformVisibilityTombstones.sourcePriority)).limit(1);
              if (nonpublicWatermark && (work.visibility.observedAt <= nonpublicWatermark.observedAt || priority < nonpublicWatermark.sourcePriority)) {
                visibility = nonpublicWatermark.visibility;
                visibilitySource = nonpublicWatermark.source;
                visibilityPriority = nonpublicWatermark.sourcePriority;
                visibilityObservedAt = nonpublicWatermark.observedAt;
                outboundFrozenAt = nonpublicWatermark.createdAt;
              }
              const secondUncertainty = uncertainSecond.get(work.externalId);
              if (secondUncertainty) {
                uncertainVisibilityAt = secondUncertainty;
                outboundFrozenAt = now();
              }
              const values = { userId: run.userId, accountId: run.accountId, platform: run.platform,
                externalId: work.externalId, kind: work.kind,
                title: work.title?.trim() || current?.title || null,
                publishedAt: work.publishedAt,
                visibility, visibilitySource, visibilityPriority, visibilityObservedAt, source: work.source,
                observedAt: work.observedAt, ingestedAt: now(), catalogGeneration: completeCatalogGeneration,
                outboundFrozenAt, uncertainVisibilityAt };
              if (current) await tx.update(platformWorks).set(values).where(eq(platformWorks.id, current.id));
              else await tx.insert(platformWorks).values({ id: nextId("work"), ...values });
            }
            // A complete new catalog can omit an older public work. Freeze its old
            // outbound projection immediately; absence alone is not deletion proof.
            const olderWorks = await tx.select().from(platformWorks).where(and(
              eq(platformWorks.userId, run.userId), eq(platformWorks.accountId, run.accountId),
              eq(platformWorks.platform, run.platform)));
            const publishedIds = new Set(ids1);
            for (const older of olderWorks) {
              if (publishedIds.has(older.externalId) || older.outboundFrozenAt) continue;
              await tx.update(platformWorks).set({ outboundFrozenAt: now(), uncertainVisibilityAt: now() })
                .where(eq(platformWorks.id, older.id));
            }
            if (catalog) await tx.update(platformCatalogs).set({ generation: completeCatalogGeneration,
              workCount: ids1.length, completedAt: now() }).where(eq(platformCatalogs.accountId, run.accountId));
            else await tx.insert(platformCatalogs).values({ accountId: run.accountId, userId: run.userId,
              platform: run.platform, generation: completeCatalogGeneration, workCount: ids1.length, completedAt: now() });
            }
          }
        } else {
          const allMetrics = [...passPages.flatMap(p => p.metrics as SourceMetric[]), ...metricRecords];
          for (const metric of allMetrics) {
            const mapping = deps.metricDictionary![run.platform]![metric.sourceField]!;
            const key = JSON.stringify(metric.window);
            const data = { userId: run.userId, accountId: run.accountId, platform: run.platform,
              metricKey: mapping.metricKey, value: metric.value, availability: metric.availability,
              unit: mapping.unit, window: metric.window, windowKey: key, source: metric.source,
              sourceSnapshotKey: page.sourceSnapshotKey, sourceSnapshotKeyIndex: page.sourceSnapshotKey ?? "",
              capturedAt: metric.capturedAt, observedAt: metric.observedAt, ingestedAt: now() };
            if (page.capability === "accountOverview") {
              const [prior] = await tx.select().from(platformAccountMetricSnapshots).where(and(
                eq(platformAccountMetricSnapshots.userId, run.userId), eq(platformAccountMetricSnapshots.accountId, run.accountId),
                eq(platformAccountMetricSnapshots.metricKey, mapping.metricKey), eq(platformAccountMetricSnapshots.windowKey, key),
                eq(platformAccountMetricSnapshots.source, metric.source), eq(platformAccountMetricSnapshots.observedAt, metric.observedAt),
                eq(platformAccountMetricSnapshots.sourceSnapshotKeyIndex, page.sourceSnapshotKey ?? "")));
              if (prior && (prior.value !== metric.value || prior.availability !== metric.availability)) deny("PAGE_DIGEST_CONFLICT", "同一指标证据值冲突");
              if (!prior) await tx.insert(platformAccountMetricSnapshots).values({ id: nextId("metric"), ...data });
            } else {
              const [work] = await tx.select().from(platformWorks).where(and(eq(platformWorks.userId, run.userId),
                eq(platformWorks.accountId, run.accountId), eq(platformWorks.platform, run.platform),
                eq(platformWorks.externalId, metric.externalWorkId!)));
              if (!work) deny("FORBIDDEN_ACCOUNT", "指标作品不属于当前账号目录");
              const [prior] = await tx.select().from(platformWorkMetricSnapshots).where(and(
                eq(platformWorkMetricSnapshots.userId, run.userId), eq(platformWorkMetricSnapshots.accountId, run.accountId),
                eq(platformWorkMetricSnapshots.platformWorkId, work.id), eq(platformWorkMetricSnapshots.metricKey, mapping.metricKey),
                eq(platformWorkMetricSnapshots.windowKey, key), eq(platformWorkMetricSnapshots.source, metric.source),
                eq(platformWorkMetricSnapshots.observedAt, metric.observedAt),
                eq(platformWorkMetricSnapshots.sourceSnapshotKeyIndex, page.sourceSnapshotKey ?? "")));
              if (prior && (prior.value !== metric.value || prior.availability !== metric.availability)) deny("PAGE_DIGEST_CONFLICT", "同一指标证据值冲突");
              if (!prior) await tx.insert(platformWorkMetricSnapshots).values({ id: nextId("metric"), ...data, platformWorkId: work.id });
            }
          }
        }
      }
      const complete = !page.hasMore && (page.capability !== "workCatalog" || completeCatalogGeneration !== null);
      await tx.update(platformCollectionRuns).set({
        committedPages: run.committedPages + 1, sourceSnapshotKey: page.sourceSnapshotKey,
        status: catalogMismatch ? "partial" : complete ? "complete" : "running", completeCatalogGeneration,
        reasonCode: catalogMismatch ? "INCOMPLETE_CATALOG" : null,
        leaseToken: complete || catalogMismatch ? null : run.leaseToken,
        leaseExpiresAt: complete || catalogMismatch ? null : new Date(Date.parse(now()) + leaseMs).toISOString(),
        updatedAt: now(),
      }).where(eq(platformCollectionRuns.id, run.id));
      return { attemptId: run.id, generation: run.generation, scanPass: page.scanPass,
        pageIndex: page.pageIndex, disposition: "accepted" as const, nextCursor: page.nextCursor,
        completeCatalogGeneration };
    });
  }

  async function listWorks(ctx: RequestContext, raw: unknown) {
    const query = platformWorksListQuery.parse(raw);
    await ownedAccount(ctx, query.accountId);
    const [catalog] = await db.select().from(platformCatalogs).where(and(eq(platformCatalogs.accountId, query.accountId), eq(platformCatalogs.userId, ctx.userId)));
    if (!catalog) return { accountId: query.accountId, catalogGeneration: null,
      catalogCompleteness: "none" as const, catalogCompletedAt: null,
      total: 0, currentTotal: 0, unavailableTotal: 0, nextCursor: null, items: [] };
    const offset = query.cursor ? Number(query.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) deny("INCOMPLETE_CATALOG", "无效分页游标");
    const filter = and(eq(platformWorks.userId, ctx.userId), eq(platformWorks.accountId, query.accountId),
      or(eq(platformWorks.catalogGeneration, catalog.generation),
        and(lt(platformWorks.catalogGeneration, catalog.generation), isNotNull(platformWorks.outboundFrozenAt))),
      ...(query.projectId ? [eq(platformWorks.legacyProjectId, query.projectId)] : []));
    const total = (await db.select({ total: count() }).from(platformWorks).where(filter))[0]?.total ?? 0;
    const currentTotal = (await db.select({ total: count() }).from(platformWorks).where(and(
      filter, eq(platformWorks.catalogGeneration, catalog.generation))))[0]?.total ?? 0;
    const unavailableTotal = total - currentTotal;
    const rows = await db.select().from(platformWorks).where(filter)
      .orderBy(desc(platformWorks.catalogGeneration), asc(platformWorks.externalId))
      .limit(query.pageSize).offset(offset);
    return { accountId: query.accountId, catalogGeneration: catalog.generation,
      catalogCompleteness: catalog.completedAt ? "verifiedComplete" as const : "legacyPartial" as const,
      catalogCompletedAt: catalog.completedAt, total, currentTotal, unavailableTotal,
      nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
      items: rows.map(row => ({ id: row.id, userId: row.userId, accountId: row.accountId,
        platform: row.platform, externalId: row.externalId, kind: row.kind,
        title: row.title,
        publishedAt: row.publishedAt, visibility: row.catalogGeneration < catalog.generation ? {
          visibility: "unknown" as const, source: "ABSENT_UNCONFIRMED", sourcePriority: 0,
          observedAt: catalog.completedAt ?? row.visibilityObservedAt,
        } : { visibility: row.visibility, source: row.visibilitySource,
          sourcePriority: row.visibilityPriority, observedAt: row.visibilityObservedAt }, source: row.source,
        observedAt: row.observedAt, ingestedAt: row.ingestedAt,
        catalogGeneration: row.catalogGeneration, publicationId: row.publicationId,
        legacyProjectId: row.legacyProjectId, legacyPublicationId: row.legacyPublicationId,
        directoryState: row.catalogGeneration < catalog.generation ? "unavailable" as const : "current" as const,
        directoryReasonCode: row.catalogGeneration < catalog.generation ? "ABSENT_UNCONFIRMED" as const : null })) };
  }

  async function readMetrics(ctx: RequestContext, raw: unknown) {
    const query = platformMetricsReadQuery.parse(raw);
    await ownedAccount(ctx, query.accountId);
    if (query.platformWorkId) {
      const [work] = await db.select().from(platformWorks).where(and(eq(platformWorks.id, query.platformWorkId),
        eq(platformWorks.userId, ctx.userId), eq(platformWorks.accountId, query.accountId)));
      if (!work) deny("FORBIDDEN_ACCOUNT", "作品不属于当前账号");
    }
    const accountRows = query.platformWorkId ? [] : await db.select().from(platformAccountMetricSnapshots).where(and(
      eq(platformAccountMetricSnapshots.userId, ctx.userId), eq(platformAccountMetricSnapshots.accountId, query.accountId),
      ...(query.metricKey ? [eq(platformAccountMetricSnapshots.metricKey, query.metricKey)] : [])));
    const workRows = await db.select().from(platformWorkMetricSnapshots).where(and(
      eq(platformWorkMetricSnapshots.userId, ctx.userId), eq(platformWorkMetricSnapshots.accountId, query.accountId),
      ...(query.platformWorkId ? [eq(platformWorkMetricSnapshots.platformWorkId, query.platformWorkId)] : []),
      ...(query.metricKey ? [eq(platformWorkMetricSnapshots.metricKey, query.metricKey)] : [])));
    const combined = [
      ...accountRows.map(row => ({ type: "account" as const, row })),
      ...workRows.map(row => ({ type: "work" as const, row })),
    ].sort((a, b) => a.row.observedAt.localeCompare(b.row.observedAt) || a.row.id.localeCompare(b.row.id));
    const offset = query.cursor ? Number(query.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) deny("INCOMPLETE_CATALOG", "无效分页游标");
    const selected = combined.slice(offset, offset + query.pageSize);
    const stripInternal = <T extends { sourceSnapshotKeyIndex: string; windowKey: string }>(row: T) => {
      const { sourceSnapshotKeyIndex: _index, windowKey: _key, ...resource } = row;
      return resource;
    };
    return { accountId: query.accountId,
      nextCursor: offset + selected.length < combined.length ? String(offset + selected.length) : null,
      accountMetrics: selected.filter(item => item.type === "account").map(item => stripInternal(item.row)),
      workMetrics: selected.filter(item => item.type === "work").map(item => stripInternal(item.row)),
    };
  }

  async function recordConfirmedLegacyImport(ctx: RequestContext, input: {
    accountId: string; platform: "douyin"; externalId: string; kind: "video"; title: string | null;
    publishedAt: string | null; publicationId: string; legacyProjectId: string | null;
    capturedAt: string; metrics: Record<string, unknown>;
  }): Promise<{ platformWorkId: string; created: boolean; metricsCreated: number }> {
    if (ctx.accountId !== input.accountId || input.platform !== "douyin" || !input.externalId || !input.publicationId) {
      deny("FORBIDDEN_ACCOUNT", "旧作品镜像必须绑定真实抖音账号及发布事实");
    }
    const capturedMs = Date.parse(input.capturedAt);
    const publishedMs = input.publishedAt === null ? null : Date.parse(input.publishedAt);
    if (!Number.isFinite(capturedMs) || (publishedMs !== null && !Number.isFinite(publishedMs))) {
      deny("SOURCE_UNMAPPED", "导入时间不是可验证的时间戳");
    }
    const capturedAt = new Date(capturedMs).toISOString();
    const publishedAt = publishedMs === null ? null : new Date(publishedMs).toISOString();
    const metricDictionary = {
      plays: "play_count", likes: "like_count", comments: "comment_count",
      shares: "share_count", favorites: "favorite_count",
    } as const;
    const metrics = Object.entries(metricDictionary).flatMap(([sourceField, metricKey]) => {
      const value = sourceField === "plays"
        ? input.metrics.views ?? input.metrics.plays : input.metrics[sourceField];
      if (value === undefined || value === null) return [];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        deny("SOURCE_UNIT_UNKNOWN", `抖音 ${sourceField} 指标必须是真实非负整数`);
      }
      return [{ metricKey, value }];
    });
    return db.transaction(async tx => {
      const [account] = await tx.select().from(platformAccounts).where(and(
        eq(platformAccounts.id, input.accountId), eq(platformAccounts.userId, ctx.userId))).for("update");
      if (!account || account.status !== "active" || account.platform !== "douyin") deny("FORBIDDEN_ACCOUNT", "抖音账号不属于当前用户");
      const [publication] = await tx.select().from(publications).where(and(
        eq(publications.id, input.publicationId), eq(publications.userId, ctx.userId),
        eq(publications.accountId, input.accountId), eq(publications.platform, "douyin"),
        eq(publications.externalId, input.externalId)));
      if (!publication || publication.status !== "published") deny("FORBIDDEN_ACCOUNT", "找不到同账号的已确认发布事实");
      if (input.legacyProjectId !== null) {
        const [project] = await tx.select().from(projects).where(and(eq(projects.id, input.legacyProjectId),
          eq(projects.userId, ctx.userId), eq(projects.accountId, input.accountId)));
        const [output] = await tx.select().from(contentOutputs).where(and(eq(contentOutputs.id, publication.contentOutputId),
          eq(contentOutputs.projectId, input.legacyProjectId)));
        if (!project || !output) deny("FORBIDDEN_ACCOUNT", "历史项目与发布作品归属不一致");
      }
      const [catalog] = await tx.select().from(platformCatalogs).where(and(eq(platformCatalogs.accountId, input.accountId),
        eq(platformCatalogs.userId, ctx.userId))).for("update");
      const [existing] = await tx.select().from(platformWorks).where(and(eq(platformWorks.userId, ctx.userId),
        eq(platformWorks.accountId, input.accountId), eq(platformWorks.platform, "douyin"),
        eq(platformWorks.externalId, input.externalId))).for("update");
      if (existing && ((existing.publicationId && existing.publicationId !== publication.id) ||
        (existing.legacyProjectId && input.legacyProjectId && existing.legacyProjectId !== input.legacyProjectId))) {
        deny("PAGE_DIGEST_CONFLICT", "历史作品关联了不同的真实发布或项目");
      }
      let platformWorkId: string;
      let created = false;
      if (existing) {
        platformWorkId = existing.id;
        await tx.update(platformWorks).set({ publicationId: existing.publicationId ?? publication.id,
          legacyPublicationId: existing.legacyPublicationId ?? publication.id,
          legacyProjectId: existing.legacyProjectId ?? input.legacyProjectId,
          title: existing.title ?? input.title?.trim() ?? null,
          publishedAt: existing.publishedAt ?? publishedAt,
        }).where(eq(platformWorks.id, existing.id));
      } else {
        platformWorkId = nextId("work");
        created = true;
        await tx.insert(platformWorks).values({ id: platformWorkId, userId: ctx.userId,
          accountId: input.accountId, platform: "douyin", externalId: input.externalId,
          kind: input.kind, title: input.title?.trim() || null, publishedAt,
          visibility: "unknown", visibilitySource: "legacy_import",
          visibilityPriority: 0, visibilityObservedAt: capturedAt, source: "ingestion",
          observedAt: capturedAt, ingestedAt: now(), catalogGeneration: 0,
          publicationId: publication.id, legacyPublicationId: publication.id,
          legacyProjectId: input.legacyProjectId, outboundFrozenAt: now(), uncertainVisibilityAt: capturedAt,
        });
      }
      if (!catalog) await tx.insert(platformCatalogs).values({ accountId: input.accountId,
        userId: ctx.userId, platform: "douyin", generation: 0, completedAt: null, workCount: 0 });
      if (!catalog || catalog.generation === 0) {
        const total = (await tx.select({ total: count() }).from(platformWorks).where(and(
          eq(platformWorks.userId, ctx.userId), eq(platformWorks.accountId, input.accountId),
          eq(platformWorks.platform, "douyin"), eq(platformWorks.catalogGeneration, 0))))[0]?.total ?? 0;
        await tx.update(platformCatalogs).set({ workCount: total }).where(eq(platformCatalogs.accountId, input.accountId));
      }
      let metricsCreated = 0;
      for (const metric of metrics) {
        const [prior] = await tx.select().from(platformWorkMetricSnapshots).where(and(
          eq(platformWorkMetricSnapshots.userId, ctx.userId), eq(platformWorkMetricSnapshots.accountId, input.accountId),
          eq(platformWorkMetricSnapshots.platformWorkId, platformWorkId), eq(platformWorkMetricSnapshots.metricKey, metric.metricKey),
          eq(platformWorkMetricSnapshots.windowKey, "lifetime"),
          eq(platformWorkMetricSnapshots.source, "ingestion"), eq(platformWorkMetricSnapshots.observedAt, capturedAt),
          eq(platformWorkMetricSnapshots.sourceSnapshotKeyIndex, "")));
        if (prior) {
          if (prior.value !== metric.value || prior.availability !== "available") deny("PAGE_DIGEST_CONFLICT", "同次导入的指标证据发生冲突");
          continue;
        }
        await tx.insert(platformWorkMetricSnapshots).values({ id: nextId("metric"), userId: ctx.userId,
          accountId: input.accountId, platform: "douyin", platformWorkId,
          metricKey: metric.metricKey, value: metric.value, availability: "available", unit: "count",
          window: { kind: "lifetime" }, windowKey: "lifetime",
          source: "ingestion", sourceSnapshotKey: null, sourceSnapshotKeyIndex: "",
          capturedAt, observedAt: capturedAt, ingestedAt: now(),
        });
        metricsCreated += 1;
      }
      return { platformWorkId, created, metricsCreated };
    });
  }

  return { commitVerifiedBinding, listCapabilities, bindBegin, recordVerifiedIdentity, bindConfirm, bindCancel, retryBindCleanup,
    start, claim, renewLease, sweepExpiredLeases, status, latestRun, scheduledOwnerTaskId, releaseTerminatedScheduledRuns, hasCredentialEvidence, resumeScheduledAuthorization, cancel, failRun, commitPage, listWorks, readMetrics,
    recordConfirmedLegacyImport };
}
