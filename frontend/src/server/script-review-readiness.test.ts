import { describe, expect, it } from "vitest";

import { getScriptReviewBlockReason } from "./script-review-readiness";

describe("getScriptReviewBlockReason", () => {
  it("已有可审稿件时忽略运行中和待采纳候选", () => {
    expect(
      getScriptReviewBlockReason(
        "这是一份已经保存并且足够长的当前稿件正文。".repeat(3),
        ["running", "awaiting_confirmation"],
        40,
      ),
    ).toBeNull();
  });

  it("空稿时区分仍在生成与等待采纳", () => {
    expect(getScriptReviewBlockReason("", ["queued"], 40)).toBe("running");
    expect(getScriptReviewBlockReason("", ["awaiting_confirmation"], 40)).toBe(
      "awaiting_adoption",
    );
  });

  it("没有稿件也没有活跃候选时返回 empty", () => {
    expect(getScriptReviewBlockReason("占位", ["failed", "cancelled"], 40)).toBe(
      "empty",
    );
  });
});
