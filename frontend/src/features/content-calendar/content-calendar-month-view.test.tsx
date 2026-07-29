import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// T-083a 月历格样板测试:publications 真数据落格、单日多条「+N」折叠、
// 过去空格淡色(data-gap)、月份静态跳转锚点、日详情抽屉(只读,跳稿面链接)。
// Deterministic — month/referenceDateKey 都是注入 props;NO Date.now。

import { ContentCalendarView } from "./content-calendar-view";
import {
  buildMonthGrid,
  nextMonthOf,
  prevMonthOf,
  normalizeMonth,
  localDateKey,
  localMonthKey,
} from "./calendar-month";
import type {
  CalendarPublicationItem,
  ContentCalendarViewModel,
} from "./content-calendar-page";

const routerPush = vi.fn();
const routerPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    prefetch: routerPrefetch,
  }),
}));

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  routerPrefetch.mockReset();
});

function pub(
  id: string,
  dateKey: string,
  title: string,
  views = "暂无数据",
): CalendarPublicationItem {
  return {
    id,
    dateKey,
    title,
    projectId: `proj-${id}`,
    platformLabel: "抖音",
    views,
    coverAssetId: null,
  };
}

function vm(
  overrides: Partial<ContentCalendarViewModel>,
): ContentCalendarViewModel {
  return {
    accountId: "acct-d",
    accounts: [],
    month: "2026-03",
    referenceDateKey: "2026-07-03",
    publications: [],
    entries: [],
    projects: [],
    cadence: null,
    attainment: null,
    window: {
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-04-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("content-calendar month grid (T-083a)", () => {
  it("month math helpers are pure and correct across year boundaries", () => {
    expect(nextMonthOf("2026-12")).toBe("2027-01");
    expect(prevMonthOf("2026-01")).toBe("2025-12");
    expect(normalizeMonth("2026-03")).toBe("2026-03");
    expect(normalizeMonth("2026-13")).toBeNull();
    expect(normalizeMonth("bogus")).toBeNull();
    expect(normalizeMonth(undefined)).toBeNull();
  });

  // [FE-H04] 「今天」派生:本地日历日/月(用户所在时区),供 page 缺省月/参考日用。
  // 用本地构造器固定日期,与测试机时区无关(TZ-robust)。
  it("localDateKey / localMonthKey derive the local calendar day/month of a Date", () => {
    const d = new Date(2026, 6, 15, 10, 30, 0); // 本地 2026-07-15 10:30
    expect(localDateKey(d)).toBe("2026-07-15");
    expect(localMonthKey(d)).toBe("2026-07");
    // 个位月/日补零。
    expect(localDateKey(new Date(2026, 0, 3, 0, 0, 0))).toBe("2026-01-03");
  });

  it("buildMonthGrid lays out 2026-03 Monday-first with correct padding", () => {
    const weeks = buildMonthGrid("2026-03");
    // 2026-03-01 是周日 → 前置补位 6 格(周一..周六都是 2 月尾)。
    expect(weeks[0]![6]!.dateKey).toBe("2026-03-01");
    expect(weeks[0]![0]!.inMonth).toBe(false);
    // 3 月 31 天,6+31=37 → 补到 42 格 = 6 周。
    expect(weeks).toHaveLength(6);
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("renders publications into their day cells and folds a 7-item day to +5", () => {
    const dense = [
      ...Array.from({ length: 7 }, (_, i) =>
        pub(`p${i}`, "2026-03-24", `作品 ${i}`, `${i + 1}00 播放`),
      ),
      pub("q1", "2026-03-13", "单条日作品"),
    ];
    render(<ContentCalendarView viewModel={vm({ publications: dense })} />);

    const denseCell = screen.getByTestId("calendar-day-2026-03-24");
    expect(denseCell.getAttribute("data-count")).toBe("7");
    // MAX 2 chips 平铺,其余折叠(此日 7 条 → 2 显示 +5 折叠,对应 SPEC 高密日验证)。
    const chips = denseCell.querySelectorAll(
      '[data-testid="calendar-pub-chip"]',
    );
    expect(chips).toHaveLength(2);
    expect(
      denseCell.querySelector('[data-testid="calendar-cell-overflow"]')
        ?.textContent,
    ).toBe("+5");
    // 摘要行照实计数。
    expect(
      screen.getByTestId("calendar-month-summary").textContent,
    ).toContain("本月发布 8 条");
  });

  it("marks past in-month empty days as gap (空窗淡色) but not future days", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          month: "2026-07",
          referenceDateKey: "2026-07-03",
          publications: [pub("p1", "2026-07-01", "七月发布")],
          window: {
            from: "2026-07-01T00:00:00.000Z",
            to: "2026-08-01T00:00:00.000Z",
          },
        })}
      />,
    );
    // 过去且空 → data-gap;有发布的过去日 / 未来日 → 无 data-gap。
    expect(
      screen.getByTestId("calendar-day-2026-07-02").getAttribute("data-gap"),
    ).toBe("true");
    expect(
      screen.getByTestId("calendar-day-2026-07-01").getAttribute("data-gap"),
    ).toBeNull();
    expect(
      screen.getByTestId("calendar-day-2026-07-15").getAttribute("data-gap"),
    ).toBeNull();
  });

  it("月份切换走客户端路由并保留当前页面，不触发 WebView 整页白屏", () => {
    const { rerender } = render(<ContentCalendarView viewModel={vm({})} />);
    const previous = screen.getByTestId("calendar-prev-month");
    const next = screen.getByTestId("calendar-next-month");
    expect(previous.tagName).toBe("BUTTON");
    expect(next.tagName).toBe("BUTTON");

    fireEvent.click(previous);
    expect(routerPush).toHaveBeenLastCalledWith(
      "/publishing?month=2026-02",
      { scroll: false },
    );
    // 新月份 RSC 尚未读回时，旧月标题和格网仍留在页面上，不卸载成白屏。
    expect(screen.getByTestId("calendar-month-title")).toHaveTextContent(
      "2026年3月",
    );
    expect(screen.getByTestId("calendar-month-grid")).toBeInTheDocument();

    fireEvent.click(next);
    expect(routerPush).toHaveBeenLastCalledWith(
      "/publishing?month=2026-04",
      { scroll: false },
    );
    rerender(
      <ContentCalendarView
        viewModel={vm({
          month: "2026-04",
          window: {
            from: "2026-04-01T00:00:00.000Z",
            to: "2026-05-01T00:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByTestId("calendar-month-title")).toHaveTextContent(
      "2026年4月",
    );
  });

  it("clicking a day opens the read-only drawer with per-item稿面 links", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          publications: [
            pub("p1", "2026-03-24", "抽屉作品一", "3.5万 播放"),
            pub("p2", "2026-03-24", "抽屉作品二"),
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("calendar-day-2026-03-24"));
    const drawer = screen.getByTestId("calendar-day-drawer");
    expect(drawer.getAttribute("data-date")).toBe("2026-03-24");
    const items = screen.getAllByTestId("calendar-drawer-pub");
    expect(items).toHaveLength(2);
    // 播放数照实渲:有数字显数字,无快照显「暂无数据」(不造假)。
    expect(items[0]!.textContent).toContain("3.5万 播放");
    expect(items[1]!.textContent).toContain("暂无数据");
    const links = screen.getAllByTestId("calendar-drawer-pub-link");
    expect(links[0]!.getAttribute("href")).toBe("/projects/proj-p1");
    // [FE-M01] 关闭:抽屉是 Sheet(Radix Dialog),点内置关闭按钮(sr-only「Close」)即关。
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });

  it("empty day cells are not clickable (no drawer)", () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    fireEvent.click(screen.getByTestId("calendar-day-2026-03-10"));
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });

  // [FE-M01] 无障碍:可点开的日历格是原生 <button>(键盘可聚焦 + Enter/Space 触发),
  // 过去空窗格不是 button(不可聚焦);抽屉是 role=dialog,Escape 可关。
  it("有内容的日期格是键盘可达 button；空日期格不再承载自由排期入口", () => {
    render(
      <ContentCalendarView
        viewModel={vm({
          month: "2026-07",
          referenceDateKey: "2026-07-03",
          publications: [pub("p1", "2026-07-01", "七月发布")],
          window: {
            from: "2026-07-01T00:00:00.000Z",
            to: "2026-08-01T00:00:00.000Z",
          },
        })}
      />,
    );
    // 未来空格 07-15 只读 → <div>，排期入口统一在项目列表。
    const future = screen.getByTestId("calendar-day-2026-07-15");
    expect(future.tagName).toBe("DIV");
    // 有真实发布的 07-01 仍可点 → <button>。
    const published = screen.getByTestId("calendar-day-2026-07-01");
    expect(published.tagName).toBe("BUTTON");
    expect(published).toHaveAttribute("type", "button");
    // 过去空窗 07-02 不可点 → <div>(非 button)。
    const gap = screen.getByTestId("calendar-day-2026-07-02");
    expect(gap.tagName).toBe("DIV");
  });

  it("day-cell drawer is a role=dialog and closes on Escape (Sheet focus-trap)", () => {
    render(
      <ContentCalendarView
        viewModel={vm({ publications: [pub("p1", "2026-03-24", "抽屉作品")] })}
      />,
    );
    fireEvent.click(screen.getByTestId("calendar-day-2026-03-24"));
    // Radix Dialog content 暴露 role=dialog(focus trap 容器)。
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Escape 关闭(键盘可达)。
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });
});
