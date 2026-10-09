import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createAnalyticsRepository,
  type AnalyticsRepository,
  type MetricSnapshotRow,
} from "./analytics.repository";

// Task 2 — user + account 双维 scoped, append-idempotent repository (pglite-backed).
//   - Ownership: A's rows never leak to B (every query filters user_id AND account_id
//     —— [T-332 S2] strict,accountId 必填,lenient OR-IS-NULL 已退役)。
//   - Idempotency: a duplicate (publicationId, source, capturedAt) append is a
//     no-op (created:false), child metric_values count unchanged.
//   - Idempotency by distinct captured_at: same pub+source different captured_at
//     yields two snapshots.
//   - Pagination: total reflects the full match count; rows capped at pageSize.

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] strict 门下测试统一的默认号;双号用例显式传别的号。
const ACCT = "acct-1";

function makeRepo(db: Db, tag = "a"): AnalyticsRepository {
  let seq = 0;
  return createAnalyticsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
  });
}

function snapshotRow(
  overrides: Partial<MetricSnapshotRow> & { id: string; userId: string },
): MetricSnapshotRow {
  return {
    publicationId: "pub-1",
    ingestionRunId: null,
    capturedAt: "2026-06-12T10:00:00.000Z",
    source: "platform_api",
    rawMetrics: {},
    createdAt: NOW,
    // [T-332 S1] account_id NOT NULL:seed 行必带号(用例可覆写)。
    accountId: ACCT,
    ...overrides,
  } as MetricSnapshotRow;
}

