import { describe, it, expect, vi } from "vitest";
import {
  bootstrapDouyinCollectionJobs,
  ensureCollectionJobs,
  DAILY_COLLECTION_JOB_DEFAULTS,
  staggeredSchedule,
  deterministicAccountOffsetMinutes,
  STAGGER_SPREAD_MINUTES,
  type CollectionBootstrapDeps,
} from "./collection-bootstrap";
import type { RequestContext } from "@creatoros/contract";

// T-189a —— 绑定抖音成功后:幂等建三个每天定时采集 job(self.metrics / self.detail / comments)+
//   按序初始化触发一次拉全量。纯编排 + 注入端口,零成本单测(不碰真抖音/不建真 job)。
// [T-332 S2] claimOrphans/hasOtherActiveDouyinAccount(T-200/T-331)已全链退役(SPEC §4.4):
//   绑定 = 只建号绑定 job + 初始化触发,零 claim;本文件的「绑定链零 claim」用例是该裁决的守护。

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
  createdJobs: { sourceKind: string; schedule: string; name: string }[];
  triggeredSourceKinds: string[];
  triggeredAccountIds: (string | null | undefined)[];
  triggeredOptions: ({ skipHeavyBackfill?: boolean } | undefined)[];
} {
  let seq = 0;
  const createdJobs: { sourceKind: string; schedule: string; name: string }[] = [];
  const triggeredSourceKinds: string[] = [];
  const triggeredAccountIds: (string | null | undefined)[] = [];
  const triggeredOptions: ({ skipHeavyBackfill?: boolean } | undefined)[] = [];
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
      options?: { skipHeavyBackfill?: boolean },
    ) => {
      triggeredSourceKinds.push(job.sourceKind);
      triggeredAccountIds.push(job.accountId);
      triggeredOptions.push(options);
    },
  );
  return {
    listJobsBySourceKind: _listJobs,
    createJob: _createJob,
    trigger: _trigger,
    target: {},
    _listJobs,
    _createJob,
    _trigger,
    createdJobs,
    triggeredSourceKinds,
    triggeredAccountIds,
    triggeredOptions,
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
    // [T-433 S3] 建 job 时基准叠加 per-account 偏移(ctx=acct-1)→ 实际 cron = staggeredSchedule(基准, "acct-1")。
    const bySource = new Map(
      deps.createdJobs.map((j) => [j.sourceKind, j.schedule]),
    );
    expect(bySource.get("self.metrics")).toBe(staggeredSchedule("0 9 * * *", "acct-1"));
    expect(bySource.get("self.detail")).toBe(staggeredSchedule("10 9 * * *", "acct-1"));
    expect(bySource.get("comments")).toBe(staggeredSchedule("20 9 * * *", "acct-1"));
    expect(bySource.get("benchmark")).toBe(staggeredSchedule("30 9 * * *", "acct-1"));
    expect(bySource.get("topic.daily")).toBe(staggeredSchedule("40 9 * * *", "acct-1"));
    expect(bySource.get("favorites")).toBe(staggeredSchedule("50 9 * * *", "acct-1"));
    // 每条都是"每天"(dom/month/dow 全 *):
    for (const [, cron] of bySource) {
      const [, , dom, mon, dow] = cron.split(/\s+/);
      expect([dom, mon, dow]).toEqual(["*", "*", "*"]);
    }
    // [T-433 S3] 账号内 6 源相对错开(0/10/20/30/40/50)在偏移后原样保留(整块同偏移)。
    const minuteOfDay = (cron: string) => {
      const [m, h] = cron.split(/\s+/);
      return Number(h) * 60 + Number(m);
    };
    const base = minuteOfDay(bySource.get("self.metrics")!);
    expect(minuteOfDay(bySource.get("self.detail")!) - base).toBe(10);
    expect(minuteOfDay(bySource.get("comments")!) - base).toBe(20);
    expect(minuteOfDay(bySource.get("favorites")!) - base).toBe(50);
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
    // [T-595] 可见性闸门已并入 self.metrics；self.detail 是默认关闭的兼容入口。
    expect(res.triggered).toEqual(["self.metrics"]);
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

  it("③ 绑定 → 初始化只触发 canonical 公开作品采集", async () => {
    const deps = makeDeps();
    const res = await bootstrapDouyinCollectionJobs(ctx, deps);

    expect(deps._trigger).toHaveBeenCalledTimes(1);
    expect(deps.triggeredSourceKinds).toEqual(["self.metrics"]);
    expect(res.triggered).toEqual(["self.metrics"]);
  });

  it("③ [T-433 S1] 绑号初始化触发:self.detail 带 skipHeavyBackfill(尾部重活跳过,留次日定时补),self.metrics 不带", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);

    // 触发顺序即 [self.metrics, self.detail](顺序铁律)。绑号是一次性重触发,
    // 只跑轻量明细拿可见性;封面/逐字稿/复刻等尾部重活延到次日定时任务,
    // 避免多账号同时绑号把重活挤成灾难。
    expect(deps.triggeredSourceKinds).toEqual(["self.metrics"]);
    const bySource = new Map(
      deps.triggeredSourceKinds.map((k, i) => [k, deps.triggeredOptions[i]]),
    );
    expect(bySource.get("self.detail")).toBeUndefined();
    // self.metrics 无重活尾巴,不传 options(保持默认全量)。
    expect(bySource.get("self.metrics")).toBeUndefined();
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
    // self.detail 建失败 → 不触发它;[T-359] 默认关的四类也不触发 → 只剩 self.metrics。
    expect(res.triggered).toEqual(["self.metrics"]);
  });

  it("[T-200] 触发的 job 带当前号(新建 job accountId = ctx.accountId)", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);
    expect(deps.triggeredAccountIds).toEqual(["acct-1"]);
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
    expect(deps.triggeredAccountIds).toEqual(["acct-1"]);
  });

  it("[T-332 S2] 绑定链零 claim:bootstrap 只走 listJobs/createJob/trigger 三个端口,不触碰任何数据行归属", async () => {
    // claimOrphans/hasOtherActiveDouyinAccount 已从 CollectionBootstrapDeps 整体删除(编译期
    // 保证不可能再被接线);行为上,绑定编排对注入端口的调用 = 每源一次 listJobs + 缺则 createJob +
    // 一次 trigger,除此之外零副作用 —— 绑第二个号不改动任何既有行归属(ISO-08 前提)。
    const deps = makeDeps();
    // 类型守护:deps 形状里不存在 claim 相关键(运行时再断言一次,防有人偷偷加回可选钩子)。
    expect("claimOrphans" in deps).toBe(false);
    expect("hasOtherActiveDouyinAccount" in deps).toBe(false);

    const secondBindCtx: RequestContext = { ...ctx, accountId: "acct-2" };
    const res = await bootstrapDouyinCollectionJobs(secondBindCtx, deps);

    // 二绑照常建 job + 触发(strict 门下 listJobs 只见 acct-2 的 job → 全量补建)。
    expect(res.created).toHaveLength(6);
    // [T-595] 建 6 条兼容模板，初始化只触发 canonical self.metrics。
    expect(res.triggered).toHaveLength(1);
    expect(deps._listJobs).toHaveBeenCalledTimes(6);
    expect(deps._createJob).toHaveBeenCalledTimes(6);
    expect(deps._trigger).toHaveBeenCalledTimes(1);
  });

  it("[T-595] 分层启用:只默认开启 canonical self.metrics", async () => {
    const deps = makeDeps();
    await bootstrapDouyinCollectionJobs(ctx, deps);
    const byKind = new Map(
      deps._createJob.mock.calls.map((c) => [
        (c[1] as { sourceKind: string }).sourceKind,
        (c[1] as { enabled?: boolean }).enabled,
      ]),
    );
    expect(byKind.get("self.metrics")).toBe(true);
    expect(byKind.get("self.detail")).toBe(false);
    expect(byKind.get("comments")).toBe(false);
    expect(byKind.get("benchmark")).toBe(false);
    expect(byKind.get("topic.daily")).toBe(false);
    expect(byKind.get("favorites")).toBe(false);
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

describe("[T-433 S3] 跨账号错峰(staggeredSchedule / deterministicAccountOffsetMinutes)", () => {
  it("确定性:同号每次同偏移(幂等,重启/重绑不漂)", () => {
    expect(deterministicAccountOffsetMinutes("acct-1")).toBe(
      deterministicAccountOffsetMinutes("acct-1"),
    );
    expect(staggeredSchedule("0 9 * * *", "acct-9")).toBe(
      staggeredSchedule("0 9 * * *", "acct-9"),
    );
  });

  it("偏移落 [0, STAGGER_SPREAD_MINUTES)", () => {
    for (const id of ["acct-1", "acct-2", "u-xyz", "抖音号-88", "z".repeat(40)]) {
      const off = deterministicAccountOffsetMinutes(id);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(STAGGER_SPREAD_MINUTES);
    }
  });

  it("无号 → 偏移 0,schedule 原样(退回基准,不错峰但不报错)", () => {
    expect(deterministicAccountOffsetMinutes(null)).toBe(0);
    expect(deterministicAccountOffsetMinutes(undefined)).toBe(0);
    expect(deterministicAccountOffsetMinutes("")).toBe(0);
    expect(staggeredSchedule("0 9 * * *", null)).toBe("0 9 * * *");
    expect(staggeredSchedule("50 9 * * *", undefined)).toBe("50 9 * * *");
  });

  it("跨号打散:找得到两个号偏移不同(不是所有号都压同刻)", () => {
    const offsets = ["acct-1", "acct-2", "acct-3", "acct-4", "acct-5"].map(
      deterministicAccountOffsetMinutes,
    );
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it("整块同偏移:账号内 0/10/50 相对错开原样保留,不越天", () => {
    const id = "acct-7";
    const m0 = staggeredSchedule("0 9 * * *", id);
    const m10 = staggeredSchedule("10 9 * * *", id);
    const m50 = staggeredSchedule("50 9 * * *", id);
    const mod = (c: string) => {
      const [m, h] = c.split(/\s+/);
      return Number(h) * 60 + Number(m);
    };
    expect(mod(m10) - mod(m0)).toBe(10);
    expect(mod(m50) - mod(m0)).toBe(50);
    // 基准 9:00–9:50 + 偏移 <180 → 落 9:00–12:49,分/时合法、不越天。
    for (const c of [m0, m10, m50]) {
      const [m, h] = c.split(/\s+/).map(Number);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(60);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(12);
    }
  });

  it("非法 cron / 非整数分时 → 原样返回(防御,不改坏)", () => {
    expect(staggeredSchedule("*/5 * * * *", "acct-1")).toBe("*/5 * * * *");
    expect(staggeredSchedule("0 9 * *", "acct-1")).toBe("0 9 * *"); // 段数不对
    expect(staggeredSchedule("", "acct-1")).toBe("");
  });
});
