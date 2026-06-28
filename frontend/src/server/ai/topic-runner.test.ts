import { describe, it, expect } from "vitest";
import { normalizeBasis } from "./topic-runner";
import { parseCard } from "./topic-enrich-runner";

// Pure-function tests for the 选题中心 runners (no Agent SDK / LLM): normalizeBasis (the
// 4-mode 出题依据 guard) and parseCard (the topic.enrich agent-output parser). Both are
// deterministic (no Date.now / Math.random) so they run without a backend.

describe("normalizeBasis", () => {
  it("accepts the four valid bases", () => {
    for (const b of ["positioning", "comments", "knowledge", "trend"]) {
      expect(normalizeBasis(b)).toBe(b);
    }
  });

  it("defaults to positioning for anything unrecognized", () => {
    expect(normalizeBasis(undefined)).toBe("positioning");
    expect(normalizeBasis("")).toBe("positioning");
    expect(normalizeBasis("garbage")).toBe("positioning");
    expect(normalizeBasis(42)).toBe("positioning");
  });
});

describe("parseCard (topic.enrich agent output)", () => {
  it("parses a full card, clamping metrics and dropping unknown keys", () => {
    const text = JSON.stringify({
      oneLiner: "一句话选题",
      targetAudience: "AI 创作者",
      audiencePain: "搭不出能用的",
      coreConflict: "以为很难其实三步",
      hook: "前 3 秒钩子",
      contentStructure: ["开头", "中段", 7, "结尾"],
      format: "口播",
      materialBasis: "现成项目截图",
      riskNote: "别用真实数据",
      proposal: "做",
      audiencePainScore: 88,
      materialScore: 250, // out of range → null
      productionDifficulty: "mid",
      bogus: "dropped",
    });
    const card = parseCard(text);
    expect(card).not.toBeNull();
    expect(card!.oneLiner).toBe("一句话选题");
    expect(card!.contentStructure).toEqual(["开头", "中段", "结尾"]); // non-strings dropped
    expect(card!.audiencePainScore).toBe(88);
    expect(card!.materialScore).toBeNull(); // clamped
    expect(card!.productionDifficulty).toBe("mid");
    expect((card as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("tolerates ```json fences and leading prose", () => {
    const text = '好的,这是选题卡:\n```json\n{"oneLiner":"X","audiencePain":"Y"}\n```';
    const card = parseCard(text);
    expect(card?.oneLiner).toBe("X");
  });

  it("returns null for an empty card (no oneLiner and no audiencePain)", () => {
    expect(parseCard(JSON.stringify({ hook: "只有钩子" }))).toBeNull();
    expect(parseCard("not json at all")).toBeNull();
    expect(parseCard("")).toBeNull();
  });

  it("coerces an invalid productionDifficulty to null", () => {
    const card = parseCard(
      JSON.stringify({ oneLiner: "x", productionDifficulty: "extreme" }),
    );
    expect(card?.productionDifficulty).toBeNull();
  });
});
