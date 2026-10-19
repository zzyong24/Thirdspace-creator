import {projects as originalProjects} from "../../schema/projects";
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createReviewsService,
  type ReviewsService,
  type ReviewsProjectsPort,
  type ReviewsPublishingPort,
  type ReviewsAnalyticsPort,
} from "./reviews.service";
import { OwnershipError } from "./reviews.errors";
import { REVIEWS_OP_IDS } from "./reviews.transport";

// SPEC §22 + foundation §5.6 acceptance for the Reviews module (plan Step 6).
// Asserts the structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + errors
//     + transport + index + db-schema + the test trio);
//   - NO cross-module repository import (Projects/Publishing/Analytics reached only
//     via injected ports, satisfied at the composition root by public services);
//   - every repository query is user-scoped (a multi-tenant smoke: A cannot read
//     B's review);
//   - reviews.complete is idempotent (no re-stamp on a second call);
//   - the DTO is built by an explicit mapper, never the Drizzle row (the schema
//     mapper drops user_id — assert it never leaks);
//   - the four owned ops are registered;
//   - the G14/G15 bridge read (listCompletedReviewInsights) is on the public service.

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] strict 门下 ctx 必带号。
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user", accountId: "acct-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user", accountId: "acct-b" };

const noopProjects: ReviewsProjectsPort = {
  verifyProjectOwned: async () => {},
  verifyOutputOwned: async () => {},
  recordActivity: async () => {},
};
const emptyPublishing: ReviewsPublishingPort = {
  listProjectPublications: async () => [],
};
const emptyAnalytics: ReviewsAnalyticsPort = {
  getProjectSnapshots: async () => ({}),
};

function makeService(db: Db, tag = "a"): ReviewsService {
  let seq = 0;
  return createReviewsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects: noopProjects,
    publishing: emptyPublishing,
    analytics: emptyAnalytics,
  });
}

describe("reviews acceptance (SPEC §22)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("has the foundation §5 module layout files", () => {
    for (const f of [
      "reviews.service.ts",
      "reviews.repository.ts",
      "reviews.schema.ts",
      "reviews.errors.ts",
      "reviews.transport.ts",
      "index.ts",
      "reviews.db-schema.ts",
      "reviews.service.test.ts",
      "reviews.repository.integration.test.ts",
      "reviews.contract.test.ts",
    ]) {
      expect(existsSync(join(HERE, f)), `${f} present`).toBe(true);
    }
  });

  it("imports NO peer module's repository (cross-module access only via injected ports)", () => {
    for (const f of [
      "reviews.service.ts",
      "reviews.repository.ts",
      "reviews.transport.ts",
    ]) {
      const src = readFileSync(join(HERE, f), "utf8");
      expect(
        /from\s+["'][^"']*modules\/(?!reviews)[^"']*\.repository["']/.test(src),
      ).toBe(false);
      expect(/from\s+["']@\/server\/modules\/publishing["']/.test(src)).toBe(false);
      expect(/from\s+["']@\/server\/modules\/projects["']/.test(src)).toBe(false);
      expect(/from\s+["']@\/server\/modules\/analytics["']/.test(src)).toBe(false);
    }
  });

  it("user scope: A cannot read B's review (OwnershipError → 404)", async () => {
    const serviceB = makeService(db, "b");
    await seedOriginalProject(db,ctxB,"project-1",NOW);
    const review = await serviceB.createReview(ctxB, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    const serviceA = makeService(db, "a");
    await expect(serviceA.getReview(ctxA, review.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("reviews.complete is idempotent (no re-stamp on the second call)", async () => {
    const service = makeService(db);
    await seedOriginalProject(db,ctxA,"project-1",NOW);
    const review = await service.createReview(ctxA, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    const first = await service.completeReview(ctxA, review.id);
    const second = await service.completeReview(ctxA, review.id);
    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("the DTO mapper never leaks user_id (built explicitly, not the Drizzle row)", async () => {
    const service = makeService(db);
    await seedOriginalProject(db,ctxA,"project-1",NOW);
    const review = await service.createReview(ctxA, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    expect(Object.keys(review)).not.toContain("userId");
    const insight = await service.createInsight(ctxA, review.id, {
      insightType: "success",
      title: "x",
    });
    expect(Object.keys(insight)).not.toContain("userId");
  });

  it("exposes the G14/G15 bridge read on the public service", async () => {
    const service = makeService(db);
    expect(typeof service.listCompletedReviewInsights).toBe("function");
  });

  it("registers the six owned ops into the module op-id list", () => {
    expect([...REVIEWS_OP_IDS].sort()).toEqual([
      "reviews.complete",
      "reviews.create",
      "reviews.get",
      "reviews.insights.create",
      "reviews.insights.list",
      // [T-053 断点③] 复盘记录列表读 op(复盘页「复盘记录」区)。
      "reviews.list",
    ]);
  });
});

async function seedOriginalProject(db:Db,owner:RequestContext,id:string,stamp:string){
 await db.insert(originalProjects).values({id,userId:owner.userId,accountId:owner.accountId??null,groupId:owner.groupId??null,title:'原用例真实父项目',creationMode:'free',status:'active',currentStage:'review',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
}
