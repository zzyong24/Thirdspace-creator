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
});