describe("analytics repository (user+account-scoped, append-idempotent)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("isolates snapshots by user_id on the same publication", async () => {
    const repo = makeRepo(db);
    await repo.seedSnapshots([
      snapshotRow({ id: "ms-A", userId: "user-a", capturedAt: "2026-06-12T10:00:00.000Z" }),
      snapshotRow({ id: "ms-B", userId: "user-b", capturedAt: "2026-06-12T11:00:00.000Z" }),
    ]);
    const a = await repo.listSnapshotsByPublication("user-a", ACCT, "pub-1", 1, 20);
    expect(a.total).toBe(1);
    expect(a.rows.map((r) => r.id)).toEqual(["ms-A"]);

    const b = await repo.listSnapshotsByPublication("user-b", ACCT, "pub-1", 1, 20);
    expect(b.total).toBe(1);
    expect(b.rows.map((r) => r.id)).toEqual(["ms-B"]);
  });

  it("is idempotent on a duplicate (publicationId, source, capturedAt) append", async () => {
    const repo = makeRepo(db);
    const input = {
      publicationId: "pub-1",
      ingestionRunId: "run-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { views: 100 },
      accountId: ACCT,
      values: [
        { metricKey: "views", numericValue: 100, unit: "count", dimensions: {} },
        { metricKey: "conversion_clicks", numericValue: 12, unit: "count", dimensions: {} },
      ],
    };
    const first = await repo.appendSnapshot("user-a", input);
    expect(first.created).toBe(true);
    const second = await repo.appendSnapshot("user-a", input);
    expect(second.created).toBe(false);
    expect(second.snapshot.id).toBe(first.snapshot.id);

    const list = await repo.listSnapshotsByPublication("user-a", ACCT, "pub-1", 1, 20);
    expect(list.total).toBe(1);

    const values = await repo.listValuesBySnapshot("user-a", ACCT, first.snapshot.id);
    expect(values.length).toBe(2); // child rows not duplicated
  });

  it("creates distinct snapshots for the same pub+source but different capturedAt", async () => {
    const repo = makeRepo(db);
    const base = {
      publicationId: "pub-1",
      ingestionRunId: null,
      source: "platform_api",
      rawMetrics: {},
      accountId: ACCT,
      values: [],
    };
    const a = await repo.appendSnapshot("user-a", { ...base, capturedAt: "2026-06-12T10:00:00.000Z" });
    const b = await repo.appendSnapshot("user-a", { ...base, capturedAt: "2026-06-13T10:00:00.000Z" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.snapshot.id).not.toBe(b.snapshot.id);

    const list = await repo.listSnapshotsByPublication("user-a", ACCT, "pub-1", 1, 20);
    expect(list.total).toBe(2);
    // ORDER BY captured_at DESC → newest first
    expect(list.rows[0]!.capturedAt).toBe("2026-06-13T10:00:00.000Z");
  });

  it("paginates: total reflects full count, rows capped at pageSize", async () => {
    const repo = makeRepo(db);
    for (let i = 0; i < 5; i++) {
      await repo.appendSnapshot("user-a", {
        publicationId: "pub-1",
        ingestionRunId: null,
        capturedAt: `2026-06-1${i}T10:00:00.000Z`,
        source: "platform_api",
        rawMetrics: {},
        accountId: ACCT,
        values: [],
      });
    }
    const page1 = await repo.listSnapshotsByPublication("user-a", ACCT, "pub-1", 1, 2);
    expect(page1.total).toBe(5);
    expect(page1.rows.length).toBe(2);
    const page3 = await repo.listSnapshotsByPublication("user-a", ACCT, "pub-1", 3, 2);
    expect(page3.rows.length).toBe(1);
  });

  it("lists by project (already-scoped publication id list) user-scoped", async () => {
    const repo = makeRepo(db);
    await repo.seedSnapshots([
      snapshotRow({ id: "ms-1", userId: "user-a", publicationId: "pub-1", capturedAt: "2026-06-12T10:00:00.000Z" }),
      snapshotRow({ id: "ms-2", userId: "user-a", publicationId: "pub-2", capturedAt: "2026-06-13T10:00:00.000Z" }),
      snapshotRow({ id: "ms-3", userId: "user-b", publicationId: "pub-1", capturedAt: "2026-06-14T10:00:00.000Z" }),
    ]);
    const res = await repo.listSnapshotsByProject("user-a", ACCT, ["pub-1", "pub-2"], 1, 20);
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.id).sort()).toEqual(["ms-1", "ms-2"]);
    // empty id list → empty page (valid)
    const empty = await repo.listSnapshotsByProject("user-a", ACCT, [], 1, 20);
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("getDashboardRollup: sums across pubs, takes each pub's latest, weights ctr/finish (user-scoped)", async () => {
    const repo = makeRepo(db);
    await repo.seedSnapshots([
      // pub-1: older snapshot (should be IGNORED in favor of the newer one)
      snapshotRow({
        id: "ms-1-old",
        userId: "user-a",
        publicationId: "pub-1",
        capturedAt: "2026-06-10T10:00:00.000Z",
        rawMetrics: { plays: 1, likes: 1, comments: 1, shares: 1, favorites: 1, follower_gain: 1, ctr: 0.1, finish_rate: 0.1 },
      }),
      // pub-1: newest → its metrics are the ones that count
      snapshotRow({
        id: "ms-1-new",
        userId: "user-a",
        publicationId: "pub-1",
        capturedAt: "2026-06-12T10:00:00.000Z",
        rawMetrics: { plays: 100, likes: 10, comments: 5, shares: 2, favorites: 4, follower_gain: 3, ctr: 0.2, finish_rate: 0.6,ctr_denominator:100,finish_rate_denominator:100,ctr_definition:"test",finish_rate_definition:"test" },
      }),
      // pub-2: single snapshot
      snapshotRow({
        id: "ms-2",
        userId: "user-a",
        publicationId: "pub-2",
        capturedAt: "2026-06-11T10:00:00.000Z",
        rawMetrics: { plays: 50, likes: 4, comments: 1, shares: 0, favorites: 6, follower_gain: 7, ctr: 0.4, finish_rate: 0.8,ctr_denominator:50,finish_rate_denominator:50,ctr_definition:"test",finish_rate_definition:"test" },
      }),
      // user-b: must NOT leak into user-a's rollup
      snapshotRow({
        id: "ms-b",
        userId: "user-b",
        publicationId: "pub-9",
        capturedAt: "2026-06-13T10:00:00.000Z",
        rawMetrics: { plays: 9999, likes: 9999, comments: 9999, shares: 9999, favorites: 9999, follower_gain: 9999, ctr: 0.99, finish_rate: 0.99 },
      }),
    ]);

    const r = await repo.getDashboardRollup("user-a", ACCT);
    expect(r.snapshotCount).toBe(2); // pub-1 (newest) + pub-2
    // sums over the two latest-per-pub snapshots (100+50, 10+4, 5+1, 2+0, 4+6, 3+7)
    expect(r.plays).toBe(150);
    expect(r.likes).toBe(14);
    expect(r.comments).toBe(6);
    expect(r.shares).toBe(2);
    expect(r.favorites).toBe(10);
    expect(r.followerGain).toBe(10);
    // averages: ctr (0.2+0.4)/2, finish (0.6+0.8)/2
    expect(r.ctrAvg).toBeCloseTo((0.2*100+0.4*50)/150, 10);
    expect(r.finishAvg).toBeCloseTo((0.6*100+0.8*50)/150, 10);
  });

  it("getDashboardRollup: numeric-string detail metrics still count as detail snapshots", async () => {
    const repo = makeRepo(db);
    await repo.seedSnapshots([
      snapshotRow({
        id: "ms-string-detail-1",
        userId: "user-a",
        publicationId: "pub-1",
        capturedAt: "2026-06-12T10:00:00.000Z",
        rawMetrics: {
          views: "100",
          likes: "10",
          comments: "5",
          shares: "2",
          follower_gain: "3",
          ctr: "20.5",ctr_denominator:"100",finish_rate_denominator:"100",ctr_definition:"test",finish_rate_definition:"test",
          finish_rate: "12.5",
        },
      }),
      snapshotRow({
        id: "ms-string-detail-2",
        userId: "user-a",
        publicationId: "pub-2",
        capturedAt: "2026-06-12T10:00:00.000Z",
        rawMetrics: {
          views: "50",
          follower_gain: "7",
          ctr: "40.5",ctr_denominator:"50",finish_rate_denominator:"50",ctr_definition:"test",finish_rate_definition:"test",
          finish_rate: "17.5",
        },
      }),
    ]);

    const r = await repo.getDashboardRollup("user-a", ACCT);
    expect(r.snapshotCount).toBe(2);
    expect(r.plays).toBe(150);
    expect(r.likes).toBe(10);
    expect(r.followerGain).toBe(10);
    expect(r.finishCount).toBe(2);
    expect(r.ctrAvg).toBeCloseTo((20.5*100+40.5*50)/150, 10);
    expect(r.finishAvg).toBeCloseTo((12.5*100+17.5*50)/150, 10);
  });

  it("getDashboardRollup: no snapshots → unknown metrics rollup, snapshotCount 0 (no throw)", async () => {
    const repo = makeRepo(db);
    const r = await repo.getDashboardRollup("user-empty", ACCT);
    expect(r).toMatchObject({
      plays: null,
      likes: null,
      comments: null,
      shares: null,
      favorites: null,
      followerGain: null,
      ctrAvg: null,
      finishAvg: null,
      finishCount: 0,
      snapshotCount: 0,
    });
  });

  it("来源同时含 views=0 和 plays 时保留真实零，与作品目录口径一致", async () => {
    const repo = makeRepo(db, "zero-play");
    await repo.seedSnapshots([
      snapshotRow({ id: "zero-view-baseline", userId: "user-a",
        capturedAt: "2026-06-19T10:00:00.000Z", rawMetrics: { views: 0, plays: 23 } }),
      snapshotRow({ id: "zero-view", userId: "user-a",
        capturedAt: "2026-06-20T10:00:00.000Z", rawMetrics: { views: 0, plays: 23 } }),
    ]);
    expect((await repo.getDashboardRollup("user-a", ACCT)).plays).toBe(0);
    expect(await repo.getDailyPlayTrend("user-a", ACCT, undefined, 7))
      .toEqual([{ day: "2026-06-20", plays: 0 }]);
  });

  // [T-332 S2] 采集 stamp(strict):appendSnapshot 的 accountId 必填 → metric_snapshots /
  it("T1106 最后快照在列表与明细间轮换时仍使用两日共同的实测系列", async () => {
    const repo = makeRepo(db, "series");
    await repo.seedSnapshots([
      snapshotRow({id:"series-v1",userId:"user-a",source:"ingestion",capturedAt:"2026-06-19T10:00:00Z",rawMetrics:{views:100}}),
      snapshotRow({id:"series-p1",userId:"user-a",source:"ingestion",capturedAt:"2026-06-19T10:00:00.001Z",rawMetrics:{plays:101}}),
      snapshotRow({id:"series-v2",userId:"user-a",source:"ingestion",capturedAt:"2026-06-20T10:00:00Z",rawMetrics:{views:150}}),
    ]);
    expect(await repo.getDailyPlayTrend("user-a",ACCT,undefined,7)).toEqual([{day:"2026-06-20",plays:50}]);
  });

  it("T1106 JSON窗口结构相同可比，平台、来源、键和窗口不一致保持未知",async()=>{
    const repo=makeRepo(db,"window");
    const cases=[
      {id:"same",a:{views:100,metric_window:{from:1,to:2}},b:{views:120,metric_window:{to:2,from:1}},source:"platform_api",expected:20},
      {id:"window",a:{views:100,metric_window:{from:1}},b:{views:120,metric_window:{from:2}},source:"platform_api",expected:null},
      {id:"platform",a:{views:100,_platform:"douyin"},b:{views:120,_platform:"bilibili"},source:"platform_api",expected:null},
      {id:"source",a:{views:100},b:{views:120},source:"ingestion",expected:null},
      {id:"key",a:{views:100},b:{plays:120},source:"platform_api",expected:null},
    ];
    for(const c of cases){await repo.seedSnapshots([
      snapshotRow({id:c.id+"-a",publicationId:c.id,userId:"user-a",capturedAt:"2026-06-19T10:00:00Z",rawMetrics:c.a}),
      snapshotRow({id:c.id+"-b",publicationId:c.id,userId:"user-a",capturedAt:"2026-06-20T10:00:00Z",source:c.source,rawMetrics:c.b}),
    ]);expect((await repo.getDailyPlayTrend("user-a",ACCT,[c.id],7))[0]?.plays).toBe(c.expected);}
  });

  it("T1106 缺失日不压缩日期，也不跨空档把多日累计当当日新增",async()=>{
    const repo=makeRepo(db,"calendar");
    for(const [day,views] of [[19,100],[20,150],[22,200]] as const)await repo.seedSnapshots([
      snapshotRow({id:"calendar-"+day,userId:"user-a",capturedAt:`2026-06-${day}T10:00:00Z`,rawMetrics:{views}}),
    ]);
    expect(await repo.getDailyPlayTrend("user-a",ACCT,undefined,2)).toEqual([
      {day:"2026-06-20",plays:50},
      {day:"2026-06-21",plays:null,complete:false,sampleCount:0,correction:null},
      {day:"2026-06-22",plays:null,complete:false,sampleCount:0,correction:null},
    ]);
  });

  it("T1106 同刻不同快照的差分冲突与新增作品无基线均不显示部分总量",async()=>{
    const repo=makeRepo(db,"coverage");
    for(const [source,last] of [["ingestion",120],["platform_api",130]] as const)await repo.seedSnapshots([
      snapshotRow({id:source+"-a",publicationId:"conflict",userId:"user-a",source,capturedAt:"2026-06-19T10:00:00Z",rawMetrics:{views:100}}),
      snapshotRow({id:source+"-b",publicationId:"conflict",userId:"user-a",source,capturedAt:"2026-06-20T10:00:00Z",rawMetrics:{views:last}}),
    ]);
    expect((await repo.getDailyPlayTrend("user-a",ACCT,["conflict"],7))[0]?.plays).toBeNull();
    await repo.seedSnapshots([
      snapshotRow({id:"old-a",publicationId:"old",userId:"user-a",capturedAt:"2026-06-19T10:00:00Z",rawMetrics:{views:100}}),
      snapshotRow({id:"old-b",publicationId:"old",userId:"user-a",capturedAt:"2026-06-20T10:00:00Z",rawMetrics:{views:120}}),
      snapshotRow({id:"new-b",publicationId:"new",userId:"user-a",capturedAt:"2026-06-20T10:00:00Z",rawMetrics:{views:500}}),
    ]);
    expect(await repo.getDailyPlayTrend("user-a",ACCT,["old","new"],7)).toEqual([{day:"2026-06-20",plays:null,complete:false,sampleCount:1,correction:null}]);
  });

  it("T1106 同日无效快照不盖掉有效plays，非有限views回落真实plays",async()=>{
    const repo=makeRepo(db,"valid-series");
    await repo.seedSnapshots([
      snapshotRow({id:"valid-a",userId:"user-a",capturedAt:"2026-06-19T10:00:00Z",rawMetrics:{plays:100}}),
      snapshotRow({id:"null-a",userId:"user-a",capturedAt:"2026-06-19T11:00:00Z",rawMetrics:{plays:null}}),
      snapshotRow({id:"valid-b",userId:"user-a",capturedAt:"2026-06-20T10:00:00Z",rawMetrics:{views:"1e309",plays:150}}),
    ]);
    expect(await repo.getDailyPlayTrend("user-a",ACCT,undefined,7)).toEqual([{day:"2026-06-20",plays:50}]);
  });

  //   metric_values 出生即归号,不存在「无号落 NULL」写路径(schema 已 NOT NULL)。
  it("appendSnapshot stamps account_id onto snapshot and its metric_values (strict)", async () => {
    const repo = makeRepo(db);
    const res = await repo.appendSnapshot("user-a", {
      publicationId: "pub-acct",
      ingestionRunId: "run-acct",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "ingestion",
      rawMetrics: { views: 100 },
      accountId: "acct-1",
      values: [
        { metricKey: "views", numericValue: 100, unit: "count", dimensions: {} },
      ],
    });
    expect(res.created).toBe(true);
    expect(res.snapshot.accountId).toBe("acct-1"); // 快照归号
    const values = await repo.listValuesBySnapshot("user-a", "acct-1", res.snapshot.id);
    expect(values.length).toBe(1);
    expect(values[0]!.accountId).toBe("acct-1"); // 子指标值随快照归同号
  });

  // [T-332 S2] strict 按号隔离(SPEC §4.1):读一律 eq(account_id, 当前号)——
  //   两个号的 dashboard/趋势/明细绝不混读;lenient「当前号 OR 未标记(IS NULL)」与
  //   「未选号 → 全量」退化均已随用户拍板 ②(清库重来)退役。
  describe("[T-332 S2] strict account-scoped reads", () => {
    // 双号数据:acct-1 / acct-2(同一 user)。
    async function seedTwoAccounts(repo: AnalyticsRepository) {
      await repo.seedSnapshots([
        // acct-1 的作品,两天(day1 累计 100 → day2 累计 150)
        snapshotRow({
          id: "ms-a1-d1",
          userId: "user-a",
          publicationId: "pub-a1",
          capturedAt: "2026-06-11T10:00:00.000Z",
          rawMetrics: { views: 100 },
          accountId: "acct-1",
        }),
        snapshotRow({
          id: "ms-a1-d2",
          userId: "user-a",
          publicationId: "pub-a1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          rawMetrics: { views: 150 },
          accountId: "acct-1",
        }),
        // acct-2 的作品,两天(1000 → 3000)—— 若泄漏会把 acct-1 的数字顶爆
        snapshotRow({
          id: "ms-b1-d1",
          userId: "user-a",
          publicationId: "pub-b1",
          capturedAt: "2026-06-11T10:00:00.000Z",
          rawMetrics: { views: 1000 },
          accountId: "acct-2",
        }),
        snapshotRow({
          id: "ms-b1-d2",
          userId: "user-a",
          publicationId: "pub-b1",
          capturedAt: "2026-06-12T10:00:00.000Z",
          rawMetrics: { views: 3000 },
          accountId: "acct-2",
        }),
      ]);
    }

    it("getDashboardRollup:双号各见本号,交叉泄漏为 0(ISO-08)", async () => {
      const repo = makeRepo(db);
      await seedTwoAccounts(repo);
      const r1 = await repo.getDashboardRollup("user-a", "acct-1");
      expect(r1.snapshotCount).toBe(1); // 仅 pub-a1
      expect(r1.plays).toBe(150); // 不含 acct-2 的 3000
      const r2 = await repo.getDashboardRollup("user-a", "acct-2");
      expect(r2.snapshotCount).toBe(1); // 仅 pub-b1
      expect(r2.plays).toBe(3000);
    });

    it("getDailyPlayTrend:差分只含本号", async () => {
      const repo = makeRepo(db);
      await seedTwoAccounts(repo);
      const t1 = await repo.getDailyPlayTrend("user-a", "acct-1", undefined, 7);
      // day2 新增 = 150 - 100 = 50(若混入 acct-2 会是 2050)
      expect(t1).toEqual([{ day: "2026-06-12", plays: 50 }]);
      const t2 = await repo.getDailyPlayTrend("user-a", "acct-2", undefined, 7);
      expect(t2).toEqual([{ day: "2026-06-12", plays: 2000 }]);
    });

    it("明细读(listSnapshotsByPublication / listValuesBySnapshot)跨号 → 空,不泄漏", async () => {
      const repo = makeRepo(db);
      await seedTwoAccounts(repo);
      // acct-2 的作品在 acct-1 ctx 下:空页(strict,与列表同语义)。
      const cross = await repo.listSnapshotsByPublication(
        "user-a",
        "acct-1",
        "pub-b1",
        1,
        20,
      );
      expect(cross.total).toBe(0);
      expect(cross.rows).toEqual([]);
      const crossValues = await repo.listValuesBySnapshot(
        "user-a",
        "acct-1",
        "ms-b1-d1",
      );
      expect(crossValues).toEqual([]);
    });

    // [T-332 S2 / spec-review minor #5] B 号(无任何数据)的聚合读必须返回空集/0,
    // 不产 NULL、不炸 contract Zod(聚合在 JS reduce,起点全 0)。
    it("无数据号(acct-empty)聚合读:rollup 全 0、trend 空数组、明细空页(不炸)", async () => {
      const repo = makeRepo(db);
      await seedTwoAccounts(repo);
      const r = await repo.getDashboardRollup("user-a", "acct-empty");
      expect(r).toMatchObject({
        plays: null,
        likes: null,
        comments: null,
        shares: null,
        favorites: null,
        followerGain: null,
        ctrAvg: null,
        finishAvg: null,
        finishCount: 0,
        snapshotCount: 0,
      });
      const t = await repo.getDailyPlayTrend("user-a", "acct-empty", undefined, 7);
      expect(t).toEqual([]);
      const page = await repo.listSnapshotsByPublication(
        "user-a",
        "acct-empty",
        "pub-a1",
        1,
        20,
      );
      expect(page).toEqual({ rows: [], total: 0 });
    });
  });
});


