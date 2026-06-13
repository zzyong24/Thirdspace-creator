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
// Locked default tabs (page-specs §14 — 7 tabs in approved order)
// ---------------------------------------------------------------------------

const DEFAULT_TABS: ReadonlyArray<ExperienceTabDescriptor> = [
  { id: "all", label: "全部" },
  { id: "topic", label: "选题策划" },
  { id: "script", label: "脚本结构" },
  { id: "shoot", label: "拍摄执行" },
  { id: "edit", label: "后期剪辑" },
  { id: "engage", label: "互动运营" },
  { id: "review", label: "复盘沉淀" },
];

// ---------------------------------------------------------------------------
// Locked default summary cards (4 cards; matches the 4 KPIs visible in
// the reference image).
// ---------------------------------------------------------------------------

const DEFAULT_SUMMARY_CARDS: ReadonlyArray<SummaryCardVm> = [
  {
    id: "exp-m-total",
    label: "总经验沉淀",
    value: "642",
    delta: "+18",
    trend: "up",
    tone: "positive",
  },
  {
    id: "exp-m-verified",
    label: "已验证经验",
    value: "386",
    delta: "+12",
    trend: "up",
    tone: "positive",
  },
  {
    id: "exp-m-reuse",
    label: "平均复用率",
    value: "62%",
    delta: "+4%",
    trend: "up",
    tone: "info",
  },
  {
    id: "exp-m-improvement",
    label: "待改进项",
    value: "24",
    delta: "-3",
    trend: "down",
    tone: "warning",
  },
];

// ---------------------------------------------------------------------------
// Locked default discoveries (list with effect data column)
// ---------------------------------------------------------------------------

const DEFAULT_DISCOVERIES: ReadonlyArray<DiscoveryRow> = [
  {
    id: "disc-1",
    title: "反差开场在科普类内容里效果最佳",
    source: "AI Native Browser",
    type: "脚本结构",
    effectLabel: "完播率 +14%",
  },
  {
    id: "disc-2",
    title: "凌晨 11 点发布的短视频评论率更高",
    source: "Creator 访谈 EP01",
    type: "互动运营",
    effectLabel: "评论率 +22%",
  },
  {
    id: "disc-3",
    title: "字幕字体加粗能显著提升移动端完播",
    source: "Prompt Craft EP01",
    type: "后期剪辑",
    effectLabel: "完播率 +9%",
  },
  {
    id: "disc-4",
    title: "失败案例：长铺垫开头会让用户流失",
    source: "第二大脑搭建手册",
    type: "复盘沉淀",
    effectLabel: "流失率 +18%",
  },
];

// ---------------------------------------------------------------------------
// Locked default categories (6 cards including failures)
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES: ReadonlyArray<ExperienceCategory> = [
  { id: "experience-topic", name: "选题策划", count: 124, tone: "brand" },
  { id: "experience-script", name: "脚本结构", count: 86, tone: "info" },
  { id: "experience-shoot", name: "拍摄执行", count: 72, tone: "success" },
  { id: "experience-edit", name: "后期剪辑", count: 64, tone: "info" },
  { id: "experience-engage", name: "互动运营", count: 48, tone: "warning" },
  { id: "experience-failures", name: "失败案例", count: 36, tone: "warning" },
];

// ---------------------------------------------------------------------------
// Locked default records (recent records table)
// ---------------------------------------------------------------------------

const DEFAULT_RECORDS: ReadonlyArray<ExperienceRecord> = [
  {
    id: "rec-1",
    title: "反差开场公式 · 科普类",
    category: "脚本结构",
    updatedAt: "2026-05-30",
    reuseCount: 18,
  },
  {
    id: "rec-2",
    title: "凌晨发布窗口 · 短视频",
    category: "互动运营",
    updatedAt: "2026-05-22",
    reuseCount: 12,
  },
  {
    id: "rec-3",
    title: "字幕加粗 · 移动端",
    category: "后期剪辑",
    updatedAt: "2026-05-15",
    reuseCount: 9,
  },
  {
    id: "rec-4",
    title: "失败案例 · 长铺垫开头",
    category: "复盘沉淀",
    updatedAt: "2026-05-08",
    reuseCount: 6,
  },
  {
    id: "rec-5",
    title: "选题切入角度 · 趋势观察",
    category: "选题策划",
    updatedAt: "2026-04-30",
    reuseCount: 11,
  },
];

