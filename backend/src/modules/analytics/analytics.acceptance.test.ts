import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAnalyticsRepository } from "./analytics.repository";
import {
  createAnalyticsService,
  type AnalyticsService,
  type AnalyticsPublishingPort,
} from "./analytics.service";
import { OwnershipError } from "./analytics.errors";
import { ANALYTICS_OP_IDS } from "./analytics.transport";

// Task 7 — SPEC §22 + foundation §5.6 acceptance for the Analytics module.
// Asserts the structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + errors
//     + index + tests);
//   - NO cross-module repository import (Publishing reached only via the injected
//     AnalyticsPublishingPort, satisfied by Publishing's public service);
//   - Idempotency for metrics: re-submission returns the original (created:false),
//     append-only (no update/delete methods exist on the repo surface);
//   - User scope everywhere: a multi-tenant smoke confirms A cannot read B's
//     snapshots through either read path;
//   - DTO boundary: the two ops are registered into the persisted set.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] per-account 域 service 一律要求 ctx.accountId(strict);测试 ctx 统一带号。
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "ra",
  source: "user",
  accountId: "acct-a",
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "rb",
  source: "user",
  accountId: "acct-b",
};

function makeService(
  db: Db,
  publishing: AnalyticsPublishingPort,
  tag = "a",
): AnalyticsService {
  let seq = 0;
  const repo = createAnalyticsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
  });
  return createAnalyticsService({ repo, publishing });
}

// An ownership-honest fake: resolvePublication rejects when the publication id is
// not owned by the ctx; listPublicationIdsByProject is scoped per ctx.
function ownershipAwarePublishing(
  owners: Record<string, string>, // publicationId → ownerUserId
  byProject: Record<string, Record<string, string[]>>, // userId → projectId → ids
): AnalyticsPublishingPort {
  return {
    resolvePublication(ctx, publicationId) {
      if (owners[publicationId] !== ctx.userId) {
        return Promise.reject(
          new OwnershipError(`OwnershipError: publication not found: ${publicationId}`),
        );
      }
      return Promise.resolve();
    },
    listPublicationIdsByProject(ctx, projectId) {
      return Promise.resolve(byProject[ctx.userId]?.[projectId] ?? []);
    },
  };
}

describe("analytics acceptance (SPEC §22)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("has the foundation §5 module layout files", () => {
    for (const f of [
      "analytics.service.ts",
      "analytics.repository.ts",
      "analytics.schema.ts",
      "analytics.errors.ts",
      "analytics.transport.ts",
      "index.ts",
      "analytics.db-schema.ts",
    ]) {
      expect(existsSync(join(HERE, f)), `${f} present`).toBe(true);
    }
  });

  it("imports NO peer module's repository (cross-module access only via the port)", () => {
    for (const f of [
      "analytics.service.ts",
      "analytics.repository.ts",
      "analytics.transport.ts",
    ]) {
      const src = readFileSync(join(HERE, f), "utf8");
      // No import from another module's repository file.
      expect(/from\s+["'][^"']*modules\/(?!analytics)[^"']*\.repository["']/.test(src)).toBe(
        false,
      );
      // No import of the publishing/projects module barrels (the port is injected).
      expect(/from\s+["']@\/server\/modules\/publishing["']/.test(src)).toBe(false);
      expect(/from\s+["']@\/server\/modules\/projects["']/.test(src)).toBe(false);
    }
  });

  it("the repository exposes NO update/delete method (append-only fact store)", () => {
    const src = readFileSync(join(HERE, "analytics.repository.ts"), "utf8");
    // No drizzle update/delete builder calls in the repo.
    expect(/\bdb\.update\(/.test(src)).toBe(false);
    expect(/\bdb\.delete\(/.test(src)).toBe(false);
  });

  it("is idempotent for metrics: re-submission returns the original (created:false)", async () => {
    const publishing = ownershipAwarePublishing({ "pub-1": "user-a" }, {});
    const service = makeService(db, publishing);
    const input = {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [
        { metricKey: "views", numericValue: 100, unit: "count", dimensions: {} },
      ],
    };
    const first = await service.appendSnapshot(ctxA, input);
    const second = await service.appendSnapshot(ctxA, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.snapshot.id).toBe(first.snapshot.id);
    const list = await service.getPublicationAnalytics(ctxA, "pub-1", 1, 20);
    expect(list.total).toBe(1);
  });

  it("user scope: A cannot read B's snapshots through either op", async () => {
    const publishing = ownershipAwarePublishing(
      { "pub-1": "user-b" },
      { "user-a": { "project-x": ["pub-1"] }, "user-b": { "project-x": ["pub-1"] } },
    );
    const serviceA = makeService(db, publishing, "a");
    const serviceB = makeService(db, publishing, "b");
    // B appends a snapshot for pub-1 (owned by B).
    await serviceB.appendSnapshot(ctxB, {
      publicationId: "pub-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      values: [],
    });
    // A cannot read pub-1 via the publication op (resolve throws OwnershipError).
    await expect(
      serviceA.getPublicationAnalytics(ctxA, "pub-1", 1, 20),
    ).rejects.toBeInstanceOf(OwnershipError);
    // A's project op resolves pub-1 (by-project fake returns it) but the metric
    // store is user-scoped → A sees zero of B's rows.
    const projA = await serviceA.getProjectAnalytics(ctxA, "project-x", 1, 20);
    expect(projA.total).toBe(0);
  });

  it("registers the two owned ops into the module op-id list", () => {
    expect([...ANALYTICS_OP_IDS].sort()).toEqual([
      "analytics.projects.get",
      "analytics.publications.get",
    ]);
  });
});
