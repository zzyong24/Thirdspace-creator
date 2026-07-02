import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// AI 编导诊断 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化诊断对象)。runner 解析
// model(resolveModelSpec)→ 读 subject/rubric → runStructuredNode 拿 object → normalizeDiagnosis
// (rubricKeys 交集 + 夹取容错)→ recordCandidate。文本兜底 parseDiagnosis 仍供 chat 路径复用,
// 这里连同一份 normalizeDiagnosis 一并覆盖(纯函数交集/夹取语义)。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
  getTemplate: (id: string) => ({ id }),
}));

import { parseDiagnosis, runCalibrationDiagnose } from "./calibration-diagnose-runner";

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

// ── Runner:mock runStructuredNode 返回结构化对象,验证 capability 解析 + 候选记录 + guard。
const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(object: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        recordStep: vi.fn(async () => undefined),
        cancelTask,
      } as never,
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      resolveModelSpec,
      subject: {
        get: async () => ({ title: "待诊断标题", scriptText: "文稿正文" }),
      },
      rubric: {
        current: async () => ({
          rubricVersionId: "rv1",
          dimensions: [
            { key: "hook", label: "钩子" },
            { key: "cta", label: "行动召唤" },
          ],
        }),
      },
    },
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
}

describe("runCalibrationDiagnose (runStructuredNode + 外置模板)", () => {
  it("resolves calibration.diagnose and records a calibration_diagnosis candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):两维度评分(命中真实 rubric key)。
    const object = {
      dimensions: [
        { key: "hook", score: 4, reason: "钩子尚可", suggestion: "更狠" },
        { key: "cta", score: 3, reason: "CTA 偏弱", suggestion: "加钩子" },
      ],
      performance: { 完播率: 60, 收藏率: 20, 评论率: null, 转化意向: 30 },
      verdict: "整体可用",
      mainIssues: ["转化偏弱"],
      priorityFixes: ["补 CTA"],
      confidence: "med",
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(object);
    await runCalibrationDiagnose(
      ctx,
      { id: "t1", inputData: { subjectType: "script", subjectId: "s1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "calibration.diagnose");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("calibration_diagnosis");
    expect(input.resultData.rubricVersionId).toBe("rv1");
    const diagnosis = input.resultData.diagnosis as { dimensions: unknown[] };
    expect(diagnosis.dimensions.length).toBe(2);
  });

  it("cancels the task (no candidate) when no real dimension is scored", async () => {
    // 结构化但全是幻觉/越界维度 → normalizeDiagnosis 交集真实 rubric key 后产 0 维度 → guard → cancel。
    const { deps, recordCandidate, cancelTask } = makeDeps({
      dimensions: [{ key: "ghost", score: 5, reason: "", suggestion: "" }],
    });
    await runCalibrationDiagnose(
      ctx,
      { id: "t1", inputData: { subjectType: "script", subjectId: "s1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
