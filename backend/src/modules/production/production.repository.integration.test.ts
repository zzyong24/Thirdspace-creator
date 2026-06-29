import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, eq } from "@creatoros/backend";
import {
  productions,
  productionSegments,
  segmentAssets,
  exportRecords,
} from "./production.db-schema";
import {
  createProductionRepository,
  type ProductionRepository,
} from "./production.repository";
import { OwnershipError } from "./production.errors";

// Step 1 (schema round-trip) + Step 2 (user-scoped repository) — pglite-backed.
// Ownership is the sole boundary (foundation §2/§5): user A cannot read user B's
// production; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus: four-table round-trip with jsonb defaults `{}` and
// nullable timestamps `null`, ensureProductionForOutput idempotency (UNIQUE on
// content_output_id), and listSegments position ordering.

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    // Namespace ids by userId so two repos sharing one pglite db never collide.
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repoA: ProductionRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repoA = createProductionRepository(db, deterministicDeps(A));
});

describe("production.repository — schema round-trip (Step 1)", () => {
  it("round-trips all four tables with jsonb defaults and nullable timestamps", async () => {
    // productions — ensure creates a drafting row with empty configs + null ts.
    const prod = await repoA.ensureProductionForOutput("output-1");
    expect(prod.userId).toBe(A);
    expect(prod.contentOutputId).toBe("output-1");
    expect(prod.productionMode).toBe("remote_recording");
    expect(prod.status).toBe("drafting");
    expect(prod.recordingConfig).toEqual({});
    expect(prod.subtitleConfig).toEqual({});
    expect(prod.startedAt).toBeNull();
    expect(prod.completedAt).toBeNull();
    expect(prod.updatedAt).toBe(NOW);

    // production_segments — created via repo.
    const seg = await repoA.createSegment(prod.id, {
      title: "片段 1",
      position: 0,
      startMs: 0,
      endMs: 30000,
    });
    expect(seg.userId).toBe(A);
    expect(seg.scriptSectionId).toBeNull();
    expect(seg.segmentConfig).toEqual({});

    // export_records — created queued with null resultAssetId.
    const exp = await repoA.createExport(prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    expect(exp.userId).toBe(A);
    expect(exp.status).toBe("queued");
    expect(exp.resultAssetId).toBeNull();
    expect(exp.bitrate).toBe(0);
    expect(exp.exportConfig).toEqual({});
    expect(exp.completedAt).toBeNull();

    // segment_assets — raw insert round-trips (schema only this wave, no op).
    await db.insert(segmentAssets).values({
      id: "sa-1",
      userId: A,
      productionSegmentId: seg.id,
      assetId: "asset-1",
      usageType: "video",
      position: 0,
    });
    const saRows = await db
      .select()
      .from(segmentAssets)
      .where(eq(segmentAssets.id, "sa-1"));
    expect(saRows[0]?.usageType).toBe("video");

    // direct re-reads confirm column fidelity.
    const reread = await db
      .select()
      .from(productions)
      .where(eq(productions.id, prod.id));
    expect(reread[0]?.contentOutputId).toBe("output-1");
    const segReread = await db
      .select()
      .from(productionSegments)
      .where(eq(productionSegments.id, seg.id));
    expect(segReread[0]?.endMs).toBe(30000);
    const expReread = await db
      .select()
      .from(exportRecords)
      .where(eq(exportRecords.id, exp.id));
    expect(expReread[0]?.format).toBe("mp4");
  });
});

describe("production.repository — ownership (Step 2)", () => {
  it("user B cannot read user A's production (OwnershipError 404, no leak)", async () => {
    await repoA.ensureProductionForOutput("output-1");
    const repoB = createProductionRepository(db, deterministicDeps(B));
    await expect(
      repoB.getProductionByOutput("output-1"),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("user B cannot complete user A's export", async () => {
    const prod = await repoA.ensureProductionForOutput("output-1");
    const exp = await repoA.createExport(prod.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    const repoB = createProductionRepository(db, deterministicDeps(B));
    await expect(repoB.getExport(exp.id)).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("production.repository — idempotency + ordering (Step 2)", () => {
  it("ensureProductionForOutput is idempotent (same id on repeat call)", async () => {
    const first = await repoA.ensureProductionForOutput("output-1");
    const second = await repoA.ensureProductionForOutput("output-1");
    expect(second.id).toBe(first.id);
    // exactly one row exists for the output.
    const rows = await db
      .select()
      .from(productions)
      .where(eq(productions.contentOutputId, "output-1"));
    expect(rows.length).toBe(1);
  });

  it("listSegments returns in position order regardless of insert order", async () => {
    const prod = await repoA.ensureProductionForOutput("output-1");
    await repoA.createSegment(prod.id, {
      title: "C",
      position: 2,
      startMs: 0,
      endMs: 1,
    });
    await repoA.createSegment(prod.id, {
      title: "A",
      position: 0,
      startMs: 0,
      endMs: 1,
    });
    await repoA.createSegment(prod.id, {
      title: "B",
      position: 1,
      startMs: 0,
      endMs: 1,
    });
    const segs = await repoA.listSegments(prod.id);
    expect(segs.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });
});
