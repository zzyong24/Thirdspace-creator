import { describe, it, expect } from "vitest";
import {
  knowledgeClassifySchema,
  KNOWLEDGE_CLASSIFY_TEMPLATE,
} from "./knowledge-classify";
import { bindPrompt, PromptBindError } from "../template";
import { getTemplate, hasOutputSchema, _resetRegistry } from "../registry";

// T-062c 知识倾倒场:knowledge.classify 模板 + 输出 schema 契约锁。
// runner(frontend knowledge-classify-runner)绑 runStructuredNode 消费这份 schema;
// 前端确认门卡片依赖四字段形状(knowledgeType/title/tags/summary)。

describe("knowledgeClassifySchema(输出契约)", () => {
  it("完整输出照单全收(五枚举 knowledgeType)", () => {
    const parsed = knowledgeClassifySchema.parse({
      knowledgeType: "snippet",
      title: "前 3 秒放结论的 Hook 模板",
      tags: ["Hook", "开头"],
      summary: "一句可复用的开头钩子。",
    });
    expect(parsed.knowledgeType).toBe("snippet");
    expect(parsed.tags).toEqual(["Hook", "开头"]);
  });

  it("缺字段走默认(跨模型健壮:老 provider 落空字段也过校验)", () => {
    const parsed = knowledgeClassifySchema.parse({});
    expect(parsed.knowledgeType).toBe("note");
    expect(parsed.title).toBe("");
    expect(parsed.tags).toEqual([]);
    expect(parsed.summary).toBe("");
  });

  it("knowledgeType 枚举外的值被拒(不静默吞非法类型)", () => {
    expect(() =>
      knowledgeClassifySchema.parse({ knowledgeType: "article" }),
    ).toThrow();
  });
});

describe("KNOWLEDGE_CLASSIFY_TEMPLATE(模板本体)", () => {
  it("id/version/必需 facet 齐(content 必需)", () => {
    expect(KNOWLEDGE_CLASSIFY_TEMPLATE.id).toBe("knowledge.classify");
    expect(KNOWLEDGE_CLASSIFY_TEMPLATE.requiredFacets).toEqual(["content"]);
    expect(KNOWLEDGE_CLASSIFY_TEMPLATE.outputSchema).toBe(
      knowledgeClassifySchema,
    );
  });

  it("prompt 嵌五枚举值 + 约束(≤5 标签/一句摘要)", () => {
    const t = KNOWLEDGE_CLASSIFY_TEMPLATE.template;
    for (const v of ["note", "reference", "inspiration", "snippet", "transcript"]) {
      expect(t).toContain(v);
    }
    expect(t).toContain("≤5");
    expect(t).toContain("摘要");
  });

  it("bindPrompt 注入 content;缺 content 抛 PromptBindError(不喂空上下文)", () => {
    const bound = bindPrompt(KNOWLEDGE_CLASSIFY_TEMPLATE, {
      content: "这是一段用户倒入的原文",
    });
    expect(bound.prompt).toContain("这是一段用户倒入的原文");
    expect(() => bindPrompt(KNOWLEDGE_CLASSIFY_TEMPLATE, {})).toThrow(
      PromptBindError,
    );
  });
});

describe("registry 注册(runner 运行时 getTemplate 取)", () => {
  it("registerAllTemplates 后 knowledge.classify 可取且带 outputSchema", () => {
    _resetRegistry(); // 空表 → getTemplate 惰性 bootstrap 全量注册
    const tpl = getTemplate("knowledge.classify");
    expect(tpl.id).toBe("knowledge.classify");
    expect(hasOutputSchema("knowledge.classify")).toBe(true);
  });
});
