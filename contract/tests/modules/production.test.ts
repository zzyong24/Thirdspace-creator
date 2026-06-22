import { describe, it, expect } from "vitest";
import { productionResource } from "../../src/resources/production";
import { productionOperations } from "../../src/operations/production";

describe("production contract", () => {
  it("parses a Production resource", () => {
    const p = productionResource.parse({
      id: "production-ainativebrowser-main",
      contentOutputId: "output-ainativebrowser-main",
      productionMode: "studio",
      status: "drafting",
      recordingConfig: { resolution: "1080p", fps: 30 },
      subtitleConfig: { language: "zh-CN" },
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(p.productionMode).toBe("studio");
    expect(p.status).toBe("drafting");
  });

  it("rejects an unknown production status", () => {
    expect(() =>
      productionResource.parse({
        id: "p",
        contentOutputId: "o",
        productionMode: "studio",
        status: "published", // not a ProductionStatus member
        recordingConfig: {},
        subtitleConfig: {},
        startedAt: null,
        completedAt: null,
        updatedAt: "2026-06-13T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the production get + segment-create endpoints with FR ids", () => {
    expect(productionOperations.getOutputProduction.method).toBe("GET");
    expect(productionOperations.getOutputProduction.path).toBe(
      "/outputs/:outputId/production",
    );
    expect(productionOperations.createProductionSegment.method).toBe("POST");
    expect(productionOperations.createProductionSegment.path).toBe(
      "/productions/:productionId/segments",
    );
    expect(
      productionOperations.getOutputProduction.fr.length,
    ).toBeGreaterThan(0);
  });
});