// ---------------------------------------------------------------------------
// Locked default value overview + application effect + popular + actions
// ---------------------------------------------------------------------------

const DEFAULT_VALUE_OVERVIEW: ValueOverviewVm = {
  totalLabel: "总经验沉淀 642",
  verifiedLabel: "已验证 386",
  reuseRate: 62,
  improvementLabel: "待改进 24",
};

const DEFAULT_APPLICATION_EFFECT: ReadonlyArray<{
  readonly label: string;
  readonly value: number;
}> = [
  { label: "2 月", value: 24 },
  { label: "3 月", value: 36 },
  { label: "4 月", value: 52 },
  { label: "5 月", value: 68 },
  { label: "6 月", value: 84 },
];

const DEFAULT_POPULAR_EXPERIENCES: ReadonlyArray<PopularExperience> = [
  {
    id: "pop-1",
    title: "反差开场公式 · 科普类",
    category: "脚本结构",
    usage: "被引用 18 次",
  },
  {
    id: "pop-2",
    title: "凌晨发布窗口 · 短视频",
    category: "互动运营",
    usage: "被引用 12 次",
  },
  {
    id: "pop-3",
    title: "字幕加粗 · 移动端",
    category: "后期剪辑",
    usage: "被引用 9 次",
  },
];

const DEFAULT_QUICK_ACTIONS: ReadonlyArray<QuickAction> = [
  {
    id: "qa-new",
    label: "新建经验",
    hint: "把这次的复盘沉淀下来",
  },
  {
    id: "qa-import",
    label: "从项目导入",
    hint: "把已发布项目作为经验",
  },
  {
    id: "qa-failure",
    label: "记录失败案例",
    hint: "失败也要被记住",
  },
];

// ---------------------------------------------------------------------------
// View model — pure builder so SSR output is deterministic
// ---------------------------------------------------------------------------

