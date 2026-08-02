import { describe, it, expect } from "vitest";
import {
  knowledgeDistillSchema,
  knowledgeAtomSchema,
  KNOWLEDGE_DISTILL_TEMPLATE,
} from "./knowledge-distill";
import { bindPrompt, PromptBindError } from "../template";
import { getTemplate, hasOutputSchema, _resetRegistry } from "../registry";

// T-079b 知识蒸馏:knowledge.distill 模板 + 输出 schema 契约锁。
// runner(frontend knowledge-distill-runner)绑 runStructuredNode 消费这份 schema;
// 前端蒸馏批量确认门依赖 atoms[]{type,title,note,sourceNote} + suggestedTags 形状。

describe("knowledgeDistillSchema(输出契约)", () => {
  it("完整输出照单全收(四原子枚举 type)", () => {
    const parsed = knowledgeDistillSchema.parse({
      atoms: [
        {
          type: "quote",
          title: "上下文工程是新的提示词工程",
          note: "谈 Agent 设计时的核心论断",
          sourceNote: "Anthropic 官方博客,可信",
        },
        { type: "evidence", title: "实测截断 8000 字符后归类准确率不降" },
      ],
      suggestedTags: ["上下文工程", "Agent"],
    });
    expect(parsed.atoms).toHaveLength(2);
    expect(parsed.atoms[0]!.type).toBe("quote");
    // 缺省字段走默认(note/sourceNote 可空)
    expect(parsed.atoms[1]!.note).toBe("");
    expect(parsed.atoms[1]!.sourceNote).toBe("");
    expect(parsed.suggestedTags).toEqual(["上下文工程", "Agent"]);
  });

  it("缺字段走默认(跨模型健壮:老 provider 落空字段也过校验)", () => {
    const parsed = knowledgeDistillSchema.parse({
      atoms: [{ title: "可独立引用的知识" }],
    });
    expect(parsed.atoms[0]).toEqual({
      type: "claim",
      title: "可独立引用的知识",
      note: "",
      sourceNote: "",
    });
    expect(parsed.suggestedTags).toEqual([]);
    const atom = knowledgeAtomSchema.parse({});
    expect(atom.type).toBe("claim");
    expect(atom.title).toBe("");
  });

  it("type 枚举外的值被拒(不静默吞非法类型)", () => {
    expect(() =>
      knowledgeDistillSchema.parse({
        atoms: [{ type: "note", title: "旧枚举不属于四原子" }],
      }),
    ).toThrow();
  });
});

describe("KNOWLEDGE_DISTILL_TEMPLATE(模板本体)", () => {
  it("id/version/必需 facet 齐(content 必需)", () => {
    expect(KNOWLEDGE_DISTILL_TEMPLATE.id).toBe("knowledge.distill");
    expect(KNOWLEDGE_DISTILL_TEMPLATE.requiredFacets).toEqual(["content"]);
    expect(KNOWLEDGE_DISTILL_TEMPLATE.outputSchema).toBe(
      knowledgeDistillSchema,
    );
  });

  it("prompt 嵌四原子枚举值 + 硬约束(独立引用/逐字保真/同义合并/3~12 个/1~3 主题词)", () => {
    const t = KNOWLEDGE_DISTILL_TEMPLATE.template;
    for (const v of ["claim", "evidence", "quote", "qa"]) {
      expect(t).toContain(v);
    }
    expect(t).toContain("可独立引用");
    expect(t).toContain("逐字保真");
    expect(t).toContain("同义合并");
    expect(t).toContain("3~12");
    expect(t).toContain("1~3 个主题词");
    expect(t).toContain("≤80 字");
  });

  it("bindPrompt 注入 content;缺 content 抛 PromptBindError(不喂空上下文)", () => {
    const bound = bindPrompt(KNOWLEDGE_DISTILL_TEMPLATE, {
      content: "这是一段要蒸馏的原文",
    });
    expect(bound.prompt).toContain("这是一段要蒸馏的原文");
    expect(() => bindPrompt(KNOWLEDGE_DISTILL_TEMPLATE, {})).toThrow(
      PromptBindError,
    );
  });
});

describe("registry 注册(runner 运行时 getTemplate 取)", () => {
  it("registerAllTemplates 后 knowledge.distill 可取且带 outputSchema", () => {
    _resetRegistry(); // 空表 → getTemplate 惰性 bootstrap 全量注册
    const tpl = getTemplate("knowledge.distill");
    expect(tpl.id).toBe("knowledge.distill");
    expect(hasOutputSchema("knowledge.distill")).toBe(true);
  });
});
