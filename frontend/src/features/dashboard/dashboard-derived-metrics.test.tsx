/**
 * Derived-metric tests for the Dashboard (Increment 4 / R1-4 + R1-7).
 *
 * The summary metrics must be DERIVED from the canonical dataset rather
 * than carried as disconnected literals, so each card reconciles with a
 * fixture aggregation:
 *  - 累计播放 == sum of the `views` MetricValue rows,
 *  - 进行中项目 == count of projects with status "active",
 *  - 素材库 == asset count.
 * [T-143 ②] 首页内容区的重复 AI 助手卡已删,本文件转为断言它不再渲染
 * (侧栏底部的 AI 助手入口由 (creator)/layout 的 Sidebar 单独挂载,不在本页组件树内)。
 *
 * Determinism: every aggregation is a pure reduction over the canonical
 * dataset — no Date.now / Math.random / network.
 */

import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// [T-247] TodoCard 成为 client 岛(useRouter → tasks.patch 后 refresh),
// 本文件在 App Router provider 外渲整页,故 mock next/navigation。
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

import { buildDashboardViewModel } from "@/fixtures/selectors";
import { canonicalDataset } from "@/fixtures/canonical";
import { DashboardPage } from "./dashboard-page";

afterEach(() => cleanup());

function sumViews(): number {
  return canonicalDataset.metricValues
    .filter((m) => m.metricKey === "views")
    .reduce((sum, m) => sum + m.numericValue, 0);
}

describe("Dashboard derived metrics", () => {
  it("累计播放 metric is derived from the sum of view MetricValues", () => {
    const vm = buildDashboardViewModel();
    const views = vm.metrics.find((m) => m.id === "m-views");
    expect(views).toBeDefined();
    // Aggregation = 18420 + 9340 = 27760 -> "2.78w".
    const expected = sumViews();
    expect(expected).toBe(27760);
    expect(views!.value).toBe(`${(expected / 10000).toFixed(2)}w`);
  });

  it("进行中项目 metric equals the count of active projects", () => {
    const vm = buildDashboardViewModel();
    const active = vm.metrics.find((m) => m.id === "m-active-projects");
    const expected = canonicalDataset.projects.filter(
      (p) => p.status === "active",
    ).length;
    expect(expected).toBe(2);
    expect(active!.value).toBe(String(expected));
  });

  it("素材库 metric equals the canonical asset count", () => {
    const vm = buildDashboardViewModel();
    const assets = vm.metrics.find((m) => m.id === "m-assets");
    expect(assets!.value).toBe(String(canonicalDataset.assets.length));
    expect(canonicalDataset.assets.length).toBe(6);
  });

  it("已完成 metric equals the count of published publications", () => {
    const vm = buildDashboardViewModel();
    const pubs = vm.metrics.find((m) => m.id === "m-publications");
    const expected = canonicalDataset.publications.filter(
      (p) => p.status === "published",
    ).length;
    expect(expected).toBe(3);
    expect(pubs!.value).toBe(String(expected));
  });

  it("recent publication engagement is derived (likes + comments), not zero", () => {
    const vm = buildDashboardViewModel();
    const total = vm.recentPublications.reduce((s, r) => s + r.engagement, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("[T-143 ②] 首页内容区不再渲染多余的 AI 助手卡(侧栏的 SidebarContextualCard 才是保留入口)", async () => {
    // `DashboardPage` is an async Server Component; drive it through the
    // `viewModel?` override seam with the fixture-composed view model and
    // resolve it to a concrete element so the render stays synchronous.
    const element = await DashboardPage({ viewModel: buildDashboardViewModel() });
    const { container } = render(element);
    // 首页内容区那张重复的 AI 助手卡已删;侧栏底部的 AI 助手入口不在本页组件树内,
    // 由 (creator)/layout 的 Sidebar 单独挂载,故此处应查无。
    const card = container.querySelector('[data-slot="sidebar-assistant-card"]');
    expect(card).toBeNull();
    expect(container.textContent ?? "").not.toContain("AI 助手");
  });
});
