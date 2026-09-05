import { describe, it, expect } from "vitest";

import { parseDiagnosis } from "./calibration-diagnose-runner";

// ── 纯函数:文本兜底 parseDiagnosis(chat 路径仍用)+ 底层 normalizeDiagnosis 的交集/夹取语义。
// parseDiagnosis 交集 REAL rubric keys(幻觉键丢弃)并夹每个数字;确定性。
const RUBRIC_KEYS = new Set(["hook", "persona", "cta"]);

describe("parseDiagnosis (calibration.diagnose agent output)", () => {
  it("parses a full diagnosis, clamping scores and dropping unknown rubric keys", () => {
    const text = JSON.stringify({
      dimensions: [
        { key: "hook", score: 4, reason: "钩子尚可", suggestion: "前3秒更狠" },
        { key: "persona", score: 2.6, reason: "人群泛", suggestion: "收窄" }, // rounds → 3
        { key: "cta", score: 9, reason: "越界", suggestion: "x" }, // out of 1-5 → dropped
        { key: "bogus", score: 5, reason: "幻觉维度", suggestion: "x" }, // not in rubric → dropped
      ],
      performance: { 完播率: 62, 收藏率: 250, 评论率: null, 转化意向: 40 },
      verdict: "整体偏流量",
      mainIssues: ["缺转化钩子", 7, "同质化"],
      priorityFixes: ["补 CTA"],
      confidence: "high",
    });
    const d = parseDiagnosis(text, RUBRIC_KEYS);
    expect(d).not.toBeNull();
    // only real rubric keys with a valid 1-5 score survive
    expect(d!.dimensions.map((x) => x.key)).toEqual(["hook", "persona"]);
    expect(d!.dimensions[0]!.score).toBe(4);
    expect(d!.dimensions[1]!.score).toBe(3); // 2.6 → 3
    expect(d!.performance.完播率).toBe(62);
    expect(d!.performance.收藏率).toBeNull(); // out of 0-100 → null
    expect(d!.performance.评论率).toBeNull();
    expect(d!.mainIssues).toEqual(["缺转化钩子", "同质化"]); // non-strings dropped
    expect(d!.confidence).toBe("high");
  });

  it("tolerates ```json fences and leading prose", () => {
    const text =
      '好的,诊断如下:\n```json\n{"dimensions":[{"key":"hook","score":3}]}\n```';
    const d = parseDiagnosis(text, RUBRIC_KEYS);
    expect(d?.dimensions[0]?.key).toBe("hook");
    expect(d?.dimensions[0]?.score).toBe(3);
  });

  it("defaults confidence to med when missing or invalid", () => {
    const d = parseDiagnosis(
      JSON.stringify({ dimensions: [{ key: "hook", score: 3 }], confidence: "x" }),
      RUBRIC_KEYS,
    );
    expect(d?.confidence).toBe("med");
  });

  it("returns null when no real dimension is scored (nothing usable)", () => {
    // all keys hallucinated → no usable dimension → null (cancel, never a fake prediction)
    expect(
      parseDiagnosis(
        JSON.stringify({ dimensions: [{ key: "ghost", score: 5 }] }),
        RUBRIC_KEYS,
      ),
    ).toBeNull();
    expect(parseDiagnosis("not json", RUBRIC_KEYS)).toBeNull();
    expect(parseDiagnosis("", RUBRIC_KEYS)).toBeNull();
  });
});

// prepare/project与冻结目标覆盖迁至calibration-positioning-business-adapters.test.ts；
// 本文件保留全部旧文本parser容错断言，生命周期由Worker测试覆盖。
