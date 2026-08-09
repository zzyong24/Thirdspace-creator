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
  isOverlayCustomized,
  skillLabelOf,
  SKILL_LABELS,
  type SkillItem,
} from "./skills-data";
import type { AccountSkillOverlayResource } from "@creatoros/contract";

function item(over: Partial<SkillItem> & { id: string }): SkillItem {
  return {
    accountId: "account-a",
    version: "v1",
    rowRevision: null,
    system: "内置 system",
    template: "定位:{{positioning}}",
    requiredFacets: ["positioning"],
    tools: [],
    outputSchemaJson: null,
    completionPolicySupported: false,
    completionPolicy: null,
    officialCompletionPolicy: null,
    completionPolicyCustomized: false,
    customized: false,
    ...over,
  };
}

function catalogRow(
  over: Partial<AccountSkillOverlayResource> & { skillId: string },
): AccountSkillOverlayResource {
  return {
    accountId: "account-a",
    baseVersion: "v1",
    editableFields: ["system", "template"],
    completionPolicySupported: false,
    official: {
      system: "内置 system",
      template: "定位:{{positioning}}",
      tools: [],
      requiredFacets: ["positioning"],
      outputSchema: null,
      completionPolicy: null,
    },
    effective: {
      system: "内置 system",
      template: "定位:{{positioning}}",
      tools: [],
      requiredFacets: ["positioning"],
      outputSchema: null,
      completionPolicy: null,
    },
    compatibility: "compatible",
    compatibilityErrors: [],
    rowRevision: null,
    validatedBaseVersion: null,
    overlayVersion: null,
    overlay: null,
    updatedAt: null,
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
      item({ id: "script.draft" }),
      item({ id: "chatbox.topic" }),
      item({ id: "knowledge.classify" }),
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
  it("SKILL_LABELS 覆盖全部仍在服务的内置 skill id(中文名 + 一句话用途非空)", () => {
    const ids = [
      "chatbox.topic",
      "chatbox.calibration",
      "chatbox.positioning",
      "chatbox.review",
      "topic.generate",
      "topic.enrich",
      "script.draft",
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
    expect(SKILL_LABELS["planning.thesis"]).toBeUndefined();
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

describe("isOverlayCustomized(账号增量)", () => {
  it("overlay 有字段才算定制", () => {
    expect(
      isOverlayCustomized(
        catalogRow({
          skillId: "script.draft",
          overlay: { template: "自定义" },
        }),
      ),
    ).toBe(true);
    expect(
      isOverlayCustomized(catalogRow({ skillId: "script.draft", overlay: null })),
    ).toBe(false);
    expect(
      isOverlayCustomized(catalogRow({ skillId: "script.draft", overlay: {} })),
    ).toBe(false);
  });
});

describe("buildSkillItems(服务端 official/effective 联合目录)", () => {
  it("无账号增量 → 服务端 effective 值 + customized=false", () => {
    const items = buildSkillItems([catalogRow({ skillId: "script.draft" })]);
    expect(items).toHaveLength(1);
    expect(items[0]!.system).toBe("内置 system");
    expect(items[0]!.customized).toBe(false);
  });

  it("账号增量已由服务端合并，客户端直接投影并保留 CAS revision", () => {
    const items = buildSkillItems([
      catalogRow({
        skillId: "script.draft",
        rowRevision: 3,
        overlayVersion: "3",
        overlay: { template: "我的结构:{{positioning}}" },
        effective: {
          ...catalogRow({ skillId: "x" }).effective,
          template: "我的结构:{{positioning}}",
        },
      }),
    ]);
    expect(items[0]!.template).toBe("我的结构:{{positioning}}");
    expect(items[0]!.system).toBe("内置 system");
    expect(items[0]!.rowRevision).toBe(3);
    expect(items[0]!.version).toBe("3");
    expect(items[0]!.customized).toBe(true);
  });

  it("outputSchema 来自 effective server value", () => {
    const items = buildSkillItems([
      catalogRow({
        skillId: "script.draft",
        effective: {
          ...catalogRow({ skillId: "x" }).effective,
          outputSchema: { type: "object" },
        },
      }),
    ]);
    expect(items[0]!.outputSchemaJson).toContain('"type": "object"');
  });

  it("完整性策略只投影服务端 official/effective，不在前端推导 hook/CTA", () => {
    const items = buildSkillItems([
      catalogRow({
        skillId: "script.draft",
        completionPolicySupported: true,
        editableFields: ["system", "template", "completionPolicy"],
        official: {
          ...catalogRow({ skillId: "x" }).official,
          completionPolicy: {
            schemaVersion: 1,
            minSegments: 6,
            maxSegments: 10,
            requiredSequence: ["hook", "body", "cta"],
            repairAttempts: 2,
          },
        },
        effective: {
          ...catalogRow({ skillId: "x" }).effective,
          completionPolicy: {
            schemaVersion: 1,
            minSegments: 1,
            maxSegments: 1,
            requiredSequence: ["monologue"],
            repairAttempts: 1,
          },
        },
        overlay: {
          completionPolicy: {
            schemaVersion: 1,
            minSegments: 1,
            maxSegments: 1,
            requiredSequence: ["monologue"],
            repairAttempts: 1,
          },
        },
      }),
    ]);

    expect(items[0]!.completionPolicySupported).toBe(true);
    expect(items[0]!.officialCompletionPolicy?.requiredSequence).toEqual([
      "hook",
      "body",
      "cta",
    ]);
    expect(items[0]!.completionPolicy).toMatchObject({
      minSegments: 1,
      requiredSequence: ["monologue"],
    });
    expect(items[0]!.completionPolicyCustomized).toBe(true);
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
