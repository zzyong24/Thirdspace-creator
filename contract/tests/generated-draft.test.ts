import { describe, expect, it } from "vitest";
import { stripDraftReasoning } from "../src/internal/generated-draft";

describe("stripDraftReasoning", () => {
  it("removes mixed-case and repeated reasoning blocks with attributes", () => {
    expect(stripDraftReasoning(
      '<THINK data-label="a > b" data-content="</think>">分析</tHiNk>\n第一段\n<think>推演</think>\n第二段',
    )).toBe("第一段\n\n第二段");
  });

  it("discards an unclosed reasoning block and preserves text before it", () => {
    expect(stripDraftReasoning("<think>这一段只有思考")).toBe("");
    expect(stripDraftReasoning("已有正文\n<think>未闭合的思考")).toBe("已有正文");
  });

  it("recovers the draft after an explicit heading in an unclosed block", () => {
    expect(stripDraftReasoning("<think>先分析\n\n【最终正文】\n这是可用正文。")).toBe("这是可用正文。");
    expect(stripDraftReasoning("<think>先分析\n正文：这是可用正文。")).toBe("这是可用正文。");
    expect(stripDraftReasoning("<think>先分析\n正文：可用正文\n<think>额外思考</think>")).toBe("可用正文");
  });

  it("ignores draft headings that occur inside a closed reasoning block", () => {
    expect(stripDraftReasoning("<think>思考\n最终正文：仍在思考中</think>\n真正的正文")).toBe("真正的正文");
    expect(stripDraftReasoning("<think>外层<think>内层</think>外层</think>正文")).toBe("正文");
  });

  it("leaves an untagged draft verbatim, including ordinary prose about thinking", () => {
    const draft = "  我们先思考这个问题。\r\n\r\n正文：继续往下说。  ";
    expect(stripDraftReasoning(draft)).toBe(draft);
  });
});
