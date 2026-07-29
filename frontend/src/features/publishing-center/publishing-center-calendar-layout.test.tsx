import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PublishingCenterViewModel } from "./publishing-center-page";
import { PublishingCenterPage } from "./publishing-center-page";

afterEach(cleanup);

function viewModel(
  overrides: Partial<PublishingCenterViewModel> = {},
): PublishingCenterViewModel {
  return {
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: null,
    contentTypeTabs: [],
    publications: [],
    metrics: [
      {
        id: "published-count",
        label: "已发布",
        value: "0",
        delta: "",
        trend: "flat",
        tone: "neutral",
      },
    ],
    platformComparison: [],
    trend: [],
    topContent: [],
    pagination: { currentPage: 1, totalPages: 1 },
    ...overrides,
  };
}

function Calendar({ state = "ready" }: { state?: "ready" | "error" }) {
  return (
    <div data-testid="real-calendar" data-calendar-state={state}>
      {state === "ready" ? "真实内容月历" : "月历加载失败"}
    </div>
  );
}

describe("T-599 发布中心日历主视图", () => {
  it("以左月历、右概览的 70/30 主行呈现，并把热门内容铺到下方避免单侧长尾", () => {
    const { container } = render(
      <PublishingCenterPage
        viewModel={viewModel({
          topContent: [
            {
              id: "publication-1",
              title: "真实热门内容",
              platform: "douyin",
              platformLabel: "抖音",
              views: "1.2万播放",
              engagement: "600互动",
            },
          ],
        })}
        calendar={<Calendar />}
      />,
    );

    const layout = container.querySelector(
      '[data-slot="publishing-center-layout"]',
    );
    expect(layout).not.toBeNull();
    expect(layout).toHaveAttribute("data-layout", "calendar-70-performance-30");
    expect(
      container.querySelector('[data-slot="publishing-center-primary-row"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="publishing-calendar-region"]'),
    ).toContainElement(container.querySelector('[data-testid="real-calendar"]'));
    expect(
      container.querySelector('[data-slot="publishing-performance-region"]'),
    ).toContainElement(container.querySelector('[data-slot="analytics-rail"]'));
    expect(
      container.querySelector(
        '[data-slot="publishing-performance-region"] [data-slot="top-content-list"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-slot="publishing-center-details"] [data-slot="top-content-list"]',
      ),
    ).not.toBeNull();
  });

  it("删除重复库存、筛选、分页和旧日历入口", () => {
    const { container, queryByText } = render(
      <PublishingCenterPage
        viewModel={viewModel()}
        calendar={<Calendar />}
      />,
    );

    expect(
      container.querySelector('[data-slot="publishing-center-calendar-entry"]'),
    ).toBeNull();
    expect(container.querySelector('[data-slot="content-type-tabs"]')).toBeNull();
    expect(container.querySelector('[data-slot="publishing-toolbar"]')).toBeNull();
    expect(container.querySelector('[data-slot="publication-table"]')).toBeNull();
    expect(container.querySelector('[data-slot="pagination"]')).toBeNull();
    expect(queryByText("打开日历 →")).toBeNull();
    expect(queryByText("待优化")).toBeNull();
  });

  it("0 条 publication 仍保留月历和真实 0/空表现", () => {
    const { container } = render(
      <PublishingCenterPage
        viewModel={viewModel({ publications: [] })}
        calendar={<Calendar />}
      />,
    );

    expect(container.querySelector('[data-page-state="empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="real-calendar"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="publishing-metrics"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="platform-comparison-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="trend-chart-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="top-content-empty"]')).not.toBeNull();
  });

  it("只有一个采集日时显示真实单点摘要，不绘制空趋势图", () => {
    const { container } = render(
      <PublishingCenterPage
        viewModel={viewModel({
          trend: [{ label: "2026-07-29", value: 566731 }],
        })}
        calendar={<Calendar />}
      />,
    );

    expect(
      container.querySelector('[data-slot="trend-chart-single-point"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="trend-chart"]'),
    ).toBeNull();
  });

  it("月历失败不遮住表现，表现失败也不遮住月历", () => {
    const calendarFailure = render(
      <PublishingCenterPage
        viewModel={viewModel()}
        calendar={<Calendar state="error" />}
      />,
    );
    expect(
      calendarFailure.container.querySelector('[data-calendar-state="error"]'),
    ).not.toBeNull();
    expect(
      calendarFailure.container.querySelector('[data-slot="analytics-rail"]'),
    ).not.toBeNull();
    calendarFailure.unmount();

    const performanceFailure = render(
      <PublishingCenterPage
        viewModel={viewModel({
          error: { code: "performance_unavailable", message: "表现加载失败" },
        })}
        calendar={<Calendar />}
      />,
    );
    expect(
      performanceFailure.container.querySelector('[data-testid="real-calendar"]'),
    ).not.toBeNull();
    expect(
      performanceFailure.container.querySelector(
        '[data-slot="publishing-performance-region"] [data-page-state="error"]',
      ),
    ).not.toBeNull();
  });
});
