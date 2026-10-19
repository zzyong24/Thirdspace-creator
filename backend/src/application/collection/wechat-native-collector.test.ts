import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionPageCommit, type CollectionRunResource, type NativeReportKind, type NativeReportPayload,
  type RequestContext } from "@creatoros/contract";
import { createWechatNativeCollector, type WechatNativeCollectorPorts,
  type WechatNativeBrowserOptions, type WechatNativeCollectionLease, type WechatNativeReportInput } from "./wechat-native-collector";

const time = Date.parse("2026-10-09T02:00:00.000Z");
const ctx: RequestContext = { userId: "synthetic-user", accountId: "synthetic-account",
  groupId: "synthetic-group", source: "user", requestId: "synthetic-request" };
const run: CollectionRunResource = {
  attemptId: "original-attempt", accountId: ctx.accountId!, capability: "nativeReports", status: "queued",
  generation: 3, committedPages: 0, completeCatalogGeneration: null, reasonCode: null,
  startedAt: new Date(time).toISOString(), updatedAt: new Date(time).toISOString(),
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const raw = (kind: NativeReportKind): WechatNativeReportInput => ({
  platform: kind.startsWith("official") ? "wechatOfficial" : "wechatVideo", kind,
  bytes: new Uint8Array([1, 2, 3]), filename: kind + ".csv",
  sourcePath: kind === "officialContent" ? "/misc/appmsganalysis" : kind === "officialFollowers"
    ? "/misc/useranalysis" : kind === "channelsFollowers" ? "/platform/statistic/follower" : "/platform/statistic/post",
  selection: { startDate: "2026-10-08", endDate: "2026-10-08", timeZone: "Asia/Shanghai",
    meaning: kind === "channelsWorks" ? "publishedDates" : "statisticsDates" },
});
const report = ({ bytes: _bytes, ...input }: WechatNativeReportInput): NativeReportPayload => ({
  ...input, scope: input.kind === "channelsWorks" ? "workSelection" : "accountDaily",
  accumulation: input.kind === "channelsWorks" ? "sourceUnspecified" : "daily",
  sha256: "a".repeat(64), receivedBytes: 3,
  tables: [{ key: "synthetic", label: "合成报表", columns: [{ key: "值", label: "值", unit: "count" }],
    rows: [[{ raw: "0", value: 0 }]] }],
} as unknown as NativeReportPayload);

function fixture(platform: "wechatOfficial" | "wechatVideo" = "wechatOfficial") {
  vi.useFakeTimers(); vi.setSystemTime(time);
  const lease: WechatNativeCollectionLease = {
    attemptId: run.attemptId, accountId: run.accountId, platform, capability: "nativeReports",
    expectedPlatformIdentity: "synthetic-stable-id", generation: 3,
    leaseToken: "synthetic-lease", leaseExpiresAt: new Date(time + 60000).toISOString(),
  };
  const saved: Extract<ReturnType<typeof collectionPageCommit.parse>, { capability: "nativeReports" }>[] = [];
  let browserOptions: WechatNativeBrowserOptions | undefined;
  let pendingStop: (() => Promise<void>) | undefined;
  const release = vi.fn(async () => {});
  const kinds: NativeReportKind[] = platform === "wechatOfficial"
    ? ["officialContent", "officialFollowers"] : ["channelsDaily", "channelsFollowers", "channelsWorks"];
  const ports: WechatNativeCollectorPorts = {
    workerId: "synthetic-worker", now: () => Date.now(),
    claimLease: vi.fn(async () => lease),
    renewLease: vi.fn(async () => ({ attemptId: lease.attemptId, generation: lease.generation,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString() })),
    commitPage: vi.fn(async page => {
      const parsed = collectionPageCommit.parse(page);
      if (parsed.capability !== "nativeReports") throw Error("BAD_SYNTHETIC_CAPABILITY");
      saved.push(parsed);
    }),
    failRun: vi.fn(async () => {}),
    authorizeProfile: vi.fn(async () => ({ authDir: "/synthetic/authorized-profile" })),
    acquireProfile: vi.fn(async () => ({ authDir: "/synthetic/authorized-profile", onStopped: release })),
    parseReport: vi.fn(report),
    collectReports: vi.fn(async options => {
      browserOptions = options;
      try { for (const kind of kinds) await options.onReport(raw(kind)); }
      finally { await options.onStopped(); }
    }),
    onStopUnconfirmed: vi.fn((_attemptId, retry) => { pendingStop = retry; }),
  };
  return { ports, saved, lease, kinds, release, get options() { return browserOptions; },
    get pendingStop() { return pendingStop; }, execute: createWechatNativeCollector(ports) };
}
afterEach(() => { vi.useRealTimers(); });

it.each([
  ["deadline", "resolve"], ["deadline", "reject"],
  ["cancel", "resolve"], ["cancel", "reject"],
  ["complete", "resolve"], ["complete", "reject"],
] as const)("T1167 pending续租不阻断%s终态，晚%s不写入或续心跳", async (mode, late) => {
  const f = fixture(), parent = new AbortController(), entered = deferred<void>(), driverFinish = deferred<void>();
  const renewal = deferred<{ attemptId: string; generation: number; leaseExpiresAt: string }>();
  let options!: WechatNativeBrowserOptions;
  f.ports.renewLease = vi.fn(() => renewal.promise);
  f.ports.collectReports = vi.fn(async current => {
    options = current;
    await current.onReport(raw("officialContent")); entered.resolve();
    await driverFinish.promise;
    if (mode === "complete") await current.onReport(raw("officialFollowers"));
    await current.onStopped();
  });
  let outcome: Awaited<ReturnType<typeof f.execute>> | undefined;
  const running = f.execute(ctx, { ...run, startedAt: new Date(time - 29 * 60000).toISOString() }, parent.signal);
  void running.then(result => { outcome = result; });
  await entered.promise; await vi.advanceTimersByTimeAsync(20000);
  expect(f.ports.renewLease).toHaveBeenCalledOnce();
  try {
    if (mode === "deadline") await vi.advanceTimersByTimeAsync(40000);
    else if (mode === "cancel") parent.abort();
    else driverFinish.resolve();
    await vi.advanceTimersByTimeAsync(0);
    // renewal仍pending。不能先resolve它再断言结束，否则会漏掉finally挂起。
    expect(outcome).toMatchObject({
      attemptId: run.attemptId,
      status: mode === "complete" ? "complete" : mode === "cancel" ? "cancelled" : "partial",
      reasonCode: mode === "complete" ? null : mode === "cancel" ? "CANCELLED" : "TASK_TIMEOUT",
      committedReports: mode === "complete" ? 2 : 1,
      stopUnconfirmed: mode !== "complete",
    });
    expect(f.release).toHaveBeenCalledTimes(mode === "complete" ? 1 : 0);
    expect(f.ports.claimLease).toHaveBeenCalledOnce();
    await expect(options.onReport(raw("officialFollowers"))).rejects.toThrow("REPORT_RUN_CLOSED");
    const writes = vi.mocked(f.ports.commitPage).mock.calls.length;
    const failures = vi.mocked(f.ports.failRun).mock.calls.length;
    if (late === "resolve") renewal.resolve({ attemptId: run.attemptId, generation: 3, leaseExpiresAt: new Date(Date.now() + 60000).toISOString() });
    else renewal.reject(new Error("PRIVATE_LATE_RENEWAL_FAILURE"));
    driverFinish.resolve();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.ports.renewLease).toHaveBeenCalledOnce();
    expect(f.ports.commitPage).toHaveBeenCalledTimes(writes);
    expect(f.ports.failRun).toHaveBeenCalledTimes(failures);
  } finally {
    // 仅在原终态断言之后清理合成端口；红测也必须自己结束，不force退出。
    renewal.resolve({ attemptId: run.attemptId, generation: 3, leaseExpiresAt: new Date(Date.now() + 60000).toISOString() });
    driverFinish.resolve(); await vi.advanceTimersByTimeAsync(0); await running;
  }
});

