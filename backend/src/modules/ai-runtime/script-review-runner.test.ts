import { describe, it, expect } from "vitest";
import { buildLexiconBlock } from "./script-review-runner";

// T-124 审核简化:违禁词表本身注进语义审 prompt(词表确定 → 让模型照表复核 lint 精确匹配漏掉的
// 谐音/变体/拆字/同义命中)。buildLexiconBlock 是纯函数,锁「词表如何渲成可注入文本」。
describe("buildLexiconBlock — 违禁词表注进语义审 prompt(T-124 照表复核)", () => {
  it("空词表 → 诚实兜底,不假装有词表", () => {
    const block = buildLexiconBlock([]);
    expect(block).toContain("未配置违禁词表");
  });

  it("有词表 → 逐条渲 tier/category/pattern,有替换给建议箭头", () => {
    const block = buildLexiconBlock([
      {
        tier: "official_hard",
        category: "导流",
        pattern: "加微信",
        replacement: "关注主页",
      },
      { tier: "empirical", category: "夸大", pattern: "最强", replacement: null },
    ]);
    expect(block).toContain("[official_hard/导流] 加微信 → 建议:关注主页");
    expect(block).toContain("[empirical/夸大] 最强");
    // replacement 为 null 的条目不加箭头(不编造替换)
    expect(block).not.toContain("最强 → 建议");
  });
});
