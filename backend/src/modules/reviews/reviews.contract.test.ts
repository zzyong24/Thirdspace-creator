import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createReviewsService } from "./reviews.service";
import { createReviewsTransport } from "./reviews.transport";

// Loose endpoint stub — the transport only reads endpoint.id (mirrors the
// publishing/analytics contract tests). The typed ENDPOINTS.<op>.response is still
// used for the DTO parse assertion.
const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  ctx?: RequestContext,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, ctx);
  return res as { data: unknown };
}

// Reviews contract test (Step 4) — for EACH of the four op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape).
// Mirrors analytics/publishing contract tests.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeTransport(db: Db) {
  let seq = 0;
  const service = createReviewsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects: {
      verifyProjectOwned: async () => {},
      verifyOutputOwned: async () => {},
      recordActivity: async () => {},
    },
    publishing: {
      listProjectPublications: async () => [
        { contentOutputId: "out-1", publishedAt: "2026-06-10T00:00:00.000Z" },
      ],
    },
    analytics: {
      getProjectSnapshots: async () => ({ source: "analytics", value: 1 }),
    },
  });
  return createReviewsTransport(() => service);
}

describe("reviews contract (each op validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("reviews.create → reviewResource (in_progress, completedAt null)", async () => {
    const transport = makeTransport(db);
    const env = await call(transport, "reviews.create", {
      params: { projectId: "project-1" },
      body: { reviewType: "project", contentOutputId: null },
    }, ctx);
    const parsed = ENDPOINTS.createReview.response.parse(env.data);
    expect(parsed.status).toBe("in_progress");
    expect(parsed.completedAt).toBeNull();
  });

  it("reviews.get → reviewResource", async () => {
    const transport = makeTransport(db);
    const created = await call(transport, "reviews.create", {
      params: { projectId: "project-1" },
      body: { reviewType: "project", contentOutputId: null },
    }, ctx);
    const id = (created.data as { id: string }).id;
    const env = await call(transport, "reviews.get", {
      params: { reviewId: id },
    }, ctx);
    const parsed = ENDPOINTS.getReview.response.parse(env.data);
    expect(parsed.id).toBe(id);
  });

  it("reviews.insights.create → reviewInsightResource (evidence object, priority int)", async () => {
    const transport = makeTransport(db);
    const created = await call(transport, "reviews.create", {
      params: { projectId: "project-1" },
      body: { reviewType: "project", contentOutputId: null },
    }, ctx);
    const id = (created.data as { id: string }).id;
    const env = await call(transport, "reviews.insights.create", {
      params: { reviewId: id },
      body: { insightType: "success", title: "保留率提升", description: "" },
    }, ctx);
    const parsed = ENDPOINTS.createReviewInsight.response.parse(env.data);
    expect(typeof parsed.evidence).toBe("object");
    expect(Number.isInteger(parsed.priority)).toBe(true);
  });

  it("reviews.complete → reviewResource (completed, non-null completedAt)", async () => {
    const transport = makeTransport(db);
    const created = await call(transport, "reviews.create", {
      params: { projectId: "project-1" },
      body: { reviewType: "project", contentOutputId: null },
    }, ctx);
    const id = (created.data as { id: string }).id;
    const env = await call(transport, "reviews.complete", {
      params: { reviewId: id },
    }, ctx);
    const parsed = ENDPOINTS.completeReview.response.parse(env.data);
    expect(parsed.status).toBe("completed");
    expect(parsed.completedAt).not.toBeNull();
  });

  it("no ctx → AuthenticationError", async () => {
    const transport = makeTransport(db);
    await expect(
      call(transport, "reviews.get", { params: { reviewId: "review-1" } }),
    ).rejects.toThrow();
  });
});
