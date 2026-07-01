import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 定位生成 runner 迁 runStructuredNode(T-025b 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象,9 字段定位提案)。
// runner 解析 model(resolveModelSpec)→ runStructuredNode 拿 object → normalizeSuggestion +
// recordCandidate。这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、
// 候选被记录、归一逻辑(keywords 夹 3 / capabilities 清洗)仍按约定产出;退化对象 → 不记录 + cancel。
const runStructuredNode = vi.fn(
  async (_input: {
    model: unknown;
    template: { id: string };
    facets: Record<string, string | undefined>;
  }) => ({ object: {} as Record<string, unknown> }),
);
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  POSITIONING_GENERATE_TEMPLATE: { id: "positioning.generate" },
}));

import {
  runPositioningGenerate,
  parseSuggestion,
  type PositioningSuggestion,
} from "./positioning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

// A complete, valid suggestion (as a structured object). Mirrors the shape the runner
// records: {persona, field, audience, differentiation, capabilities[], oneLiner, keywords[3]}.
const VALID_OBJECT = {
  persona: "硬核 AI 科普人",
  field: "AI 工程",
  audience: "一线后端/算法开发者",
  differentiation: "把论文直接落成可跑的代码",
  capabilities: ["论文拆解", "工程化演示", "踩坑复盘"],
  oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
  keywords: ["论文", "代码", "工程化"],
};
const VALID_JSON = JSON.stringify(VALID_OBJECT);

function makeDeps(object: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object } as never);
  const markRunning = vi.fn(async () => undefined);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        resultData: { suggestion: PositioningSuggestion };
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
      ai: { markRunning, recordCandidate, cancelTask } as never,
      // assembleCreativeContext reads getPositioningCenter (PositioningReader) and
      // list (AccountsReader); both degrade to "" on throw. These stubs feed the real
      // shapes so the brief assembles with positioning + 抖音账号 context.
      positioning: {
        getPositioningCenter: async () => ({
          profile: {
            persona: "现有人设",
            field: "现有领域",
            audience: "现有人群",
            differentiation: "现有差异化",
            capabilities: ["A", "B"],
          },
          currentStatement: {
            oneLiner: "现有一句话定位",
            keywords: ["关键A", "关键B", "关键C"],
          },
        }),
      } as never,
      accounts: {
        list: async () => [
          {
            platform: "douyin",
            accountHandle: "@老黄说AI",
            followerBaseline: 128000,
          },
        ],
      } as never,
      resolveModelSpec,
    },
    markRunning,
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
}

describe("parseSuggestion (tolerant JSON object parse — chat 文本兜底路径)", () => {
  it("parses a clean JSON object", () => {
    const s = parseSuggestion(VALID_JSON);
    expect(s).not.toBeNull();
    expect(s!.persona).toBe("硬核 AI 科普人");
    expect(s!.keywords).toEqual(["论文", "代码", "工程化"]);
    expect(s!.capabilities).toEqual(["论文拆解", "工程化演示", "踩坑复盘"]);
  });

  it("tolerates ``` fences and leading prose", () => {
    const wrapped = "好的，这是我的建议：\n```json\n" + VALID_JSON + "\n```\n希望有用。";
    const s = parseSuggestion(wrapped);
    expect(s).not.toBeNull();
    expect(s!.oneLiner).toContain("论文");
  });

  it("clamps keywords to exactly 3 (drops extras / pads when short)", () => {
    const s = parseSuggestion(
      JSON.stringify({ ...VALID_OBJECT, keywords: ["a", "b", "c", "d", "e"] }),
    );
    expect(s!.keywords).toHaveLength(3);
    expect(s!.keywords).toEqual(["a", "b", "c"]);
  });

  it("returns null on unparseable text", () => {
    expect(parseSuggestion("完全不是 JSON 的一段话")).toBeNull();
  });

  it("returns null when oneLiner + persona are both empty (no usable suggestion)", () => {
    expect(
      parseSuggestion(JSON.stringify({ persona: "", oneLiner: "", keywords: [] })),
    ).toBeNull();
  });
});

describe("runPositioningGenerate (runStructuredNode + 外置模板)", () => {
  it("resolves positioning.generate and records a positioning_profile candidate", async () => {
    const { deps, recordCandidate, markRunning, resolveModelSpec } =
      makeDeps(VALID_OBJECT);
    await runPositioningGenerate(ctx, { id: "t1", inputData: {} }, deps);

    expect(markRunning).toHaveBeenCalledWith(ctx, "t1");
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "positioning.generate");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    // runStructuredNode 被喂进 positioning.generate 模板 + 装配好的 facets(current 兜底非空)。
    const call = runStructuredNode.mock.calls[0]![0];
    expect(call.template.id).toBe("positioning.generate");
    // 定位现状 + 抖音账号画像都进了 facets(current / accounts)。
    expect(call.facets.current).toContain("现有一句话定位");
    expect(call.facets.accounts).toContain("douyin");
    expect(call.facets.accounts).toContain("@老黄说AI");

    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const [, taskId, payload] = recordCandidate.mock.calls[0]!;
    expect(taskId).toBe("t1");
    expect(payload.resultType).toBe("positioning_profile");
    expect(payload.resultData.suggestion.persona).toBe("硬核 AI 科普人");
    expect(payload.resultData.suggestion.keywords).toEqual(["论文", "代码", "工程化"]);
  });

  it("degrades gracefully when the creator has NO positioning yet (current facet 兜底)", async () => {
    const { deps, recordCandidate } = makeDeps(VALID_OBJECT);
    // 覆盖 positioning reader 成空 → assembleCreativeContext 产空 brief → current 走兜底文案。
    (deps as { positioning: unknown }).positioning = {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    } as never;

    await runPositioningGenerate(ctx, { id: "t3", inputData: {} }, deps);
    const call = runStructuredNode.mock.calls.at(-1)![0];
    expect(call.facets.current).toContain("尚未设置定位");
    expect(recordCandidate).toHaveBeenCalledTimes(1);
  });

  it("cancels the task (no candidate) when the object normalizes to no usable suggestion", async () => {
    // 合法但退化的结构化对象(persona + oneLiner 均空)→ normalizeSuggestion 返回 null → guard → cancel。
    const { deps, recordCandidate, cancelTask } = makeDeps({
      persona: "",
      oneLiner: "",
      keywords: [],
    });
    await runPositioningGenerate(ctx, { id: "t4", inputData: {} }, deps);
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t4");
  });

  it("cancels the task gracefully (no throw) when runStructuredNode throws", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(VALID_OBJECT);
    runStructuredNode.mockRejectedValueOnce(new Error("结构化节点:未得到合 schema 的对象"));
    // Must not throw out of the background runner — it swallows + cancels.
    await expect(
      runPositioningGenerate(ctx, { id: "t5", inputData: {} }, deps),
    ).resolves.toBeUndefined();
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t5");
  });
});
