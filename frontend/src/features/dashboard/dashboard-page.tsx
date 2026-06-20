/**
 * Dashboard page (Task 9 / page-specs §1).
 *
 * Composes the 5-metric summary and the 3×2 dashboard grid inside the
 * page-scroll area. Data flows from `buildDashboardViewModel()`; the
 * page is otherwise a deterministic composition of approved shared
 * components.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group. The page just provides the content
 * slot.
 *
 * Layout invariants (locked by the page spec):
 *  - one row of five MetricCard,
 *  - three-column grid with six SectionCard in fixed order:
 *    Continue, Todo, Trending, Publications, Data, Suggestions,
 *  - the "新项目" entry is a Link to `/projects/new` so the
 *    intercepting modal from Task 8 is opened when navigated to.
 */

import * as React from "react";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { MetricCard } from "@/components/project/metric-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import { ChartFrame } from "@/components/analytics/chart-frame";
import { PlatformIconView } from "@/components/publishing/platform-icon";
import { buildDashboardViewModel } from "@/fixtures/selectors";
import {
  getProjectPlatforms,
} from "@/fixtures/canonical";
import { cn } from "@/lib/utils";
import type {
  ContinueCreating,
  DashboardViewModel,
  TodoRow,
  TopicRow,
  PublicationCompactRow,
  CreationSuggestion,
} from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DashboardPageProps {
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: DashboardViewModel;
  /**
   * Override for the displayed greeting name. The reference design
   * (`ui/Dashboard.png`) shows "Kevin". The canonical user account
   * remains "Zyong Zhu" because 16 other pages share that fixture;
   * the dashboard renders a friendlier first-name on the greeting.
   */
  readonly greetingName?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * The reference design shows "Kevin" as the dashboard greeting name.
 * The canonical user fixture cannot be edited without breaking 16
 * other pages; we keep this constant on the dashboard page itself.
 */
const DASHBOARD_GREETING_NAME = "Kevin";

export function DashboardPage({
  viewModel,
  greetingName,
}: DashboardPageProps = {}) {
  const vm = viewModel ?? buildDashboardViewModel();
  const greeting = buildGreeting(vm, greetingName ?? DASHBOARD_GREETING_NAME);
  return (
    <main
      data-app="creatoros"
      data-page="dashboard"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-0.5">
        <h1
          data-slot="dashboard-welcome"
          className="font-heading text-xl font-semibold text-foreground"
        >
          {greeting}
        </h1>
        <p className="text-sm text-muted-foreground">
          {vm.suggestions.length > 0
            ? `今天有 ${vm.suggestions.length} 条创作建议等待处理。`
            : "今天所有任务都已处理完。"}
        </p>
      </header>

      <SummaryMetrics metrics={vm.metrics} />
      <DashboardGrid vm={vm} />
      <SidebarAssistantCard prompt={vm.assistantPrompt} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// SidebarAssistantCard (page-specs §1 component tree, R1-7)
// ---------------------------------------------------------------------------

function SidebarAssistantCard({ prompt }: { prompt: string }) {
  return (
    <aside
      data-slot="sidebar-assistant-card"
      aria-label="AI 助手"
      className="flex items-center justify-between gap-3 rounded-card border border-brand/30 bg-brand-soft/40 p-4"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">AI 助手</span>
        <p className="truncate text-xs text-muted-foreground">{prompt}</p>
      </div>
      <Link
        href="/?copilot=open"
        data-slot="sidebar-assistant-cta"
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-card bg-brand px-3 text-sm font-medium text-brand-foreground",
          "transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span aria-hidden="true">✦</span>
        <span>开始对话</span>
      </Link>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Summary metrics
// ---------------------------------------------------------------------------

function SummaryMetrics({ metrics }: { metrics: DashboardViewModel["metrics"] }) {
  return (
    <section
      data-slot="dashboard-summary-metrics"
      aria-label="总览指标"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-5"
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          label={metric.label}
          value={metric.value}
          delta={metric.delta}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function DashboardGrid({ vm }: { vm: DashboardViewModel }) {
  return (
    <section
      data-slot="dashboard-grid"
      aria-label="工作台"
      className="grid grid-cols-1 gap-card-gap md:grid-cols-2 lg:grid-cols-3"
    >
      <ContinueCreatingCard
        continueCreating={vm.continueCreating}
        projectPlatforms={getProjectPlatformLabels(vm.continueCreating.projectId)}
      />
      <TodoCard todos={vm.todos} />
      <TrendingTopicsCard topics={vm.trendingTopics} />
      <RecentPublicationsCard publications={vm.recentPublications} />
      <DataOverviewCard vm={vm} />
      <CreationSuggestionsCard suggestions={vm.suggestions} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 继续创作
// ---------------------------------------------------------------------------

function ContinueCreatingCard({
  continueCreating,
  projectPlatforms,
}: {
  continueCreating: ContinueCreating;
  projectPlatforms: ReadonlyArray<string>;
}) {
  return (
    <div data-slot="continue-creating-card">
    <SectionCard
      title="继续创作"
      description="最近编辑的项目与下一步行动"
    >
      <div className="flex flex-col gap-3">
        <article
          data-slot="continue-creating-row"
          className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {continueCreating.projectTitle}
            </span>
            <StatusBadge status="active" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {projectPlatforms.map((platform) => (
              <TagChip key={platform} label={platform} tone="brand" size="sm" />
            ))}
            <TagChip label={stageLabel(continueCreating.stage)} tone="info" size="sm" />
          </div>
          <ProgressBar
            value={continueCreating.progressPct}
            tone="brand"
            showValue
            label="项目进度"
          />
        </article>
        <Link
          href="/projects/new"
          data-slot="new-project-entry"
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-subtle text-sm font-medium text-brand",
            "transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span aria-hidden="true">＋</span>
          <span>新项目</span>
        </Link>
      </div>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 待办事项
// ---------------------------------------------------------------------------

function TodoCard({ todos }: { todos: ReadonlyArray<TodoRow> }) {
  return (
    <div data-slot="todo-card">
    <SectionCard title="待办事项" description={`${todos.length} 项待处理任务`}>
      <ul
        data-slot="todo-list"
        className="flex flex-col gap-2"
        aria-label="待办任务"
      >
        {todos.slice(0, 4).map((todo) => (
          <li
            key={todo.id}
            data-slot="todo-row"
            data-priority={todo.priority}
            className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {todo.title}
              </span>
              <TagChip
                label={priorityLabel(todo.priority)}
                tone={priorityTone(todo.priority)}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{todo.projectTitle}</span>
              <span>{stageLabel(todo.stage)}</span>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 热门选题
// ---------------------------------------------------------------------------

function TrendingTopicsCard({ topics }: { topics: ReadonlyArray<TopicRow> }) {
  return (
    <div data-slot="trending-topics-card">
    <SectionCard title="热门选题" description="来自知识库的灵感与热点">
      <ul
        data-slot="trending-topics"
        className="flex flex-col gap-2"
        aria-label="热门选题"
      >
        {topics.map((topic, index) => (
          <li
            key={topic.id}
            data-slot="trending-topic-row"
            data-trend={topic.trend}
            className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
              >
                {index + 1}
              </span>
              <span className="truncate text-sm text-foreground">
                {topic.title}
              </span>
            </div>
            <TagChip
              label={`热度 ${topic.heat}`}
              tone={topic.trend === "up" ? "warning" : "neutral"}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 最近发布
// ---------------------------------------------------------------------------

function RecentPublicationsCard({
  publications,
}: {
  publications: ReadonlyArray<PublicationCompactRow>;
}) {
  return (
    <div data-slot="recent-publications-card">
    <SectionCard title="最近发布" description="各平台的最新表现">
      <ul
        data-slot="recent-publications"
        className="flex flex-col gap-2"
        aria-label="最近发布"
      >
        {publications.slice(0, 4).map((row) => (
          <li
            key={row.id}
            data-slot="publication-row"
            className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <PlatformIconView platform={row.platform} size="xs" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {row.title}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.views.toLocaleString()} 次播放
                </span>
              </div>
            </div>
            <StatusBadge status={row.status} />
          </li>
        ))}
      </ul>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 数据概览
// ---------------------------------------------------------------------------

function DataOverviewCard({ vm }: { vm: DashboardViewModel }) {
  return (
    <div data-slot="data-overview-card">
    <SectionCard
      title="数据概览"
      description="本周累计播放与转化趋势"
      className="md:col-span-2 lg:col-span-1"
    >
      <div
        data-slot="data-overview-compact-metrics"
        className="grid grid-cols-2 gap-1.5"
      >
        {vm.dataOverview.metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            id={metric.id}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            trend={metric.trend}
            tone={metric.tone}
            className="bg-surface-subtle"
          />
        ))}
      </div>
      <div className="mt-2">
        <ChartFrame
          title="本周播放趋势"
          summary={buildTrendSummary(vm.dataOverview.trend)}
          trend={vm.dataOverview.trend}
          testId="dashboard-data-trend"
        />
      </div>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 创作建议
// ---------------------------------------------------------------------------

function CreationSuggestionsCard({
  suggestions,
}: {
  suggestions: ReadonlyArray<CreationSuggestion>;
}) {
  return (
    <div data-slot="creation-suggestions-card">
    <SectionCard
      title="创作建议"
      description="基于当前进度的下一步行动"
    >
      <ul
        data-slot="creation-suggestions"
        className="flex flex-col gap-2"
        aria-label="创作建议"
      >
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.id}
            data-slot="suggestion-row"
            data-category={suggestion.category}
            className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {suggestion.title}
              </span>
              <TagChip
                label={categoryLabel(suggestion.category)}
                tone="info"
                size="sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {suggestion.description}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProjectStageName | string, string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
  recording: "录制",
  editing: "剪辑",
  ready: "已就绪",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

const PRIORITY_LABELS: Record<number, string> = {
  1: "高",
  2: "高",
  3: "中",
  4: "低",
  5: "低",
};

const PRIORITY_TONES: Record<number, "warning" | "info" | "neutral"> = {
  1: "warning",
  2: "warning",
  3: "info",
  4: "neutral",
  5: "neutral",
};

function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? "中";
}

function priorityTone(priority: number): "warning" | "info" | "neutral" {
  return PRIORITY_TONES[priority] ?? "neutral";
}

const CATEGORY_LABELS: Record<string, string> = {
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  research: "研究",
  planning: "策划",
  review: "复盘",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function getProjectPlatformLabels(projectId: string): ReadonlyArray<string> {
  const platforms = getProjectPlatforms(projectId);
  if (platforms.length > 0) return platforms;
  // Fall back to a single "多平台" label so the row never renders empty.
  return ["多平台"];
}

function buildTrendSummary(
  trend: ReadonlyArray<{ label: string; value: number }>,
): string {
  if (trend.length === 0) {
    return "本周暂无播放数据。";
  }
  const values = trend.map((point) => point.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const maxPoint = trend.find((point) => point.value === max);
  const minPoint = trend.find((point) => point.value === min);
  return `本周累计播放 ${total.toLocaleString()} 次，${maxPoint?.label ?? ""} ${max.toLocaleString()} 次最高，${minPoint?.label ?? ""} ${min.toLocaleString()} 次最低`;
}

function buildGreeting(
  vm: DashboardViewModel,
  displayName: string,
): string {
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  void vm; // reserved for future variation by todos/suggestions count
  return `早上好, ${firstName}!`;
}
