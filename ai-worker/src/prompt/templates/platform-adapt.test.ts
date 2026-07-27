import { describe, it, expect } from "vitest";
import {
  platformDraftSchema,
  platformAdaptSchema,
  PLATFORM_ADAPT_TEMPLATE,
} from "./platform-adapt";

// L6 对齐 cheat-package:platform.adapt 节点内置发布审核 SOP —— schema 加 auditFlags 承载审核结论,
// prompt 嵌 Tier1/Tier2 清单 + 平台规格 + 「工具名不算违规」更正。这里锁 schema 契约 + prompt 关键约束。

describe("platformDraftSchema（L6 发布审核 SOP 承载字段）", () => {
  it("auditFlags 缺省为 []（向后兼容:老 provider/文本兜底不吐也过校验）", () => {
    const parsed = platformDraftSchema.parse({
      platform: "douyin",
      title: "标题",
      body: "正文",
      tags: ["a"],
      coverIdea: "封面",
      // 无 auditFlags
    });
    expect(parsed.auditFlags).toEqual([]);
  });

  it("auditFlags 透传字符串数组(命中记录 + 改动)", () => {
    const parsed = platformDraftSchema.parse({
      platform: "douyin",
      title: "标题",
      body: "简介正文",
      auditFlags: ["标签去掉品牌词→泛称", "✅ 无命中,合规"],
    });
    expect(parsed.auditFlags).toEqual([
      "标签去掉品牌词→泛称",
      "✅ 无命中,合规",
    ]);
  });

  it("[T-477] 简介 body 是发布物料必填，MiniMax 漏字段/空串必须拒绝而非假成功", () => {
    expect(() =>
      platformDraftSchema.parse({
        platform: "douyin",
        title: "只有标题",
        body: "   ",
      }),
    ).toThrow();
    expect(() =>
      platformDraftSchema.parse({
        platform: "douyin",
        title: "只有标题",
      }),
    ).toThrow();
  });

  it("顶层 drafts 数组每项含 auditFlags(与既有 platform/title/body/tags/coverIdea 并存)", () => {
    const parsed = platformAdaptSchema.parse({
      drafts: [{ platform: "douyin", title: "标题", body: "简介正文" }],
    });
    const d = parsed.drafts[0]!;
    // 既有字段不动
    expect(d.platform).toBe("douyin");
    expect(d.title).toBe("标题");
    expect(d.tags).toEqual([]);
    expect(d.coverIdea).toBe("");
    // 新增字段
    expect(d.auditFlags).toEqual([]);
  });
});

describe("PLATFORM_ADAPT_TEMPLATE（内置发布审核 SOP prompt）", () => {
  const t = PLATFORM_ADAPT_TEMPLATE.template;

  it("嵌入 Tier1 硬规则(营销导流/绝对化用语)", () => {
    expect(t).toContain("Tier 1");
    expect(t).toContain("营销导流");
    expect(t).toContain("绝对化用语");
  });

  it("嵌入 Tier2 经验限流(降权词/营销变现词)", () => {
    expect(t).toContain("Tier 2");
    expect(t).toContain("降权词");
    expect(t).toContain("营销变现词");
  });

  it("含「工具名不算违规」关键更正(别误删 Codex/Claude)", () => {
    expect(t).toContain("工具名不是违规项");
    expect(t).toContain("Codex");
  });

  it("含平台规格(抖音标签 1-3、小红书 3-6)让模型按目标平台调", () => {
    expect(t).toContain("抖音");
    expect(t).toContain("小红书");
    expect(t).toContain("1-3");
    expect(t).toContain("3-6");
  });

  it("输出契约要求逐条输出 auditFlags", () => {
    expect(t).toContain("auditFlags");
  });
});
