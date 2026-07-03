/**
 * 今日台 contract tests(T-063b · 北极星 SPEC §3 [gate-F2])。
 *
 * 锁定的结构不变量:
 *  - 问候头 + 行动队列(data-slot="today-queue")是页面主体;
 *  - 六类源(project/candidate/learning/calibration/publish/signal)各自有数据
 *    即渲行(data-slot="today-action" data-kind=…),每行 href 深链正确;
 *  - 六源全空 → 引导空态(今天没有排上的事 + Copilot 深链),不是空白;
 *  - 逐源降级:某个源读失败只是该源不渲行,队列其余行照常;
 *  - 核心 getDashboard 失败 → 整页错误态;
 *  - 保留件:「继续创作」卡 + 一条真值趋势行;移除件:旧路标卡
 *    (热门选题/最近发布/数据概览大图/创作建议)不再渲染。
 *
 * 组件是 Server Component;渲染经 `viewModel?` seam 驱动,装配经
 * `buildTodayViewModel(stub client)` 驱动 —— 单测不需要真 in-process backend。
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Stub `next/navigation` so shell islands (NotificationPopover etc.) can call
// `useRouter()` outside an App Router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Stub `next/link` so we can assert href values without the Next.js runtime.
vi.mock("next/link", () => ({
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

import { buildDashboardViewModel } from "@/fixtures/selectors";
import type { DashboardViewModel, TodoRow } from "@/types/view-models";
import {
  buildTodayViewModel,
  type TodayDataClient,
  type TodayViewModel,
} from "./dashboard-data";
import { DashboardPage } from "./dashboard-page";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// 装配辅助:stub client(默认六源全空;逐 case 注入某源数据)
// ---------------------------------------------------------------------------

/** signal 源的确定性时间种子(测试禁 Date.now)。 */
const FIXED_NOW = new Date("2026-07-03T12:00:00.000Z");

/** 一个 todos/suggestions 清空的 dashboard 基座(project/publish 源默认无数据)。 */
function emptyDashboard(): DashboardViewModel {
  return { ...buildDashboardViewModel(), todos: [], suggestions: [] };
}

function stubClient(
  overrides: Partial<Record<keyof TodayDataClient, unknown>> = {},
): TodayDataClient {
  const resolve =
    (value: unknown) =>
    async (): Promise<unknown> => {
      if (value instanceof Error) throw value;
      return value;
    };
  return {
    getDashboard: resolve(overrides.getDashboard ?? emptyDashboard()),
    listCandidates: resolve(overrides.listCandidates ?? []),
    listLearnings: resolve(overrides.listLearnings ?? []),
    listRuleSuggestions: resolve(overrides.listRuleSuggestions ?? []),
    listAudienceSignals: resolve(overrides.listAudienceSignals ?? []),
  } as TodayDataClient;
}

async function buildVm(
  overrides: Partial<Record<keyof TodayDataClient, unknown>> = {},
): Promise<TodayViewModel> {
  return buildTodayViewModel(stubClient(overrides), FIXED_NOW);
}

async function renderDashboard(viewModel: TodayViewModel) {
  const element = await DashboardPage({ viewModel });
  return render(element);
}

