import { describe, it, expect } from "vitest";
import { lintScript, type LintRule } from "./lint";

// L1 lint 引擎单测(T-086 SPEC §6.2)—— 纯函数,直接喂词表,覆盖 word/regex/多命中/零命中。
// 每条 finding 的 quote 必为原文子串、带 replacement。

const RULES: LintRule[] = [
  {
    id: "r-baomu",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "保姆级",
    replacement: "分步演示",
    note: "降权词",
  },
  {
    id: "r-nianru",
    tier: "empirical",
    category: "营销词",
    matchType: "regex",
    pattern: "年入\\s*[0-9一二三四五六七八九十百千]+\\s*[wW万]",
    replacement: "真实数据",
    note: "收益承诺",
  },
  {
    id: "r-weixin",
    tier: "official_hard",
    category: "导流",
    matchType: "regex",
    pattern: "[VvＶｖ]\\s*信",
    replacement: "站内互动",
    note: "公约34",
  },
];

describe("lintScript", () => {
  it("在含多条违禁词的文本上命中 ≥3 条,每条 quote 是原文子串", () => {
    const text = "保姆级教程加我V信年入百万,不看后悔";
    const findings = lintScript(text, RULES);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const f of findings) {
      // quote 必为原文子串,offset 定位正确。
      expect(text).toContain(f.quote);
      expect(text.slice(f.offset, f.offset + f.quote.length)).toBe(f.quote);
    }
    // 覆盖到三条规则各一。
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "r-baomu",
      "r-nianru",
      "r-weixin",
    ]);
    // replacement 随命中带出。
    expect(findings.find((f) => f.ruleId === "r-baomu")?.replacement).toBe(
      "分步演示",
    );
  });

  it("word 匹配大小写不敏感,多命中各独立 offset", () => {
    const rules: LintRule[] = [
      {
        id: "r-qq",
        tier: "official_hard",
        category: "导流",
        matchType: "word",
        pattern: "QQ",
        replacement: "站内私信",
        note: "",
      },
    ];
    const text = "加 qq 或 QQ 群";
    const findings = lintScript(text, rules);
    expect(findings.length).toBe(2);
    expect(findings[0]!.offset).toBeLessThan(findings[1]!.offset);
  });

  it("零命中返回空数组", () => {
    expect(lintScript("这是一段完全合规的正常文案", RULES)).toEqual([]);
  });

  it("非法 regex 规则被跳过,不崩", () => {
    const bad: LintRule[] = [
      {
        id: "r-bad",
        tier: "empirical",
        category: "其他",
        matchType: "regex",
        pattern: "[unclosed",
        replacement: null,
        note: "",
      },
    ];
    expect(() => lintScript("任意文本", bad)).not.toThrow();
    expect(lintScript("任意文本", bad)).toEqual([]);
  });

  it("命中项按 offset 升序", () => {
    const findings = lintScript("年入百万后再看保姆级", RULES);
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i]!.offset).toBeGreaterThanOrEqual(
        findings[i - 1]!.offset,
      );
    }
  });
});
