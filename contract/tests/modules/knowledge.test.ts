import { describe, it, expect } from "vitest";
import { knowledgeItemResource } from "../../src/resources/knowledge";
import { knowledgeOperations } from "../../src/operations/knowledge";

describe("knowledge contract", () => {
  it("parses a KnowledgeItem resource", () => {
    const k = knowledgeItemResource.parse({
      id: "knowledge-arc-dia-research",
      userId: "user-zyongzhu",
      currentRevisionId: "krevision-arc-dia-research",
      knowledgeType: "reference",
      title: "Arc / Dia 用户调研",
      sourceType: "manual",
      sourceUrl: null,
      sourceMetadata: { sampleSize: 120 },
      status: "active",
      archivedAt: null,
      createdAt: "2026-05-30T02:00:00.000Z",
      updatedAt: "2026-05-30T02:00:00.000Z",
    });
    expect(k.knowledgeType).toBe("reference");
    expect(k.sourceType).toBe("manual");
  });

  it("rejects an unknown knowledgeType", () => {
    expect(() =>
      knowledgeItemResource.parse({
        id: "k",
        userId: "u",
        currentRevisionId: "r",
        knowledgeType: "bogus", // not a KnowledgeType member
        title: "t",
        sourceType: "manual",
        sourceUrl: null,
        sourceMetadata: {},
        status: "active",
        archivedAt: null,
        createdAt: "2026-05-30T02:00:00.000Z",
        updatedAt: "2026-05-30T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the knowledge list + relations endpoints with FR ids", () => {
    expect(knowledgeOperations.listKnowledge.method).toBe("GET");
    expect(knowledgeOperations.listKnowledge.path).toBe("/knowledge");
    expect(knowledgeOperations.listKnowledge.isList).toBe(true);
    expect(knowledgeOperations.createKnowledgeRelation.method).toBe("POST");
    expect(knowledgeOperations.createKnowledgeRelation.path).toBe(
      "/knowledge/:knowledgeId/relations",
    );
    expect(knowledgeOperations.listKnowledge.fr.length).toBeGreaterThan(0);
  });

  it("registers the soft-delete archive endpoint (status→archived)", () => {
    expect(knowledgeOperations.archiveKnowledge.id).toBe("knowledge.archive");
    expect(knowledgeOperations.archiveKnowledge.method).toBe("POST");
    expect(knowledgeOperations.archiveKnowledge.path).toBe(
      "/knowledge/:knowledgeId/archive",
    );
    // Returns the updated KnowledgeItem (mirrors assets.trash's shape).
    expect(knowledgeOperations.archiveKnowledge.response).toBe(
      knowledgeItemResource,
    );
    expect(knowledgeOperations.archiveKnowledge.fr.length).toBeGreaterThan(0);
  });

  it("registers the relations.delete endpoint with target+relationType body", () => {
    expect(knowledgeOperations.removeKnowledgeRelation.id).toBe(
      "knowledge.relations.delete",
    );
    expect(knowledgeOperations.removeKnowledgeRelation.method).toBe("POST");
    expect(knowledgeOperations.removeKnowledgeRelation.path).toBe(
      "/knowledge/:knowledgeId/relations/remove",
    );
    const body = knowledgeOperations.removeKnowledgeRelation.body!.parse({
      targetKnowledgeId: "knowledge-b",
      relationType: "supports",
    });
    expect(body.targetKnowledgeId).toBe("knowledge-b");
    expect(body.relationType).toBe("supports");
  });
});