function queueRow(container: HTMLElement, kind: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-slot="today-action"][data-kind="${kind}"]`,
  );
}

function rowHref(row: HTMLElement): string {
  return (
    row
      .querySelector<HTMLAnchorElement>('a[data-slot="today-action-link"]')
      ?.getAttribute("href") ?? ""
  );
}

const todoBase: Omit<TodoRow, "id" | "title" | "stage"> = {
  projectId: "proj-1",
  projectTitle: "AI 浏览器实测",
  dueAt: null,
  priority: 2,
  status: "todo",
};

// ---------------------------------------------------------------------------
// 页面骨架
// ---------------------------------------------------------------------------

describe("今日台(DashboardPage)", () => {
  it("renders a welcome heading greeting the current user", async () => {
    await renderDashboard(await buildVm());
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent ?? "").toMatch(/早上好|Kevin|Zyong/i);
  });

  it("行动队列是页面主体,旧路标卡全部移除", async () => {
    const { container } = await renderDashboard(await buildVm());
    expect(container.querySelector('[data-slot="today-queue"]')).not.toBeNull();
    // 移除件:热门选题/最近发布/数据概览大图/创作建议/5 指标行。
    for (const slot of [
      "trending-topics-card",
      "recent-publications-card",
      "data-overview-card",
      "creation-suggestions-card",
      "dashboard-summary-metrics",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).toBeNull();
    }
  });

  it("保留「继续创作」卡:最近项目直达当前阶段工作面 + 新项目入口", async () => {
    const vm = await buildVm();
    const { container } = await renderDashboard(vm);
    const card = container.querySelector<HTMLElement>(
      '[data-slot="continue-creating-card"]',
    );
    expect(card).not.toBeNull();
    const row = card!.querySelector<HTMLAnchorElement>(
      'a[data-slot="continue-creating-row"]',
    );
    const cc = vm.dashboard!.continueCreating;
    expect(row).toHaveAttribute("href", `/projects/${cc.projectId}/${cc.stage}`);
    expect(within(card!).getAllByRole("progressbar").length).toBeGreaterThanOrEqual(1);
    const newEntry = screen.getByRole("link", { name: /新项目/ });
    expect(newEntry).toHaveAttribute("href", "/projects/new");
  });

  it("保留一条真值趋势行:本周播放合计数字来自 dataOverview.trend", async () => {
    const vm = await buildVm();
    const { container } = await renderDashboard(vm);
    const line = container.querySelector<HTMLElement>(
      '[data-slot="dashboard-trend-line"]',
    );
    expect(line).not.toBeNull();
    const expectedTotal = vm
      .dashboard!.dataOverview.trend.reduce((s, p) => s + p.value, 0)
      .toLocaleString();
    expect(
      line!.querySelector('[data-slot="trend-week-total"]')?.textContent,
    ).toBe(expectedTotal);
    // 迷你趋势条:每个数据点一根 bar。
    expect(line!.querySelectorAll('[data-slot="trend-bar"]')).toHaveLength(
      vm.dashboard!.dataOverview.trend.length,
    );
  });

  it("核心 getDashboard 失败 → 整页错误态(不渲染队列/卡片)", async () => {
    const vm = await buildVm({ getDashboard: new Error("boom") });
    expect(vm.loadError).toBe(true);
    const { container } = await renderDashboard(vm);
    expect(
      container.querySelector('[data-slot="dashboard-load-error"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="today-queue"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 六类源:各源有数据即渲行 + href 正确 [gate-F2]
// ---------------------------------------------------------------------------

describe("今日台行动队列 · 六类源", () => {
  it("源 project:进行中项目的阶段推进 todo 渲行,深链阶段工作面", async () => {
    const vm = await buildVm({
      getDashboard: {
        ...emptyDashboard(),
        todos: [
          { ...todoBase, id: "task-1", title: "完成脚本初稿", stage: "script" },
        ],
      },
    });
    const { container } = await renderDashboard(vm);
    const row = queueRow(container, "project");
    expect(row).not.toBeNull();
    expect(row!.textContent ?? "").toContain("AI 浏览器实测");
    expect(row!.textContent ?? "").toContain("完成脚本初稿");
    expect(rowHref(row!)).toBe("/projects/proj-1/script");
  });

  it("源 publish:发布/复盘类 todo 渲行(data-kind=publish),深链对应阶段页", async () => {
    const vm = await buildVm({
      getDashboard: {
        ...emptyDashboard(),
        todos: [
          { ...todoBase, id: "task-2", title: "定时发布抖音", stage: "publishing" },
          { ...todoBase, id: "task-3", title: "复盘上周作品", stage: "review" },
        ],
      },
    });
    const { container } = await renderDashboard(vm);
    const rows = container.querySelectorAll<HTMLElement>(
      '[data-slot="today-action"][data-kind="publish"]',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent ?? "").toContain("该发布了");
    expect(rowHref(rows[0])).toBe("/projects/proj-1/publishing");
    expect(rows[1].textContent ?? "").toContain("该复盘了");
    expect(rowHref(rows[1])).toBe("/projects/proj-1/review");
  });

  it("源 candidate:pool 候选渲一行汇总(计数 + top 标题),深链候选 tab", async () => {
    const vm = await buildVm({
      listCandidates: [
        { id: "cand-1", title: "AI 剪辑工作流", status: "pool" },
        { id: "cand-2", title: "本地大模型实测", status: "pool" },
        { id: "cand-3", title: "已丢弃的选题", status: "dropped" },
      ],
    });
    const { container } = await renderDashboard(vm);
    const row = queueRow(container, "candidate");
    expect(row).not.toBeNull();
    // 只数 status=pool(2 条),带真实标题。
    expect(row!.textContent ?? "").toContain("2 条选题候选待评估");
    expect(row!.textContent ?? "").toContain("AI 剪辑工作流");
    expect(rowHref(row!)).toBe("/projects?tab=candidates");
  });

  it("源 learning:candidate 经验渲行(计数 + 最新 title),深链经验 tab", async () => {
    const vm = await buildVm({
      listLearnings: [
        {
          id: "learn-1",
          title: "开场 3 秒放冲突",
          validationStatus: "candidate",
          createdAt: "2026-07-02T08:00:00.000Z",
        },
        {
          id: "learn-2",
          title: "标题带数字更抓人",
          validationStatus: "candidate",
          createdAt: "2026-07-03T08:00:00.000Z",
        },
        {
          id: "learn-3",
          title: "已验证的经验",
          validationStatus: "validated",
          createdAt: "2026-07-01T08:00:00.000Z",
        },
      ],
    });
    const { container } = await renderDashboard(vm);
    const row = queueRow(container, "learning");
    expect(row).not.toBeNull();
    expect(row!.textContent ?? "").toContain("2 条经验待裁决");
    // 最新一条(createdAt 倒序第一)。
    expect(row!.textContent ?? "").toContain("标题带数字更抓人");
    expect(rowHref(row!)).toBe("/library?tab=experience");
  });

  it("源 calibration:pending 规则建议渲行,深链设置校准页签", async () => {
    const vm = await buildVm({
      listRuleSuggestions: [
        { id: "rs-1", learningId: "learn-1" },
        { id: "rs-2", learningId: "learn-2" },
        { id: "rs-3", learningId: "learn-3" },
      ],
    });
    const { container } = await renderDashboard(vm);
    const row = queueRow(container, "calibration");
    expect(row).not.toBeNull();
    expect(row!.textContent ?? "").toContain("3 条校准规则建议待采纳");
    expect(rowHref(row!)).toBe("/settings?tab=calibration");
  });

  it("源 signal:最近 24h 信号计数渲行(窗口外不计),深链候选 tab", async () => {
    const vm = await buildVm({
      listAudienceSignals: [
        // FIXED_NOW = 07-03 12:00Z;两条在 24h 窗口内,一条在窗口外。
        { id: "sig-1", createdAt: "2026-07-03T10:00:00.000Z" },
        { id: "sig-2", createdAt: "2026-07-02T20:00:00.000Z" },
        { id: "sig-3", createdAt: "2026-07-01T09:00:00.000Z" },
      ],
    });
    const { container } = await renderDashboard(vm);
    const row = queueRow(container, "signal");
    expect(row).not.toBeNull();
    expect(row!.textContent ?? "").toContain("今天有 2 条新评论信号");
    expect(rowHref(row!)).toBe("/projects?tab=candidates");
  });

  it("逐源降级:candidates 读失败只是该源不渲行,其余行照常", async () => {
    const vm = await buildVm({
      listCandidates: new Error("source down"),
      listRuleSuggestions: [{ id: "rs-1", learningId: "learn-1" }],
    });
    expect(vm.loadError).toBe(false);
    const { container } = await renderDashboard(vm);
    expect(queueRow(container, "candidate")).toBeNull();
    expect(queueRow(container, "calibration")).not.toBeNull();
  });

  it("六源全空 → 引导空态(不是空白),带 Copilot 出题深链 [gate-F2]", async () => {
    const vm = await buildVm();
    expect(vm.actions).toHaveLength(0);
    const { container } = await renderDashboard(vm);
    const empty = container.querySelector<HTMLElement>(
      '[data-slot="today-queue-empty"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.textContent ?? "").toContain("今天没有排上的事");
    const cta = empty!.querySelector<HTMLAnchorElement>(
      'a[data-slot="today-queue-empty-cta"]',
    );
    // query-only 深链:就地开 Copilot 浮层并预调出题工具。
    expect(cta?.getAttribute("href") ?? "").toMatch(/^\?copilot=open/);
    expect(cta?.getAttribute("href") ?? "").toContain("fn=topic.generate");
  });
});

// ---------------------------------------------------------------------------
// AppShell 集成(保持原有壳层断言)
// ---------------------------------------------------------------------------

describe("今日台 · AppShell 集成", () => {
  async function renderInShell() {
    const { AppShell } = await import("@/components/shell/app-shell");
    const element = await DashboardPage({ viewModel: await buildVm() });
    return render(<AppShell pathname="/">{element}</AppShell>);
  }

  it("is wrapped in the shared AppShell with one sidebar and one top header", async () => {
    const { container } = await renderInShell();
    expect(container.querySelectorAll('[data-slot="app-sidebar"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="app-top-header"]')).toHaveLength(1);
  });

  it("marks the 今日台 nav item as the active page in the sidebar", async () => {
    await renderInShell();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/");
    // [T-063a] IA 收敛:首页 →「今日台」。
    expect(active.textContent?.trim()).toBe("今日台");
  });
});
