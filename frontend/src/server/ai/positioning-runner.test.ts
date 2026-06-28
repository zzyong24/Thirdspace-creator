import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  runPositioningGenerate,
  parseSuggestion,
  type PositioningSuggestion,
} from "./positioning-runner";
import { LlmCredentialError } from "@/server/ai/llm/provider";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

// A complete, valid suggestion the fake LLM returns. Mirrors the structured shape the
// runner records: {persona, field, audience, differentiation, capabilities[], oneLiner,
// keywords[3]}.
const VALID_JSON = JSON.stringify({
  persona: "硬核 AI 科普人",
  field: "AI 工程",
  audience: "一线后端/算法开发者",
  differentiation: "把论文直接落成可跑的代码",
  capabilities: ["论文拆解", "工程化演示", "踩坑复盘"],
  oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
  keywords: ["论文", "代码", "工程化"],
});

function makeDeps(
  llmImpl: () => Promise<{ text: string }>,
  context?: {
    positioning?: { profile: unknown; currentStatement: unknown };
    accounts?: Array<{ platform: string; accountHandle: string; followerBaseline: number }>;
  },
) {
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
  const llm = vi.fn(llmImpl);
  return {
    deps: {
      ai: { markRunning, recordCandidate, cancelTask } as never,
      // assembleCreativeContext reads getPositioningCenter (PositioningReader) and
      // list (AccountsReader); both degrade to "" on throw. These stubs feed the real
      // shapes so the brief assembles with positioning + 抖音账号 context.
      positioning: {
        getPositioningCenter: async () =>
          context?.positioning ?? {
            profile: {
              persona: "现有人设",
              field: "现有领域",
              audience: "现有人群",
              differentiation: "现有差异化",
              capabilities: ["A", "B"],
            },
            currentStatement: { oneLiner: "现有一句话定位", keywords: ["关键A", "关键B", "关键C"] },
          },
      } as never,
      accounts: {
        list: async () =>
          context?.accounts ?? [
            { platform: "douyin", accountHandle: "@老黄说AI", followerBaseline: 128000 },
          ],
      } as never,
      llm,
    },
    markRunning,
    recordCandidate,
    cancelTask,
    llm,
  };
}

describe("parseSuggestion (tolerant JSON object parse)", () => {
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
      JSON.stringify({ ...JSON.parse(VALID_JSON), keywords: ["a", "b", "c", "d", "e"] }),
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

describe("runPositioningGenerate", () => {
  it("calls deps.llm with the positioning.generate capability + schema, and records a positioning_profile candidate", async () => {
    const { deps, llm, recordCandidate, markRunning } = makeDeps(async () => ({
      text: VALID_JSON,
    }));
    await runPositioningGenerate(ctx, { id: "t1", inputData: {} }, deps);

    expect(markRunning).toHaveBeenCalledWith(ctx, "t1");
    expect(llm).toHaveBeenCalledWith(
      ctx,
      "positioning.generate",
      expect.any(String),
      expect.objectContaining({ schema: true }),
    );
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const [, taskId, payload] = recordCandidate.mock.calls[0]!;
    expect(taskId).toBe("t1");
    expect(payload.resultType).toBe("positioning_profile");
    expect(payload.resultData.suggestion.persona).toBe("硬核 AI 科普人");
    expect(payload.resultData.suggestion.keywords).toEqual(["论文", "代码", "工程化"]);
  });

  it("the prompt carries the creator's current positioning AND their 抖音账号 profile as material", async () => {
    let capturedPrompt = "";
    const { deps } = makeDeps(async () => ({ text: VALID_JSON }));
    deps.llm = vi.fn(async (_c: unknown, _cap: unknown, prompt: string) => {
      capturedPrompt = prompt;
      return { text: VALID_JSON };
    }) as never;

    await runPositioningGenerate(ctx, { id: "t2", inputData: {} }, deps);

    // 定位现状 fed in (existing one-liner / persona)
    expect(capturedPrompt).toContain("现有一句话定位");
    expect(capturedPrompt).toContain("现有人设");
    // 抖音账号画像 fed in (platform / handle / follower count)
    expect(capturedPrompt).toContain("douyin");
    expect(capturedPrompt).toContain("@老黄说AI");
    expect(capturedPrompt).toContain("128000");
  });

  it("degrades gracefully when the creator has NO positioning yet (empty profile/statement)", async () => {
    let capturedPrompt = "";
    const { deps, recordCandidate } = makeDeps(
      async () => ({ text: VALID_JSON }),
      { positioning: { profile: null, currentStatement: null } },
    );
    deps.llm = vi.fn(async (_c: unknown, _cap: unknown, prompt: string) => {
      capturedPrompt = prompt;
      return { text: VALID_JSON };
    }) as never;

    await runPositioningGenerate(ctx, { id: "t3", inputData: {} }, deps);
    expect(capturedPrompt).toContain("尚未设置定位");
    expect(recordCandidate).toHaveBeenCalledTimes(1);
  });

  it("cancels the task (no candidate) when the LLM returns unparseable text", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(async () => ({
      text: "抱歉我帮不了你",
    }));
    await runPositioningGenerate(ctx, { id: "t4", inputData: {} }, deps);
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t4");
  });

  it("cancels the task gracefully (no throw) when the LLM has no credentials (LlmCredentialError)", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(async () => {
      throw new LlmCredentialError("无可用 LLM 凭据");
    });
    // Must not throw out of the background runner — it swallows + cancels.
    await expect(
      runPositioningGenerate(ctx, { id: "t5", inputData: {} }, deps),
    ).resolves.toBeUndefined();
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t5");
  });
});
