/**
 * TopHeader is the pinned bar at the top of the main frame.
 *
 * The component is mode-driven — it never forks into different files per
 * page. Supported modes (D-005):
 *  - `global`            – Dashboard, Projects, resource centers, Settings
 *  - `project-overview`  – Project title, metadata, Enter Workspace
 *  - `project-workspace` – Project identity, six-stage stepper, primary action
 *  - `search`            – Global search input + filters
 *  - `overlay-background`– Same layout with a mask for open overlays
 *
 * The first focusable element is the search input (or the search trigger
 * for non-search modes) so keyboard focus enters the header before the
 * page scroll area.
 */

import * as React from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ProjectStageStepper } from "@/components/navigation/project-stage-stepper";
import { HeaderGlobalSearch } from "./header-global-search";
import { NotificationPopover } from "./notification-popover";
import { WorkspacePrimaryAction } from "./workspace-primary-action";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { NotificationsViewModel } from "@/fixtures/selectors";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TopHeaderMode =
  | "global"
  | "project-overview"
  | "project-workspace"
  | "search"
  | "overlay-background";

export interface TopHeaderProjectIdentity {
  readonly projectId: string;
  readonly title: string;
  readonly stage: string;
  readonly stageProgressPct: number;
  readonly updatedLabel: string;
  readonly starred: boolean;
  /**
   * REAL project one-liner (`projects.brief`), threaded by the shell router so
   * the project-overview subtitle renders the actual project context instead of
   * a hardcoded constant. Optional — when absent the subtitle is omitted rather
   * than faked.
   */
  readonly brief?: string;
}

export interface TopHeaderProps {
  readonly mode?: TopHeaderMode;
  readonly pathname?: string;
  // G1: the server-read Shell notifications, passed to the bell popover as its
  // `viewModel`. Optional so existing static renders fall back to the selector.
  readonly notifications?: NotificationsViewModel;
  readonly pageTitle?: string;
  readonly pageDescription?: string;
  readonly project?: TopHeaderProjectIdentity;
  readonly projectStages?: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly status: "pending" | "in_progress" | "completed" | "skipped";
  }>;
  readonly primaryActionLabel?: string;
  readonly secondaryActionLabel?: string;
  readonly searchPlaceholder?: string;
  readonly searchValue?: string;
  readonly overlayMasked?: boolean;
  readonly className?: string;
}

export type TopHeaderStage = {
  readonly id: string;
  readonly label: string;
  readonly status: "pending" | "in_progress" | "completed" | "skipped";
};

const DEFAULT_STAGES: ReadonlyArray<TopHeaderStage> = [
  { id: "research", label: "研究", status: "completed" },
  { id: "planning", label: "策划", status: "completed" },
  { id: "script", label: "写稿", status: "in_progress" },
  { id: "production", label: "制作", status: "pending" },
  { id: "publishing", label: "发布", status: "pending" },
  { id: "review", label: "复盘", status: "pending" },
];

