import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// [FE-H04] 「今天」= 真实系统 now,经 ContentCalendarPage 的可注入 `now` clock 派生。
// 本测注入固定 Date,证明「参考日 / 缺省月」从 now 派生(不再写死 2026-07-03):
// 过去日 = 空窗淡色(data-gap)、今天/未来格可点(button)。
//
// 只验时钟派生 → mock 掉 server 数据装配(publishing 装配链 + server client),
// 避免拉真 SQL;账号读返回一个 active 号让月历格真渲染。

vi.mock("@/lib/contract-client.server", () => ({ client: {} }));
vi.mock("@/features/publishing-center/publishing-center-data", () => ({
  buildPublishingCenterViewModelReal: vi.fn(async () => ({ publications: [] })),
}));

import { ContentCalendarPage } from "./content-calendar-page";

afterEach(() => cleanup());

// loadViewModel 直接调用的读:账号(需一个 active 号)、日历、项目、节奏、达成率。
// publications 走被 mock 的装配器,故 outputs/publications/revisions/analytics 不被触达。
const mockClient = {
  listAccounts: vi.fn(async () => [{ id: "acct-x", status: "active" }]),
  listCalendar: vi.fn(async () => []),
  listProjects: vi.fn(async () => []),
  getCadence: vi.fn(async () => null),
  getCadenceAttainment: vi.fn(async () => ({})),
};

describe("content-calendar 今天=真实 now (FE-H04, 可注入 clock)", () => {
  it("注入固定 now → 缺省月/参考日从 now 派生;过去日=空窗,今天/未来可点", async () => {
    // 用本地构造器固定「今天」= 本地 2026-07-15,localDateKey 与测试机时区无关。
    const now = new Date(2026, 6, 15, 10, 0, 0);
    // [T-332 S4] 页面不再自选首号:显式传 ctx 当前号(本测关注时钟派生,不关注选号)。
    const ui = await ContentCalendarPage({
      now,
      client: mockClient as never,
      currentAccountId: "acct-x",
    });
    render(ui);

    // 缺省月 = now 所在本地月。
    expect(
      screen.getByTestId("content-calendar").getAttribute("data-month"),
    ).toBe("2026-07");

    // 修 bug 的核心断言:07-10 现在是「过去空窗」(data-gap),不再被当未来。
    const past = screen.getByTestId("calendar-day-2026-07-10");
    expect(past.getAttribute("data-gap")).toBe("true");
    expect(past.getAttribute("data-openable")).toBeNull();

    // 今天 07-15:不是 gap,且可点(原生 button)。
    const today = screen.getByTestId("calendar-day-2026-07-15");
    expect(today.getAttribute("data-gap")).toBeNull();
    expect(today.getAttribute("data-openable")).toBe("true");
    expect(today.tagName).toBe("BUTTON");

    // 未来 07-20:可点、非 gap。
    const future = screen.getByTestId("calendar-day-2026-07-20");
    expect(future.getAttribute("data-gap")).toBeNull();
    expect(future.getAttribute("data-openable")).toBe("true");
  });

  it("显式 ?month 覆盖缺省(clock 只定缺省月/今天,不夺显式路由)", async () => {
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const ui = await ContentCalendarPage({
      now,
      month: "2026-09",
      client: mockClient as never,
      currentAccountId: "acct-x", // [T-332 S4] 同上:显式当前号
    });
    render(ui);
    expect(
      screen.getByTestId("content-calendar").getAttribute("data-month"),
    ).toBe("2026-09");
  });
});
