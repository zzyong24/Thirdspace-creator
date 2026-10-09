import type {
  CollectionPageCommit, CollectionRunResource, NativeReportKind, NativeReportPayload, RequestContext,
} from "@creatoros/contract";

export type WechatNativeReportInput = Pick<
  NativeReportPayload, "platform" | "kind" | "filename" | "sourcePath" | "selection"
> & { bytes: Uint8Array; expectedRows?: number };
export type WechatNativeCollectionLease = Pick<CollectionPageCommit,
  "attemptId" | "accountId" | "platform" | "capability" | "expectedPlatformIdentity" | "generation" | "leaseToken"
> & { leaseExpiresAt: string };
export interface WechatNativeBrowserOptions {
  directory: string;
  platform: NativeReportPayload["platform"];
  expectedPlatformIdentity: string;
  attemptId: string;
  signal: AbortSignal;
  deadlineAt: number;
  onReport(input: WechatNativeReportInput): Promise<void>;
  onStopped(): Promise<void>;
  onStopUnconfirmed(retry: () => Promise<void>): void;
}
export interface WechatNativeCollectorPorts {
  workerId: string;
  now?: () => number;
  claimLease(attemptId: string, workerId: string): Promise<WechatNativeCollectionLease>;
  renewLease(attemptId: string, generation: number, leaseToken: string): Promise<{
    attemptId: string; generation: number; leaseExpiresAt: string;
  }>;
  commitPage(page: CollectionPageCommit): Promise<unknown>;
  failRun(attemptId: string, generation: number, leaseToken: string,
    status: "partial" | "needsAuth" | "failed", reasonCode: string): Promise<unknown>;
  authorizeProfile(ctx: RequestContext, lease: WechatNativeCollectionLease, signal: AbortSignal): Promise<{ authDir: string }>;
  acquireProfile(authDir: string, signal: AbortSignal): Promise<{ authDir: string; onStopped(): Promise<void> }>;
  parseReport(input: WechatNativeReportInput): NativeReportPayload | Promise<NativeReportPayload>;
  collectReports(options: WechatNativeBrowserOptions): Promise<void>;
  onStopUnconfirmed(attemptId: string, retry: () => Promise<void>): void;
}
const REASONS = [
  "CANCELLED", "TASK_TIMEOUT", "LEASE_LOST", "LOGIN_REQUIRED", "EXPORT_FAILED",
  "REPORT_TOO_LARGE", "REPORT_PARSE_FAILED", "REPORT_KIND_DUPLICATE", "REPORT_KIND_MISMATCH",
  "REPORT_PLATFORM_MISMATCH", "REPORTS_INCOMPLETE", "REPORT_RUN_CLOSED", "COLLECTION_RUN_INVALID",
  "BROWSER_STOP_UNCONFIRMED", "WRONG_PLATFORM_IDENTITY", "FORBIDDEN_ACCOUNT", "SCOPE_MISSING",
  "GENERATION_STALE", "LEASE_EXPIRED", "PAGE_DIGEST_CONFLICT",
] as const;
type Reason = typeof REASONS[number];
export class WechatNativeCollectorError extends Error {
  constructor(readonly code: Reason) { super(code); this.name = "WechatNativeCollectorError"; }
}
export interface WechatNativeCollectionResult {
  attemptId: string;
  status: "complete" | "partial" | "needsAuth" | "failed" | "cancelled";
  reasonCode: Reason | null;
  committedReports: number;
  stopUnconfirmed: boolean;
}
const RUN_BUDGET_MS = 30 * 60 * 1000;
const RENEW_INTERVAL_MS = 20000; // 租约心跳间隔，不是下载/执行预算。
function fail(code: Reason): never { throw new WechatNativeCollectorError(code); }
function reasonOf(error: unknown): Reason {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === "string" ? value.code : value?.message;
  if (REASONS.includes(code as Reason)) return code as Reason;
  if (["REPORT_FORMAT", "REPORT_SCHEMA", "REPORT_DATE_RANGE", "REPORT_ROW_COUNT_MISMATCH"].includes(String(code))) return "REPORT_PARSE_FAILED";
  return "EXPORT_FAILED";
}

/**
 * 组合唯一CollectionRun的租约、受管profile与worker窄端口。自身不打开浏览器、不读文件、不写DB。
 * SEMANTIC_BOUNDARY_ALLOW: 固定种类集合、来源平台与顺序/租约校验属于有限协议；
 * 不根据标题匹配作品，不判断内容，不授予账号或登录环境归属。
 */
