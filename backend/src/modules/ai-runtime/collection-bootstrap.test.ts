import { describe, it, expect, vi } from "vitest";
import {
  bootstrapDouyinCollectionJobs,
  DAILY_COLLECTION_JOB_DEFAULTS,
  type CollectionBootstrapDeps,
} from "./collection-bootstrap";
import type { RequestContext } from "@creatoros/contract";

// T-189a —— 绑定抖音成功后:幂等建三个每天定时采集 job(self.metrics / self.detail / comments)+
//   按序初始化触发一次拉全量。纯编排 + 注入端口,零成本单测(不碰真抖音/不建真 job)。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "bind",
  source: "ingestion",
  accountId: "acct-1",
};

// 无既有 job 的 fake deps:createJob 递增发 id,trigger 记录被触发的 job(顺序即调用序)。
function makeDeps(
  existingBySourceKind: Record<string, { id: string; accountId?: string | null }[]> = {},
): CollectionBootstrapDeps & {
  _listJobs: ReturnType<typeof vi.fn>;
  _createJob: ReturnType<typeof vi.fn>;
  _trigger: ReturnType<typeof vi.fn>;
  _claimOrphans: ReturnType<typeof vi.fn>;
  createdJobs: { sourceKind: string; schedule: string; name: string }[];
  triggeredSourceKinds: string[];
  triggeredAccountIds: (string | null | undefined)[];
  claimCallOrder: number[];
  callCounter: { n: number };
} {
  let seq = 0;
  const createdJobs: { sourceKind: string; schedule: string; name: string }[] = [];
  const triggeredSourceKinds: string[] = [];
  const triggeredAccountIds: (string | null | undefined)[] = [];
  // 记录 claim 相对 create/trigger 的调用顺序(claim 必须最先,让存量先归号)。
  const claimCallOrder: number[] = [];
  const callCounter = { n: 0 };
  const _listJobs = vi.fn(async (_c: RequestContext, sourceKind: string) => {
    return existingBySourceKind[sourceKind] ?? [];
  });
  const _createJob = vi.fn(
    async (
      _c: RequestContext,
      input: {
        name: string;
        prompt: string;
        sourceKind: string;
        schedule: string;
        target: Record<string, unknown>;
      },
    ) => {
      callCounter.n += 1;
      createdJobs.push({
        sourceKind: input.sourceKind,
        schedule: input.schedule,
        name: input.name,
      });
      return { id: `job-${input.sourceKind}-${++seq}` };
    },
  );
  const _trigger = vi.fn(
    async (
      _c: RequestContext,
      job: {
        id: string;
        sourceKind: string;
        target: Record<string, unknown>;
        accountId?: string | null;
      },
    ) => {
      callCounter.n += 1;
      triggeredSourceKinds.push(job.sourceKind);
      triggeredAccountIds.push(job.accountId);
    },
  );
  const _claimOrphans = vi.fn(async (_c: RequestContext) => {
    claimCallOrder.push(callCounter.n); // 记录 claim 时 create/trigger 已发生几次(应为 0)
    return {
      projects: 3,
      publications: 2,
      metricSnapshots: 5,
      metricValues: 10,
      assets: 4,
      scheduledJobs: 1,
    };
  });
  return {
    listJobsBySourceKind: _listJobs,
    createJob: _createJob,
    trigger: _trigger,
    claimOrphans: _claimOrphans,
    target: {},
    _listJobs,
    _createJob,
    _trigger,
    _claimOrphans,
    createdJobs,
    triggeredSourceKinds,
    triggeredAccountIds,
    claimCallOrder,
    callCounter,
  };
}

