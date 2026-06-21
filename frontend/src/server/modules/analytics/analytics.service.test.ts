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
});