describe("微信原生采集公开执行入口的合成窄端口链", () => {
  it.each(["wechatOfficial", "wechatVideo"] as const)("完整%s逐报告先持久化，实停后重交末报告终页；不冒充目录", async platform => {
    const f = fixture(platform);
    const result = await f.execute(ctx, run);
    expect(result).toMatchObject({ attemptId: run.attemptId, status: "complete", committedReports: f.kinds.length });
    expect(f.saved).toHaveLength(f.kinds.length + 1);
    expect(f.saved.slice(0, -1).map(page => page.hasMore)).toEqual(f.kinds.map(() => true));
    expect(f.saved.at(-1)).toMatchObject({ pageIndex: f.kinds.length, hasMore: false, nextCursor: null,
      requestCursor: "native-reports:terminal", works: [], accountMetrics: [], workMetrics: [],
      terminalEvidence: { kind: "platformHasMoreFalse" } });
    expect(f.saved.at(-1)!.nativeReports).toEqual(f.saved.at(-2)!.nativeReports);
    expect(f.saved.at(-1)!.observedAt).toBe(f.saved.at(-2)!.observedAt);
    expect(f.ports.commitPage).toHaveBeenCalledTimes(f.kinds.length + 1);
    expect(f.release).toHaveBeenCalledOnce(); expect(f.ports.failRun).not.toHaveBeenCalled();
    expect(f.ports.claimLease).toHaveBeenCalledWith(run.attemptId, "synthetic-worker");
  });
  it("原run截止时间耗尽不启动浏览器、不续租，也不创建新attempt", async () => {
    const f = fixture();
    const result = await f.execute(ctx, { ...run, startedAt: new Date(time - 31 * 60000).toISOString() });
    expect(result).toMatchObject({ attemptId: run.attemptId, status: "partial", reasonCode: "TASK_TIMEOUT" });
    expect(f.ports.collectReports).not.toHaveBeenCalled(); expect(f.ports.authorizeProfile).not.toHaveBeenCalled();
    expect(f.ports.renewLease).not.toHaveBeenCalled(); expect(f.saved).toHaveLength(0);
  });
  it("继承原run剩余1分钟，deadline只在原startedAt上计算", async () => {
    const f = fixture(), entered = deferred<void>();
    f.ports.collectReports = vi.fn(async options => {
      entered.resolve();
      try { await new Promise<void>((_, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      }); } finally { await options.onStopped(); }
    });
    const result = f.execute(ctx, { ...run, startedAt: new Date(time - 29 * 60000).toISOString() });
    await entered.promise; await vi.advanceTimersByTimeAsync(60000);
    expect(await result).toMatchObject({ status: "partial", reasonCode: "TASK_TIMEOUT" });
    expect(f.saved).toHaveLength(0); expect(f.release).toHaveBeenCalledOnce();
  });
  it("父取消更早生效，取消后和execute结束后的晚回调都不能写", async () => {
    const f = fixture(), parent = new AbortController(), entered = deferred<void>();
    let options!: WechatNativeBrowserOptions;
    f.ports.collectReports = vi.fn(async current => {
      options = current; entered.resolve();
      try { await new Promise<void>((_, reject) => {
        current.signal.addEventListener("abort", () => reject(current.signal.reason), { once: true });
      }); } finally { await current.onStopped(); }
    });
    const running = f.execute(ctx, run, parent.signal); await entered.promise;
    parent.abort(new Error("PRIVATE_CANCEL_CONTENT"));
    await expect(options.onReport(raw("officialContent"))).rejects.toThrow();
    expect(await running).toMatchObject({ status: "cancelled", reasonCode: "CANCELLED" });
    await expect(options.onReport(raw("officialContent"))).rejects.toThrow();
    expect(f.saved).toHaveLength(0); expect(f.release).toHaveBeenCalledOnce();
    expect(f.ports.failRun).toHaveBeenCalledWith(run.attemptId, 3, "synthetic-lease", "partial", "CANCELLED");
  });
  it("首份已持久化后导出失败保留报表，失败原因不带原文", async () => {
    const f = fixture();
    f.ports.collectReports = vi.fn(async options => {
      try {
        await options.onReport(raw("officialContent"));
        expect(f.saved).toHaveLength(1);
        throw Object.assign(new Error("PRIVATE_DATA_AND_COOKIE"), { code: "EXPORT_FAILED" });
      } finally { await options.onStopped(); }
    });
    expect(await f.execute(ctx, run)).toMatchObject({ status: "partial", committedReports: 1, reasonCode: "EXPORT_FAILED" });
    expect(f.saved).toHaveLength(1); expect(f.saved[0]!.hasMore).toBe(true);
    expect(f.ports.failRun).toHaveBeenCalledWith(run.attemptId, 3, "synthetic-lease", "partial", "EXPORT_FAILED");
  });
  it.each([["LOGIN_REQUIRED", "needsAuth"], ["EXPORT_FAILED", "failed"], ["SESSION_TIMEOUT", "failed"]] as const)(
    "只有明确LOGIN_REQUIRED才needsAuth：%s", async (code, expectedStatus) => {
      const f = fixture();
      f.ports.collectReports = vi.fn(async options => {
        try { throw Object.assign(new Error("PRIVATE_DIAGNOSTIC"), { code }); }
        finally { await options.onStopped(); }
      });
      const result = await f.execute(ctx, run);
      expect(result.status).toBe(expectedStatus);
      expect(result.reasonCode).toBe(code === "LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "EXPORT_FAILED");
      expect(JSON.stringify(result)).not.toContain("PRIVATE_DIAGNOSTIC");
    });
  it.each(["missing", "duplicate", "wrongPlatform"] as const)("报表种类%s失败且不生成假终页", async mode => {
    const f = fixture();
    f.ports.collectReports = vi.fn(async options => {
      try {
        if (mode === "wrongPlatform") await options.onReport(raw("channelsDaily"));
        else {
          await options.onReport(raw("officialContent"));
          if (mode === "duplicate") await options.onReport(raw("officialContent"));
        }
      } finally { await options.onStopped(); }
    });
    const result = await f.execute(ctx, run);
    expect(result.status).not.toBe("complete");
    expect(f.saved.some(page => !page.hasMore)).toBe(false);
    expect(f.saved).toHaveLength(mode === "wrongPlatform" ? 0 : 1);
  });
  it("最终文件先保留；close未确认不提前释放且不给complete，retry只清宿主资源", async () => {
    const f = fixture(); let stop!: () => Promise<void>;
    f.ports.collectReports = vi.fn(async options => {
      for (const kind of f.kinds) await options.onReport(raw(kind));
      stop = options.onStopped;
      options.onStopUnconfirmed(async () => { await options.onStopped(); });
      throw Error("PRIVATE_CLOSE_DIAGNOSTIC");
    });
    const result = await f.execute(ctx, run);
    expect(result).toMatchObject({ status: "partial", reasonCode: "BROWSER_STOP_UNCONFIRMED", committedReports: 2 });
    expect(f.saved).toHaveLength(2); expect(f.saved.every(page => page.hasMore)).toBe(true);
    expect(f.release).not.toHaveBeenCalled();
    expect(f.pendingStop).toBeTypeOf("function"); await f.pendingStop!(); await stop();
    expect(f.release).toHaveBeenCalledOnce(); expect(f.saved).toHaveLength(2);
  });
  it("driver忽略abort或卡住close，原deadline到点返回pending stop，晚回调不写且只在真停后释放", async () => {
    const f = fixture(), entered = deferred<void>(), physicalStop = deferred<void>();
    let options!: WechatNativeBrowserOptions;
    f.ports.collectReports = vi.fn(async current => {
      options = current; entered.resolve();
      await current.onReport(raw("officialContent"));
      await physicalStop.promise; // 模拟浏览器close忽略abort；外层不能等待新的预算。
      await current.onStopped();
      throw Error("PRIVATE_LATE_DRIVER_FAILURE");
    });
    const running = f.execute(ctx, { ...run, startedAt: new Date(time - 29 * 60000).toISOString() });
    await entered.promise; await vi.advanceTimersByTimeAsync(60000);
    const ended = await running;
    expect(ended).toMatchObject({ attemptId: run.attemptId, status: "partial",
      reasonCode: "TASK_TIMEOUT", stopUnconfirmed: true, committedReports: 1 });
    expect(f.saved).toHaveLength(1); expect(f.saved.every(page => page.hasMore)).toBe(true);
    expect(f.release).not.toHaveBeenCalled();
    await expect(options.onReport(raw("officialFollowers"))).rejects.toThrow("REPORT_RUN_CLOSED");
    physicalStop.resolve(); await vi.advanceTimersByTimeAsync(0);
    expect(f.release).toHaveBeenCalledOnce(); expect(f.saved).toHaveLength(1);
    expect(f.ports.claimLease).toHaveBeenCalledOnce();
  });
  it("续租串行无重叠；结束后停掉续租", async () => {
    const f = fixture(), entered = deferred<void>(), finish = deferred<void>();
    const firstRenew = deferred<{ attemptId: string; generation: number; leaseExpiresAt: string }>();
    let count = 0, active = 0, maxActive = 0;
    f.ports.renewLease = vi.fn(async () => {
      count++; active++; maxActive = Math.max(maxActive, active);
      try {
        if (count === 1) return await firstRenew.promise;
        return { attemptId: run.attemptId, generation: 3, leaseExpiresAt: new Date(Date.now() + 60000).toISOString() };
      } finally { active--; }
    });
    f.ports.collectReports = vi.fn(async options => {
      entered.resolve(); await finish.promise;
      try { for (const kind of f.kinds) await options.onReport(raw(kind)); }
      finally { await options.onStopped(); }
    });
    const running = f.execute(ctx, run); await entered.promise;
    await vi.advanceTimersByTimeAsync(20000); expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(60000); expect(count).toBe(1);
    firstRenew.resolve({ attemptId: run.attemptId, generation: 3, leaseExpiresAt: new Date(Date.now() + 60000).toISOString() });
    await vi.advanceTimersByTimeAsync(20000); expect(count).toBe(2); expect(maxActive).toBe(1);
    finish.resolve(); expect((await running).status).toBe("complete");
    await vi.advanceTimersByTimeAsync(60000); expect(count).toBe(2);
  });
  it("续租失败立即abort浏览器，不能晚写或重发", async () => {
    const f = fixture(), entered = deferred<void>(); let options!: WechatNativeBrowserOptions;
    f.ports.renewLease = vi.fn(async () => { throw Object.assign(Error("PRIVATE_LEASE"), { code: "LEASE_EXPIRED" }); });
    f.ports.collectReports = vi.fn(async current => {
      options = current; entered.resolve();
      try { await new Promise<void>((_, reject) => {
        current.signal.addEventListener("abort", () => reject(current.signal.reason), { once: true });
      }); } finally { await current.onStopped(); }
    });
    const running = f.execute(ctx, run); await entered.promise; await vi.advanceTimersByTimeAsync(20000);
    expect(await running).toMatchObject({ status: "partial", reasonCode: "LEASE_LOST" });
    expect(options.signal.aborted).toBe(true); await expect(options.onReport(raw("officialContent"))).rejects.toThrow();
    expect(f.saved).toHaveLength(0); expect(f.ports.claimLease).toHaveBeenCalledOnce();
  });
});

it("解析失败后真实关闭跨过心跳间隔，仍续原租约但不误报LEASE_LOST或续执行期限",async()=>{
 const f=fixture(),closing=deferred<void>(),closed=deferred<void>();
 f.ports.parseReport=vi.fn(input=>{if(input.kind==='officialFollowers')throw Object.assign(Error('synthetic-format-error'),{code:'REPORT_FORMAT'});return report(input);});
 f.ports.acquireProfile=vi.fn(async()=>({authDir:'/synthetic/authorized-profile',onStopped:async()=>{closing.resolve();await closed.promise;await f.release();}}));
 const running=f.execute(ctx,run);await closing.promise;await vi.advanceTimersByTimeAsync(25000);
 expect(f.ports.renewLease).toHaveBeenCalledOnce();expect(f.options!.signal.aborted).toBe(false);expect(f.release).not.toHaveBeenCalled();
 closed.resolve();expect(await running).toMatchObject({status:'partial',reasonCode:'REPORT_PARSE_FAILED',committedReports:1,stopUnconfirmed:false});
 expect(f.ports.failRun).toHaveBeenCalledWith(run.attemptId,3,'synthetic-lease','partial','REPORT_PARSE_FAILED');expect(f.saved).toHaveLength(1);expect(f.ports.claimLease).toHaveBeenCalledOnce();
});
