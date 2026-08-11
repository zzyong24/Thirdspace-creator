import { describe, expect, it } from "vitest";

import { isBlindPredictionStale } from "./script-result-freshness";

describe("T-767 盲预测与当前脚本版本的新鲜度", () => {
  it("脚本版本晚于预测时判旧预测过期", () => {
    expect(
      isBlindPredictionStale(
        "2026-08-11T08:00:00.000Z",
        "2026-08-11T08:01:00.000Z",
      ),
    ).toBe(true);
  });

  it("预测不早于当前脚本或时间无效时不猜测过期", () => {
    expect(
      isBlindPredictionStale(
        "2026-08-11T08:02:00.000Z",
        "2026-08-11T08:01:00.000Z",
      ),
    ).toBe(false);
    expect(isBlindPredictionStale("invalid", "2026-08-11T08:01:00.000Z")).toBe(false);
    expect(isBlindPredictionStale(null, "2026-08-11T08:01:00.000Z")).toBe(false);
  });
});
