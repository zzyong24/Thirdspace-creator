import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createAnalyticsRepository,
  type AnalyticsRepository,
  type MetricSnapshotRow,
} from "./analytics.repository";

// Task 2 — user-scoped, append-idempotent repository (pglite-backed).
//   - Ownership: A's rows never leak to B (every query filters user_id).
//   - Idempotency: a duplicate (publicationId, source, capturedAt) append is a
//     no-op (created:false), child metric_values count unchanged.
//   - Idempotency by distinct captured_at: same pub+source different captured_at
//     yields two snapshots.
//   - Pagination: total reflects the full match count; rows capped at pageSize.

const NOW = "2026-06-21T00:00:00.000Z";

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
    ...overrides,
  } as MetricSnapshotRow;
}

describe("analytics repository (user-scoped, append-idempotent)", () => {
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
    const a = await repo.listSnapshotsByPublication("user-a", "pub-1", 1, 20);
    expect(a.total).toBe(1);
    expect(a.rows.map((r) => r.id)).toEqual(["ms-A"]);

    const b = await repo.listSnapshotsByPublication("user-b", "pub-1", 1, 20);
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

    const list = await repo.listSnapshotsByPublication("user-a", "pub-1", 1, 20);
    expect(list.total).toBe(1);

    const values = await repo.listValuesBySnapshot("user-a", first.snapshot.id);
    expect(values.length).toBe(2); // child rows not duplicated
  });

  it("creates distinct snapshots for the same pub+source but different capturedAt", async () => {
    const repo = makeRepo(db);
    const base = {
      publicationId: "pub-1",
      ingestionRunId: null,
      source: "platform_api",
      rawMetrics: {},
      values: [],
    };
    const a = await repo.appendSnapshot("user-a", { ...base, capturedAt: "2026-06-12T10:00:00.000Z" });
    const b = await repo.appendSnapshot("user-a", { ...base, capturedAt: "2026-06-13T10:00:00.000Z" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.snapshot.id).not.toBe(b.snapshot.id);

    const list = await repo.listSnapshotsByPublication("user-a", "pub-1", 1, 20);
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
        values: [],
      });
    }
    const page1 = await repo.listSnapshotsByPublication("user-a", "pub-1", 1, 2);
    expect(page1.total).toBe(5);
    expect(page1.rows.length).toBe(2);
    const page3 = await repo.listSnapshotsByPublication("user-a", "pub-1", 3, 2);
    expect(page3.rows.length).toBe(1);
  });

  it("lists by project (already-scoped publication id list) user-scoped", async () => {
    const repo = makeRepo(db);
    await repo.seedSnapshots([
      snapshotRow({ id: "ms-1", userId: "user-a", publicationId: "pub-1", capturedAt: "2026-06-12T10:00:00.000Z" }),
      snapshotRow({ id: "ms-2", userId: "user-a", publicationId: "pub-2", capturedAt: "2026-06-13T10:00:00.000Z" }),
      snapshotRow({ id: "ms-3", userId: "user-b", publicationId: "pub-1", capturedAt: "2026-06-14T10:00:00.000Z" }),
    ]);
    const res = await repo.listSnapshotsByProject("user-a", ["pub-1", "pub-2"], 1, 20);
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.id).sort()).toEqual(["ms-1", "ms-2"]);
    // empty id list → empty page (valid)
    const empty = await repo.listSnapshotsByProject("user-a", [], 1, 20);
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("getDashboardRollup: sums across pubs, takes each pub's latest, averages ctr/finish (user-scoped)", async () => {
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
        rawMetrics: { plays: 100, likes: 10, comments: 5, shares: 2, favorites: 4, follower_gain: 3, ctr: 0.2, finish_rate: 0.6 },
      }),
      // pub-2: single snapshot
      snapshotRow({
        id: "ms-2",
        userId: "user-a",
        publicationId: "pub-2",
        capturedAt: "2026-06-11T10:00:00.000Z",
        rawMetrics: { plays: 50, likes: 4, comments: 1, shares: 0, favorites: 6, follower_gain: 7, ctr: 0.4, finish_rate: 0.8 },
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

    const r = await repo.getDashboardRollup("user-a");
    expect(r.snapshotCount).toBe(2); // pub-1 (newest) + pub-2
    // sums over the two latest-per-pub snapshots (100+50, 10+4, 5+1, 2+0, 4+6, 3+7)
    expect(r.plays).toBe(150);
    expect(r.likes).toBe(14);
    expect(r.comments).toBe(6);
    expect(r.shares).toBe(2);
    expect(r.favorites).toBe(10);
    expect(r.followerGain).toBe(10);
    // averages: ctr (0.2+0.4)/2, finish (0.6+0.8)/2
    expect(r.ctrAvg).toBeCloseTo(0.3, 10);
    expect(r.finishAvg).toBeCloseTo(0.7, 10);
  });

  it("getDashboardRollup: no snapshots → all-zero rollup, snapshotCount 0 (no throw)", async () => {
    const repo = makeRepo(db);
    const r = await repo.getDashboardRollup("user-empty");
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

  // [T-136 §D 切片 c] 采集 stamp:appendSnapshot 带 accountId → metric_snapshots /
  //   metric_values 都归到该号(采集数据无号归属 = 切号看不到该号真实指标)。
  it("[T-136] appendSnapshot stamps account_id onto snapshot and its metric_values", async () => {
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
    const values = await repo.listValuesBySnapshot("user-a", res.snapshot.id);
    expect(values.length).toBe(1);
    expect(values[0]!.accountId).toBe("acct-1"); // 子指标值随快照归同号
  });

  it("[T-136] appendSnapshot without accountId stamps null (存量 / 未选号兜底)", async () => {
    const repo = makeRepo(db);
    const res = await repo.appendSnapshot("user-a", {
      publicationId: "pub-null",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "ingestion",
      rawMetrics: { views: 1 },
    });
    expect(res.snapshot.accountId).toBeNull();
  });
});
