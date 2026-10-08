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
 *  - ProjectsToolbar(状态 tab + 排序,URL 驱动真筛真排;视图切换已砍 [T-051]),
 *  - ProjectList rendering one ProjectListRow per canonical project,
 *    each row carrying cover, title, summary, owner, status, stage,
 *    progress, platforms and update time,
 *  - Pagination with the current page marked.
 */

import * as React from "react";
import Link from "next/link";

import { EmptyState } from "@/components/state/page-state";
import { ProgressBar } from "@/components/project/progress-bar";
import { CoverThumb } from "@/components/resources/cover-thumb";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { type StatusTabsBarTab } from "@/features/projects/status-tabs-bar";
import { ProjectsToolbar } from "@/features/projects/projects-toolbar";
import { projectWorkspaceHref } from "@/features/projects/project-href";
import { ProjectRowMenu } from "@/features/projects/project-row-menu";
import {
  ProjectScheduleControl,
  type ProjectScheduleSummary,
} from "@/features/projects/project-schedule-control";
import { Pagination } from "@/components/navigation/pagination";
import { buildProjectsViewModel } from "@/fixtures/selectors";
import { client as defaultClient } from "@/lib/contract-client.server";
import { cn } from "@/lib/utils";
import { STAGE_LABELS_ACTIVE, STAGE_DESCRIPTORS } from "@/lib/stage-labels";
import type { ProjectsViewModel, ProjectListRow } from "@/types/view-models";
import type { Project, ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Structural seam for the server read. The route passes a session-scoped
 * `createServerClient(ctx)` so the projects list stays user-scoped; the default
 * keeps the singleton (canonical ctx) as the SSR/test fallback seam.
 * [T-078] 封面解析 ops 可选:窄桩(只有 listProjects)照常工作,行回渐变占位。
 */
export type ProjectsReadClient = Pick<typeof defaultClient, "listProjects"> &
  Partial<
    Pick<
      typeof defaultClient,
      | "listOutputs"
      | "listPublications"
      | "listPublicationRevisions"
      // [T-153] 内容指标排序读:project → outputs → publications → 最新 metric_snapshot。
      | "getPublicationAnalytics"
    >
  >;

export interface ProjectsPageProps {
  /** 服务端传入的真实账号组上下文；旧账号调用方省略。 */
  readonly groupId?:string|null;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ProjectsViewModel;
  /** 1-based page number (from the route's ?page= search param). */
  readonly page?: number;
  /**
   * [T-051 2b] 状态筛选(?status=,tab id;"all" = 不筛)与排序(?sort=)。
   * 三件套接真:server 端据此筛行 + 排序,tab 计数仍取全量。
   */
  readonly status?: string;
  readonly sort?: string;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam.
   */
  readonly client?: ProjectsReadClient;
  /** 当前页封面通过账号作用域的批量服务读取。 */
  readonly resolveCoverIds?: (projectIds: readonly string[]) => Promise<Record<string, string | null>>;
  /**
   * T-599：由 route/server composition 一次性读取当前账号的有效项目排期后传入。
   * 缺省不渲染控件，避免未登录/未选号或旧调用方制造无归属写请求。
   */
  readonly scheduleContext?: {
    readonly accountId: string;
    readonly referenceDateKey: string;
    readonly entries: ReadonlyArray<ProjectScheduleSummary>;
  };
}

// Demo/seed projects from the canonical baseline dataset. They stay seeded (the
// acceptance/integration tests assert their ids), but the user-facing list shows
// only the user's REAL works + anything they create — never these demos.
const DEMO_PROJECT_IDS = new Set<string>([
  "project-ainativebrowser",
  "project-secondbrain",
  "project-promptcraft",
  "project-podcast-launch",
]);

const PROJECTS_PAGE_SIZE = 10;

// [T-153] metric 类排序 id(server 侧本地常量,不跨 client 边界 import —— 从
//   "use client" 的 projects-toolbar 导出 Set 会在 RSC 序列化时丢 .has,真机报错)。
//   决定是否付「全量解析最新快照」的 N+1 成本。
const PROJECT_METRIC_SORT_IDS = ["plays", "likes", "comments"] as const;
function isMetricSort(sort: string): boolean {
  return (PROJECT_METRIC_SORT_IDS as ReadonlyArray<string>).includes(sort);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function ProjectsPage({
  viewModel,
  page = 1,
  status = "all",
  sort = "updated",
  client = defaultClient,
  scheduleContext,
  resolveCoverIds,
  groupId,
}: ProjectsPageProps = {}) {
  // Reads flow page -> await client.* -> MockTransport -> store -> DTO. The
  // `viewModel?` prop remains the test-override seam (fixture-driven, sync).
  // Real read: pull the user's projects, drop the canonical demos, sort
  // newest-published first, then page 10/screen.
  const all =
    viewModel === undefined
      ? ((await client.listProjects({
          params: undefined,
          query: { page: 1, pageSize: 500 },
          body: undefined,
        })) as unknown as ReadonlyArray<Project>)
      : [];
  // 真机反馈 #1(时间倒序):按真实发布时刻倒序 —— 导入的已发布历史作品用
  //   platformRef.publishedAt(真实发布时刻),缺失(站内新建项目)回退 createdAt。
  //   原 createdAt 倒序对导入历史作品语义错(导入入库顺序 ≠ 实际发布顺序)。
  const realProjects = all
    .filter((project) => !DEMO_PROJECT_IDS.has(project.id))
    .slice()
    .sort((a, b) =>
      projectSortKey(b).localeCompare(projectSortKey(a)),
    );

  // Build the VM from the FULL real set so the status-tab counts stay correct,
  // then filter (status tab) + sort + slice the rows to the current page.
  const vm = viewModel ?? buildProjectsViewModel(realProjects);
  // T-595：页面直接消费采集边界归一后的项目域，不再二次解释 hidden。
  const baseRows = vm.rows;
  const tabs = buildProjectStatusTabs(baseRows);

  // [T-051 2b] 状态 tab 真筛选:tab 计数看全量(上面),行集按选中 tab 过滤。
  // [T-102] 「全部」视图排除已归档项目(只在「已归档」tab 显示);其余 tab 精确匹配。
  const filteredRows =
    status === "all"
      ? baseRows.filter((row) => mapProjectRowToTab(row) !== "archived")
      : baseRows.filter((row) => mapProjectRowToTab(row) === status);
  // [T-153] 内容指标排序(播放/点赞/评论)才付「全量解析最新快照」的 N+1 成本:
  //   对筛选后的行集全量解析 metric_snapshot(排序作用在分页前,故须全量);其余排序
  //   (updated/progress/stage/title)与测试 seam 路径不解析 → metrics undefined。
  const rowsForSort =
    viewModel === undefined && isMetricSort(sort) && canResolveMetrics(client)
      ? await resolveRowsMetrics(client, filteredRows)
      : filteredRows;
  // [T-051 2b] 排序真接线:updated(默认,保持真实发布时刻倒序的原序)之外按选项排。
  const sortedRows = sortProjectRows(rowsForSort, sort);

  // Pagination only applies to the real-read path; the test-override VM renders
  // its rows verbatim (totalPages 1) so existing page tests stay green.
  const paginate = viewModel === undefined;
  const totalPages = paginate
    ? Math.max(1, Math.ceil(sortedRows.length / PROJECTS_PAGE_SIZE))
    : 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = paginate
    ? sortedRows.slice(
        (currentPage - 1) * PROJECTS_PAGE_SIZE,
        currentPage * PROJECTS_PAGE_SIZE,
      )
    : sortedRows;
  // [T-078] 只给当前页的行解析真封面(每页 10 行,N+1 可控):项目 → outputs →
  // publications → 当前 revision.coverAssetId。测试 viewModel 覆写路径 / 窄桩
  // client 不解析(coverAssetId 缺省 → 渐变占位,现状不回退)。
  // 封面是可选展示；批量读取失败仍展示项目，不放大为整页错误。
  const coverIds = paginate && resolveCoverIds && pagedRows.length
    ? await resolveCoverIds(pagedRows.map((row) => row.id)).catch(() => ({} as Record<string, string | null>))
    : undefined;
  const rows =
    coverIds
      ? pagedRows.map((row) => ({ ...row, coverAssetId: coverIds[row.id] ?? null }))
      : paginate && canResolveCovers(client)
      ? await Promise.all(
          pagedRows.map(async (row) => ({
            ...row,
            coverAssetId: await resolveProjectCoverAssetId(client, row.id),
          })),
        )
      : pagedRows;
  const totalLabel =
    status === "all"
      ? `共 ${filteredRows.length} 个项目` // [T-102] 不含已归档
      : `筛选 ${sortedRows.length} / ${baseRows.length} 个项目`;
  // 分页链接保留当前筛选/排序(否则翻页丢筛选)。
  const hrefForPage = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (status !== "all") params.set("status", status);
    if (sort !== "updated") params.set("sort", sort);
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };
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

      <ProjectsToolbar
        tabs={tabs}
        status={status}
        sort={sort}
      />

      <ProjectList rows={rows} scheduleContext={scheduleContext} groupId={groupId}/>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalLabel={totalLabel}
        perPageLabel={`每页显示 ${PROJECTS_PAGE_SIZE} 条`}
        hrefForPage={paginate ? hrefForPage : undefined}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Project list — table-like rows with column header
// ---------------------------------------------------------------------------

function ProjectList({
  rows,
  scheduleContext,
  groupId,
}: {
  rows: ReadonlyArray<ProjectListRow>;
  groupId?:string|null;
  scheduleContext?: ProjectsPageProps["scheduleContext"];
}) {
  // [T-332 S4·§6.2] 新号零项目:诚实空态 + 从零开始的两个入口(新建 / 从选题立项),
  // 不再渲染只有列头的空表格(看着像坏了)。
  if (rows.length === 0) {
    return (
      <EmptyState
        title={groupId?"这个账号组还没有项目":"这个账号还没有项目"}
        description={groupId?"项目属于当前账号组。可以先创建项目，分发时再添加平台账号，也可以从选题池立项。":"项目按抖音号隔离。新建一个项目,或先去选题池挑一条候选立项。"}
        action={
          <div className="flex items-center gap-4">
            <Link
              href="/projects/new"
              data-slot="projects-empty-new"
              className="inline-flex h-9 items-center justify-center rounded-card bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
            >
              ＋ 新建项目
            </Link>
            <Link
              href="/topics"
              data-slot="projects-empty-topics"
              className="text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              从选题立项 →
            </Link>
          </div>
        }
      />
    );
  }
  return (
    <div
      data-slot="project-list"
      aria-label="项目列表"
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div
        data-slot="project-list-header"
        className="grid grid-cols-[minmax(0,1fr)_140px_130px_170px_110px_150px_108px] gap-4 border-b border-border bg-surface-subtle px-5 py-3 text-xs font-medium text-muted-foreground"
      >
        <span>项目</span>
        <span>当前阶段</span>
        <span>进度</span>
        <span>目标平台</span>
        <span>最近更新</span>
        <span>发布排期</span>
        <span className="text-right">操作</span>
      </div>
      <ul className="divide-y divide-border" role="list">
        {rows.map((row) => (
          <li key={row.id} className="list-none">
            <ProjectListItem row={row} scheduleContext={scheduleContext} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectListItem({
  row,
  scheduleContext,
}: {
  row: ProjectListRow;
  scheduleContext?: ProjectsPageProps["scheduleContext"];
}) {
  const schedule =
    scheduleContext?.entries.find((entry) => entry.projectId === row.id) ?? null;
  const lifecycle = deriveProjectLifecycle(row);
  const scheduleEligible =
    scheduleContext !== undefined && lifecycle.scheduleEligible;
  const scheduleStaticLabel = lifecycle.scheduleStaticLabel;

  return (
    <article
      data-slot="project-row"
      data-project-id={row.id}
      data-project-status={row.status}
      data-project-stage={row.currentStage}
      className="grid grid-cols-[minmax(0,1fr)_140px_130px_170px_110px_150px_108px] items-center gap-4 px-5 py-6"
    >
      <div className="flex min-w-0 items-center gap-4">
        {/* [T-078] 有真封面(采集回填的 revision.coverAssetId)渲真图;无则渐变占位。 */}
        <CoverThumb
          assetId={row.coverAssetId ?? null}
          alt={row.title}
          className="h-[70px] w-[84px] shrink-0 rounded-control object-cover shadow-sm bg-surface-subtle"
          fallback={
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
          }
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              data-slot="project-title"
              className="truncate text-base font-semibold text-foreground"
            >
              {row.title}
            </h3>
          </div>
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

      <div data-slot="project-schedule-cell" className="flex min-w-0 items-center">
        {scheduleContext && scheduleEligible ? (
          <ProjectScheduleControl
            accountId={scheduleContext.accountId}
            projectId={row.id}
            projectTitle={row.title}
            referenceDateKey={scheduleContext.referenceDateKey}
            schedule={schedule}
            eligible={scheduleEligible}
          />
        ) : (
          <span
            data-slot="project-schedule-static"
            className="text-xs text-muted-foreground"
          >
            {scheduleStaticLabel}
          </span>
        )}
      </div>

      <div
        data-slot="project-actions"
        className="flex items-center justify-end gap-2"
      >
        <Link
          href={workspaceHrefForRow(row)}
          data-slot="project-open-action"
          className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-control border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          打开
        </Link>
        <ProjectRowMenu
          projectId={row.id}
          projectTitle={row.title}
          openHref={workspaceHrefForRow(row)}
          // [T-085] 状态感知:已归档行的菜单不再放出必 409 的归档动作。
          projectStatus={row.status}
          // [T-102] 来源透传:imported 项目删除确认框额外强调含真实数据。
          projectSource={row.source}
        />
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

// [T-051 2b] 排序真接线:updated 保持传入原序(真实发布时刻倒序,projectSortKey 已排),
// 其余按选项排;未知 sort 值按 updated 处理。
function sortProjectRows(
  rows: ReadonlyArray<ProjectListRow>,
  sort: string,
): ReadonlyArray<ProjectListRow> {
  const STAGE_ORDER = [
    "brief",
    "research",
    "planning",
    "script",
    "production",
    "publishing",
    "review",
  ];
  switch (sort) {
    case "progress":
      return rows.slice().sort((a, b) => b.progressPct - a.progressPct);
    case "stage":
      return rows
        .slice()
        .sort(
          (a, b) =>
            STAGE_ORDER.indexOf(a.currentStage) -
            STAGE_ORDER.indexOf(b.currentStage),
        );
    case "title":
      return rows.slice().sort((a, b) => a.title.localeCompare(b.title, "zh"));
    // [T-153] 内容指标排序:按最新 metric_snapshot 快照倒序(高→低)。无 metrics 的行
    //   (未解析 / 无采集数据)排最后(视为 0),不歪排序。
    case "plays":
      return rows
        .slice()
        .sort((a, b) => (b.metrics?.plays ?? 0) - (a.metrics?.plays ?? 0));
    case "likes":
      return rows
        .slice()
        .sort((a, b) => (b.metrics?.likes ?? 0) - (a.metrics?.likes ?? 0));
    case "comments":
      return rows
        .slice()
        .sort((a, b) => (b.metrics?.comments ?? 0) - (a.metrics?.comments ?? 0));
    default:
      return rows;
  }
}

// [T-073] 签名从 vm 收窄到 rows:tab 计数基于「默认过滤已隐藏后」的行集(与列表一致)。
function buildProjectStatusTabs(
  rows: ReadonlyArray<ProjectListRow>,
): ReadonlyArray<StatusTabsBarTab> {
  const counts: Record<string, number> = {
    all: rows.length,
    active: 0,
    drafting: 0,
    production: 0,
    published: 0,
    review: 0,
    archived: 0,
  };
  for (const row of rows) {
    const key = mapProjectRowToTab(row);
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  // Tab counts are the REAL project distribution (D-PRJ-b): no fixture override.
  // [T-102] 「全部」不含已归档:归档项目只在「已归档」tab 出现(用户裁决),
  //   故 all 计数 = 总数 - 归档数;per-status 桶来自 mapProjectRowToTab。
  counts.all = rows.length - (counts.archived ?? 0);
  return PROJECT_TAB_ORDER.map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    count: counts[descriptor.id] ?? 0,
  }));
}

function mapProjectRowToTab(row: ProjectListRow): string {
  return deriveProjectLifecycle(row).tab;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// [T-052] 阶段名迁单一词表(lib/stage-labels):修「research=复盘中」bug,
// 全站阶段中文名不再各页自写字典。
const STAGE_LABELS = STAGE_LABELS_ACTIVE;

const STAGE_CHIP_TONE: Record<ProjectStageName, { bg: string; fg: string }> = {
  brief: { bg: "rgba(148,163,184,0.16)", fg: "#475569" },
  research: { bg: "rgba(124,58,237,0.12)", fg: "#7c3aed" },
  planning: { bg: "rgba(245,158,11,0.12)", fg: "#d97706" },
  script: { bg: "rgba(16,185,129,0.14)", fg: "#059669" },
  production: { bg: "rgba(99,102,241,0.14)", fg: "#4f46e5" },
  publishing: { bg: "rgba(244,114,182,0.14)", fg: "#db2777" },
  review: { bg: "rgba(14,165,233,0.14)", fg: "#0284c7" },
};

// 真机反馈 #1(时间倒序)排序键:导入作品用真实发布时刻,缺失回退 createdAt。
//   注:排序在 Project(raw DTO)层做,故取 platformRef.publishedAt(VM 的 publishedAt
//   等价镜像)。空键('')排在最后(localeCompare 升序里最小),published 真值在前。
function projectSortKey(project: Project): string {
  return project.platformRef?.publishedAt ?? project.createdAt ?? "";
}

function stageLabel(row: ProjectListRow): string {
  return deriveProjectLifecycle(row).stageLabel;
}

function stageDescriptor(row: ProjectListRow): string {
  return deriveProjectLifecycle(row).stageDescriptor;
}

function stageChipStyle(row: ProjectListRow): React.CSSProperties {
  const tone = deriveProjectLifecycle(row).stageTone;
  return { backgroundColor: tone.bg, color: tone.fg };
}

interface ProjectLifecyclePresentation {
  readonly tab: "active" | "review" | "published" | "archived";
  readonly stageLabel: string;
  readonly stageDescriptor: string;
  readonly stageTone: { bg: string; fg: string };
  readonly scheduleEligible: boolean;
  readonly scheduleStaticLabel: string;
}

/**
 * T-724 单一生命周期解释器：status 是当前生命状态，source 只说明出生方式。
 * 所有 Tab、标签、颜色和排期文案都必须从这里派生，避免 archived+imported 被复活。
 */
function deriveProjectLifecycle(
  row: ProjectListRow,
): ProjectLifecyclePresentation {
  const mutedTone = { bg: "rgba(107,114,128,0.12)", fg: "#64748b" };
  const publishedTone = { bg: "rgba(16,185,129,0.14)", fg: "#059669" };
  if (row.status === "archived") {
    return {
      tab: "archived",
      stageLabel: "已归档",
      stageDescriptor: "项目已归档",
      stageTone: mutedTone,
      scheduleEligible: false,
      scheduleStaticLabel: "已归档",
    };
  }

  if (row.source === "imported") {
    return {
      tab: "published",
      stageLabel: "已发布",
      stageDescriptor: "历史作品",
      stageTone: publishedTone,
      scheduleEligible: false,
      scheduleStaticLabel: "历史作品",
    };
  }

  if (row.status === "completed") {
    return {
      tab: "published",
      stageLabel: "已发布",
      stageDescriptor: "数据复盘中",
      stageTone: publishedTone,
      scheduleEligible: false,
      scheduleStaticLabel: "已完成",
    };
  }

  // 进入 review 就代表发布动作已经结束、现在只做数据复盘。即使旧数据的
  // output.status 尚未同步为 published，也不能把它重新解释成可排期项目。
  if (row.currentStage === "review") {
    return {
      tab: "review",
      stageLabel: "复盘中",
      stageDescriptor: "数据复盘",
      stageTone: STAGE_CHIP_TONE.review ?? mutedTone,
      scheduleEligible: false,
      scheduleStaticLabel: "复盘中",
    };
  }

  const hasPublishedOutput = row.outputs.some(
    (output) => output.status === "published",
  );
  if (row.status === "paused") {
    return {
      tab: "review",
      stageLabel: "已暂停",
      stageDescriptor:
        row.currentStage === "publishing" ? "等待素材" : "结构大纲",
      stageTone: mutedTone,
      scheduleEligible: !hasPublishedOutput,
      scheduleStaticLabel: hasPublishedOutput ? "已发布" : "不可排期",
    };
  }

  return {
    tab: "active",
    stageLabel: STAGE_LABELS[row.currentStage] ?? row.currentStage,
    stageDescriptor: STAGE_DESCRIPTORS[row.currentStage] ?? "",
    stageTone:
      STAGE_CHIP_TONE[row.currentStage] ?? STAGE_CHIP_TONE.script,
    scheduleEligible: !hasPublishedOutput,
    scheduleStaticLabel: hasPublishedOutput ? "已发布" : "不可排期",
  };
}

// ---------------------------------------------------------------------------
// [T-078] 项目行真封面解析(server 侧,只跑当前页 10 行)
// ---------------------------------------------------------------------------

function canResolveCovers(
  client: ProjectsReadClient,
): client is ProjectsReadClient &
  Required<
    Pick<
      typeof defaultClient,
      "listOutputs" | "listPublications" | "listPublicationRevisions"
    >
  > {
  return (
    typeof client.listOutputs === "function" &&
    typeof client.listPublications === "function" &&
    typeof client.listPublicationRevisions === "function"
  );
}

/**
 * 项目 → outputs → publications → 当前 revision.coverAssetId。命中第一个有封面的
 * publication 即返回(一个项目通常一条发布链)。任一读失败 → null(渐变占位,
 * 绝不把封面故障放大成列表故障)。
 */
async function resolveProjectCoverAssetId(
  client: ProjectsReadClient &
    Required<
      Pick<
        typeof defaultClient,
        "listOutputs" | "listPublications" | "listPublicationRevisions"
      >
  >,
  projectId: string,
): Promise<string | null> {
  try {
    // contract client 的类型标的是单资源,运行时 list op 返回数组 —— 与
    // publishing-center-data 同款窄化(经 unknown 转数组结构)。
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string }>;
    for (const output of outputs.slice(0, 3)) {
      const pubs = (await client.listPublications({
        params: { outputId: output.id },
        query: { page: 1, pageSize: 10 },
        body: undefined,
      })) as unknown as ReadonlyArray<{
        id: string;
        currentRevisionId: string | null;
      }>;
      for (const pub of pubs) {
        const revs = (await client.listPublicationRevisions({
          params: { publicationId: pub.id },
          query: { page: 1, pageSize: 20 },
          body: undefined,
        })) as unknown as ReadonlyArray<{
          id: string;
          coverAssetId?: string | null;
        }>;
        const current =
          revs.find((r) => r.id === pub.currentRevisionId) ?? revs[0];
        if (current?.coverAssetId) return current.coverAssetId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// [T-153] 项目行内容指标解析(server 侧,仅 metric 类排序时全量解析)
// ---------------------------------------------------------------------------

function canResolveMetrics(
  client: ProjectsReadClient,
): client is ProjectsReadClient &
  Required<
    Pick<
      typeof defaultClient,
      "listOutputs" | "listPublications" | "getPublicationAnalytics"
    >
  > {
  return (
    typeof client.listOutputs === "function" &&
    typeof client.listPublications === "function" &&
    typeof client.getPublicationAnalytics === "function"
  );
}

/**
 * 给行集全量解析最新 metric_snapshot(project → outputs → publications →
 * analytics 最新快照;键名归一 views/plays、likes、comments,与 publishing-center /
 * backend analytics.repository 同口径)。一个项目聚合其所有 publication 的最新快照
 * (取各 publication 最新快照求和)。任一读失败 → 该行 metrics 缺省(排序视为 0),
 * 绝不把指标故障放大成列表故障。
 */
async function resolveRowsMetrics(
  client: ProjectsReadClient &
    Required<
      Pick<
        typeof defaultClient,
        "listOutputs" | "listPublications" | "getPublicationAnalytics"
      >
    >,
  rows: ReadonlyArray<ProjectListRow>,
): Promise<ReadonlyArray<ProjectListRow>> {
  return Promise.all(
    rows.map(async (row) => {
      const metrics = await resolveProjectMetrics(client, row.id);
      return metrics ? { ...row, metrics } : row;
    }),
  );
}

async function resolveProjectMetrics(
  client: ProjectsReadClient &
    Required<
      Pick<
        typeof defaultClient,
        "listOutputs" | "listPublications" | "getPublicationAnalytics"
      >
    >,
  projectId: string,
): Promise<ProjectListRow["metrics"] | null> {
  try {
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string }>;
    let plays = 0;
    let likes = 0;
    let comments = 0;
    let sawAny = false;
    for (const output of outputs.slice(0, 3)) {
      const pubs = (await client.listPublications({
        params: { outputId: output.id },
        query: { page: 1, pageSize: 10 },
        body: undefined,
      })) as unknown as ReadonlyArray<{ id: string }>;
      for (const pub of pubs) {
        const snapshots = (await client.getPublicationAnalytics({
          params: { publicationId: pub.id },
          query: { page: 1, pageSize: 20 },
          body: undefined,
        })) as unknown as ReadonlyArray<{
          capturedAt: string;
          rawMetrics?: Record<string, unknown>;
        }>;
        if (!snapshots || snapshots.length === 0) continue;
        const latest = snapshots
          .slice()
          .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]!;
        const raw = latest.rawMetrics ?? {};
        sawAny = true;
        // 键名归一:真采集写 `views`,fixture 写 `plays`(与 analytics.repository 同口径)。
        plays += numOfMetric(raw, "views") || numOfMetric(raw, "plays");
        likes += numOfMetric(raw, "likes");
        comments += numOfMetric(raw, "comments");
      }
    }
    return sawAny ? { plays, likes, comments } : null;
  } catch {
    return null;
  }
}

function numOfMetric(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
  return projectWorkspaceHref(row.id, row.currentStage);
}

function formatCompactUpdatedAt(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  // [T-052] 相对时间锚改真时钟:旧写死 2026-06-13 假「现在」让真项目的
  // 「x 天前」全部失真(审计:三个互相矛盾的「现在」之一)。SSR 每请求取真值。
  const diffMs = Date.now() - target;
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
