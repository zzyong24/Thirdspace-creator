import { describe, it, expect } from "vitest";
import {
  metricSnapshotResource,
  audienceSnapshotResource,
} from "../../src/resources/analytics";
import { analyticsOperations } from "../../src/operations/analytics";

describe("analytics contract", () => {
  it("parses a MetricSnapshot resource", () => {
    const ms = metricSnapshotResource.parse({
      id: "ms-podcast-bilibili-1",
      publicationId: "pub-podcast-bilibili",
      ingestionRunId: "run-1",
      capturedAt: "2026-06-12T02:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      createdAt: "2026-06-12T02:00:00.000Z",
    });
    expect(ms.source).toBe("platform_api");
    expect(ms.ingestionRunId).toBe("run-1");
  });

  it("parses an AudienceSnapshot resource", () => {
    const aud = audienceSnapshotResource.parse({
      id: "aud-age-1",
      publicationId: "pub-podcast-bilibili",
      capturedAt: "2026-06-12T02:00:00.000Z",
      dimensionType: "age",
      dimensionValue: "18-24",
      percentage: 0.22,
      audienceCount: 4052,
    });
    expect(aud.dimensionType).toBe("age");
  });

  it("registers the publication + project analytics endpoints", () => {
    expect(analyticsOperations.getPublicationAnalytics.method).toBe("GET");
    expect(analyticsOperations.getPublicationAnalytics.path).toBe(
      "/analytics/publications/:publicationId",
    );
    expect(analyticsOperations.getProjectAnalytics.method).toBe("GET");
    expect(analyticsOperations.getProjectAnalytics.path).toBe(
      "/analytics/projects/:projectId",
    );
    expect(
      analyticsOperations.getPublicationAnalytics.fr.length,
    ).toBeGreaterThan(0);
  });
});
