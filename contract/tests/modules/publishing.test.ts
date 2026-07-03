import { describe, it, expect } from "vitest";
import { publicationResource } from "../../src/resources/publishing";
import { publishingOperations } from "../../src/operations/publishing";

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
    // [T-073] hiddenAt:存量 payload 不带该键 → default(null)(可见);带值可 parse。
    expect(p.hiddenAt).toBeNull();
  });

  it("parses hiddenAt when supplied ([T-073] 平台侧已隐藏承载位)", () => {
    const p = publicationResource.parse({
      id: "pub-x",
      contentOutputId: "output-x",
      platform: "douyin",
      accountReference: "acc",
      status: "published",
      currentRevisionId: "rev-x",
      externalId: "7423000000000000001",
      externalUrl: null,
      scheduledAt: null,
      publishedAt: "2026-04-15T02:00:00.000Z",
      removedAt: null,
      hiddenAt: "2026-07-01T02:00:00.000Z",
      createdAt: "2026-04-02T02:00:00.000Z",
      updatedAt: "2026-07-01T02:00:00.000Z",
    });
    expect(p.hiddenAt).toBe("2026-07-01T02:00:00.000Z");
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

  it("registers the 登记已发布 endpoint ([T-055h③/T-063c] register-published)", () => {
    const op = publishingOperations.registerPublishedPublication;
    expect(op.method).toBe("POST");
    expect(op.path).toBe("/outputs/:outputId/publications/register");
    expect(op.id).toBe("outputs.publications.register");
    // body:platform + externalId 必填;externalUrl/publishedAt/title 可选。
    expect(() =>
      op.body!.parse({ platform: "douyin", externalId: "7423000000000000000" }),
    ).not.toThrow();
    expect(() => op.body!.parse({ platform: "douyin" })).toThrow();
    expect(op.fr).toContain("FR-PUBLISHING-REGISTER-PUBLISHED");
  });
});
