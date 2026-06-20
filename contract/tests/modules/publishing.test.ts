import { describe, it, expect } from "vitest";
import { publicationResource } from "../../src/resources/publishing.js";
import { publishingOperations } from "../../src/operations/publishing.js";

describe("publishing contract", () => {
  it("parses a Publication resource", () => {
    const p = publicationResource.parse({
      id: "pub-podcast-bilibili",
      contentOutputId: "output-podcast-ep01",
      platform: "bilibili",
      accountReference: "Creator 主账号",
      status: "published",
      currentRevisionId: "prev-podcast-bilibili",
      externalId: "BV1xx411c7xx",
      externalUrl: "https://www.bilibili.com/video/BV1xx411c7xx",
      scheduledAt: null,
      publishedAt: "2026-04-15T02:00:00.000Z",
      removedAt: null,
      createdAt: "2026-04-02T02:00:00.000Z",
      updatedAt: "2026-04-15T02:00:00.000Z",
    });
    expect(p.platform).toBe("bilibili");
    expect(p.status).toBe("published");
  });

  it("registers the publication list + transition endpoints with FR ids", () => {
    expect(publishingOperations.listPublications.method).toBe("GET");
    expect(publishingOperations.listPublications.path).toBe(
      "/outputs/:outputId/publications",
    );
    expect(publishingOperations.listPublications.isList).toBe(true);
    expect(publishingOperations.transitionPublication.method).toBe("POST");
    expect(publishingOperations.transitionPublication.path).toBe(
      "/publications/:publicationId/transition",
    );
    expect(publishingOperations.listPublications.fr.length).toBeGreaterThan(0);
  });
});
