/**
 * Experience Center page (Task 22 / page-specs §14).
 *
 * The `/experience` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   ExperiencePage
 *   ├── ExperienceTabs                  (7 tabs in approved order)
 *   ├── MainColumn
 *   │   ├── AISummarySection            (4 cards horizontally)
 *   │   ├── RecentDiscoveries           (list with effect data column)
 *   │   ├── ExperienceCategories        (6 cards incl. failures)
 *   │   └── RecentRecordsTable
 *   └── RightRail
 *       ├── ValueOverview
 *       ├── ApplicationEffectChart
 *       ├── PopularExperienceList
 *       └── QuickRecordActions
 *
 * Layout invariants (page-specs §14, D-003):
 *  - The page is a global resource-center route — distinct from
 *    knowledge base, publishing center, etc.
 *  - Header is in `global` mode with page title "经验沉淀" and
 *    description "被验证的创作经验与失败案例" (configured by
 *    `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - 顶部二级导航保持七项（按截图顺序固定）。
 *  - AI 洞察总结四张卡横排。
 *  - 最近发现保持列表和效果数据列。
 *  - 经验库分类为六张紧凑卡（含失败案例）。
 *  - RightRail 顺序固定：
 *      ValueOverview → ApplicationEffectChart → PopularExperienceList
 *      → QuickRecordActions.
 *  - No community / template market is added (page-specs §14 "禁止改变").
 *  - No new product structure, no fixture mutation, no Date.now /
 *    Math.random / network access.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { PageTabs } from "@/components/navigation/page-tabs";
import { ProgressBar } from "@/components/project/progress-bar";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { buildExperienceViewModel } from "@/fixtures/selectors";
import {
  ExperienceInteractiveRegion,
  QuickRecordActionsIsland,
} from "./experience-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExperiencePageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from deterministic defaults (D-010) so SSR output is
   * stable.
   */
  readonly viewModel?: ExperienceViewModel;
  /**
   * Owned projects the records' 应用经验 control targets (sourced from
   * `projects.list`). Defaults to empty — the apply control is hidden when no
   * project is available. The server page passes the real owned list.
   */
  readonly applyTargets?: ReadonlyArray<ApplyTarget>;
}

export interface ExperienceViewModel {
  readonly tabs: ReadonlyArray<ExperienceTabDescriptor>;
  readonly summaryCards: ReadonlyArray<SummaryCardVm>;
  readonly discoveries: ReadonlyArray<DiscoveryRow>;
  readonly categories: ReadonlyArray<ExperienceCategory>;
  readonly records: ReadonlyArray<ExperienceRecord>;
  readonly valueOverview: ValueOverviewVm;
  readonly applicationEffect: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly popularExperiences: ReadonlyArray<PopularExperience>;
  readonly quickActions: ReadonlyArray<QuickAction>;
}

export interface ExperienceTabDescriptor {
  readonly id: string;
  readonly label: string;
}

export interface SummaryCardVm {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly trend: "up" | "down" | "flat";
  readonly tone: "neutral" | "positive" | "negative" | "warning" | "info";
}

export interface DiscoveryRow {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly type: string;
  readonly effectLabel: string;
}

