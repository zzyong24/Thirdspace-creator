import { describe, expect, it } from "vitest";
import { joinCopilotMessageText } from "./copilot-message-text";

describe("joinCopilotMessageText", () => {
  it("助手多步工具循环产生相邻重复文本时只显示一次", () => {
    const repeated = "好的，我继续阅读权威来源并核对事实。";
    expect(
      joinCopilotMessageText(
        [
          { type: "text", text: repeated },
          { type: "text", text: repeated },
          { type: "text", text: "核对完成，下面是结论。" },
        ],
        { dedupeConsecutive: true },
      ),
    ).toBe(`${repeated}核对完成，下面是结论。`);
  });

  it("只去掉相邻且规范化后完全相同的块，不删用户原文或非相邻内容", () => {
    expect(
      joinCopilotMessageText(
        [
          { type: "text", text: "第一段。" },
          { type: "text", text: "第二段。" },
          { type: "text", text: "第一段。" },
        ],
        { dedupeConsecutive: true },
      ),
    ).toBe("第一段。第二段。第一段。");
    expect(
      joinCopilotMessageText(
        [
          { type: "text", text: "原文原文" },
          { type: "text", text: "原文原文" },
        ],
        { dedupeConsecutive: false },
      ),
    ).toBe("原文原文原文原文");
  });
});
