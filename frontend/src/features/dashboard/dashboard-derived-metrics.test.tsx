/**
 * Derived-metric tests for the dashboard selector (Increment 4 / R1-4).
 *
 * `buildDashboardViewModel()` 仍是今日台读侧的组成口径(getDashboard DTO 同形),
 * 其聚合必须从 canonical dataset 派生而非散落字面量:
 *  - 累计播放 == sum of the `views` MetricValue rows,
 *  - 进行中项目 == count of projects with status "active",
 *  - 素材库 == asset count。
 *
 * [T-063b] 今日台重构后 5 指标行不再上屏(指标收窄为一条趋势行),但 selector
 * 口径继续被 dataOverview/趋势行消费,聚合正确性仍在此锁定。原
 * SidebarAssistantCard 渲染断言随卡片移除删除(Copilot 入口在队列空态深链)。
 *
 * Determinism: every aggregation is a pure reduction over the canonical
 * dataset — no Date.now / Math.random / network.
 */

import { describe, expect, it } from "vitest";

import { buildDashboardViewModel } from "@/fixtures/selectors";
import { canonicalDataset } from "@/fixtures/canonical";

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
});
