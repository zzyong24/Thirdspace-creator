import { describe, it, expect } from "vitest";
import {
  calibrationScoreSchema,
  type CalibrationScoreOutput,
} from "@creatoros/ai-worker";
import { normalizeScore } from "./calibration-score-runner";

type CalibrationScore = CalibrationScoreOutput;

// Pure-function tests for the calibration.score runner (no Agent SDK / LLM). The schema is
// the every-round 约束 (generateObject binds it; an out-of-range/non-int score is rejected by
// Zod). normalizeScore intersects the model's already-validated output with the REAL
// prediction dimension keys (a hallucinated key is dropped); deterministic.

const RUBRIC_KEYS = new Set(["hook", "persona", "cta"]);

describe("calibrationScoreSchema (every-round schema 约束)", () => {
  it("accepts well-formed 维度真实分", () => {
    const parsed = calibrationScoreSchema.safeParse({
      dimensions: [{ key: "hook", score: 4, reason: "完播率 62% 偏高,钩子有效" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an out-of-range score (防发散:1-5 整数)", () => {
    expect(
      calibrationScoreSchema.safeParse({
        dimensions: [{ key: "hook", score: 9, reason: "x" }],
      }).success,
    ).toBe(false);
    expect(
      calibrationScoreSchema.safeParse({
        dimensions: [{ key: "hook", score: 3.5, reason: "x" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty dimensions array", () => {
    expect(
      calibrationScoreSchema.safeParse({ dimensions: [] }).success,
    ).toBe(false);
  });
});

describe("normalizeScore (collapse onto real prediction dimensions)", () => {
  it("keeps only real rubric keys, trims reasons", () => {
    const object: CalibrationScore = {
      dimensions: [
        { key: "hook", score: 4, reason: "  完播率高  " },
        { key: "persona", score: 2, reason: "人群泛" },
        { key: "bogus", score: 5, reason: "幻觉维度" }, // not a real dimension → dropped
      ],
    };
    const out = normalizeScore(object, RUBRIC_KEYS);
    expect(out.map((d) => d.key)).toEqual(["hook", "persona"]);
    expect(out[0]!.score).toBe(4);
    expect(out[0]!.reason).toBe("完播率高"); // trimmed
  });

  it("returns [] when every dimension is hallucinated", () => {
    const object: CalibrationScore = {
      dimensions: [{ key: "ghost", score: 5, reason: "x" }],
    };
    expect(normalizeScore(object, RUBRIC_KEYS)).toEqual([]);
  });
});
