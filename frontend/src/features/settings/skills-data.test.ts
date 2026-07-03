/**
 * skills-data 纯函数测试(T-077a):分组 / 「已定制」判定(T-040 空串归一语义)/
 * 生效值投影(override ?? 内置)/ facets 说明卡行装配([gate-F2])。
 */

import { describe, expect, it } from "vitest";

import {
  buildFacetCardRows,
  buildSkillItems,
  extractPlaceholders,
  facetLabelOf,
  groupKeyOf,
  groupSkills,
  isOverrideCustomized,
  skillLabelOf,
  SKILL_LABELS,
  type BuiltinSkillShape,
  type SkillItem,
} from "./skills-data";
import type { SkillConfigOverrideResource } from "@creatoros/contract";

// 一条内置模板形状的最小构造。
function builtin(over: Partial<BuiltinSkillShape> & { id: string }): BuiltinSkillShape {
  return {
    version: "v1",
    system: "内置 system",
    template: "定位:{{positioning}}",
    requiredFacets: ["positioning"],
    tools: [],
    outputSchemaJson: null,
    ...over,
  };
}

// 一条 override 行的最小构造(contract skillConfigOverrideResource 形状)。
function overrideRow(
  over: Partial<SkillConfigOverrideResource> & { id: string },
): SkillConfigOverrideResource {
  return {
    version: null,
    system: null,
    template: null,
    tools: null,
    requiredFacets: null,
    outputSchema: null,
    updatedBy: null,
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...over,
  };
}

describe("分组(按 id 前缀)", () => {
  it("chatbox.* → 对话技能;knowledge./asset.* → 采集分类;其余 → 创作节点", () => {
    expect(groupKeyOf("chatbox.topic")).toBe("chat");
    expect(groupKeyOf("knowledge.classify")).toBe("ingestion");
    expect(groupKeyOf("asset.classify")).toBe("ingestion");
    expect(groupKeyOf("script.draft")).toBe("creation");
    expect(groupKeyOf("calibration.score")).toBe("creation");
  });

  it("groupSkills:稳定序 对话技能 → 创作节点 → 采集分类,空组不输出", () => {
    const items: SkillItem[] = [
      { ...builtin({ id: "script.draft" }), customized: false },
      { ...builtin({ id: "chatbox.topic" }), customized: false },
      { ...builtin({ id: "knowledge.classify" }), customized: false },
    ];
    const groups = groupSkills(items);
    expect(groups.map((g) => g.key)).toEqual(["chat", "creation", "ingestion"]);
    expect(groups[0]!.label).toBe("对话技能");
    expect(groups[0]!.items.map((s) => s.id)).toEqual(["chatbox.topic"]);
    // 空组(无 ingestion 条目)不输出。
    const withoutIngestion = groupSkills(items.slice(0, 2));
    expect(withoutIngestion.map((g) => g.key)).toEqual(["chat", "creation"]);
  });
});

describe("中文词表", () => {
  it("SKILL_LABELS 覆盖全部 19 个内置 skill id(中文名 + 一句话用途非空)", () => {
    const ids = [
      "chatbox.topic",
      "chatbox.calibration",
      "chatbox.positioning",
      "chatbox.review",
      "topic.generate",
      "topic.enrich",
      "script.draft",
      "planning.thesis",
      "planning.contract",
      "planning.outline",
      "platform.adapt",
      "review.insights",
      "calibration.diagnose",
      "calibration.score",
      "research.gather",
      "reconstruct.project",
      "positioning.generate",
      "material.match",
      "knowledge.classify",
    ];
    for (const id of ids) {
      const label = SKILL_LABELS[id];
      expect(label, `缺词表: ${id}`).toBeDefined();
      expect(label!.name.length).toBeGreaterThan(0);
      expect(label!.purpose.length).toBeGreaterThan(0);
    }
  });

  it("skillLabelOf:缺词表回退显 id(诚实,不编)", () => {
    expect(skillLabelOf("future.skill")).toEqual({
      name: "future.skill",
      purpose: "",
    });
  });

  it("facetLabelOf:词表命中给中文含义,未收录回退「(暂无说明)」", () => {
    expect(facetLabelOf("positioning")).toContain("定位");
    expect(facetLabelOf("unknownFacet")).toBe("(暂无说明)");
  });
});

