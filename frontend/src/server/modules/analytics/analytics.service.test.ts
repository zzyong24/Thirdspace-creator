import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAnalyticsRepository } from "./analytics.repository";
import {
  createAnalyticsService,
  type AnalyticsService,
  type AnalyticsPublishingPort,
} from "./analytics.service";
import { OwnershipError } from "./analytics.errors";

// Task 3 — service (RequestContext; cross-module resolve via Publishing public
// port; no state machine).
//   - getPublicationAnalytics for a publication owned by another user →
//     OwnershipError (resolve rejects), no rows leaked.
//   - getProjectAnalytics resolves project→publication ids via the fake and
//     returns only matching snapshots.
//   - appendSnapshot returns created:false on the second identical call.
//   - getProjectAnalytics with zero resolved publications → { rows:[], total:0 }.

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };

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
      snapshotCount: 0,
    });
  });
});
