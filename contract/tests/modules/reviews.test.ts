import { describe, it, expect } from "vitest";
import { reviewResource } from "../../src/resources/reviews";
import { reviewsOperations } from "../../src/operations/reviews";

describe("reviews contract", () => {
  it("parses a Review resource", () => {
    const r = reviewResource.parse({
      id: "review-podcast-ep01",
      projectId: "project-podcast-launch",
      contentOutputId: "output-podcast-ep01",
      reportArtifactId: "artifact-podcast-review-report",
      reviewType: "output",
      status: "completed",
      periodStart: "2026-04-15T00:00:00.000Z",
      periodEnd: "2026-05-15T00:00:00.000Z",
      createdAt: "2026-05-10T02:00:00.000Z",
      completedAt: "2026-04-28T02:00:00.000Z",
    });
    expect(r.reviewType).toBe("output");
    expect(r.status).toBe("completed");
  });

  it("rejects an unknown review status", () => {
    expect(() =>
      reviewResource.parse({
        id: "r",
        projectId: "p",
        contentOutputId: null,
        reportArtifactId: null,
        reviewType: "project",
        status: "draft", // not a ReviewStatus member
        periodStart: "2026-04-15T00:00:00.000Z",
        periodEnd: "2026-05-15T00:00:00.000Z",
        createdAt: "2026-05-10T02:00:00.000Z",
        completedAt: null,
      }),
    ).toThrow();
  });

  it("registers the create + complete endpoints with FR ids", () => {
    expect(reviewsOperations.createReview.method).toBe("POST");
    expect(reviewsOperations.createReview.path).toBe(
      "/projects/:projectId/reviews",
    );
    expect(reviewsOperations.completeReview.method).toBe("POST");
    expect(reviewsOperations.completeReview.path).toBe(
      "/reviews/:reviewId/complete",
    );
    expect(reviewsOperations.createReview.fr.length).toBeGreaterThan(0);
  });
});