describe("isOverrideCustomized(T-040 空串归一 undefined 语义)", () => {
  it("任一文本字段非空 → 已定制", () => {
    expect(
      isOverrideCustomized(overrideRow({ id: "script.draft", template: "自定义" })),
    ).toBe(true);
    expect(
      isOverrideCustomized(overrideRow({ id: "script.draft", system: "自定义" })),
    ).toBe(true);
  });

  it("恢复默认后(全字段空串/空数组/null)→ 未定制(徽章诚实熄灭)", () => {
    expect(
      isOverrideCustomized(
        overrideRow({ id: "script.draft", system: "", template: "  " }),
      ),
    ).toBe(false);
    expect(
      isOverrideCustomized(overrideRow({ id: "script.draft", tools: [] })),
    ).toBe(false);
    expect(isOverrideCustomized(overrideRow({ id: "script.draft" }))).toBe(false);
  });

  it("tools / requiredFacets / outputSchema 非空也算定制", () => {
    expect(
      isOverrideCustomized(overrideRow({ id: "x", tools: ["topic.generate"] })),
    ).toBe(true);
    expect(
      isOverrideCustomized(
        overrideRow({ id: "x", outputSchema: { type: "object" } }),
      ),
    ).toBe(true);
  });
});

describe("buildSkillItems(生效值 = override 归一后 ?? 内置)", () => {
  it("无 override → 内置值 + customized=false", () => {
    const items = buildSkillItems([builtin({ id: "script.draft" })], []);
    expect(items).toHaveLength(1);
    expect(items[0]!.system).toBe("内置 system");
    expect(items[0]!.customized).toBe(false);
  });

  it("有效 override → 生效值取 override,customized=true;空串字段回退内置", () => {
    const items = buildSkillItems(
      [builtin({ id: "script.draft" })],
      [
        overrideRow({
          id: "script.draft",
          template: "我的结构:{{positioning}}",
          system: "", // 空串 = 未配 → 回退内置(T-040 归一)
        }),
      ],
    );
    expect(items[0]!.template).toBe("我的结构:{{positioning}}");
    expect(items[0]!.system).toBe("内置 system"); // 空串回退内置
    expect(items[0]!.customized).toBe(true);
  });

  it("恢复默认后的行(全空串)→ 全部回退内置 + customized=false", () => {
    const items = buildSkillItems(
      [builtin({ id: "script.draft" })],
      [overrideRow({ id: "script.draft", system: "", template: "" })],
    );
    expect(items[0]!.system).toBe("内置 system");
    expect(items[0]!.template).toBe("定位:{{positioning}}");
    expect(items[0]!.customized).toBe(false);
  });
});

describe("facets 说明卡([gate-F2])", () => {
  it("extractPlaceholders:去重保序提取 {{x}}", () => {
    expect(
      extractPlaceholders("{{positioning}}{{topic}} 再来 {{ positioning }}"),
    ).toEqual(["positioning", "topic"]);
  });

  it("buildFacetCardRows:requiredFacets 在前标必需,模板其余占位符跟后", () => {
    const rows = buildFacetCardRows(
      "{{positioning}}{{learnings}}{{topic}}",
      ["positioning", "topic"],
    );
    expect(rows.map((r) => r.name)).toEqual([
      "positioning",
      "topic",
      "learnings",
    ]);
    expect(rows[0]!.required).toBe(true);
    expect(rows[2]!.required).toBe(false);
    // 每行都有中文含义(词表来源)。
    expect(rows[0]!.label).toContain("定位");
  });
});
