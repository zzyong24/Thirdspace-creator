import { describe, it, expect } from "vitest";
import {
  knowledgeRelateSchema,
  knowledgeRelateCandidateSchema,
  KNOWLEDGE_RELATE_TEMPLATE,
} from "./knowledge-relate";
import { bindPrompt } from "../template";
import { getTemplate, hasOutputSchema, _resetRegistry } from "../registry";

// T-091 图谱 AI 建边:knowledge.relate 模板 + 输出 schema 契约锁。
// runner(frontend knowledge-relate-runner)绑 runStructuredNode 消费这份 schema;
// 前端确认门依赖 candidates[]{sourceId,targetId,relationType,reason} 形状。

describe("knowledgeRelateSchema(输出契约)", () => {
  it("完整输出照单全收(relationType 四枚举)", () => {
    const parsed = knowledgeRelateSchema.parse({
      candidates: [
        {
          sourceId: "knowledge-1",
          targetId: "knowledge-2",
          relationType: "supports",
          reason: "实测数据支撑该观点的核心论断",
        },
        {
          sourceId: "knowledge-3",
          targetId: "knowledge-1",
          relationType: "extends",
          reason: "在原观点基础上细化到 Agent 场景",
        },
      ],
    });
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]!.relationType).toBe("supports");
  });

  it("缺字段走默认(空候选诚实空数组;老 provider 落空也过校验)", () => {
    const parsed = knowledgeRelateSchema.parse({});
    expect(parsed.candidates).toEqual([]);
    const c = knowledgeRelateCandidateSchema.parse({});
    expect(c.relationType).toBe("references");
    expect(c.sourceId).toBe("");
    expect(c.reason).toBe("");
  });

  it("relationType 枚举外的值被拒", () => {
    expect(() =>
      knowledgeRelateSchema.parse({
        candidates: [
          {
            sourceId: "a",
            targetId: "b",
            relationType: "similar",
            reason: "x",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("KNOWLEDGE_RELATE_TEMPLATE(模板本体)", () => {
  it("id/version/必需 facet 齐(atoms 必需),outputSchema 挂载", () => {
    expect(KNOWLEDGE_RELATE_TEMPLATE.id).toBe("knowledge.relate");
    expect(KNOWLEDGE_RELATE_TEMPLATE.requiredFacets).toEqual(["atoms"]);
    expect(KNOWLEDGE_RELATE_TEMPLATE.outputSchema).toBe(knowledgeRelateSchema);
  });

  it("bindPrompt 注入 atoms facet", () => {
    const bound = bindPrompt(KNOWLEDGE_RELATE_TEMPLATE, {
      atoms: "[knowledge-1] (claim) 上下文工程是新的提示词工程 — Anthropic 博客",
    });
    expect(bound.prompt).toContain("[knowledge-1] (claim)");
    expect(bound.system).toContain("知识图谱");
  });

  it("registry 注册且带输出契约(惰性 bootstrap)", () => {
    _resetRegistry();
    const tpl = getTemplate("knowledge.relate");
    expect(tpl.id).toBe("knowledge.relate");
    expect(hasOutputSchema("knowledge.relate")).toBe(true);
  });
});
