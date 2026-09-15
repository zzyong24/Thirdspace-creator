import * as React from "react";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPublishingCenterViewModel } from "@/fixtures/selectors";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

type PublishingCenterPageProps = React.ComponentProps<
  typeof import("./publishing-center-page").PublishingCenterPage
>;

async function renderPublishingCenter(
  overrides: Partial<PublishingCenterPageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { PublishingCenterPage } = await import("./publishing-center-page");
  return render(
    <AppShell
      pathname="/publishing"
      headerMode="global"
      pageTitle="发布中心"
      pageDescription="已发布内容、表现与排期"
    >
      <PublishingCenterPage
        viewModel={buildPublishingCenterViewModel()}
        calendar={<div data-testid="composed-calendar">真实月历</div>}
        {...overrides}
      />
    </AppShell>,
  );
}

describe("PublishingCenterPage", () => {
  afterEach(cleanup);

  it("沿用全局 Header 与单一 AppShell", async () => {
    const { container } = await renderPublishingCenter();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).toHaveAttribute("data-mode", "global");
    expect(
      container.querySelector('[data-slot="header-page-heading"]')?.textContent,
    ).toContain("发布中心");
    expect(container.querySelectorAll('[data-slot="app-shell"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="app-sidebar"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="app-top-header"]')).toHaveLength(1);
  });

  it("保持发布中心导航激活和 assistant 上下文卡", async () => {
    const { container } = await renderPublishingCenter();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    expect(within(nav).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/publishing",
    );
    expect(
      container.querySelector(
        '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
      ),
    ).toBeNull();
  });

  it("月历是左侧主区域，真实表现是右侧辅助区域", async () => {
    const { container } = await renderPublishingCenter();
    expect(container.querySelector('[data-testid="composed-calendar"]')).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="publishing-calendar-region"] [data-testid="composed-calendar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="publishing-performance-region"] [data-slot="analytics-rail"]',
      ),
    ).not.toBeNull();
  });

  it("右侧只保留紧凑指标，热门内容下沉到月历后的全宽区域", async () => {
    const { container } = await renderPublishingCenter();
    const rail = container.querySelector('[data-slot="analytics-rail"]')!;
    const slots = [
      "publishing-metrics",
      "platform-comparison-chart",
      "trend-chart",
    ];
    const nodes = slots.map((slot) =>
      rail.querySelector(`[data-slot="${slot}"]`),
    );
    expect(nodes.every(Boolean)).toBe(true);
    for (let index = 1; index < nodes.length; index += 1) {
      expect(
        (nodes[index - 1] as Element).compareDocumentPosition(
          nodes[index] as Element,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(rail.querySelector('[data-slot="top-content-list"]')).toBeNull();

    const primary = container.querySelector(
      '[data-slot="publishing-center-primary-row"]',
    )!;
    const details = container.querySelector(
      '[data-slot="publishing-center-details"]',
    )!;
    expect(details.querySelector('[data-slot="top-content-list"]')).not.toBeNull();
    expect(
      primary.compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("不再渲染历史库存交互", async () => {
    const { container } = await renderPublishingCenter();
    for (const slot of [
      "publishing-center-calendar-entry",
      "content-type-tabs",
      "publishing-toolbar",
      "publication-table",
      "pagination",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).toBeNull();
    }
  });
});
