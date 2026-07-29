import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAnalyticsRepository } from "./analytics.repository";
import {
  createAnalyticsService,
  type AnalyticsService,
  type AnalyticsPublishingPort,
} from "./analytics.service";
import { AccountRequiredError, OwnershipError } from "./analytics.errors";

// Task 3 — service (RequestContext; cross-module resolve via Publishing public
// port; no state machine).
//   - getPublicationAnalytics for a publication owned by another user →
//     OwnershipError (resolve rejects), no rows leaked.
//   - getProjectAnalytics resolves project→publication ids via the fake and
//     returns only matching snapshots.
//   - appendSnapshot returns created:false on the second identical call.
//   - getProjectAnalytics with zero resolved publications → { rows:[], total:0 }.

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] per-account 域 service 一律要求 ctx.accountId(strict);测试 ctx 统一带号。
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "ra",
  source: "user",
  accountId: "acct-1",
};

function makeService(
  db: Db,
  publishing: AnalyticsPublishingPort,
): AnalyticsService {
  let seq = 0;
  const repo = createAnalyticsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  return createAnalyticsService({ repo, publishing });
}

describe("analytics service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("rejects getPublicationAnalytics for a publication owned by another user", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => {
        throw new OwnershipError("OwnershipError: publication not found");
      },
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    await expect(
      service.getPublicationAnalytics(ctxA, "pub-other", 1, 20),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("getProjectAnalytics resolves project→publication ids and returns matching snapshots", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve(["pub-1", "pub-2"]),
    };
    const service = makeService(db, publishing);
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [],
    });
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-3", // not in the project
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [],
    });
    const res = await service.getProjectAnalytics(ctxA, "project-x", 1, 20);
    expect(res.total).toBe(1);
    expect(res.rows.map((r) => r.publicationId)).toEqual(["pub-1"]);
  });

  it("appendSnapshot returns created:false on the second identical call (idempotent through service)", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    const input = {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [],
    };
    const first = await service.appendSnapshot(ctxA, input);
    const second = await service.appendSnapshot(ctxA, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("getProjectAnalytics with zero resolved publications returns an empty page", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    const res = await service.getProjectAnalytics(ctxA, "project-empty", 1, 20);
    expect(res).toEqual({ rows: [], total: 0 });
  });

  it("getPublicationAnalytics returns the owned publication's snapshots after resolve passes", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [],
    });
    const res = await service.getPublicationAnalytics(ctxA, "pub-1", 1, 20);
    expect(res.total).toBe(1);
  });

  it("[T-599] batches latest snapshots for a publication set", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-1",
      capturedAt: "2026-07-28T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { views: 10 },
      values: [],
    });
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-1",
      capturedAt: "2026-07-29T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { views: 20 },
      values: [],
    });
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-other",
      capturedAt: "2026-07-29T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { views: 999 },
      values: [],
    });

    const rows = await service.listLatestSnapshotsByPublicationIds(ctxA, [
      "pub-1",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      publicationId: "pub-1",
      capturedAt: "2026-07-29T10:00:00.000Z",
      rawMetrics: { views: 20 },
    });
  });

  it("getDashboardRollup rolls up the user's latest-per-publication snapshots (no Publishing seam)", async () => {
    // Publishing port must NOT be touched by the rollup path — wire it to throw.
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => {
        throw new Error("publishing seam must not be used by rollup");
      },
      listPublicationIdsByProject: () => {
        throw new Error("publishing seam must not be used by rollup");
      },
    };
    const service = makeService(db, publishing);
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { plays: 100, likes: 10, comments: 5, shares: 2, favorites: 4, follower_gain: 3, ctr: 0.2, finish_rate: 0.6 },
      values: [],
    });
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-2",
      capturedAt: "2026-06-11T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { plays: 50, likes: 4, comments: 1, shares: 0, favorites: 6, follower_gain: 7, ctr: 0.4, finish_rate: 0.8 },
      values: [],
    });

    const r = await service.getDashboardRollup(ctxA);
    expect(r.snapshotCount).toBe(2);
    expect(r.plays).toBe(150);
    expect(r.followerGain).toBe(10);
    expect(r.ctrAvg).toBeCloseTo(0.3, 10);
    expect(r.finishAvg).toBeCloseTo(0.7, 10);
  });

  it("getDashboardRollup with no snapshots returns an all-zero rollup (no throw)", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    const r = await service.getDashboardRollup(ctxA);
    expect(r).toEqual({
      plays: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      favorites: 0,
      followerGain: 0,
      ctrAvg: 0,
      finishAvg: 0,
      finishCount: 0,
      snapshotCount: 0,
    });
  });

  // [T-332 S2] service 把 ctx.accountId(strict)贯穿进聚合读:选号 ctx 的 dashboard/趋势
  //   只含本号;lenient「当前号 or 未标记」与「无号 ctx 全量」均已退役(拍板 ②)。
  it("getDashboardRollup / getDailyPlayTrend thread ctx.accountId (strict 按号隔离)", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve([]),
    };
    const service = makeService(db, publishing);
    // 号1 采集(ctxA 带号 acct-1 → stamp acct-1)。
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-acct1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "ingestion",
      rawMetrics: { views: 100 },
      values: [],
    });
    // 号2 采集(input 显式带号,覆盖 ctx 兜底 —— ingestion 派生 ctx 的等价形态)。
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-acct2",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "ingestion",
      rawMetrics: { views: 1000 },
      accountId: "acct-2",
      values: [],
    });

    const r1 = await service.getDashboardRollup(ctxA);
    expect(r1.snapshotCount).toBe(1); // 只见本号,不含 acct-2
    expect(r1.plays).toBe(100);
    const ctxAcct2: RequestContext = { ...ctxA, accountId: "acct-2" };
    const r2 = await service.getDashboardRollup(ctxAcct2);
    expect(r2.snapshotCount).toBe(1);
    expect(r2.plays).toBe(1000);
  });

  // [T-332 S2 / spec-review minor #5] B 号(无任何数据)的聚合读返回空集/0,不炸:
  //   rollup 全 0、trend 空数组、project 明细空页 —— 无 NULL 逃逸进 contract。
  it("无数据号 ctx 的聚合读:rollup 全 0 / trend [] / project 空页(不炸)", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve(["pub-acct1"]),
    };
    const service = makeService(db, publishing);
    // acct-1 有数据;acct-empty 一条都没有。
    await service.appendSnapshot(ctxA, {
      publicationId: "pub-acct1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "ingestion",
      rawMetrics: { views: 100 },
      values: [],
    });
    const ctxEmpty: RequestContext = { ...ctxA, accountId: "acct-empty" };
    const r = await service.getDashboardRollup(ctxEmpty);
    expect(r).toEqual({
      plays: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      favorites: 0,
      followerGain: 0,
      ctrAvg: 0,
      finishAvg: 0,
      finishCount: 0,
      snapshotCount: 0,
    });
    const trend = await service.getDailyPlayTrend(ctxEmpty, { days: 7 });
    expect(trend).toEqual([]);
    const proj = await service.getProjectAnalytics(ctxEmpty, "project-x", 1, 20);
    expect(proj).toEqual({ rows: [], total: 0 });
  });

  // [T-332 S2] 未选号(ctx.accountId 缺失)= 引导态,per-account 域禁读写(SPEC §4.2):
  //   每个经 ctx 的入口统一 requireAccountId → AccountRequiredError,无「全量」退化。
  it("未选号 ctx → 所有入口抛 AccountRequiredError(读写同门)", async () => {
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve(["pub-1"]),
    };
    const service = makeService(db, publishing);
    const noAcctCtx: RequestContext = {
      userId: "user-a",
      requestId: "r-noacct",
      source: "user",
    };
    await expect(
      service.appendSnapshot(noAcctCtx, {
        publicationId: "pub-1",
        capturedAt: "2026-06-12T10:00:00.000Z",
        source: "ingestion",
        rawMetrics: { views: 1 },
        values: [],
      }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.getPublicationAnalytics(noAcctCtx, "pub-1", 1, 20),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.getProjectAnalytics(noAcctCtx, "project-x", 1, 20),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(service.getDashboardRollup(noAcctCtx)).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
    await expect(
      service.getDailyPlayTrend(noAcctCtx, { days: 7 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
  });
});
