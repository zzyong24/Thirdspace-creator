/**
 * 单测:脚本编辑器 ↔ artifact 内容桥(T-019 / L4)。
 *
 * 锁住纯函数契约(server 读侧 + client 保存共用):
 *   - sectionsToHtml:段落 → `<h2>` + `<p>`;emphasis/金句段 body 包 `<strong>`;`<>&` 转义。
 *   - htmlToSections:HTML → `[{ heading, body, emphasis }]`;整段 `<strong>` → emphasis。
 *   - 往返:sections → HTML → sections 保 heading/body/emphasis 语义(id 重排不算回归)。
 */

import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  formatTimecode,
  htmlToSections,
  sectionsToHtml,
  stripTimecodePrefix,
  timecodeLabel,
} from "./script-editor-bridge";
import type { ScriptSectionView } from "@/types/view-models";

function section(
  over: Partial<ScriptSectionView> & { heading: string; body: string },
): ScriptSectionView {
  return {
    id: over.id ?? "s",
    type: over.type ?? "body",
    heading: over.heading,
    body: over.body,
    emphasis: over.emphasis ?? false,
    startSeconds: over.startSeconds ?? null,
    endSeconds: over.endSeconds ?? null,
  };
}

describe("escapeHtml", () => {
  it("escapes <, > and &", () => {
    expect(escapeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("sectionsToHtml", () => {
  it("renders a heading <h2> and one <p> per body line", () => {
    const html = sectionsToHtml([
      section({ heading: "开场 15 秒", body: "第一行\n第二行" }),
    ]);
    expect(html).toContain("<h2>开场 15 秒</h2>");
    expect(html).toContain("<p>第一行</p>");
    expect(html).toContain("<p>第二行</p>");
  });

  it("wraps emphasis / golden_quote bodies in <strong>", () => {
    const html = sectionsToHtml([
      section({
        heading: "金句",
        body: "AI 不是工具，而是同事",
        type: "golden_quote",
        emphasis: true,
      }),
    ]);
    expect(html).toContain("<strong>AI 不是工具，而是同事</strong>");
  });

  it("escapes html-special characters in heading and body", () => {
    const html = sectionsToHtml([
      section({ heading: "<b>标题</b>", body: "a & b < c" }),
    ]);
    expect(html).toContain("&lt;b&gt;标题&lt;/b&gt;");
    expect(html).toContain("a &amp; b &lt; c");
    // No raw injected tag survived.
    expect(html).not.toContain("<b>标题</b>");
  });

  it("returns a single empty paragraph for no sections", () => {
    expect(sectionsToHtml([])).toBe("<p></p>");
  });
});

describe("htmlToSections", () => {
  it("splits on headings and collects following paragraphs as body", () => {
    const sections = htmlToSections(
      "<h2>钩子</h2><p>第一行</p><p>第二行</p><h2>CTA</h2><p>点赞关注</p>",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]!.heading).toBe("钩子");
    expect(sections[0]!.body).toBe("第一行\n第二行");
    expect(sections[1]!.heading).toBe("CTA");
    expect(sections[1]!.body).toBe("点赞关注");
  });

  it("marks a section emphasized when its paragraph is wrapped in <strong>", () => {
    const sections = htmlToSections(
      "<h2>金句</h2><p><strong>AI 是同事</strong></p>",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.emphasis).toBe(true);
    expect(sections[0]!.body).toBe("AI 是同事");
  });

  it("captures leading body before any heading as a heading-less section", () => {
    const sections = htmlToSections("<p>没有标题的开场</p>");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("");
    expect(sections[0]!.body).toBe("没有标题的开场");
  });

  it("falls back to plain text when there are no block tags", () => {
    const sections = htmlToSections("纯文本无标签");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.body).toBe("纯文本无标签");
  });

  it("treats list items as body lines", () => {
    const sections = htmlToSections(
      "<h2>清单</h2><ul><li>第一项</li><li>第二项</li></ul>",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.body).toBe("第一项\n第二项");
  });
});

// T-024 ①:分镜时间码只读展示。
describe("formatTimecode", () => {
  it("formats seconds as mm:ss with zero padding", () => {
    expect(formatTimecode(0)).toBe("00:00");
    expect(formatTimecode(5)).toBe("00:05");
    expect(formatTimecode(65)).toBe("01:05");
    expect(formatTimecode(600)).toBe("10:00");
  });

  it("floors fractional seconds and clamps negatives to 00:00", () => {
    expect(formatTimecode(12.9)).toBe("00:12");
    expect(formatTimecode(-3)).toBe("00:00");
    expect(formatTimecode(Number.NaN)).toBe("00:00");
  });
});

describe("timecodeLabel", () => {
  it("builds [mm:ss-mm:ss] when both bounds present", () => {
    expect(timecodeLabel(0, 15)).toBe("[00:00-00:15]");
    expect(timecodeLabel(75, 90)).toBe("[01:15-01:30]");
  });

  it("builds [mm:ss] with only start, and empty when neither", () => {
    expect(timecodeLabel(15, null)).toBe("[00:15]");
    expect(timecodeLabel(null, null)).toBe("");
    expect(timecodeLabel(null, 30)).toBe("");
  });
});

describe("stripTimecodePrefix", () => {
  it("removes a leading [mm:ss] / [mm:ss-mm:ss] prefix (with trailing space)", () => {
    expect(stripTimecodePrefix("[00:00-00:15] 开场钩子")).toBe("开场钩子");
    expect(stripTimecodePrefix("[01:15] 金句")).toBe("金句");
  });

  it("leaves headings without a timecode prefix untouched", () => {
    expect(stripTimecodePrefix("开场钩子")).toBe("开场钩子");
    // Bracketed content that is not a timecode is preserved.
    expect(stripTimecodePrefix("[重点] 段落")).toBe("[重点] 段落");
  });
});

describe("sectionsToHtml — timecode (T-024 ①)", () => {
  it("prepends [mm:ss-mm:ss] to the heading when start/end present", () => {
    const html = sectionsToHtml([
      section({
        heading: "开场钩子",
        body: "前3秒抓人",
        startSeconds: 0,
        endSeconds: 15,
      }),
    ]);
    expect(html).toContain("<h2>[00:00-00:15] 开场钩子</h2>");
  });

  it("prepends [mm:ss] when only start is present", () => {
    const html = sectionsToHtml([
      section({ heading: "转场", body: "过渡", startSeconds: 30, endSeconds: null }),
    ]);
    expect(html).toContain("<h2>[00:30] 转场</h2>");
  });

  it("omits the timecode when both bounds are null", () => {
    const html = sectionsToHtml([
      section({ heading: "无时间码段", body: "正文" }),
    ]);
    expect(html).toContain("<h2>无时间码段</h2>");
    expect(html).not.toContain("[");
  });

  it("renders a heading carrying only the timecode when the section has no heading text", () => {
    const html = sectionsToHtml([
      section({ heading: "", body: "口播", startSeconds: 0, endSeconds: 10 }),
    ]);
    expect(html).toContain("<h2>[00:00-00:10]</h2>");
  });
});

describe("htmlToSections — timecode round-trip (T-024 ①)", () => {
  it("strips the read-only timecode prefix back off the heading on save", () => {
    // The editor shows the timecode prefix; saving must NOT fold it into heading text.
    const sections = htmlToSections(
      "<h2>[00:00-00:15] 开场钩子</h2><p>前3秒抓人</p>",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("开场钩子");
    expect(sections[0]!.body).toBe("前3秒抓人");
  });

  it("timecode does not accumulate across a sections→html→sections round-trip", () => {
    const input = [
      section({
        heading: "开场",
        body: "抓人",
        startSeconds: 0,
        endSeconds: 15,
      }),
    ];
    // First round-trip.
    const heading = htmlToSections(sectionsToHtml(input))[0]!.heading;
    expect(heading).toBe("开场");
    // Simulate a second save of the same rendered html — prefix must not double up.
    const again = htmlToSections(
      sectionsToHtml([{ ...input[0]!, heading }]),
    )[0]!.heading;
    expect(again).toBe("开场");
    expect(again).not.toContain("[");
  });
});

describe("round-trip sections → html → sections", () => {
  it("preserves heading / body / emphasis semantics", () => {
    const input = [
      section({ heading: "钩子", body: "前3秒抓人" }),
      section({
        heading: "金句",
        body: "一句话点睛",
        type: "golden_quote",
        emphasis: true,
      }),
      section({ heading: "CTA", body: "点赞\n关注" }),
    ];
    const html = sectionsToHtml(input);
    const round = htmlToSections(html);
    expect(round).toHaveLength(3);
    expect(round.map((s) => s.heading)).toEqual(["钩子", "金句", "CTA"]);
    expect(round[0]!.body).toBe("前3秒抓人");
    expect(round[1]!.emphasis).toBe(true);
    expect(round[2]!.body).toBe("点赞\n关注");
  });
});
