/**
 * Projects page (Task 10 / page-specs §2).
 *
 * Composes the global toolbar, status tabs, view/sort controls, the
 * canonical project list rows and pagination inside the page-scroll area.
 * Data flows from `buildProjectsViewModel()`; the page is otherwise a
 * deterministic composition of approved shared components.
 *
 * The page is a Server Component. The toolbar search field and the
 * view/sort controls live inside two small Client Components
 * (`ProjectToolbar` and `ViewAndSortControls`) because they need local
 * UI state; the page itself does not.
 *
 * Layout invariants (locked by the page spec):
 *  - one PageHeading rendered by the global TopHeader (already shown by
 *    `(creator)/layout`),
 *  - ProjectToolbar with SearchField, FilterButton, NewProjectButton,
 *  - StatusTabs in the canonical order 全部 / 进行中 / 待办中 / 已暂停 /
 *    已完成 / 已归档,
 *  - ViewAndSortControls exposing list/grid + sort accessible state,
 *  - ProjectList rendering one ProjectListRow per canonical project,
 *    each row carrying thumbnail, title, summary, status, stage,
 *    progress, platforms and update time,
 *  - Pagination with the current page marked.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { PlatformIconView } from "@/components/publishing/platform-icon";
import { StatusTabsBar, type StatusTabsBarTab } from "@/features/projects/status-tabs-bar";
import { ProjectToolbar } from "@/features/projects/project-toolbar";
import { ViewAndSortControls } from "@/features/projects/view-and-sort-controls";
import { Pagination } from "@/features/projects/pagination";
import { buildProjectsViewModel } from "@/fixtures/selectors";
import { cn } from "@/lib/utils";
import type { ProjectsViewModel, ProjectListRow } from "@/types/view-models";
import type { ProjectStageName, ProjectStatus } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProjectsPageProps {
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ProjectsViewModel;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProjectsPage({ viewModel }: ProjectsPageProps = {}) {
  const vm = viewModel ?? buildProjectsViewModel();
  const tabs = buildProjectStatusTabs(vm);
  return (
    <main
      data-app="creatoros"
      data-page="projects"
      className="flex flex-col gap-(--section-gap)"
    >
      <header className="flex flex-col gap-1">
        <h1
          data-slot="projects-page-heading"
          className="font-heading text-xl font-semibold text-foreground"
        >
          项目
        </h1>
        <p
          data-slot="projects-subtitle"
          className="text-sm text-muted-foreground"
        >
          管理所有项目的阶段、进度与平台分发。
        </p>
      </header>

      <ProjectToolbar />

      <SectionCard
        title="项目状态"
        description="按状态切换以过滤项目列表"
        className="gap-3"
        contentClassName="pt-0"
      >
        <StatusTabsBar tabs={tabs} />
      </SectionCard>

      <ViewAndSortControls />

      <ProjectList rows={vm.rows} />

      <Pagination currentPage={1} totalPages={10} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------

function ProjectList({ rows }: { rows: ReadonlyArray<ProjectListRow> }) {
  return (
    <ul
      data-slot="project-list"
      aria-label="项目列表"
      className="flex flex-col gap-2"
    >
      {rows.map((row) => (
        <li key={row.id} className="list-none">
          <ProjectListItem row={row} />
        </li>
      ))}
    </ul>
  );
}

function ProjectListItem({ row }: { row: ProjectListRow }) {
  return (
    <article
      data-slot="project-row"
      data-project-id={row.id}
      data-project-status={row.status}
      data-project-stage={row.currentStage}
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-4",
        "sm:flex-row sm:items-center",
      )}
    >
      <div
        data-slot="project-thumbnail"
        aria-hidden="true"
        className="flex h-16 w-24 shrink-0 items-center justify-center rounded-control bg-brand-soft text-xs font-medium text-brand"
      >
        {contentCategoryShort(row.contentCategory)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              data-slot="project-title"
              className="truncate text-sm font-semibold text-foreground"
            >
              {row.title}
            </h3>
            <StatusBadge status={row.status as ProjectStatus} />
          </div>
          <span
            data-slot="project-updated-at"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {formatRelativeUpdatedAt(row.updatedAt)}
          </span>
        </div>
        <p
          data-slot="project-summary"
          className="line-clamp-2 text-xs text-muted-foreground"
        >
          {row.brief}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div
            data-slot="project-stage"
            className="flex items-center gap-1 rounded-control bg-surface-subtle px-2 py-0.5 text-xs text-muted-foreground"
          >
            <span aria-hidden="true">{stageGlyph(row.currentStage)}</span>
            <span>{stageLabel(row.currentStage)}</span>
          </div>
          <ProgressBar
            value={row.progressPct}
            tone={row.status === "completed" ? "success" : "brand"}
            showValue
            label="进度"
            className="min-w-32 flex-1"
          />
          <div
            data-slot="project-platforms"
            className="flex flex-wrap items-center gap-1.5"
            aria-label="目标平台"
          >
            {row.platforms.map((platform) => (
              <PlatformIconView
                key={platform.id}
                platform={platform.id}
                size="xs"
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Status tabs
// ---------------------------------------------------------------------------

const PROJECT_TAB_ORDER = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "todo", label: "待办中" },
  { id: "paused", label: "已暂停" },
  { id: "completed", label: "已完成" },
  { id: "archived", label: "已归档" },
] as const;

function buildProjectStatusTabs(vm: ProjectsViewModel): ReadonlyArray<StatusTabsBarTab> {
  const counts: Record<string, number> = {
    all: vm.rows.length,
    active: 0,
    todo: 0,
    paused: 0,
    completed: 0,
    archived: 0,
  };
  for (const row of vm.rows) {
    const key = row.status as keyof typeof counts;
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return PROJECT_TAB_ORDER.map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: counts[descriptor.id] ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProjectStageName, string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

const STAGE_GLYPHS: Record<ProjectStageName, string> = {
  research: "🔍",
  planning: "🧭",
  script: "✍️",
  production: "🎬",
  publishing: "🚀",
  review: "🧾",
};

function stageLabel(stage: ProjectStageName): string {
  return STAGE_LABELS[stage] ?? stage;
}

function stageGlyph(stage: ProjectStageName): string {
  return STAGE_GLYPHS[stage] ?? "•";
}

function contentCategoryShort(category: string): string {
  if (!category) return "项目";
  // Show first two characters to keep the thumbnail visually balanced.
  return category.slice(0, 2);
}

const FIXED_NOW = new Date("2026-06-13T10:00:00+08:00").getTime();

function formatRelativeUpdatedAt(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const diffMs = FIXED_NOW - target;
  if (diffMs <= 0) return "刚刚";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前更新`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} 周前更新`;
  const months = Math.round(days / 30);
  return `${months} 个月前更新`;
}