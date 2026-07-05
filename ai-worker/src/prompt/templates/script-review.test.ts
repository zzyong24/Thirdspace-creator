import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import { SCRIPT_REVIEW_TEMPLATE } from "./script-review";

// T-124:违禁词表(创作者确定词表)注进语义审 prompt,让模型照表复核 lint 精确匹配漏掉的变体。
describe("SCRIPT_REVIEW_TEMPLATE — 违禁词表注入(T-124)", () => {
  it("lexicon facet 渲进 prompt(照表复核变体)", () => {
    const { prompt } = bindPrompt(SCRIPT_REVIEW_TEMPLATE, {
      script: "测试文案",
      lexicon: "· [official_hard/导流] 加微信",
      lintFindings: "（L1 无命中)",
      officialRules: "官方规则",
      positioning: "定位",
    });
    expect(prompt).toContain("违禁词表");
    expect(prompt).toContain("· [official_hard/导流] 加微信");
    expect(prompt).toContain("照表复核");
  });

  it("requiredFacets 仍只 script(lexicon 非必需,未提供替空串不抛)", () => {
    expect(SCRIPT_REVIEW_TEMPLATE.requiredFacets).toEqual(["script"]);
    const { prompt } = bindPrompt(SCRIPT_REVIEW_TEMPLATE, {
      script: "只给 script",
    });
    expect(prompt).toContain("只给 script");
    expect(prompt).not.toContain("{{lexicon}}");
  });
});
