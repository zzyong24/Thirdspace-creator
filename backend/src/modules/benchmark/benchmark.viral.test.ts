import { describe, it, expect } from "vitest";
import { detectViral, medianOf } from "./benchmark.viral";

// [T-212b] 爆款判定纯函数单测：绝对/相对/中位数边界/空输入/阈值配置化。

describe("medianOf", () => {
  it("空数组 → null", () => {
    expect(medianOf([])).toBeNull();
  });
  it("奇数个取中值", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });
  it("偶数个取中间两数均值", () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("detectViral", () => {
  it("空输入 → 空输出", () => {
    expect(detectViral([])).toEqual([]);
  });

  it("绝对爆款：digg ≥ 10000 判爆（即便未超中位数 3 倍）", () => {
    // 一批全是万赞级 → 中位数也很高，相对判据不一定命中，但绝对判据兜住。
    const works = [
      { awemeId: "a", diggCount: 12000 },
      { awemeId: "b", diggCount: 11000 },
      { awemeId: "c", diggCount: 10000 },
    ];
    const out = detectViral(works);
    expect(out.every((v) => v.isViral)).toBe(true);
  });

  it("相对爆款（黑马）：digg ≥ 3× 中位数 且 ≥ 1000", () => {
    // 中位数 = 200；黑马 5000 ≥ 3×200=600 且 ≥1000 → 爆；其余低量级不爆。
    const works = [
      { awemeId: "low1", diggCount: 100 },
      { awemeId: "low2", diggCount: 200 },
      { awemeId: "low3", diggCount: 300 },
      { awemeId: "horse", diggCount: 5000 },
    ];
    const out = detectViral(works);
    const byId = Object.fromEntries(out.map((v) => [v.awemeId, v]));
    expect(byId.horse!.isViral).toBe(true);
    expect(byId.low1!.isViral).toBe(false);
    expect(byId.low3!.isViral).toBe(false);
  });

  it("相对下限 relativeFloor 兜底：超中位数 3 倍但 < 1000 不判爆", () => {
    // 中位数 = 100；某条 400 ≥ 3×100=300 但 < 1000 → 不爆（防低量级批把几百赞当黑马）。
    const works = [
      { awemeId: "x", diggCount: 50 },
      { awemeId: "y", diggCount: 100 },
      { awemeId: "z", diggCount: 150 },
      { awemeId: "spike", diggCount: 400 },
    ];
    const out = detectViral(works);
    const spike = out.find((v) => v.awemeId === "spike")!;
    expect(spike.isViral).toBe(false);
  });

  it("viralMultiple = digg / 中位数", () => {
    const works = [
      { awemeId: "a", diggCount: 100 },
      { awemeId: "b", diggCount: 300 },
      { awemeId: "c", diggCount: 900 },
    ];
    // 中位数 = 300。
    const out = detectViral(works);
    const byId = Object.fromEntries(out.map((v) => [v.awemeId, v]));
    expect(byId.a!.viralMultiple).toBeCloseTo(100 / 300);
    expect(byId.c!.viralMultiple).toBeCloseTo(900 / 300);
  });

  it("全 0 赞退化批：除零兜底，不误判爆款", () => {
    const works = [
      { awemeId: "a", diggCount: 0 },
      { awemeId: "b", diggCount: 0 },
    ];
    const out = detectViral(works);
    expect(out.every((v) => v.isViral === false)).toBe(true);
    // median=0 → denom=1 → viralMultiple=digg=0，无 NaN/Infinity。
    expect(out.every((v) => Number.isFinite(v.viralMultiple))).toBe(true);
  });

  it("单条输入：中位数=自身，绝对阈值仍生效", () => {
    expect(detectViral([{ awemeId: "solo", diggCount: 50000 }])[0]!.isViral).toBe(
      true,
    );
    expect(detectViral([{ awemeId: "solo", diggCount: 50 }])[0]!.isViral).toBe(
      false,
    );
  });

  it("阈值配置化：调低绝对阈值改变判定", () => {
    const works = [{ awemeId: "a", diggCount: 500 }];
    expect(detectViral(works)[0]!.isViral).toBe(false);
    expect(
      detectViral(works, { absoluteThreshold: 100 })[0]!.isViral,
    ).toBe(true);
  });

  it("输出顺序与输入一致", () => {
    const works = [
      { awemeId: "first", diggCount: 1 },
      { awemeId: "second", diggCount: 2 },
    ];
    const out = detectViral(works);
    expect(out.map((v) => v.awemeId)).toEqual(["first", "second"]);
  });
});
