import { describe, it, expect } from "vitest";
import {
  PREFERENCE_WEIGHT_CAP,
  MIN_EXAMPLES_FOR_HARD,
  PREFERENCE_DECAY_WEEKS,
  clampPreferenceWeight,
  isHardPreference,
  weeksBetween,
  decayedWeight,
  isArchivable,
  computePreferenceAdjustment,
  rankWithExploration,
  type ActivePreference,
  type ScoredCandidate,
} from "./topic-preference-guardrail";

// [T-212d] 反过拟合护栏纯函数单测 —— 四条护栏逐条断言(SPEC §2.4 验收重点)。

describe("护栏① 权重 ±10 封顶 (clampPreferenceWeight)", () => {
  it("超过 +10 夹到 +10、低于 -10 夹到 -10", () => {
    expect(clampPreferenceWeight(37)).toBe(PREFERENCE_WEIGHT_CAP);
    expect(clampPreferenceWeight(11)).toBe(10);
    expect(clampPreferenceWeight(-25)).toBe(-PREFERENCE_WEIGHT_CAP);
    expect(clampPreferenceWeight(-10.4)).toBe(-10);
  });
  it("区间内四舍五入原样返回", () => {
    expect(clampPreferenceWeight(3.4)).toBe(3);
    expect(clampPreferenceWeight(-6.6)).toBe(-7);
    expect(clampPreferenceWeight(0)).toBe(0);
  });
  it("非有限值诚实降级为 0(不注入)", () => {
    expect(clampPreferenceWeight(NaN)).toBe(0);
    expect(clampPreferenceWeight(Infinity)).toBe(0);
  });
});

describe("护栏② ≥3 例才升级 (isHardPreference)", () => {
  it("<3 例不升级(单次淘汰只记不改规则)", () => {
    expect(isHardPreference(0)).toBe(false);
    expect(isHardPreference(1)).toBe(false);
    expect(isHardPreference(2)).toBe(false);
  });
  it("=3 例即升级为硬偏好,>3 亦然", () => {
    expect(MIN_EXAMPLES_FOR_HARD).toBe(3);
    expect(isHardPreference(3)).toBe(true);
    expect(isHardPreference(7)).toBe(true);
  });
});