const SearchIcon = creatorIcons.search;
const ShareIcon = creatorIcons.share;
const MoreIcon = creatorIcons.more;

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function TopHeader({
  mode = "global",
  pathname = "/",
  notifications,
  pageTitle,
  pageDescription,
  project,
  projectStages = DEFAULT_STAGES,
  primaryActionLabel,
  secondaryActionLabel,
  searchPlaceholder = "搜索项目、素材或知识",
  searchValue,
  overlayMasked = false,
  className,
}: TopHeaderProps) {
  const resolvedMode: TopHeaderMode = overlayMasked ? "overlay-background" : mode;
  const resolvedStages: ReadonlyArray<TopHeaderStage> = projectStages ?? DEFAULT_STAGES;
  const usesOverlayLayout =
    resolvedMode === "global" || resolvedMode === "overlay-background";
  return (
    <header
      data-slot="app-top-header"
      data-testid="app-top-header"
      data-mode={resolvedMode}
      data-layout={usesOverlayLayout ? "overlay" : "flow"}
      data-masked={overlayMasked ? "true" : "false"}
      className={cn(
        "z-header flex min-w-0 items-center gap-3 px-page-gutter",
        usesOverlayLayout
          ? "pointer-events-none absolute inset-x-0 top-0 h-20 justify-end border-0 bg-transparent pt-2"
          : resolvedMode === "project-overview"
            ? "h-40 shrink-0 items-start border-b border-border bg-surface py-5"
            : "h-header shrink-0 border-b border-border bg-surface",
        className,
      )}
    >
      {resolvedMode === "search" ? (
        // [T-051 2d] 可见搜索框接真:client 岛提交 → router.push(/search?q=…)
        // server 重查。旧的 SearchField 无 onSubmit(默认 preventDefault)是死路。
        <HeaderGlobalSearch
          placeholder={searchPlaceholder}
          initialValue={searchValue}
        />
      ) : resolvedMode === "project-overview" || resolvedMode === "project-workspace" ? (
        <ProjectIdentityBlock
          project={project}
          stages={resolvedStages}
          mode={resolvedMode}
          pathname={pathname}
        />
      ) : (
        <PageHeading
          title={pageTitle}
          description={pageDescription}
          visuallyHidden={usesOverlayLayout}
        />
      )}
      <HeaderActions
        mode={resolvedMode}
        pathname={pathname}
        project={project}
        notifications={notifications}
        primaryActionLabel={primaryActionLabel}
        secondaryActionLabel={secondaryActionLabel}
      />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function PageHeading({
  title,
  description,
  visuallyHidden = false,
}: {
  title?: string;
  description?: string;
  visuallyHidden?: boolean;
}) {
  if (!title) {
    return <div data-slot="header-page-heading" className="min-w-0 flex-1" />;
  }
  return (
    <div
      data-slot="header-page-heading"
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        visuallyHidden && "sr-only",
      )}
    >
      {visuallyHidden ? (
        <span className="truncate text-md font-semibold text-foreground">
          {title}
        </span>
      ) : (
        <h1 className="truncate text-md font-semibold text-foreground">
          {title}
        </h1>
      )}
      {description ? (
        <p className="truncate text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function ProjectIdentityBlock({
  project,
  stages,
  mode,
  pathname,
}: {
  project?: TopHeaderProjectIdentity;
  stages: NonNullable<TopHeaderProps["projectStages"]>;
  mode: "project-overview" | "project-workspace";
  pathname: string;
}) {
  const segments = pathname.split("/").filter(Boolean);
  const routeProjectId = segments[1];
  const currentStage = segments[2];
  return (
    <div
      data-slot="header-project-identity"
      className={cn(
        "flex min-w-0 flex-1 gap-card-gap",
        mode === "project-overview"
          ? "flex-col items-start"
          : "items-center",
      )}
    >
      {mode === "project-overview" ? (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            项目　›　{project?.title ?? "项目概览"}
          </span>
          <span
            className="truncate text-2xl font-semibold text-foreground"
            title={project?.title}
          >
            {project?.title ?? "项目概览"}
            {project?.starred ? (
              <>
                　<span className="text-warning">★</span>
              </>
            ) : null}
          </span>
          {/* T-010: 副标题读真实项目 brief(projects.brief),无 brief 则省略 —
              不再渲染硬编码假文案「全面解析 AI Native Browser…」。 */}
          {project?.brief ? (
            <span className="text-sm text-muted-foreground">{project.brief}</span>
          ) : null}
          {/* T-010: 元信息只渲染真值(updatedLabel 由 router 透传)。原假作者
              「Kevin.Z」/ 假创建日期「2024-05-10」无数据来源,删除不编造。 */}
          {project?.updatedLabel ? (
            <span className="text-xs text-muted-foreground">
              {project.updatedLabel}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex w-64 min-w-0 shrink-0 flex-col">
          {/* [T-089④] 超长标题(导入作品曾把整篇文案当 title)truncate + title 悬停看全名。 */}
          <span
            className="truncate text-sm font-medium text-foreground"
            title={project?.title}
          >
            {project?.title ?? "项目"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {project?.updatedLabel ?? "最近更新 —"}
          </span>
        </div>
      )}
      {mode === "project-workspace" ? (
        <ProjectStageStepper
          variant="segmented"
          stages={stages}
          currentStage={currentStage}
          projectId={routeProjectId}
        />
      ) : null}
    </div>
  );
}

function HeaderActions({
  mode,
  pathname,
  primaryActionLabel,
  secondaryActionLabel,
  project,
  notifications,
}: {
  mode: TopHeaderMode;
  pathname: string;
  project?: TopHeaderProjectIdentity;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  notifications?: NotificationsViewModel;
}) {
  if (
    (mode === "global" || mode === "overlay-background") &&
    pathname === "/"
  ) {
    return <DashboardHeaderActions notifications={notifications} />;
  }
  if (
    (mode === "global" || mode === "overlay-background") &&
    pathname === "/projects"
  ) {
    return <ProjectsHeaderActions />;
  }
  if (mode === "global" || mode === "overlay-background") {
    return null;
  }
  if (mode === "project-workspace" || mode === "project-overview") {
    return (
      <ProjectHeaderActions
        mode={mode}
        pathname={pathname}
        project={project}
        primaryActionLabel={primaryActionLabel}
        secondaryActionLabel={secondaryActionLabel}
      />
    );
  }

  // For non-search modes the search trigger is the first focusable element
  // (D-005: focus order TopHeader -> PageContent).
  const showSearchTrigger = mode !== "search";
  return (
    <div
      data-slot="header-actions"
      className="flex shrink-0 items-center gap-2"
    >
      {showSearchTrigger ? (
        <Link
          href="/search"
          aria-label="搜索"
          data-slot="button"
          className="group/button inline-flex shrink-0 items-center justify-center rounded-lg size-8 text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <SearchIcon className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      <NotificationPopover viewModel={notifications} />
      {secondaryActionLabel ? (
        <Button type="button" variant="outline" size="sm">
          {secondaryActionLabel}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="分享"
      >
        <ShareIcon className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="更多"
      >
        <MoreIcon className="size-4" aria-hidden="true" />
      </Button>
      {primaryActionLabel ? (
        <Button type="button" size="sm">
          {primaryActionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ProjectHeaderActions({
  mode,
  pathname,
  project,
  primaryActionLabel,
  secondaryActionLabel,
}: {
  mode: "project-overview" | "project-workspace";
  pathname: string;
  project?: TopHeaderProjectIdentity;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}) {
  // The Overview header's primary action enters the workspace (navigation only,
  // no stage change). The Workspace header's primary action PERSISTS the stage
  // transition through the same contract op the overview page uses, so progress
  // and position never desync (Plan A6).
  const overviewHref =
    mode === "project-overview" && project?.stage
      ? `${pathname.replace(/\/$/, "")}/${project.stage}`
      : null;
  const segments = pathname.split("/").filter(Boolean);
  const routeProjectId = segments[1] ?? "";
  const currentStage = segments[2] ?? "";
  // Advancing labels are the "进入下一步:<next>" ones; terminal/non-advancing
  // labels ("完成制作", "查看数据", "导出报告") stay plain buttons.
  const advances = (primaryActionLabel ?? "").startsWith("进入下一步");
  return (
    <div
      data-slot="header-actions"
      className={cn(
        "flex shrink-0 items-center gap-3",
        mode === "project-overview" && "pt-0.5",
      )}
    >
      {mode === "project-workspace" ? (
        <Link
          href="/search"
          aria-label="搜索"
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}
        >
          <SearchIcon className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      {secondaryActionLabel ? (
        <Button type="button" variant="outline" size="lg">
          <ShareIcon className="size-4" aria-hidden="true" />
          {secondaryActionLabel}
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="icon-lg" aria-label="更多">
        <MoreIcon className="size-4" aria-hidden="true" />
      </Button>
      {primaryActionLabel ? (
        mode === "project-workspace" ? (
          <WorkspacePrimaryAction
            label={primaryActionLabel}
            routeProjectId={routeProjectId}
            currentStage={currentStage}
            advances={advances}
          />
        ) : overviewHref ? (
          <Link href={overviewHref} className={buttonVariants({ size: "lg" })}>
            {primaryActionLabel} →
          </Link>
        ) : (
          <Button type="button" size="lg">
            {primaryActionLabel} →
          </Button>
        )
      ) : null}
    </div>
  );
}

function DashboardHeaderActions({
  notifications,
}: {
  notifications?: NotificationsViewModel;
}) {
  return (
    <div
      data-slot="header-actions"
      className="pointer-events-auto flex shrink-0 items-center gap-3"
    >
      <Link
        href="/search"
        aria-label="搜索"
        className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-muted-foreground shadow-sm"
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        <span className="flex-1">搜索项目、内容、素材...</span>
        {/* [T-051 2c] ⌘K 已接真:GlobalSearchHotkey(layout 挂载)监听 ⌘K/Ctrl+K
            → /search,与此提示言行一致。 */}
        <kbd className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px]">
          ⌘ K
        </kbd>
      </Link>
      <NotificationPopover
        viewModel={notifications}
        triggerClassName="size-9 border border-border bg-surface"
      />
      <Link
        href="/projects/new"
        className={buttonVariants({ size: "lg" })}
      >
        ＋ 新建项目
      </Link>
    </div>
  );
}

function ProjectsHeaderActions() {
  return (
    <div
      data-slot="header-actions"
      className="pointer-events-auto flex shrink-0 items-center gap-3"
    >
      <Link
        href="/search"
        aria-label="搜索项目"
        className="flex h-10 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-muted-foreground shadow-sm"
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        <span className="flex-1">搜索项目名称、关键词...</span>
        {/* §348 ⌘K kbd hint — decorative per roadmap §4 (intentionally inert:
            no keydown listener; the Link itself navigates to /search). */}
        <kbd className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px]">
          ⌘ K
        </kbd>
      </Link>
      {/* [T-153] 移除全局 header 的「筛选」假按钮(无 onClick,不生效,误导用户):
          页内 ProjectsToolbar 已提供真筛选(状态 tab)+ 真排序 + 可见性开关(URL 驱动),
          此处重复且假。裁决「接不了真就移除避免误导」。 */}
      <Link
        href="/projects/new"
        className={buttonVariants({ size: "lg" })}
      >
        ＋ 新建项目
      </Link>
    </div>
  );
}
