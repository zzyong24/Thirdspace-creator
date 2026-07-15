import { describe, it, expect, vi } from "vitest";
import {
  bootstrapDouyinCollectionJobs,
  ensureCollectionJobs,
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
// [T-331] 默认注入首绑门(hasOtherActiveDouyinAccount → false = 无其它 active 号):claim
//   相关既有用例保持 T-200 首绑语义;二绑用例显式覆写为 true。
function makeDeps(
  existingBySourceKind: Record<string, { id: string; accountId?: string | null }[]> = {},
): CollectionBootstrapDeps & {
  _listJobs: ReturnType<typeof vi.fn>;
  _createJob: ReturnType<typeof vi.fn>;
  _trigger: ReturnType<typeof vi.fn>;
  _claimOrphans: ReturnType<typeof vi.fn>;
  _hasOtherActive: ReturnType<typeof vi.fn>;
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
  // [T-331] 默认首绑(无其它 active 抖音号);二绑用例 mockResolvedValue(true) 覆写。
  const _hasOtherActive = vi.fn(async (_c: RequestContext) => false);
  return {
    listJobsBySourceKind: _listJobs,
    createJob: _createJob,
    trigger: _trigger,
    claimOrphans: _claimOrphans,
    hasOtherActiveDouyinAccount: _hasOtherActive,
    target: {},
    _listJobs,
    _createJob,
    _trigger,
    _claimOrphans,
    _hasOtherActive,
    createdJobs,
    triggeredSourceKinds,
    triggeredAccountIds,
    claimCallOrder,
    callCounter,
  };
}

describe("bootstrapDouyinCollectionJobs (T-189a)", () => {
  it("① 全新绑定 → 建 6 个 job(正确 sourceKind + 每天定时 cron)", async () => {
    const deps = makeDeps();
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    // [T-212a][T-235a][T-235c] 建了恰好 6 个 job(self 三源 + benchmark 对标 +
    // topic.daily 每日出题 + favorites 指定收藏夹)。
    expect(deps._createJob).toHaveBeenCalledTimes(6);
    expect(res.created).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);

    // sourceKind 正确 + 每天定时 cron(5 段,分/时确定、日/月/周为 *)。
    const bySource = new Map(
      deps.createdJobs.map((j) => [j.sourceKind, j.schedule]),
    );
    expect(bySource.get("self.metrics")).toBe("0 9 * * *");
    expect(bySource.get("self.detail")).toBe("10 9 * * *");
    expect(bySource.get("comments")).toBe("20 9 * * *");
    expect(bySource.get("benchmark")).toBe("30 9 * * *");
    // [T-235a] 每日出题错峰 9:40(benchmark 9:30 后,当天新拆解可入引用)。
    expect(bySource.get("topic.daily")).toBe("40 9 * * *");
    // [T-235c] 指定收藏夹错峰 9:50(topic.daily 9:40 后,采集类互不同时到点)。
    expect(bySource.get("favorites")).toBe("50 9 * * *");
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
      "topic.daily": [{ id: "existing-topic-daily" }],
      favorites: [{ id: "existing-favorites" }],
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
      "topic.daily",
      "favorites",
    ]);
  });

  it("② 部分已存在 → 只补建缺的(幂等,不重复)", async () => {
    const deps = makeDeps({
      "self.metrics": [{ id: "existing-metrics" }],
    });
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    // 只建 self.detail + comments + benchmark + topic.daily + favorites(self.metrics 复用既有)。
    expect(deps._createJob).toHaveBeenCalledTimes(5);
    expect(res.created).toEqual([
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
  });

  it("③ 绑定 → 触发一次初始化采集(每源各一次,顺序 self.metrics→self.detail→comments→benchmark→topic.daily)", async () => {
    const deps = makeDeps();
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    expect(deps._trigger).toHaveBeenCalledTimes(6);
    // 顺序铁律(接 T-190:self.metrics 先建 publication → self.detail 落可见性 → comments);
    // benchmark 无依赖,追加最后(无对标源时诚实空跑);[T-235a] topic.daily 压轴(当天新拆解可入引用,
    // 未配模型诚实跳过)。
    expect(deps.triggeredSourceKinds).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
    expect(res.triggered).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
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
    expect(res.created).toEqual([
      "self.metrics",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
    // self.detail 建失败 → 不触发它;其余仍触发。
    expect(res.triggered).toEqual([
      "self.metrics",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
  });

  it("[T-200] 触发的 job 带当前号(新建 job accountId = ctx.accountId)", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);
    // 六条触发都带 acct-1(采集 ctx.accountId 由此派生 → 落正确号,修串号根因)。
    expect(deps.triggeredAccountIds).toEqual([
      "acct-1",
      "acct-1",
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
      "topic.daily": [{ id: "existing-topic-daily", accountId: "acct-1" }],
      favorites: [{ id: "existing-favorites", accountId: "acct-1" }],
    });
    await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps.triggeredAccountIds).toEqual([
      "acct-1",
      "acct-1",
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
    // [T-331] 首绑判定确实经收敛门(带绑定 ctx)。
    expect(deps._hasOtherActive).toHaveBeenCalledTimes(1);
    expect(deps._hasOtherActive).toHaveBeenCalledWith(ctx);
  });

  it("[T-331] 已有其它 active 抖音号(二绑)→ claimOrphans 零调用,建 job/触发照常", async () => {
    const deps = makeDeps();
    deps._hasOtherActive.mockResolvedValue(true); // 该 user 已有别的 active 号
    const res = await bootstrapDouyinCollectionJobs(
      { ...ctx, accountId: "acct-2" },
      deps,
    );
    // 核心断言:二绑绝不认领(NULL 存量属谁未知,认领 = 把旧号数据错认给新号)。
    expect(deps._claimOrphans).not.toHaveBeenCalled();
    // 建 job / 初始化触发不受影响(收敛门只挡 claim,不挡 bootstrap 主流程)。
    expect(res.created).toHaveLength(6);
    expect(res.triggered).toHaveLength(6);
  });

  it("[T-331] 收敛门未注入 → fail-closed 跳过 claim(不阻断建 job/触发)", async () => {
    const deps = makeDeps();
    delete (deps as { hasOtherActiveDouyinAccount?: unknown })
      .hasOtherActiveDouyinAccount;
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps._claimOrphans).not.toHaveBeenCalled();
    expect(res.created).toHaveLength(6);
    expect(res.triggered).toHaveLength(6);
  });

  it("[T-331] 收敛门查询抛错 → fail-closed 跳过 claim(不阻断建 job/触发)", async () => {
    const deps = makeDeps();
    deps._hasOtherActive.mockRejectedValueOnce(new Error("accounts boom"));
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps._claimOrphans).not.toHaveBeenCalled();
    expect(res.created).toHaveLength(6);
    expect(res.triggered).toHaveLength(6);
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
      "topic.daily",
      "favorites",
    ]);
    expect(res.triggered).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
  });

  it("[T-227] ensureCollectionJobs:存量账号只补建缺的 job,不触发采集(启动兜底)", async () => {
    // 存量账号:绑定早于 benchmark/topic.daily 模板 → 只有 self 三源 job。启动 ensure 应补建
    // 缺失的 benchmark + topic.daily,且**不触发**任何采集(新 job 等下次到点跑)。
    const deps = makeDeps({
      "self.metrics": [{ id: "existing-metrics", accountId: "acct-1" }],
      "self.detail": [{ id: "existing-detail", accountId: "acct-1" }],
      comments: [{ id: "existing-comments", accountId: "acct-1" }],
    });
    const res = await ensureCollectionJobs(ctx, deps);
    expect(res.created).toEqual(["benchmark", "topic.daily", "favorites"]);
    expect(res.jobsInOrder.map((j) => j.sourceKind)).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
    expect(deps._trigger).not.toHaveBeenCalled();
    // 再跑一次(全部已存在)→ 幂等零建。
    const deps2 = makeDeps({
      "self.metrics": [{ id: "j1" }],
      "self.detail": [{ id: "j2" }],
      comments: [{ id: "j3" }],
      benchmark: [{ id: "j4" }],
      "topic.daily": [{ id: "j5" }],
      favorites: [{ id: "j6" }],
    });
    const res2 = await ensureCollectionJobs(ctx, deps2);
    expect(res2.created).toEqual([]);
    expect(deps2._createJob).not.toHaveBeenCalled();
  });

  it("[T-212a][T-235a][T-235c] 模板常量为六源(self 三源 + benchmark 对标 + topic.daily 每日出题 + favorites 指定收藏夹)", () => {
    expect(DAILY_COLLECTION_JOB_DEFAULTS.map((t) => t.sourceKind)).toEqual([
      "self.metrics",
      "self.detail",
      "comments",
      "benchmark",
      "topic.daily",
      "favorites",
    ]);
  });
});
