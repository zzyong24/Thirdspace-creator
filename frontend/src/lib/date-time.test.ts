process.env.TZ = "Asia/Shanghai";
import { describe, expect, it } from "vitest";
import { formatLocalDay } from "./date-time";

describe("界面日期按本机时区显示（月明录屏 2026-11-10：知识库显示成前一天）", () => {
  it("北京时间 11-10 凌晨新建（UTC 仍是 11-09）显示 2026-11-10", () => {
    expect(formatLocalDay("2026-11-09T17:30:00.000Z")).toBe("2026-11-10");
    expect(formatLocalDay("2026-11-10T01:05:00+08:00")).toBe("2026-11-10");
  });
  it("纯日期原样返回，空值返回空串", () => {
    expect(formatLocalDay("2026-11-09")).toBe("2026-11-09");
    expect(formatLocalDay(null)).toBe("");
  });
});
