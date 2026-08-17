import { describe, expect, it } from "vitest";
import { COVER_BRIEF_TEMPLATE } from "./cover-brief";

describe("cover.brief 用户画面要求", () => {
  it("把可选用户画面要求声明为硬约束，但不把它当事实来源", () => {
    expect(COVER_BRIEF_TEMPLATE.version).toBe("v3");
    expect(COVER_BRIEF_TEMPLATE.template).toContain("{{userVisualRequirements}}");
    expect(COVER_BRIEF_TEMPLATE.template).toContain("用户明确画面要求");
    expect(COVER_BRIEF_TEMPLATE.template).toContain("不是事实出处");
    expect(COVER_BRIEF_TEMPLATE.requiredFacets).not.toContain(
      "userVisualRequirements",
    );
  });

  it("要求封面方案保持简洁，不让文本模型把画面提示词膨胀成策划案", () => {
    expect(COVER_BRIEF_TEMPLATE.template).toContain("不超过 220 字");
    expect(COVER_BRIEF_TEMPLATE.template).toContain("不超过 100 字");
    expect(COVER_BRIEF_TEMPLATE.template).toContain("不超过 40 字");
  });
});