it("T987 历史快照增多时仅返回最近采样日每日最后值，保持稀疏日期和账号隔离", async () => {
  const { db, client } = await createDb();
  try {
    const repo = makeRepo(db, "trend-perf");
    const rows: MetricSnapshotRow[] = [];
    for (let day = 1; day <= 20; day++) {
      for (let tick = 0; tick < 10; tick++) {
        for (const pub of ["a", "b"]) {
          rows.push(snapshotRow({id:`t987-${day}-${tick}-${pub}`,userId:"user-a",publicationId:pub,
            capturedAt:`2025-01-${String(day).padStart(2,"0")}T${String(tick).padStart(2,"0")}:00:00.000Z`,
            rawMetrics:{[pub === "a" ? "views" : "plays"]:String(day*100+tick), irrelevant:"x".repeat(2048)}}));
        }
      }
    }
    rows.push(snapshotRow({id:"other-account",userId:"user-a",accountId:"other",publicationId:"a",capturedAt:"2026-09-01T00:00:00.000Z",rawMetrics:{views:999999}}));
    await repo.seedSnapshots(rows);
    const original = client.query.bind(client);
    const payloads: unknown[][] = [];
    const spy = vi.spyOn(client,"query").mockImplementation(async (...args: any[]) => {
      const result = await (original as any)(...args);
      if (String(args[0]).includes('from "metric_snapshots"')) payloads.push(result.rows);
      return result;
    });
    const trend = await repo.getDailyPlayTrend("user-a",ACCT,undefined,7);
    expect(trend).toEqual(Array.from({length:7},(_,i)=>({day:`2025-01-${14+i}`,plays:200})));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toHaveLength(16);
    expect(JSON.stringify(payloads)).not.toContain("irrelevant");
    expect(await repo.getDailyPlayTrend("user-a",ACCT,["a"],7)).toEqual(trend.map(p=>({...p,plays:100})));
    spy.mockClear();expect(await repo.getDailyPlayTrend("user-a",ACCT,[],7)).toEqual([]);expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  } finally { await client.close(); }
});