function buildExperienceViewModel(): ExperienceViewModel {
  return {
    tabs: DEFAULT_TABS,
    summaryCards: DEFAULT_SUMMARY_CARDS,
    discoveries: DEFAULT_DISCOVERIES,
    categories: DEFAULT_CATEGORIES,
    records: DEFAULT_RECORDS,
    valueOverview: DEFAULT_VALUE_OVERVIEW,
    applicationEffect: DEFAULT_APPLICATION_EFFECT,
    popularExperiences: DEFAULT_POPULAR_EXPERIENCES,
    quickActions: DEFAULT_QUICK_ACTIONS,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ExperiencePage({ viewModel }: ExperiencePageProps = {}) {
  const vm = viewModel ?? buildExperienceViewModel();
  return (
    <main
      data-app="creatoros"
      data-page="experience"
      data-experience-id="experience-root"
      className="flex flex-col gap-(--section-gap)"
    >
      <ExperienceTabs tabs={vm.tabs} />
      <ExperienceLayout
        summaryCards={vm.summaryCards}
        discoveries={vm.discoveries}
        categories={vm.categories}
        records={vm.records}
        valueOverview={vm.valueOverview}
        applicationEffect={vm.applicationEffect}
        popularExperiences={vm.popularExperiences}
        quickActions={vm.quickActions}
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
}

function ExperienceLayout({
  summaryCards,
  discoveries,
  categories,
  records,
  valueOverview,
  applicationEffect,
  popularExperiences,
  quickActions,
}: ExperienceLayoutProps) {
  return (
    <div
      data-slot="experience-layout"
      className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div
        data-slot="experience-main-column"
        className="flex flex-col gap-(--section-gap)"
      >
        <AISummarySection cards={summaryCards} />
        <RecentDiscoveries rows={discoveries} />
        <ExperienceCategories categories={categories} />
        <RecentRecordsTable rows={records} />
      </div>
      <RightRail
        valueOverview={valueOverview}
        applicationEffect={applicationEffect}
        popularExperiences={popularExperiences}
        quickActions={quickActions}
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
      className="grid grid-cols-1 gap-(--card-gap) sm:grid-cols-2 md:grid-cols-4"
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
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-(--card-gap) shadow-card"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {card.label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">
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
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm"
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
              className="shrink-0 font-mono text-xs font-medium text-foreground tabular-nums"
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
        className="grid grid-cols-2 gap-(--card-gap) sm:grid-cols-3 md:grid-cols-6"
      >
        {categories.map((category) => (
          <article
            key={category.id}
            data-slot="experience-category-card"
            data-category-id={category.id}
            className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-subtle p-(--card-gap) text-sm"
          >
            <span
              aria-hidden="true"
              className={
                category.tone === "brand"
                  ? "size-2 rounded-full bg-brand"
                  : category.tone === "success"
                    ? "size-2 rounded-full bg-success"
                    : category.tone === "warning"
                      ? "size-2 rounded-full bg-warning"
                      : category.tone === "info"
                        ? "size-2 rounded-full bg-info"
                        : "size-2 rounded-full bg-border-strong"
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
// RecentRecordsTable — atomic-level block, visible in the reference
// image as the "recent records" panel below the categories.
// ---------------------------------------------------------------------------

function RecentRecordsTable({
  rows,
}: {
  rows: ReadonlyArray<ExperienceRecord>;
}) {
  return (
    <SectionCard
      title="最近经验记录"
      description="按更新时间倒序"
    >
      <table
        data-slot="recent-records-table"
        aria-label="最近经验记录"
        className="w-full text-sm"
      >
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="py-2 text-left font-medium">标题</th>
            <th className="py-2 text-left font-medium">分类</th>
            <th className="py-2 text-right font-medium">更新</th>
            <th className="py-2 text-right font-medium">复用次数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-slot="recent-record-row"
              data-record-id={row.id}
              className="border-b border-border last:border-b-0"
            >
              <td className="py-2 text-foreground">{row.title}</td>
              <td className="py-2">
                <TagChip label={row.category} tone="neutral" size="sm" />
              </td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {row.updatedAt}
              </td>
              <td className="py-2 text-right font-mono text-xs text-foreground tabular-nums">
                {row.reuseCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
}: {
  valueOverview: ValueOverviewVm;
  applicationEffect: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  popularExperiences: ReadonlyArray<PopularExperience>;
  quickActions: ReadonlyArray<QuickAction>;
}) {
  return (
    <aside
      data-slot="experience-right-rail"
      aria-label="经验沉淀侧栏"
      className="flex flex-col gap-(--card-gap)"
    >
      <ValueOverview vm={valueOverview} />
      <ApplicationEffectChart trend={applicationEffect} />
      <PopularExperienceList items={popularExperiences} />
      <QuickRecordActions actions={quickActions} />
    </aside>
  );
}

function ValueOverview({ vm }: { vm: ValueOverviewVm }) {
  return (
    <SectionCard title="价值概览" description="经验沉淀的整体价值">
      <div
        data-slot="value-overview"
        className="flex flex-col gap-2 text-sm"
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
        <span className="text-xs text-muted-foreground">
          {vm.improvementLabel}
        </span>
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
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="popular-experience-row"
            data-popular-id={item.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-foreground">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.category}
              </span>
            </div>
            <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">
              {item.usage}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function QuickRecordActions({
  actions,
}: {
  actions: ReadonlyArray<QuickAction>;
}) {
  return (
    <SectionCard
      title="快速记录"
      description="把这次的复盘沉淀下来"
    >
      <div
        data-slot="quick-record-actions"
        aria-label="快速记录操作"
        className="flex flex-col gap-2"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-slot="quick-record-action"
            data-action-id={action.id}
            className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.hint}</span>
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              +
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}