export interface ExperienceCategory {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface ExperienceRecord {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly updatedAt: string;
  readonly reuseCount: number;
  /**
   * The backing Learning's id + status, present when the record is sourced from a
   * real `learnings.list` row (Module 14 wiring). When absent the apply / evaluate
   * affordances fall back to the record `id` so the fixture-only render still wires.
   * `tabId` is the derived client-side filter category (see EXPERIENCE_TAB filter).
   */
  readonly learningId?: string;
  readonly validationStatus?: "candidate" | "validated" | "discarded";
  readonly tabId?: string;
}

/** An owned project the apply control can target (sourced from `projects.list`). */
export interface ApplyTarget {
  readonly id: string;
  readonly title: string;
}

export interface ValueOverviewVm {
  readonly totalLabel: string;
  readonly verifiedLabel: string;
  readonly reuseRate: number;
  readonly improvementLabel: string;
}

export interface PopularExperience {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly usage: string;
}

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ExperiencePage({
  viewModel,
  applyTargets = [],
}: ExperiencePageProps = {}) {
  const vm = viewModel ?? buildExperienceViewModel();
  return (
    <main
      data-app="creatoros"
      data-page="experience"
      data-experience-id="experience-root"
      className="flex flex-col gap-3.5"
    >
      <ExperienceTabs tabs={vm.tabs} />
      <ExperienceLayout
        tabs={vm.tabs}
        summaryCards={vm.summaryCards}
        discoveries={vm.discoveries}
        categories={vm.categories}
        records={vm.records}
        valueOverview={vm.valueOverview}
        applicationEffect={vm.applicationEffect}
        popularExperiences={vm.popularExperiences}
        quickActions={vm.quickActions}
        applyTargets={applyTargets}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// ExperienceTabs — page-tabs in the spec order
// ---------------------------------------------------------------------------

function ExperienceTabs({
  tabs,
}: {
  tabs: ReadonlyArray<ExperienceTabDescriptor>;
}) {
  // Wrap PageTabs so the page-level slot name stays stable for tests
  // and the rail order assertions.
  return (
    <div
      data-slot="experience-tabs"
      aria-label="经验沉淀二级导航"
      className="border-b border-border pb-2"
    >
      <PageTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="经验分类"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExperienceLayout — MainColumn + RightRail
// ---------------------------------------------------------------------------

interface ExperienceLayoutProps {
  readonly tabs: ReadonlyArray<ExperienceTabDescriptor>;
  readonly summaryCards: ReadonlyArray<SummaryCardVm>;
  readonly discoveries: ReadonlyArray<DiscoveryRow>;
  readonly categories: ReadonlyArray<ExperienceCategory>;
  readonly records: ReadonlyArray<ExperienceRecord>;
  readonly valueOverview: ValueOverviewVm;
  readonly applicationEffect: ReadonlyArray<{
    readonly label: string;
    readonly value: number;
  }>;
  readonly popularExperiences: ReadonlyArray<PopularExperience>;
  readonly quickActions: ReadonlyArray<QuickAction>;
  readonly applyTargets: ReadonlyArray<ApplyTarget>;
}

function ExperienceLayout({
  tabs,
  summaryCards,
  discoveries,
  categories,
  records,
  valueOverview,
  applicationEffect,
  popularExperiences,
  quickActions,
  applyTargets,
}: ExperienceLayoutProps) {
  return (
    <div
      data-slot="experience-layout"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div
        data-slot="experience-main-column"
        className="flex flex-col gap-4"
      >
        <AISummarySection cards={summaryCards} />
        <RecentDiscoveries rows={discoveries} />
        <ExperienceCategories categories={categories} />
        {/* Wired island (Module 14 Step 5): the records table gains the 应用经验 /
            验证 / 废弃 controls + the client-side category filter. Replaces the inert
            server-only RecentRecordsTable. */}
        <ExperienceInteractiveRegion
          tabs={tabs}
          records={records}
          applyTargets={applyTargets}
        />
      </div>
      <RightRail
        valueOverview={valueOverview}
        applicationEffect={applicationEffect}
        popularExperiences={popularExperiences}
        quickActions={quickActions}
        applyTargets={applyTargets}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AISummarySection — 4 cards horizontally
// ---------------------------------------------------------------------------

function AISummarySection({
  cards,
}: {
  cards: ReadonlyArray<SummaryCardVm>;
}) {
  return (
    <section
      data-slot="ai-summary-section"
      aria-label="AI 洞察总结"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 md:grid-cols-4"
    >
      {cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </section>
  );
}

function SummaryCard({ card }: { card: SummaryCardVm }) {
  return (
    <article
      data-slot="summary-card"
      data-summary-id={card.id}
      aria-label={card.label}
      className="flex flex-col gap-1.5 rounded-xl bg-surface-subtle px-4 py-3"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {card.label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">
          {card.value}
        </span>
        <SummaryTrend trend={card.trend} tone={card.tone} delta={card.delta} />
      </div>
    </article>
  );
}

function SummaryTrend({
  trend,
  tone,
  delta,
}: {
  trend: SummaryCardVm["trend"];
  tone: SummaryCardVm["tone"];
  delta: string;
}) {
  const glyph = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  const toneText =
    tone === "positive"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "info"
          ? "text-info"
          : tone === "negative"
            ? "text-danger"
            : "text-foreground";
  return (
    <span
      data-slot="summary-trend"
      data-trend={trend}
      data-tone={tone}
      className={`inline-flex items-center gap-1 text-xs font-medium ${toneText}`}
    >
      <span aria-hidden="true">{glyph}</span>
      <span>{delta}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// RecentDiscoveries — list with effect data column
// ---------------------------------------------------------------------------

function RecentDiscoveries({
  rows,
}: {
  rows: ReadonlyArray<DiscoveryRow>;
}) {
  return (
    <SectionCard
      title="最近发现"
      description="系统从经验库提炼的关键洞察"
    >
      <ul
        data-slot="recent-discoveries"
        aria-label="最近发现列表"
        className="flex flex-col gap-2"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            data-slot="discovery-row"
            data-discovery-id={row.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-foreground">{row.title}</span>
              <span className="text-xs text-muted-foreground">
                来源 {row.source} · {row.type}
              </span>
            </div>
            <span
              data-slot="discovery-effect-data"
              data-effect={row.effectLabel}
              className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-medium text-brand tabular-nums"
            >
              {row.effectLabel}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// ExperienceCategories — 6 compact cards including failures
// ---------------------------------------------------------------------------

function ExperienceCategories({
  categories,
}: {
  categories: ReadonlyArray<ExperienceCategory>;
}) {
  return (
    <SectionCard
      title="经验库分类"
      description="六类经验沉淀（含失败案例）"
    >
      <div
        data-slot="experience-categories"
        aria-label="经验库分类"
        className="grid grid-cols-2 gap-card-gap sm:grid-cols-3 md:grid-cols-6"
      >
        {categories.map((category) => (
          <article
            key={category.id}
            data-slot="experience-category-card"
            data-category-id={category.id}
            className="flex flex-col gap-1.5 rounded-xl bg-surface-subtle px-4 py-3 text-sm"
          >
            <span
              aria-hidden="true"
              className={
                category.tone === "brand"
                  ? "size-1.5 rounded-full bg-brand"
                  : category.tone === "success"
                    ? "size-1.5 rounded-full bg-success"
                    : category.tone === "warning"
                      ? "size-1.5 rounded-full bg-warning"
                      : category.tone === "info"
                        ? "size-1.5 rounded-full bg-info"
                        : "size-1.5 rounded-full bg-border-strong"
              }
            />
            <span className="font-medium text-foreground">{category.name}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {category.count} 条
            </span>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// RightRail — locked order:
//   ValueOverview → ApplicationEffectChart → PopularExperienceList →
//   QuickRecordActions
// ---------------------------------------------------------------------------

function RightRail({
  valueOverview,
  applicationEffect,
  popularExperiences,
  quickActions,
  applyTargets,
}: {
  valueOverview: ValueOverviewVm;
  applicationEffect: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  popularExperiences: ReadonlyArray<PopularExperience>;
  quickActions: ReadonlyArray<QuickAction>;
  applyTargets: ReadonlyArray<ApplyTarget>;
}) {
  return (
    <aside
      data-slot="experience-right-rail"
      aria-label="经验沉淀侧栏"
      className="flex flex-col gap-card-gap"
    >
      <ValueOverview vm={valueOverview} />
      <ApplicationEffectChart trend={applicationEffect} />
      <PopularExperienceList items={popularExperiences} />
      {/* Wired island (Module 14 Step 5): each quick-record button →
          learnings.create. Replaces the inert server-only QuickRecordActions. */}
      <QuickRecordActionsIsland actions={quickActions} applyTargets={applyTargets} />
    </aside>
  );
}

function ValueOverview({ vm }: { vm: ValueOverviewVm }) {
  return (
    <SectionCard title="价值概览" description="经验沉淀的整体价值">
      <div
        data-slot="value-overview"
        className="flex flex-col gap-2.5 text-sm"
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{vm.totalLabel}</span>
          <span>{vm.verifiedLabel}</span>
        </div>
        <ProgressBar
          value={vm.reuseRate}
          tone="brand"
          label="平均复用率"
          showValue
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{vm.improvementLabel}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function ApplicationEffectChart({
  trend,
}: {
  trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  const summary = `应用效果：最近 5 月经验被引用 ${
    trend.reduce((acc, row) => acc + row.value, 0)
  } 次，整体上升。`;
  return (
    <ChartFrame
      title="应用效果"
      description="近 5 月经验被引用次数"
      summary={summary}
      trend={trend}
      slot="application-effect-chart"
      shape="line"
      testId="application-effect-chart"
    />
  );
}

function PopularExperienceList({
  items,
}: {
  items: ReadonlyArray<PopularExperience>;
}) {
  return (
    <SectionCard title="热门经验" description="被引用最多的经验">
      <ul
        data-slot="popular-experience-list"
        aria-label="热门经验列表"
        className="flex flex-col gap-2"
      >
        {items.length === 0 ? (
          <li
            data-slot="popular-experience-empty"
            className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-muted-foreground"
          >
            暂无热门经验
          </li>
        ) : null}
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="popular-experience-row"
            data-popular-id={item.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-foreground">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.category}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-foreground tabular-nums">
              {item.usage}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

