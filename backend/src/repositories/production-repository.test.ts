import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createProductionRepository,
  type ProductionRepository,
} from "./production-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps namespaced per userId so two owners' ids never collide on
// the shared PK (mirrors project-repository.test.ts; id factory is injected).
function deterministicDeps(userId = "user-1") {
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
let repo: ProductionRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createProductionRepository(db, deterministicDeps());
});

describe("ProductionRepository (pglite-backed real persistence)", () => {
  it("ensures a production for an output then reads it back via get + list", async () => {
    const created = await repo.ensureProductionForOutput({
      contentOutputId: "output-1",
    });
    expect(created.id).toBe("production-user-1-1");
    expect(created.status).toBe("drafting");
    expect(created.contentOutputId).toBe("output-1");

    const fetched = await repo.get("production-user-1-1");
    expect(fetched.contentOutputId).toBe("output-1");

    const list = await repo.list();
    expect(list.map((p) => p.id)).toContain("production-user-1-1");
  });

  it("throws for a missing production", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  // KEY INVARIANT: CONTENT_OUTPUT ||--o| PRODUCTION is 0..1 — ensuring twice for
  // the same output is idempotent (UNIQUE content_output_id + onConflictDoNothing).
  it("is idempotent on (content_output_id): a second ensure returns the same row", async () => {
    const first = await repo.ensureProductionForOutput({
      contentOutputId: "output-X",
    });
    const second = await repo.ensureProductionForOutput({
      contentOutputId: "output-X",
    });
    expect(second.id).toBe(first.id);

    const list = await repo.list();
    expect(list.filter((p) => p.contentOutputId === "output-X")).toHaveLength(1);
  });

  it("transitions production status adjacent-only and stamps timestamps", async () => {
    const p = await repo.ensureProductionForOutput({
      contentOutputId: "output-2",
    });
    expect(p.startedAt).toBeNull();

    const recording = await repo.transitionStatus(p.id, "recording");
    expect(recording.status).toBe("recording");
    expect(recording.startedAt).toBe(FIXED_NOW); // stamped on leaving drafting

    await repo.transitionStatus(p.id, "editing");
    await repo.transitionStatus(p.id, "rendering");
    const ready = await repo.transitionStatus(p.id, "ready");
    expect(ready.status).toBe("ready");
    expect(ready.completedAt).toBe(FIXED_NOW);
  });

  it("rejects an illegal (non-adjacent) production status transition", async () => {
    const p = await repo.ensureProductionForOutput({
      contentOutputId: "output-3",
    });
    await expect(repo.transitionStatus(p.id, "ready")).rejects.toThrow(
      /illegal production status transition/,
    );
  });

  it("appends segments at monotonic positions and lists them durably", async () => {
    const p = await repo.ensureProductionForOutput({
      contentOutputId: "output-4",
    });
    const s1 = await repo.addSegment(p.id, { title: "Intro" });
    const s2 = await repo.addSegment(p.id, { title: "Body", startMs: 1000, endMs: 5000 });
    expect(s1.position).toBe(0);
    expect(s2.position).toBe(1);

    const segments = await repo.listSegments(p.id);
    expect(segments.map((s) => s.title)).toEqual(["Intro", "Body"]);
    expect(segments[1]!.startMs).toBe(1000);
    expect(segments[1]!.endMs).toBe(5000);
  });

  it("creates an export and walks its status FSM (queued->rendering->ready)", async () => {
    const p = await repo.ensureProductionForOutput({
      contentOutputId: "output-5",
    });
    const exp = await repo.createExport(p.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
      bitrate: 8000,
    });
    expect(exp.status).toBe("queued");
    expect(exp.resultAssetId).toBeNull();

    await repo.transitionExportStatus(exp.id, "rendering");
    const ready = await repo.transitionExportStatus(exp.id, "ready", {
      resultAssetId: "asset-99",
    });
    expect(ready.status).toBe("ready");
    expect(ready.resultAssetId).toBe("asset-99");
    expect(ready.completedAt).toBe(FIXED_NOW);

    const exports = await repo.listExports(p.id);
    expect(exports).toHaveLength(1);
  });

  it("rejects an illegal export status transition", async () => {
    const p = await repo.ensureProductionForOutput({
      contentOutputId: "output-6",
    });
    const exp = await repo.createExport(p.id, {
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    // queued -> ready skips rendering (non-adjacent)
    await expect(
      repo.transitionExportStatus(exp.id, "ready"),
    ).rejects.toThrow(/illegal export status transition/);
  });

  // OWNERSHIP NEGATIVE CASE: a production owned by user-1 is invisible to user-2
  // and surfaces the same not-found OwnershipError (404 surface).
  it("hides another user's production behind the not-found surface", async () => {
    const owned = await repo.ensureProductionForOutput({
      contentOutputId: "output-owned",
    });

    const otherRepo = createProductionRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.get(owned.id)).rejects.toThrow(/not found/);

    const otherList = await otherRepo.list();
    expect(otherList.map((p) => p.id)).not.toContain(owned.id);

    // user-2 also cannot transition or read segments/exports of user-1's row.
    await expect(
      otherRepo.transitionStatus(owned.id, "recording"),
    ).rejects.toThrow(/not found/);
    await expect(otherRepo.listSegments(owned.id)).rejects.toThrow(/not found/);
  });
});
