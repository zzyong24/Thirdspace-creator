import { describe, expect, it } from "vitest";
import {
  type Cadence,
  compileCadenceToCron,
  compileCronToCadence,
  describeCadence,
  DEFAULT_CADENCE,
} from "./cadence";

// T-030-D7 友好频率 ⇄ cron 编译器测试(SPEC §8.1「去裸 crontab」)。
// 确定性:全纯函数,无 Date.now / 无随机。

describe("compileCadenceToCron — 友好频率 → cron", () => {
  it("每天 09:00 → `0 9 * * *`", () => {
    expect(
      compileCadenceToCron({
        mode: "period",
        unit: "daily",
        weekday: 1,
        hour: 9,
        minute: 0,
      }),
    ).toBe("0 9 * * *");
  });

  it("每周一 09:00 → `0 9 * * 1`", () => {
    expect(
      compileCadenceToCron({
        mode: "period",
        unit: "weekly",
        weekday: 1,
        hour: 9,
        minute: 0,
      }),
    ).toBe("0 9 * * 1");
  });

  it("每周日 20:30 → `30 20 * * 0`", () => {
    expect(
      compileCadenceToCron({
        mode: "period",
        unit: "weekly",
        weekday: 0,
        hour: 20,
        minute: 30,
      }),
    ).toBe("30 20 * * 0");
  });

  it("每 3 小时 → `0 */3 * * *`", () => {
    expect(
      compileCadenceToCron({ mode: "interval", unit: "hours", every: 3 }),
    ).toBe("0 */3 * * *");
  });

  it("每 30 分 → `*/30 * * * *`", () => {
    expect(
      compileCadenceToCron({ mode: "interval", unit: "minutes", every: 30 }),
    ).toBe("*/30 * * * *");
  });

  it("单次 7月1日 09:00 → `0 9 1 7 *`(每年近似)", () => {
    expect(
      compileCadenceToCron({
        mode: "once",
        month: 7,
        day: 1,
        hour: 9,
        minute: 0,
      }),
    ).toBe("0 9 1 7 *");
  });

  it("越界值被夹到合法域(脏输入不产非法 cron)", () => {
    // 时 99 → 23,分 -5 → 0
    expect(
      compileCadenceToCron({
        mode: "period",
        unit: "daily",
        weekday: 1,
        hour: 99,
        minute: -5,
      }),
    ).toBe("0 23 * * *");
    // 间隔 0 → 1
    expect(
      compileCadenceToCron({ mode: "interval", unit: "hours", every: 0 }),
    ).toBe("0 */1 * * *");
  });
});

describe("compileCronToCadence — cron → 友好频率(反解)", () => {
  it("`0 9 * * *` → 每天 09:00", () => {
    expect(compileCronToCadence("0 9 * * *")).toEqual({
      mode: "period",
      unit: "daily",
      weekday: 1,
      hour: 9,
      minute: 0,
    });
  });

  it("`0 9 * * 1` → 每周一 09:00", () => {
    expect(compileCronToCadence("0 9 * * 1")).toEqual({
      mode: "period",
      unit: "weekly",
      weekday: 1,
      hour: 9,
      minute: 0,
    });
  });

  it("`0 */3 * * *` → 每 3 小时", () => {
    expect(compileCronToCadence("0 */3 * * *")).toEqual({
      mode: "interval",
      unit: "hours",
      every: 3,
    });
  });

  it("`*/30 * * * *` → 每 30 分", () => {
    expect(compileCronToCadence("*/30 * * * *")).toEqual({
      mode: "interval",
      unit: "minutes",
      every: 30,
    });
  });

  it("`0 9 1 7 *` → 单次 7月1日 09:00", () => {
    expect(compileCronToCadence("0 9 1 7 *")).toEqual({
      mode: "once",
      month: 7,
      day: 1,
      hour: 9,
      minute: 0,
    });
  });

  it("空白归一:多空格 cron 仍可解", () => {
    expect(compileCronToCadence("  0   9   *  *  * ")).toEqual({
      mode: "period",
      unit: "daily",
      weekday: 1,
      hour: 9,
      minute: 0,
    });
  });

  it("不可解的复杂 cron → null(UI 降级显示原值)", () => {
    expect(compileCronToCadence("0 9,17 * * 1-5")).toBeNull();
    expect(compileCronToCadence("15 2 * * *")).not.toBeNull(); // 这个是合法 daily
    expect(compileCronToCadence("* * * * *")).toBeNull();
    expect(compileCronToCadence("garbage")).toBeNull();
  });
});

describe("round-trip:cadence → cron → cadence 幂等", () => {
  const cases: Cadence[] = [
    { mode: "period", unit: "daily", weekday: 1, hour: 9, minute: 0 },
    { mode: "period", unit: "daily", weekday: 1, hour: 15, minute: 45 },
    { mode: "period", unit: "weekly", weekday: 1, hour: 9, minute: 0 },
    { mode: "period", unit: "weekly", weekday: 5, hour: 20, minute: 30 },
    { mode: "interval", unit: "hours", every: 3 },
    { mode: "interval", unit: "hours", every: 6 },
    { mode: "interval", unit: "minutes", every: 30 },
    { mode: "interval", unit: "minutes", every: 15 },
    { mode: "once", month: 7, day: 1, hour: 9, minute: 0 },
    { mode: "once", month: 12, day: 25, hour: 8, minute: 0 },
  ];

  for (const c of cases) {
    it(`${describeCadence(c)} 反解回自身`, () => {
      const cron = compileCadenceToCron(c);
      const back = compileCronToCadence(cron);
      expect(back).toEqual(c);
    });
  }
});

describe("DEFAULT_CADENCE / describeCadence", () => {
  it("缺省频率是每天 09:00", () => {
    expect(compileCadenceToCron(DEFAULT_CADENCE)).toBe("0 9 * * *");
    expect(describeCadence(DEFAULT_CADENCE)).toBe("每天 09:00");
  });

  it("describeCadence 中文摘要", () => {
    expect(
      describeCadence({
        mode: "period",
        unit: "weekly",
        weekday: 1,
        hour: 9,
        minute: 0,
      }),
    ).toBe("每周一 09:00");
    expect(
      describeCadence({ mode: "interval", unit: "hours", every: 3 }),
    ).toBe("每 3 小时");
    expect(
      describeCadence({ mode: "interval", unit: "minutes", every: 30 }),
    ).toBe("每 30 分钟");
  });
});
