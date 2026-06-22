import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createAnalyticsRepository,
  type AnalyticsRepository,
} from "./analytics-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";
const CAPTURED_AT = "2026-06-13T09:00:00+08:00";

// Namespace ids per userId so cross-user tests never collide on the PK.
function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: AnalyticsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createAnalyticsRepository(db, deterministicDeps("user-1"));
});

describe("AnalyticsRepository (pglite-backed real persistence)", () => {
  it("appends a snapshot and reads it back from SQL", async () => {
    const created = await repo.appendSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      source: "douyin",
      rawMetrics: { views: 100 },
    });
    expect(created.id).toBe("snapshot-user-1-1");
    expect(created.source).toBe("douyin");
    expect(created.createdAt).toBe(FIXED_NOW);

    const fetched = await repo.getSnapshot("snapshot-user-1-1");
    expect(fetched.publicationId).toBe("pub-1");
    expect(fetched.rawMetrics).toEqual({ views: 100 });

    const list = await repo.listSnapshots("pub-1");
    expect(list.map((s) => s.id)).toContain("snapshot-user-1-1");
  });

  it("throws for a missing snapshot", async () => {
    await expect(repo.getSnapshot("nope")).rejects.toThrow(/not found/);
  });

  it("is idempotent on (publicationId, source, capturedAt) — no duplicate", async () => {
    const first = await repo.appendSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      source: "douyin",
      rawMetrics: { views: 100 },
    });
    // Same idempotency key — must be a no-op insert returning the existing row.
    const second = await repo.appendSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      source: "douyin",
      rawMetrics: { views: 999 },
    });
    expect(second.id).toBe(first.id);
    expect(second.rawMetrics).toEqual({ views: 100 }); // original wins

    const list = await repo.listSnapshots("pub-1");
    expect(list).toHaveLength(1);

    // A different source IS a distinct fact (key differs).
    await repo.appendSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      source: "bilibili",
    });
    expect(await repo.listSnapshots("pub-1")).toHaveLength(2);
  });

  it("appends metric values / retention / audience facts durably", async () => {
    const snap = await repo.appendSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      source: "douyin",
    });

    const value = await repo.appendValue(snap.id, {
      metricKey: "conversion_clicks",
      numericValue: 42,
      unit: "count",
      dimensions: { funnel: "guide" },
    });
    expect(value.numericValue).toBe(42);
    const values = await repo.listValues(snap.id);
    expect(values).toHaveLength(1);
    expect(values[0]!.metricKey).toBe("conversion_clicks");

    await repo.appendRetentionPoint({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      positionMs: 5000,
      retentionRate: 0.8,
      viewerCount: 80,
    });
    const retention = await repo.listRetentionPoints("pub-1");
    expect(retention).toHaveLength(1);
    expect(retention[0]!.retentionRate).toBe(0.8);

    await repo.appendAudienceSnapshot({
      publicationId: "pub-1",
      capturedAt: CAPTURED_AT,
      dimensionType: "paying",
      dimensionValue: "paid",
      percentage: 0.3,
      audienceCount: 30,
    });
    const audience = await repo.listAudienceSnapshots("pub-1");
    expect(audience).toHaveLength(1);
    expect(audience[0]!.dimensionType).toBe("paying");
  });

  it("does not leak another user's snapshot (ownership 404 surface)", async () => {
    const otherRepo = createAnalyticsRepository(db, deterministicDeps("user-2"));
    const theirs = await otherRepo.appendSnapshot({
      publicationId: "pub-x",
      capturedAt: CAPTURED_AT,
      source: "douyin",
    });

    // user-1 cannot read user-2's snapshot — same "not found" surface.
    await expect(repo.getSnapshot(theirs.id)).rejects.toThrow(/not found/);
    // ...nor enumerate it by publication.
    expect(await repo.listSnapshots("pub-x")).toHaveLength(0);
    // ...nor append children onto it.
    await expect(
      repo.appendValue(theirs.id, { metricKey: "views", numericValue: 1 }),
    ).rejects.toThrow(/not found/);
  });
});
