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
import { STAGE_LABELS as CANONICAL_STAGE_LABELS } from "@/lib/stage-labels";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { MetricCard } from "@/components/project/metric-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import { ChartFrame } from "@/components/analytics/chart-frame";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { projectWorkspaceHref } from "@/features/projects/project-href";
import { client } from "@/lib/contract-client.server";
import {
  canonicalDataset,
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
   * Override for the displayed greeting name (test seam). In production the
   * greeting uses the real account holder — `canonicalDataset.user.displayName`,
   * the same source the sidebar's `resolveUser` reads.
   */
  readonly greetingName?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function DashboardPage({
  viewModel,
  greetingName,
}: DashboardPageProps = {}) {
  const vm =
    viewModel ??
    (await client.getDashboard({
      params: undefined,
      query: undefined,
      body: undefined,
    }));
  // Greet the real account holder — the same source the sidebar uses
  // (`resolveUser` → `canonicalDataset.user.displayName`). Tests may still
  // override via the `greetingName` prop seam.
  const greeting = buildGreeting(
    vm,
    greetingName ?? canonicalDataset.user.displayName,
  );
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
      {/* bug #3:query-only href(以 `?` 开头)= 保持当前页路径,就地开 Copilot 浮层,不跳首页。 */}
      <Link
        href="?copilot=open"
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
      <CreationSuggestionsCard
        suggestions={vm.suggestions}
        continueCreating={vm.continueCreating}
      />
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
  // Deep-link the project row to its workspace (D3)。[T-076] 两阶段化:统一走
  // projectWorkspaceHref(review → 复盘页,其余 → 稿面),不再拼阶段子路由。
  const projectHref = projectWorkspaceHref(
    continueCreating.projectId,
    continueCreating.stage,
  );
  return (
    <div data-slot="continue-creating-card">
    <SectionCard
      title="继续创作"
      description="最近编辑的项目与下一步行动"
    >
      <div className="flex flex-col gap-3">
        <Link
          href={projectHref}
          data-slot="continue-creating-row"
          className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3 transition-colors hover:border-brand/40 hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        </Link>
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
      {/* [T-054] 空态引导:0 待办时原先整卡空白(基线截图的「大片留白」),
          改为把人送去下一步(选题池)。 */}
      {todos.length === 0 ? (
        <div
          data-slot="todo-empty"
          className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border bg-surface-subtle px-3.5 py-4"
        >
          <p className="text-sm text-muted-foreground">
            没有待处理任务。从选题池挑一条,开启下一条内容。
          </p>
          <Link
            href="/topics"
            className="text-sm font-medium text-brand hover:underline"
          >
            去选题池挑一条 →
          </Link>
        </div>
      ) : null}
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
          >
            {/* D3: each todo deep-links to its project — to the stage workspace
                when `stage` is a real project stage, else the project overview. */}
            <Link
              href={todoHref(todo)}
              data-slot="todo-row-link"
              className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3 transition-colors hover:border-brand/40 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            </Link>
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
    <SectionCard
      title="热门选题"
      description="来自知识库的灵感与热点"
      action={
        <Link
          href="/topics"
          data-slot="trending-topics-action"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>去选题池</span>
          <span aria-hidden="true">→</span>
        </Link>
      }
    >
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
          <li key={row.id} data-slot="publication-row">
            {/* D3: 最近发布 rows deep-link to the Publishing Center (the lean
                dashboard publication row carries no projectId, so /publishing is
                the cleanest real target). */}
            <Link
              href="/publishing"
              className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 transition-colors hover:border-brand/40 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={row.platform} size="xs" />
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
            </Link>
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
      {/* [T-054] 删重复 KPI 瓷砖:同 5 个指标顶部一排已展示,本区再铺一遍是
          信息冗余(审计「怪」感来源之一)。数据概览聚焦趋势图。 */}
      <div className="mt-1">
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
  continueCreating,
}: {
  suggestions: ReadonlyArray<CreationSuggestion>;
  continueCreating: ContinueCreating;
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
            {(() => {
              // D3: each suggestion routes to the most relevant real surface
              // for its category — there is no per-suggestion projectId, so the
              // target is resolved from the category + the active project.
              const cta = suggestionCta(suggestion.category, continueCreating);
              return (
                <Link
                  href={cta.href}
                  data-slot="suggestion-cta"
                  className="mt-0.5 inline-flex items-center gap-1 self-start text-xs font-medium text-brand underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{cta.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              );
            })()}
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

/**
 * [T-076] 项目两阶段化后的深链:review → 复盘页;其余任何 stage(含遗留
 * research/planning/production/publishing 与 OutputStageName 的 recording/editing/…)
 * 一律落稿面(`/projects/<id>`)——可执行入口都在稿面内。
 */
function todoHref(todo: TodoRow): string {
  return todo.stage === "review"
    ? `/projects/${todo.projectId}/review`
    : `/projects/${todo.projectId}`;
}

/**
 * Category-aware CTA for a creation suggestion. 选题/研究/策划 category routes to
 * the topic pool; review resumes the active project's 复盘页; other stage
 * categories resume its 稿面 ([T-076] production 工作台已删,深链一律落稿面);
 * anything else falls back to starting a new project.
 */
function suggestionCta(
  category: string,
  continueCreating: ContinueCreating,
): { href: string; label: string } {
  if (category === "research" || category === "topic" || category === "planning") {
    return { href: "/topics", label: "去选题池" };
  }
  if (category === "review") {
    return {
      href: `/projects/${continueCreating.projectId}/review`,
      label: "立即创作",
    };
  }
  if (category === "script" || category === "production" || category === "publishing") {
    return {
      href: `/projects/${continueCreating.projectId}`,
      label: "立即创作",
    };
  }
  return { href: "/projects/new", label: "立即创作" };
}

// [T-052] 阶段名迁单一词表(lib/stage-labels);recording/editing/ready 是
// dashboard 特有的任务态扩展键,保留在本地扩展。
const STAGE_LABELS: Record<ProjectStageName | string, string> = {
  ...CANONICAL_STAGE_LABELS,
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
