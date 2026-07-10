import { describe, it, expect } from "vitest";
import { summarizeEditDelta, renderEditDeltaInsight } from "./edit-delta";

// [T-183] 改稿 delta 纯文本 diff helper 的单测。覆盖:无变化→null(不误产)、行级
// added/removed 提取、emoji 删减线索、句长/篇幅线索、render 含原始 delta。

describe("summarizeEditDelta (改稿 delta 纯 diff)", () => {
  it("完全相同 → null(不产信号)", () => {
    expect(summarizeEditDelta("同一段话", "同一段话")).toBeNull();
  });

  it("都空 → null", () => {
    expect(summarizeEditDelta("", "")).toBeNull();
    expect(summarizeEditDelta("  \n ", "")).toBeNull();
  });

  it("仅空白/换行差异(行级无实质变化) → null", () => {
    expect(summarizeEditDelta("第一行\n第二行", "第一行\n\n  第二行  ")).toBeNull();
  });

  it("提取 removed / added 行", () => {
    const s = summarizeEditDelta("开场很长的一句废话\n正文", "正文\n新钩子");
    expect(s).not.toBeNull();
    expect(s!.removed).toContain("开场很长的一句废话");
    expect(s!.added).toContain("新钩子");
  });

  it("删减 emoji → 线索含 emoji 提示", () => {
    const s = summarizeEditDelta("今天超开心😄🎉冲鸭🚀", "今天超开心冲鸭");
    expect(s).not.toBeNull();
    expect(s!.clue).toMatch(/emoji|表情/);
    expect(s!.charDelta).toBeLessThan(0);
  });

  it("整体压缩 → 线索含压缩提示且 charDelta 为负", () => {
    const before =
      "这是一段非常非常冗长啰嗦的开场白反复强调没有意义的信息占用观众耐心";
    const after = "开门见山";
    const s = summarizeEditDelta(before, after);
    expect(s).not.toBeNull();
    expect(s!.charDelta).toBeLessThan(0);
    expect(s!.clue).toMatch(/压缩|改短/);
  });

  it("renderEditDeltaInsight 含线索 + 原始 delta 行", () => {
    const s = summarizeEditDelta("旧开场白很啰嗦的一句", "新钩子");
    const text = renderEditDeltaInsight(s!);
    expect(text).toContain("改稿信号");
    expect(text).toContain("新钩子");
    expect(text).toContain("旧开场白很啰嗦的一句");
  });
});
