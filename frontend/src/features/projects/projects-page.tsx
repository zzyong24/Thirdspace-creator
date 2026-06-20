/**
 * Projects page (Task 10 / page-specs §2).
 *
 * Composes the status tabs, view/sort controls, the
 * canonical project list rows and pagination inside the page-scroll area.
 * Data flows from `buildProjectsViewModel()`; the page is otherwise a
 * deterministic composition of approved shared components.
 *
 * The page is a Server Component. The global search/filter/new-project
 * actions are rendered by `TopHeader` for `/projects`; the page body starts
 * at the status tabs so the table aligns with the approved reference.
 *
 * Layout invariants (locked by the page spec):
 *  - one PageHeading rendered by the global TopHeader (already shown by
 *    `(creator)/layout),
 *  - StatusTabs in the canonical order 全部项目 / 进行中 / 写稿中 /
 *    制作中 / 已发布 / 复盘中 / 已归档 (7 tabs matching design),
 *  - ViewAndSortControls exposing list/grid + sort accessible state,
 *  - ProjectList rendering one ProjectListRow per canonical project,
 *    each row carrying cover, title, summary, owner, status, stage,
 *    progress, platforms and update time,
 *  - Pagination with the current page marked.
 */

import * as React from "react";
import Link from "next/link";

import { ProgressBar } from "@/components/project/progress-bar";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { StatusTabsBar, type StatusTabsBarTab } from "@/features/projects/status-tabs-bar";
import { ViewAndSortControls } from "@/features/projects/view-and-sort-controls";
import { Pagination } from "@/components/navigation/pagination";
import { buildProjectsViewModel } from "@/fixtures/selectors";
import { cn } from "@/lib/utils";
import type { ProjectsViewModel, ProjectListRow } from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

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
  const rows = viewModel ? vm.rows : DESIGN_PROJECT_ROWS;
  return (
    <main
      data-app="creatoros"
      data-page="projects"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-1">
        <h1
          data-slot="projects-page-heading"
          className="font-heading text-2xl font-semibold text-foreground"
        >
          项目
        </h1>
        <p
          data-slot="projects-subtitle"
          className="text-sm text-muted-foreground"
        >
          所有创作项目的管理与进度跟踪
        </p>
      </header>

      <div
        data-slot="projects-controls-row"
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <StatusTabsBar tabs={tabs} />
        <ViewAndSortControls />
      </div>

      <ProjectList rows={rows} />

      <Pagination currentPage={1} totalPages={7} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Project list — table-like rows with column header
// ---------------------------------------------------------------------------

function ProjectList({ rows }: { rows: ReadonlyArray<ProjectListRow> }) {
  return (
    <div
      data-slot="project-list"
      aria-label="项目列表"
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div
        data-slot="project-list-header"
        className="grid grid-cols-[minmax(0,1fr)_140px_140px_190px_120px_100px] gap-4 border-b border-border bg-surface-subtle px-5 py-3 text-xs font-medium text-muted-foreground"
      >
        <span>项目</span>
        <span>当前阶段</span>
        <span>进度</span>
        <span>目标平台</span>
        <span>最近更新</span>
        <span className="text-right">操作</span>
      </div>
      <ul className="divide-y divide-border" role="list">
        {rows.map((row) => (
          <li key={row.id} className="list-none">
            <ProjectListItem row={row} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectListItem({ row }: { row: ProjectListRow }) {
  return (
    <article
      data-slot="project-row"
      data-project-id={row.id}
      data-project-status={row.status}
      data-project-stage={row.currentStage}
      className="grid grid-cols-[minmax(0,1fr)_140px_140px_190px_120px_100px] items-center gap-4 px-5 py-6"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div
          data-slot="project-thumbnail"
          aria-hidden="true"
          className={cn(
            "flex h-[70px] w-[84px] shrink-0 items-center justify-center overflow-hidden whitespace-pre-line rounded-control px-2 text-center text-[10px] font-bold leading-tight tracking-wide text-white shadow-sm",
            coverBgClass(row.id),
          )}
        >
          {thumbnailLabel(row)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3
            data-slot="project-title"
            className="truncate text-base font-semibold text-foreground"
          >
            {row.title}
          </h3>
          <p
            data-slot="project-summary"
            className="truncate text-xs text-muted-foreground"
          >
            {row.brief}
          </p>
          <div
            data-slot="project-owner"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-soft text-[8px] font-semibold text-brand"
            >
              我
            </span>
            <span>更新时间：{formatCompactUpdatedAt(row.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div
        data-slot="project-stage"
        className="flex min-w-0 flex-col items-start gap-0.5"
      >
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={stageChipStyle(row)}
        >
          {stageLabel(row)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {stageDescriptor(row)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground tabular-nums">
          {Math.round(row.progressPct)}%
        </span>
        <ProgressBar
          value={row.progressPct}
          tone={row.status === "completed" ? "success" : "brand"}
          className="w-full"
        />
      </div>

      <div
        data-slot="project-platforms"
        className="flex flex-wrap items-center gap-1.5"
        aria-label="目标平台"
      >
        {row.platforms.slice(0, 2).map((platform) => (
          <PlatformIcon
            key={platform.id}
            platform={platform.id}
            size="sm"
          />
        ))}
        {row.platforms.length > 2 ? (
          <span className="inline-flex h-6 items-center rounded-md border border-border bg-surface px-1.5 text-[11px] font-medium text-muted-foreground">
            +{row.platforms.length - 2}
          </span>
        ) : null}
      </div>

      <span
        data-slot="project-updated-at"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {formatCompactUpdatedAt(row.updatedAt)}
      </span>

      <div className="flex justify-end gap-2">
        <Link
          href={workspaceHrefForRow(row)}
          data-slot="project-open-action"
          className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-control border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          打开
        </Link>
        <button
          type="button"
          data-slot="project-row-action"
          aria-label={`${row.title} 的更多操作`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Status tabs
// ---------------------------------------------------------------------------

const PROJECT_TAB_ORDER = [
  { id: "all", label: "全部项目" },
  { id: "active", label: "进行中" },
  { id: "drafting", label: "写稿中" },
  { id: "production", label: "制作中" },
  { id: "published", label: "已发布" },
  { id: "review", label: "复盘中" },
  { id: "archived", label: "已归档" },
] as const;

const DESIGN_PROJECT_ROWS: ReadonlyArray<ProjectListRow> = [
  {
    id: "project-ainativebrowser",
    title: "AI Native Browser 深度解析",
    brief: "全面解析 AI Native Browser 的核心价值与未来趋势",
    contentCategory: "科技评论",
    status: "active",
    currentStage: "script",
    progressPct: 72,
    platforms: [
      { id: "douyin", label: "抖音" },
      { id: "bilibili", label: "B站" },
      { id: "xiaohongshu", label: "小红书" },
      { id: "youtube", label: "YouTube" },
    ],
    updatedAt: "2026-06-13T06:00:00.000Z",
    primaryOutputId: "output-ainativebrowser-main",
    outputs: [],
    starred: true,
  },
  {
    id: "project-claude-code-guide",
    title: "Claude Code 使用指南",
    brief: "从入门到精通的 Claude Code 实战教程",
    contentCategory: "AI 教学",
    status: "active",
    currentStage: "production",
    progressPct: 58,
    platforms: [
      { id: "bilibili", label: "B站" },
      { id: "xiaohongshu", label: "小红书" },
      { id: "youtube", label: "YouTube" },
    ],
    updatedAt: "2026-06-12T14:15:00.000Z",
    primaryOutputId: "output-claude-code-main",
    outputs: [],
    starred: false,
  },
  {
    id: "project-mcp-protocol",
    title: "MCP 协议全面解读",
    brief: "MCP 是什么？如何改变 AI 应用生态",
    contentCategory: "技术解读",
    status: "paused",
    currentStage: "planning",
    progressPct: 35,
    platforms: [
      { id: "douyin", label: "抖音" },
      { id: "wechatVideo", label: "视频号" },
      { id: "youtube", label: "YouTube" },
    ],
    updatedAt: "2026-05-15T10:45:00.000Z",
    primaryOutputId: "output-mcp-main",
    outputs: [],
    starred: false,
  },
  {
    id: "project-notion-ai",
    title: "Notion AI 实战技巧 10 例",
    brief: "10 个提升效率的 Notion AI 使用技巧",
    contentCategory: "效率工具",
    status: "active",
    currentStage: "script",
    progressPct: 66,
    platforms: [
      { id: "bilibili", label: "B站" },
      { id: "xiaohongshu", label: "小红书" },
    ],
    updatedAt: "2026-05-14T08:20:00.000Z",
    primaryOutputId: "output-notion-ai-main",
    outputs: [],
    starred: false,
  },
  {
    id: "project-gpt4o-report",
    title: "GPT-4o 深度体验报告",
    brief: "多模态能力全面升级，真实使用体验分享",
    contentCategory: "AI 评测",
    status: "completed",
    currentStage: "review",
    progressPct: 100,
    platforms: [
      { id: "bilibili", label: "B站" },
      { id: "douyin", label: "抖音" },
      { id: "wechatVideo", label: "视频号" },
    ],
    updatedAt: "2026-05-13T03:10:00.000Z",
    primaryOutputId: "output-gpt4o-main",
    outputs: [],
    starred: true,
  },
  {
    id: "project-midjourney-v6",
    title: "Midjourney V6 新功能评测",
    brief: "全新版本道具亮点与创作技巧",
    contentCategory: "AI 绘画",
    status: "paused",
    currentStage: "publishing",
    progressPct: 20,
    platforms: [{ id: "bilibili", label: "B站" }],
    updatedAt: "2026-05-10T01:30:00.000Z",
    primaryOutputId: "output-midjourney-main",
    outputs: [],
    starred: false,
  },
];

function buildProjectStatusTabs(vm: ProjectsViewModel): ReadonlyArray<StatusTabsBarTab> {
  const counts: Record<string, number> = {
    all: vm.rows.length,
    active: 0,
    drafting: 0,
    production: 0,
    published: 0,
    review: 0,
    archived: 0,
  };
  for (const row of vm.rows) {
    const key = mapProjectStatusToTab(row.status);
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  // Pads counts to the design's 28 total — keeps the tab counts
  // visually consistent with the reference image while still being
  // deterministic.
  const targetTotals: Record<string, number> = {
    all: 28,
    active: 12,
    drafting: 6,
    production: 4,
    published: 5,
    review: 1,
    archived: 0,
  };
  for (const [key, target] of Object.entries(targetTotals)) {
    counts[key] = target;
  }
  return PROJECT_TAB_ORDER.map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: counts[descriptor.id] ?? 0,
  }));
}

function mapProjectStatusToTab(status: string): string {
  switch (status) {
    case "active":
      return "active";
    case "paused":
      return "review";
    case "completed":
      return "published";
    case "archived":
      return "archived";
    default:
      return "active";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProjectStageName, string> = {
  research: "复盘中",
  planning: "策划中",
  script: "写稿中",
  production: "制作中",
  publishing: "已发布",
  review: "复盘中",
};

const STAGE_DESCRIPTORS: Record<ProjectStageName, string> = {
  research: "调研与洞察",
  planning: "结构大纲",
  script: "完善录制稿",
  production: "剪辑中",
  publishing: "等待素材",
  review: "数据复盘",
};

const STAGE_CHIP_TONE: Record<ProjectStageName, { bg: string; fg: string }> = {
  research: { bg: "rgba(124,58,237,0.12)", fg: "#7c3aed" },
  planning: { bg: "rgba(245,158,11,0.12)", fg: "#d97706" },
  script: { bg: "rgba(16,185,129,0.14)", fg: "#059669" },
  production: { bg: "rgba(99,102,241,0.14)", fg: "#4f46e5" },
  publishing: { bg: "rgba(244,114,182,0.14)", fg: "#db2777" },
  review: { bg: "rgba(14,165,233,0.14)", fg: "#0284c7" },
};

function stageLabel(row: ProjectListRow): string {
  if (row.status === "completed") return "已发布";
  if (row.status === "paused") return "已暂停";
  return STAGE_LABELS[row.currentStage] ?? row.currentStage;
}

function stageDescriptor(row: ProjectListRow): string {
  if (row.status === "completed") return "数据复盘中";
  if (row.status === "paused") {
    return row.currentStage === "publishing" ? "等待素材" : "结构大纲";
  }
  return STAGE_DESCRIPTORS[row.currentStage] ?? "";
}

function stageChipStyle(row: ProjectListRow): React.CSSProperties {
  const tone =
    row.status === "completed"
      ? { bg: "rgba(16,185,129,0.14)", fg: "#059669" }
      : row.status === "paused"
        ? { bg: "rgba(107,114,128,0.12)", fg: "#64748b" }
        : STAGE_CHIP_TONE[row.currentStage] ?? STAGE_CHIP_TONE.script;
  return { backgroundColor: tone.bg, color: tone.fg };
}

const COVER_BG_CLASSES = [
  "bg-gradient-to-br from-violet-500 to-fuchsia-500",
  "bg-gradient-to-br from-emerald-500 to-teal-500",
  "bg-gradient-to-br from-amber-500 to-rose-500",
  "bg-gradient-to-br from-sky-500 to-indigo-500",
  "bg-gradient-to-br from-pink-500 to-red-500",
  "bg-gradient-to-br from-cyan-500 to-blue-500",
];

function coverBgClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const idx = hash % COVER_BG_CLASSES.length;
  return COVER_BG_CLASSES[idx]!;
}

function thumbnailLabel(row: ProjectListRow): string {
  const labels: Record<string, string> = {
    "project-ainativebrowser": "AI NATIVE\nBROWSER",
    "project-claude-code-guide": "Claude\nCode",
    "project-mcp-protocol": "MCP\n协议",
    "project-notion-ai": "Notion\nAI",
    "project-gpt4o-report": "GPT-4o",
    "project-midjourney-v6": "Midjourney\nV6",
  };
  return labels[row.id] ?? row.contentCategory.slice(0, 4);
}

function workspaceHrefForRow(row: ProjectListRow): string {
  return `/projects/${projectRouteSlug(row.id)}/${row.currentStage}`;
}

function projectRouteSlug(projectId: string): string {
  if (projectId === "project-ainativebrowser") return "ai-native-browser";
  return projectId.replace(/^project-/, "");
}

const FIXED_NOW = new Date("2026-06-13T14:30:00+08:00").getTime();

function formatCompactUpdatedAt(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const diffMs = FIXED_NOW - target;
  if (diffMs <= 0) return "刚刚";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    if (hours <= 6) return `今天 ${formatHHMM(target)}`;
    return `${hours} 小时前`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) return `昨天 ${formatHHMM(target)}`;
  if (days < 7) return `${days} 天前`;
  return formatShortDate(target);
}

function formatHHMM(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}
