import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// T-083a 月历格样板测试:publications 真数据落格、单日多条「+N」折叠、
// 过去空格淡色(data-gap)、月份静态跳转锚点、日详情抽屉(只读,跳稿面链接)。
// Deterministic — month/referenceDateKey 都是注入 props;NO Date.now。

import { ContentCalendarView } from "./content-calendar-view";
import {
  buildMonthGrid,
  nextMonthOf,
  prevMonthOf,
  normalizeMonth,
} from "./calendar-month";
import type {
  CalendarPublicationItem,
  ContentCalendarViewModel,
} from "./content-calendar-page";

afterEach(() => cleanup());

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

  it("month nav anchors point at prev/next month (static jump)", () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    expect(
      screen.getByTestId("calendar-prev-month").getAttribute("href"),
    ).toBe("/calendar?month=2026-02");
    expect(
      screen.getByTestId("calendar-next-month").getAttribute("href"),
    ).toBe("/calendar?month=2026-04");
    expect(screen.getByTestId("calendar-month-title").textContent).toBe(
      "2026年3月",
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
    // 关闭:点遮罩。
    fireEvent.click(screen.getByTestId("calendar-drawer-overlay"));
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });

  it("empty day cells are not clickable (no drawer)", () => {
    render(<ContentCalendarView viewModel={vm({})} />);
    fireEvent.click(screen.getByTestId("calendar-day-2026-03-10"));
    expect(screen.queryByTestId("calendar-day-drawer")).toBeNull();
  });
});