describe("bootstrapDouyinCollectionJobs (T-189a)", () => {
  it("① 全新绑定 → 建 4 个 job(正确 sourceKind + 每天定时 cron)", async () => {
    const deps = makeDeps();
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    // [T-212a] 建了恰好 4 个 job(self 三源 + benchmark 对标)。
    expect(deps._createJob).toHaveBeenCalledTimes(4);
    expect(res.created).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);

    // sourceKind 正确 + 每天定时 cron(5 段,分/时确定、日/月/周为 *)。
    const bySource = new Map(
      deps.createdJobs.map((j) => [j.sourceKind, j.schedule]),
    );
    expect(bySource.get("self.metrics")).toBe("0 9 * * *");
    expect(bySource.get("self.detail")).toBe("10 9 * * *");
    expect(bySource.get("comments")).toBe("20 9 * * *");
    expect(bySource.get("benchmark")).toBe("30 9 * * *");
    // 每条都是"每天"(dom/month/dow 全 *):
    for (const [, cron] of bySource) {
      const [, , dom, mon, dow] = cron.split(/\s+/);
      expect([dom, mon, dow]).toEqual(["*", "*", "*"]);
    }
  });

  it("② 已有同 sourceKind job → 不重建(幂等)", async () => {
    // 三源都已存在 → 一个都不建。
    const deps = makeDeps({
      "self.metrics": [{ id: "existing-metrics" }],
      "self.detail": [{ id: "existing-detail" }],
      comments: [{ id: "existing-comments" }],
      benchmark: [{ id: "existing-benchmark" }],
    });
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    expect(deps._createJob).not.toHaveBeenCalled();
    expect(res.created).toEqual([]);
    // 但仍初始化触发既有 job(拉全量)——复用既有 id。
    expect(res.triggered).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
  });

  it("② 部分已存在 → 只补建缺的(幂等,不重复)", async () => {
    const deps = makeDeps({
      "self.metrics": [{ id: "existing-metrics" }],
    });
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    // 只建 self.detail + comments + benchmark(self.metrics 复用既有)。
    expect(deps._createJob).toHaveBeenCalledTimes(3);
    expect(res.created).toEqual(["self.detail", "comments", "benchmark"]);
  });

  it("③ 绑定 → 触发一次初始化采集(每源各一次,顺序 self.metrics→self.detail→comments→benchmark)", async () => {
    const deps = makeDeps();
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    expect(deps._trigger).toHaveBeenCalledTimes(4);
    // 顺序铁律(接 T-190:self.metrics 先建 publication → self.detail 落可见性 → comments);
    // benchmark 无依赖,追加最后(无对标源时诚实空跑)。
    expect(deps.triggeredSourceKinds).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
    expect(res.triggered).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
  });

  it("③ 触发用的是新建/复用的真实 job id(不是空串)", async () => {
    const deps = makeDeps({ "self.metrics": [{ id: "existing-metrics" }] });
    await bootstrapDouyinCollectionJobs(ctx, deps);
    const triggeredIds = deps._trigger.mock.calls.map((c) => c[1].id as string);
    // self.metrics 复用既有 id;其余用新建 id;均非空。
    expect(triggeredIds).toContain("existing-metrics");
    expect(triggeredIds.every((id) => id.length > 0)).toBe(true);
  });

  it("单源建 job 失败 → 不阻断其余源(best-effort)", async () => {
    const deps = makeDeps();
    // 让 self.detail 建失败,验 self.metrics/comments 仍建 + 触发。
    deps._createJob.mockImplementation(
      async (_c: RequestContext, input: { sourceKind: string }) => {
        if (input.sourceKind === "self.detail") {
          throw new Error("boom");
        }
        return { id: `job-${input.sourceKind}` };
      },
    );
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(res.created).toEqual(["self.metrics", "comments", "benchmark"]);
    // self.detail 建失败 → 不触发它;其余仍触发。
    expect(res.triggered).toEqual(["self.metrics", "comments", "benchmark"]);
  });

  it("[T-200] 触发的 job 带当前号(新建 job accountId = ctx.accountId)", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);
    // 四条触发都带 acct-1(采集 ctx.accountId 由此派生 → 落正确号,修串号根因)。
    expect(deps.triggeredAccountIds).toEqual([
      "acct-1",
      "acct-1",
      "acct-1",
      "acct-1",
    ]);
  });

  it("[T-200] 复用既有 job → 带既有 job 的属主号给触发", async () => {
    const deps = makeDeps({
      "self.metrics": [{ id: "existing-metrics", accountId: "acct-1" }],
      "self.detail": [{ id: "existing-detail", accountId: "acct-1" }],
      comments: [{ id: "existing-comments", accountId: "acct-1" }],
      benchmark: [{ id: "existing-benchmark", accountId: "acct-1" }],
    });
    await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps.triggeredAccountIds).toEqual([
      "acct-1",
      "acct-1",
      "acct-1",
      "acct-1",
    ]);
  });

  it("[T-200] 既有 job 无号(旧 job)→ 退化用 ctx.accountId 触发", async () => {
    const deps = makeDeps({
      "self.metrics": [{ id: "old-metrics", accountId: null }],
    });
    await bootstrapDouyinCollectionJobs(ctx, deps);
    // old-metrics 无号 → 退化 acct-1;其余新建 → acct-1。
    expect(deps.triggeredAccountIds).toEqual([
      "acct-1",
      "acct-1",
      "acct-1",
      "acct-1",
    ]);
  });

  it("[T-200] 认领存量无号采集数据:claimOrphans 在建 job/触发之前调一次", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps._claimOrphans).toHaveBeenCalledTimes(1);
    // claim 时 create/trigger 均未发生(claimCallOrder 记录的计数应为 0 = 最先跑)。
    expect(deps.claimCallOrder).toEqual([0]);
  });

  it("[T-200] claimOrphans 抛错 → 不阻断建 job/触发(best-effort)", async () => {
    const deps = makeDeps();
    deps._claimOrphans.mockRejectedValueOnce(new Error("claim boom"));
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(res.created).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
    expect(res.triggered).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
  });

  it("[T-212a] 模板常量为四源(self 三源 + benchmark 对标)", () => {
    expect(DAILY_COLLECTION_JOB_DEFAULTS.map((t) => t.sourceKind)).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
    ]);
  });
});
