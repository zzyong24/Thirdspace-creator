/**
 * Knowledge & Memory page (Task 19 / page-specs §11).
 *
 * The `/knowledge` global resource-center landing page. Composes:
 *  - a `KnowledgeToolbar` (search + filter affordances),
 *  - a `KnowledgeMetrics` row of FIVE MetricCard items in a single row,
 *  - a `KnowledgeGrid` with three columns in the spec order
 *      CategoryPanel → RecentKnowledgeTable → InsightRail
 *    where InsightRail contains the four insight blocks in the
 *    locked order PopularTags → MemoryInsights → UnsortedItems →
 *    ReusableSnippets,
 *  - a `KnowledgeGraph` rendered at the bottom of the same page
 *    (NOT a separate route — page-specs §11 "禁止改变").
 *
 * The page is a Server Component shell. The interactive part — search
 * input + category/type filter chips that narrow the rendered list, plus
 * row selection — lives in the Client island
 * `KnowledgeInteractiveRegion` (`./knowledge-interactive-region.tsx`),
 * consistent with the existing islands pattern (assets / settings /
 * search). The KnowledgeMetrics row and the KnowledgeGraph stay server
 * components.
 *
 * When the ViewModel envelope signals `loading` / `error` / `empty`, the
 * page renders the shared page-state placeholders for the main content
 * region instead of the interactive grid. The default state renders the
 * island and is DOM-equivalent to the previous server-only render.
 *
 * Layout invariants (locked by page-specs §11, decision-log D-002):
 *  - The route is a global resource-center route. There is no
 *    project identity block, no second AppShell, and no second
 *    Sidebar/TopHeader. The Header region remains in `global` mode
 *    with the page title "知识库".
 *  - The MemoryInsights block is NOT removed (page-specs §11).
 *  - The KnowledgeGraph stays on the same page (no graph-as-route
 *    redesign). No folder-tree hierarchy is added.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { SectionCard } from "@/components/project/section-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  resolvePageState,
} from "@/components/state/page-state";
import type {
  BasePageViewModel,
  MetricCard as MetricCardVm,
} from "@/types/view-models";
import { buildKnowledgeDashboardViewModel } from "./knowledge-data";
import { KnowledgeDumpZone } from "./knowledge-dump-zone";
import { KnowledgeInteractiveRegion } from "./knowledge-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KnowledgePageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: KnowledgeViewModel;
}

export interface KnowledgeViewModel extends BasePageViewModel {
  readonly kind: "knowledge";
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  readonly graphSeries: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  /**
   * KNOW-13:当前生效的 `?tag=` 标签筛选(标签名)。非空时 `recent` 已在读侧
   * 装配层按该标签过滤,页面渲染「清除筛选」返回全量列表。可选:fixture 构建
   * 器不设置(等价 null,无筛选)。
   */
  readonly activeTag?: string | null;
  /**
   * T-079c 观点地图 VM(按 tag 主题聚类的分组卡墙,SPEC §3)。真实装配层
   * (knowledge-data)始终提供 → 页面默认视图 = 观点地图;可选是兼容缝:
   * fixture 构建器/旧测试 VM 不设置时,交互岛回落「全部」列表视图,
   * 既有结构性契约测试(toolbar/grid 三列)不受影响。
   */
  readonly atlas?: import("./knowledge-atlas-vm").KnowledgeAtlasVm | null;
}

export interface KnowledgeCategory {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface KnowledgeRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly status: "active" | "archived" | "draft";
  readonly tags: ReadonlyArray<string>;
}

export interface KnowledgeTag {
  readonly id: string;
  readonly name: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface KnowledgeInsight {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface KnowledgeUnsorted {
  readonly id: string;
  readonly title: string;
  readonly ageLabel: string;
}

export interface KnowledgeSnippet {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function KnowledgePage({ viewModel }: KnowledgePageProps = {}) {
  // READ-side made real ("知识库读侧做真"): the VM now derives `recent`, the
  // `metrics` row (知识条目 total / 本周新增 / 复用片段 / 知识关联 are REAL counts;
  // 记忆命中率 has no read op → 「规划中」 placeholder, not a fixture number),
  // `categories` tally, the reusable-snippet LIST, the 未整理 (unlinked) LIST,
  // the knowledge GRAPH, and light memory-insights — all from the REAL
  // `knowledge.list` + `knowledge.relations.list` ops (pglite, user-scoped).
  // 热门标签 derives from the REAL `taxonomy.tags.list` op (ranked by usageCount).
  // AI-search material confirmed into a KnowledgeItem flows through this list,
  // so the new entry is reflected in the total / week / category counts.
  // Assembly degrades to the pure fixture VM on read failure; each secondary
  // read (relations, tags) is independently guarded. The `viewModel?` prop
  // remains the test-override seam: when provided, no network read happens.
  const vm: KnowledgeViewModel =
    viewModel ?? (await buildKnowledgeDashboardViewModel());
  const isEmpty =
    vm.categories.length === 0 &&
    vm.recent.length === 0 &&
    vm.popularTags.length === 0 &&
    vm.memoryInsights.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="knowledge"
      data-knowledge-id="knowledge-root"
      data-page-state={state}
      className="flex flex-col gap-section-gap"
    >
      {/* T-062c 知识倾倒场:录入主入口(AI 归类确认门 + 手动补录),页面顶部常驻。
          空库也要能倒(否则空账号无录入口),仅 loading/error 不渲。 */}
      {state === "default" || state === "empty" ? <KnowledgeDumpZone /> : null}
      {state === "loading" ? (
        <LoadingState label="正在加载知识库…" rows={5} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <EmptyState
          title="知识库暂无内容"
          description="把笔记、金句、逐字稿倒进上方的倾倒场,AI 自动归类后确认入库。"
        />
      ) : (
        <>
          <KnowledgeInteractiveRegion viewModel={vm} />
          <KnowledgeGraph series={vm.graphSeries} />
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeGraph — rendered on the same page (page-specs §11 invariant)
// ---------------------------------------------------------------------------

function KnowledgeGraph({
  series,
}: {
  series: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  const summary = summariseGraph(series);
  return (
    <SectionCard title="知识图谱" description="按类型分布的条目数">
      <div data-slot="knowledge-graph" className="flex flex-col gap-1">
        <ChartFrame
          title="条目分布"
          description="按类型聚合的知识条目数"
          summary={summary}
          trend={series}
          slot="knowledge-graph-chart"
          shape="line"
          testId="knowledge-graph-chart"
          height={160}
        />
        <p data-slot="knowledge-graph-summary" className="sr-only">
          {summary}
        </p>
      </div>
    </SectionCard>
  );
}

function summariseGraph(
  series: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  if (series.length === 0) return "知识图谱：暂无数据。";
  const total = series.reduce((acc, row) => acc + row.value, 0);
  const top = series.reduce(
    (acc, row) => (row.value > acc.value ? row : acc),
    series[0]!,
  );
  return `知识图谱：共 ${total} 条，最多的类型是 ${top.label}（${top.value} 条）。`;
}
