import { describe, it, expect } from "vitest";
import { isCompleteRawScriptReview } from "@creatoros/ai-worker";

describe("isCompleteRawScriptReview", () => {
  it("拒绝依靠 schema 默认值的空对象，只接受显式完整报告", () => {
    expect(isCompleteRawScriptReview({})).toBe(false);
    expect(
      isCompleteRawScriptReview({ verdict: "pass", summary: "", findings: [] }),
    ).toBe(false);
    expect(
      isCompleteRawScriptReview({
        verdict: "pass",
        summary: "语义审核完成。",
        findings: [],
      }),
    ).toBe(true);
  });
});