describe("护栏③ 8 周衰减 + 过期归档 (weeksBetween/decayedWeight/isArchivable)", () => {
  it("周数纯计算,负龄记 0", () => {
    expect(weeksBetween("2026-01-01T00:00:00Z", "2026-01-08T00:00:00Z")).toBeCloseTo(1, 5);
    expect(weeksBetween("2026-01-08T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(0);
  });
  it("线性衰减:0 周原值、4 周半衰、8 周归 0", () => {
    expect(decayedWeight(10, 0)).toBe(10);
    expect(decayedWeight(10, 4)).toBe(5); // (8-4)/8 = 0.5
    expect(decayedWeight(8, 2)).toBe(6); // (8-2)/8 = 0.75 → 6
    expect(decayedWeight(10, 8)).toBe(0);
    expect(decayedWeight(10, 20)).toBe(0); // 过期不出现负值
  });
  it("负向权重同样按龄衰减", () => {
    expect(decayedWeight(-10, 4)).toBe(-5);
  });
  it("满 8 周即可归档", () => {
    expect(PREFERENCE_DECAY_WEEKS).toBe(8);
    expect(isArchivable(7.9)).toBe(false);
    expect(isArchivable(8)).toBe(true);
    expect(isArchivable(12)).toBe(true);
  });
});

describe("偏好调整量注入 (computePreferenceAdjustment)", () => {
  const now = "2026-03-01T00:00:00Z";
  const fresh = "2026-02-28T00:00:00Z"; // ~1 天前,几乎无衰减

  function pref(p: Partial<ActivePreference>): ActivePreference {
    return {
      keyword: "理论",
      direction: "avoid",
      weight: 8,
      exampleCount: 3,
      lastReinforcedAt: fresh,
      ...p,
    };
  }

  it("命中的硬偏好按方向注入:avoid 压分、prefer 抬分", () => {
    const avoid = computePreferenceAdjustment("纯理论解析", [pref({})], now);
    expect(avoid).toBeLessThan(0);
    const prefer = computePreferenceAdjustment(
      "真实案例复盘",
      [pref({ keyword: "案例", direction: "prefer", weight: 8 })],
      now,
    );
    expect(prefer).toBeGreaterThan(0);
  });

  it("护栏②:未达 3 例的偏好绝不注入(即便命中)", () => {
    const adj = computePreferenceAdjustment(
      "纯理论解析",
      [pref({ exampleCount: 2 })],
      now,
    );
    expect(adj).toBe(0);
  });

  it("护栏③:过期(≥8 周)偏好衰减为 0、不注入", () => {
    const stale = "2026-01-01T00:00:00Z"; // 距 now ~8.5 周
    const adj = computePreferenceAdjustment(
      "纯理论解析",
      [pref({ lastReinforcedAt: stale })],
      now,
    );
    expect(adj).toBe(0);
  });

  it("未命中 keyword 不贡献", () => {
    expect(computePreferenceAdjustment("美食探店", [pref({})], now)).toBe(0);
  });

  it("护栏①总量兜底:多条偏好叠加仍夹到 ±10", () => {
    const many = [
      pref({ keyword: "理论", weight: 10 }),
      pref({ keyword: "解析", weight: 10 }),
      pref({ keyword: "深度", weight: 10 }),
    ];
    const adj = computePreferenceAdjustment("理论解析深度长文", many, now);
    expect(adj).toBe(-PREFERENCE_WEIGHT_CAP); // 三条各 -10 叠加,总量夹到 -10
  });
});

describe("护栏④ 探索位 (rankWithExploration)", () => {
  // 5 个候选:c1 合偏好(高 adjusted),c5 被偏好狠压(adjusted 低但 base 最高)。
  const scored: ScoredCandidate[] = [
    { id: "c1", baseScore: 70, adjustedScore: 78 }, // prefer 抬分
    { id: "c2", baseScore: 60, adjustedScore: 62 },
    { id: "c3", baseScore: 55, adjustedScore: 55 },
    { id: "c4", baseScore: 50, adjustedScore: 48 },
    { id: "c5", baseScore: 90, adjustedScore: 80 }, // base 最高但被压;注意 adjusted 也高于多数
  ];

  it("无探索位 → 纯 adjustedScore 降序", () => {
    const out = rankWithExploration(scored, { limit: 3, explorationSlots: 0 });
    expect(out.map((c) => c.id)).toEqual(["c5", "c1", "c2"]);
  });

  it("保留探索位:被偏好压制但 base 高的候选获得出场机会", () => {
    // 构造:偏好把某个 base 高的候选压到 adjusted 很低,纯 adjusted 排序会漏掉它。
    const s: ScoredCandidate[] = [
      { id: "a", baseScore: 40, adjustedScore: 50 }, // 合偏好抬分
      { id: "b", baseScore: 42, adjustedScore: 49 },
      { id: "c", baseScore: 44, adjustedScore: 47 },
      { id: "hidden", baseScore: 95, adjustedScore: 20 }, // 被 avoid 狠压,adjusted 垫底
    ];
    const pure = rankWithExploration(s, { limit: 3, explorationSlots: 0 });
    expect(pure.map((c) => c.id)).toEqual(["a", "b", "c"]); // 纯利用位漏掉 hidden

    const withExplore = rankWithExploration(s, { limit: 3, explorationSlots: 1 });
    // 2 利用位(a,b)+ 1 探索位(剩余里 base 最高 = hidden)。
    expect(withExplore.map((c) => c.id)).toEqual(["a", "b", "hidden"]);
    expect(withExplore).toHaveLength(3);
  });

  it("探索位从剩余候选按 base 挑,不重复利用位已选", () => {
    const out = rankWithExploration(scored, { limit: 3, explorationSlots: 1 });
    const ids = out.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // 无重复
    expect(ids).toHaveLength(3);
  });

  it("limit=0 → 空;explorationSlots 超过 limit 不越界", () => {
    expect(rankWithExploration(scored, { limit: 0, explorationSlots: 2 })).toEqual([]);
    const out = rankWithExploration(scored, { limit: 2, explorationSlots: 5 });
    expect(out).toHaveLength(2);
  });
});
