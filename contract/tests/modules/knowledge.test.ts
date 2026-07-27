import { describe, it, expect } from "vitest";
import { knowledgeItemResource } from "../../src/resources/knowledge";
import { knowledgeOperations } from "../../src/operations/knowledge";

describe("knowledge contract", () => {
  it("parses a KnowledgeItem resource", () => {
    const k = knowledgeItemResource.parse({
      id: "knowledge-arc-dia-research",
      userId: "user-zyongzhu",
      currentRevisionId: "krevision-arc-dia-research",
      folderId: null,
      assetId: null,
      knowledgeType: "reference",
      title: "Arc / Dia 用户调研",
      sourceType: "manual",
      sourceUrl: null,
      sourceMetadata: { sampleSize: 120 },
      status: "active",
      archivedAt: null,
      sourceNote: null,
      usedCount: 0,
      usedInPublished: false,
      createdAt: "2026-05-30T02:00:00.000Z",
      updatedAt: "2026-05-30T02:00:00.000Z",
    });
    expect(k.knowledgeType).toBe("reference");
    expect(k.sourceType).toBe("manual");
  });

  // [T-079a] 四原子类型 + 出处 + 战绩投影(SPEC 2026-07-03 §1,additive)。
  it("parses the four atom types (claim/evidence/quote/qa) with sourceNote + 战绩", () => {
    for (const knowledgeType of ["claim", "evidence", "quote", "qa"] as const) {
      const k = knowledgeItemResource.parse({
        id: "knowledge-atom",
        userId: "u",
        currentRevisionId: "r",
        folderId: null,
        assetId: null,
        knowledgeType,
        title: "时区、UA、TLS 指纹任何两项一致就会被标记",
        sourceType: "ai",
        sourceUrl: null,
        sourceMetadata: {},
        status: "active",
        archivedAt: null,
        sourceNote: "Reddit r/ClaudeAI 用户 @sysadmthrowaway 原帖,需核实",
        usedCount: 3,
        usedInPublished: true,
        createdAt: "2026-07-03T02:00:00.000Z",
        updatedAt: "2026-07-03T02:00:00.000Z",
      });
      expect(k.knowledgeType).toBe(knowledgeType);
      expect(k.sourceNote).toContain("需核实");
      expect(k.usedCount).toBe(3);
      expect(k.usedInPublished).toBe(true);
    }
  });

  it("usedCount must be an int; usedInPublished a boolean", () => {
    const base = {
      id: "k",
      userId: "u",
      currentRevisionId: "r",
      folderId: null,
      assetId: null,
      knowledgeType: "claim",
      title: "t",
      sourceType: "manual",
      sourceUrl: null,
      sourceMetadata: {},
      status: "active",
      archivedAt: null,
      sourceNote: null,
      createdAt: "2026-07-03T02:00:00.000Z",
      updatedAt: "2026-07-03T02:00:00.000Z",
    };
    expect(() =>
      knowledgeItemResource.parse({ ...base, usedCount: 1.5, usedInPublished: false }),
    ).toThrow();
    expect(() =>
      knowledgeItemResource.parse({ ...base, usedCount: 1, usedInPublished: "yes" }),
    ).toThrow();
  });

  // [T-079a] create body:枚举与 resource 同步 + 可选 sourceNote。
  it("create body accepts the atom types and an optional sourceNote", () => {
    const body = knowledgeOperations.createKnowledge.body!.parse({
      title: "92% 的开发者在工作中会用到 AI 编码工具",
      knowledgeType: "evidence",
      sourceNote: "Stack Overflow Developer Survey 2024",
    });
    expect(body.knowledgeType).toBe("evidence");
    expect(body.sourceNote).toBe("Stack Overflow Developer Survey 2024");
    expect(body.content).toBe("");

    // sourceNote 可缺省;knowledgeType 仍默认 note(旧行为不破坏)。
    const legacy = knowledgeOperations.createKnowledge.body!.parse({ title: "t" });
    expect(legacy.knowledgeType).toBe("note");
    expect(legacy.sourceNote).toBeUndefined();

    expect(() =>
      knowledgeOperations.createKnowledge.body!.parse({
        title: "t",
        knowledgeType: "bogus",
      }),
    ).toThrow();
  });

  it("rejects an unknown knowledgeType", () => {
    expect(() =>
      knowledgeItemResource.parse({
        id: "k",
        userId: "u",
        currentRevisionId: "r",
        folderId: null,
        assetId: null,
        knowledgeType: "bogus", // not a KnowledgeType member
        title: "t",
        sourceType: "manual",
        sourceUrl: null,
        sourceMetadata: {},
        status: "active",
        archivedAt: null,
        sourceNote: null,
        usedCount: 0,
        usedInPublished: false,
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
