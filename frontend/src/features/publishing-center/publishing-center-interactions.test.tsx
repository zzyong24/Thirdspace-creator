import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { PublishingCenterPage } from "./publishing-center-page";

afterEach(cleanup);

const calendar = <div data-testid="calendar-survives">月历</div>;

describe("PublishingCenterPage 独立状态", () => {
  it("表现 loading 时月历继续可见", () => {
    const vm = buildPageScenario(
      () => buildPublishingCenterViewModel(),
      "loading",
    );
    const { container } = render(
      <PublishingCenterPage viewModel={vm} calendar={calendar} />,
    );
    expect(container.querySelector('[data-testid="calendar-survives"]')).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="publishing-performance-region"] [data-page-state="loading"]',
      ),
    ).not.toBeNull();
  });

  it("表现 error 时月历继续可见", () => {
    const vm = buildPageScenario(
      () => buildPublishingCenterViewModel(),
      "error",
    );
    const { container } = render(
      <PublishingCenterPage viewModel={vm} calendar={calendar} />,
    );
    expect(container.querySelector('[data-testid="calendar-survives"]')).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="publishing-performance-region"] [data-page-state="error"]',
      ),
    ).not.toBeNull();
  });

  it("publication 为空不触发全页 EmptyState", () => {
    const base = buildPublishingCenterViewModel();
    const { container } = render(
      <PublishingCenterPage
        viewModel={{
          ...base,
          scenario: "default",
          publications: [],
          metrics: base.metrics.map((metric) => ({
            ...metric,
            value: metric.id === "pubc-published-count" ? "0" : "—",
            delta: "",
          })),
          platformComparison: [],
          trend: [],
          topContent: [],
        }}
        calendar={calendar}
      />,
    );
    expect(container.querySelector('[data-page-state="empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="calendar-survives"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="analytics-rail"]')).not.toBeNull();
  });

  it("缺少月历 composition 时明确报错，不回退旧入口或 fixture", () => {
    const { container } = render(
      <PublishingCenterPage viewModel={buildPublishingCenterViewModel()} />,
    );
    const calendarRegion = container.querySelector(
      '[data-slot="publishing-calendar-region"]',
    )!;
    expect(
      calendarRegion.querySelector('[data-page-state="error"]'),
    ).not.toBeNull();
    expect(calendarRegion.textContent).toContain("内容日历暂时不可用");
    expect(
      container.querySelector('[data-slot="publishing-center-calendar-entry"]'),
    ).toBeNull();
  });
});
