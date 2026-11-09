process.env.TZ = "Asia/Shanghai";
/**
 * 批次2-9（月明 2026-11-10，第一批遗留）：按日分桶/日期键一律用本机时区。
 * 北京时间早上 8 点前的时间戳在 UTC 仍是前一天，iso.slice(0,10) 会落到前一天。
 */
import { describe, expect, it } from "vitest";
import { snapshotDayKey } from "@/features/review/analytics-review-view-model";
import { formatLicenseDate } from "@/features/settings/settings-interactive-region";
import { buildMonthGrid } from "@/features/content-calendar/calendar-month";

describe("本机时区日期键", () => {
  it("复盘播放趋势：北京时间 11-10 07:30 的采集落在 11-10", () => {
    expect(snapshotDayKey("2026-11-09T23:30:00.000Z")).toBe("2026-11-10");
  });
  it("设置页授权到期：北京时间 12-01 00:00 到期显示 2026-12-01", () => {
    expect(formatLicenseDate("2026-11-30T16:00:00.000Z")).toBe("2026-12-01");
    expect(formatLicenseDate("坏值")).toBe("坏值");
  });
  it("内容日历格网是纯日历运算，不受时区影响（核对后无需改）", () => {
    const keys = buildMonthGrid("2026-11").flat().map((c) => c.dateKey);
    expect(keys[0]).toBe("2026-10-26");
    expect(keys.at(-1)).toBe("2026-12-06");
  });
});