export function createWechatNativeCollector(ports: WechatNativeCollectorPorts) {
  const now = ports.now ?? Date.now;
  return async function execute(
    ctx: RequestContext, run: CollectionRunResource, parentSignal?: AbortSignal,
  ): Promise<WechatNativeCollectionResult> {
    let lease: WechatNativeCollectionLease | undefined;
    let resource: Awaited<ReturnType<WechatNativeCollectorPorts["acquireProfile"]>> | undefined;
    let active = true, acceptingReports = true, browserStarted = false, stopped = false, stopUnconfirmed = false;
    let committedReports = 0, pageIndex = 0, cursor: string | null = null;
    let last: { report: NativeReportPayload; observedAt: string } | undefined;
    let expectedKinds: readonly NativeReportKind[] = [];
    const seen = new Set<NativeReportKind>();
    const controller = new AbortController();
    const deadlineAt = Date.parse(run.startedAt) + RUN_BUDGET_MS;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalInFlight: Promise<void> | undefined;
    let callbackTail: Promise<void> = Promise.resolve(), callbackFailure: unknown;
    let stoppedPromise: Promise<void> | undefined;
    const result = (status: WechatNativeCollectionResult["status"], reasonCode: Reason | null): WechatNativeCollectionResult =>
      ({ attemptId: run.attemptId, status, reasonCode, committedReports, stopUnconfirmed: browserStarted && !stopped });
    const abort = (code: Reason) => { if (!controller.signal.aborted) controller.abort(new WechatNativeCollectorError(code)); };
    const parentAbort = () => abort("CANCELLED"); // 不把父signal可能包含的私密正文带入结果/持久失败码。
    const check = () => {
      if (!active) fail("REPORT_RUN_CLOSED");
      if (controller.signal.aborted) throw controller.signal.reason;
      if (now() >= deadlineAt) { abort("TASK_TIMEOUT"); throw controller.signal.reason; }
    };
    const onStopped = async () => {
      if (!resource) fail("BROWSER_STOP_UNCONFIRMED");
      if (!stoppedPromise) stoppedPromise = resource.onStopped().then(() => { stopped = true; stopUnconfirmed = false; });
      try { await stoppedPromise; } catch (error) { stoppedPromise = undefined; throw error; }
    };
    const renew = async () => {
      try {
        check();
        const renewed = await ports.renewLease(lease!.attemptId, lease!.generation, lease!.leaseToken);
        if (renewed.attemptId !== lease!.attemptId || renewed.generation !== lease!.generation) fail("LEASE_LOST");
        check();
      } catch {
        if (active && !controller.signal.aborted) abort("LEASE_LOST");
      } finally {
        if (active && !controller.signal.aborted) renewalTimer = setTimeout(() => {
          renewalInFlight = renew();
        }, RENEW_INTERVAL_MS);
      }
    };
    const commit = async (report: NativeReportPayload, observedAt: string, terminal: boolean) => {
      check();
      const nextCursor = terminal ? null : seen.size + 1 === expectedKinds.length
        ? "native-reports:terminal" : "native-reports:" + (pageIndex + 1);
      await ports.commitPage({
        attemptId: lease!.attemptId, accountId: lease!.accountId, platform: lease!.platform,
        expectedPlatformIdentity: lease!.expectedPlatformIdentity, generation: lease!.generation, leaseToken: lease!.leaseToken,
        capability: "nativeReports", sourceSnapshotKey: null, scanPass: 1,
        platformReportedTotal: null, totalSource: null, totalObservedAt: null,
        terminalEvidence: terminal ? { kind: "platformHasMoreFalse", source: "wechat-native-reports", observedAt } : null,
        pageIndex, requestCursor: cursor, nextCursor, pageDigest: report.sha256,
        hasMore: !terminal, observedAt, works: [], accountMetrics: [], workMetrics: [], nativeReports: [report],
      });
      pageIndex++; cursor = nextCursor;
    };
    const submit = async (input: WechatNativeReportInput) => {
      if (callbackFailure) throw callbackFailure;
      check();
      if (input.platform !== lease!.platform) fail("REPORT_PLATFORM_MISMATCH");
      if (!expectedKinds.includes(input.kind)) fail("REPORT_KIND_MISMATCH");
      if (seen.has(input.kind)) fail("REPORT_KIND_DUPLICATE");
      const report = await ports.parseReport(input);
      check();
      if (report.platform !== input.platform) fail("REPORT_PLATFORM_MISMATCH");
      if (report.kind !== input.kind) fail("REPORT_KIND_MISMATCH");
      const observedAt = new Date(now()).toISOString();
      await commit(report, observedAt, false);
      seen.add(report.kind); committedReports++; last = { report, observedAt };
      check();
    };
    const onReport = (input: WechatNativeReportInput): Promise<void> => {
      if (!acceptingReports || !active) return Promise.reject(new WechatNativeCollectorError("REPORT_RUN_CLOSED"));
      const next = callbackTail.then(() => submit(input));
      // driver逐份await此回调，协议失败沿原reject进入物理close；不抢先abort外层而遮盖真实错误。
      // 即使错误driver忽略reject，后续报告已封闭，原deadline仍独立限制整次执行。
      callbackTail = next.catch(error => { callbackFailure = error; acceptingReports = false; });
      return next;
    };

    if (parentSignal?.aborted) return result("cancelled", "CANCELLED");
    parentSignal?.addEventListener("abort", parentAbort, { once: true });
    if (Number.isFinite(deadlineAt) && deadlineAt > now()) {
      deadlineTimer = setTimeout(() => abort("TASK_TIMEOUT"), deadlineAt - now());
    }
    try {
      if (!Number.isFinite(deadlineAt) || run.capability !== "nativeReports" || !ports.workerId ||
          (ctx.accountId != null && ctx.accountId !== run.accountId)) fail("COLLECTION_RUN_INVALID");
      // 原预算已耗尽仍只领取原attempt用于记录终态，不启浏览器、不开始续租。
      const claimed = await ports.claimLease(run.attemptId, ports.workerId);
      if (claimed.attemptId !== run.attemptId || claimed.accountId !== run.accountId ||
          claimed.capability !== "nativeReports" || !claimed.expectedPlatformIdentity) fail("COLLECTION_RUN_INVALID");
      lease = claimed; check();
      if (lease.platform === "wechatOfficial") expectedKinds = ["officialContent", "officialFollowers"];
      else if (lease.platform === "wechatVideo") expectedKinds = ["channelsDaily", "channelsFollowers", "channelsWorks"];
      else fail("REPORT_PLATFORM_MISMATCH");
      renewalTimer = setTimeout(() => { renewalInFlight = renew(); }, RENEW_INTERVAL_MS);
      const profile = await ports.authorizeProfile(ctx, lease, controller.signal); check();
      resource = await ports.acquireProfile(profile.authDir, controller.signal); check();
      if (resource.authDir !== profile.authDir) fail("WRONG_PLATFORM_IDENTITY");
      browserStarted = true;
      const browserOperation = ports.collectReports({
        directory: resource.authDir, platform: lease.platform, expectedPlatformIdentity: lease.expectedPlatformIdentity,
        attemptId: lease.attemptId, signal: controller.signal, deadlineAt, onReport, onStopped,
        onStopUnconfirmed: retry => {
          stopUnconfirmed = true;
          ports.onStopUnconfirmed(run.attemptId, retry);
        },
      });
      // 原deadline/父取消是独立外层；driver即使卡在close也不能续期本任务。
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (action: () => void) => {
          if (settled) return;
          settled = true; controller.signal.removeEventListener("abort", stoppedWaiting); action();
        };
        const stoppedWaiting = () => {
          acceptingReports = false;
          // 给即时onStopped一个微任务机会，不增加执行预算；物理close卡住则立即返回pending stop。
          queueMicrotask(() => settle(() => reject(controller.signal.reason)));
        };
        controller.signal.addEventListener("abort", stoppedWaiting, { once: true });
        // 保留promise的成功/失败处理器；外层退出后仍由guard清理，不产生未处理晚异常。
        browserOperation.then(() => settle(resolve), error => settle(() => reject(error)));
        if (controller.signal.aborted) stoppedWaiting();
      });
      acceptingReports = false;
      await callbackTail;
      if (callbackFailure) throw callbackFailure;
      check();
      if (!stopped || stopUnconfirmed) fail("BROWSER_STOP_UNCONFIRMED");
      if (seen.size !== expectedKinds.length || !last) fail("REPORTS_INCOMPLETE");
      // 全部文件已逐份保存；实际停止后才重交同末报告的终页，backend按原sha去重。
      await commit(last.report, last.observedAt, true);
      return result("complete", null);
    } catch (error) {
      acceptingReports = false;
      if (!controller.signal.aborted) await callbackTail;
      const abortedReason = controller.signal.aborted ? reasonOf(controller.signal.reason) : null;
      // 执行截止/取消是主因；未实停由独立资源状态保留，不能抢先遮盖原终态。
      const reason = abortedReason === "CANCELLED" || abortedReason === "TASK_TIMEOUT" ? abortedReason : browserStarted && !stopped ? "BROWSER_STOP_UNCONFIRMED"
        : controller.signal.aborted ? reasonOf(controller.signal.reason) : reasonOf(error);
      abort(reason);
      const status = reason === "LOGIN_REQUIRED" ? "needsAuth"
        : reason === "CANCELLED" ? "cancelled"
          : committedReports > 0 || ["TASK_TIMEOUT", "LEASE_LOST", "BROWSER_STOP_UNCONFIRMED"].includes(reason)
            ? "partial" : "failed";
      if (lease) {
        try {
          await ports.failRun(lease.attemptId, lease.generation, lease.leaseToken,
            status === "cancelled" ? "partial" : status, reason);
        } catch {
          // 取消或归属/世代变化时backend拒绝旧租约是正确结果，不能重领或覆盖新状态。
        }
      }
      return result(status, reason);
    } finally {
      active = false; acceptingReports = false;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (renewalTimer) clearTimeout(renewalTimer);
      parentSignal?.removeEventListener("abort", parentAbort);
      // T1167：心跳端口无取消能力，不能让pending续租延长原deadline或阻断终态。
      // renew内部已处理晚resolve/reject；active=false禁止晚续心跳/abort，backend仍核租约与状态。
      void renewalInFlight;
      // acquire后尚未调用browser时，本执行从未启动宿主；无需假装调用过浏览器close。
      if (resource && !browserStarted) {
        try { await resource.onStopped(); }
        catch { ports.onStopUnconfirmed(run.attemptId, resource.onStopped); }
      }
      // browserStarted后绝不在finally冒充实停释放；仅guard的onStopped拥有释放证明。
    }
  };
}
