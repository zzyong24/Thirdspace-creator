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
import { SearchField } from "@/components/navigation/search-field";
import { NotificationPopover } from "./notification-popover";
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
        <SearchField
          id="app-header-search"
          label="全局搜索"
          dataSlot="header-search"
          placeholder={searchPlaceholder}
          value={searchValue}
        />
      ) : resolvedMode === "project-overview" || resolvedMode === "project-workspace" ? (
        <ProjectIdentityBlock
          project={project}
          stages={resolvedStages}
          mode={resolvedMode}
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
}: {
  project?: TopHeaderProjectIdentity;
  stages: NonNullable<TopHeaderProps["projectStages"]>;
  mode: "project-overview" | "project-workspace";
}) {
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
          <span className="truncate text-2xl font-semibold text-foreground">
            {project?.title ?? "项目概览"}　<span className="text-warning">★</span>
          </span>
          <span className="text-sm text-muted-foreground">
            全面解析 AI Native Browser 的核心价值、市场机会与未来趋势
          </span>
          <span className="text-xs text-muted-foreground">
            Kevin.Z　　创建于 2024-05-10　　最后更新 今天 14:30　　写稿中
          </span>
        </div>
      ) : (
        <div className="flex w-64 min-w-0 shrink-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {project?.title ?? "项目"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {project?.updatedLabel ?? "最近更新 —"}
          </span>
        </div>
      )}
      {mode === "project-workspace" ? (
        <ProjectStageStepper variant="segmented" stages={stages} />
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
  const primaryHref = primaryActionHref({ mode, pathname, project });
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
        primaryHref ? (
        <Link href={primaryHref} className={buttonVariants({ size: "lg" })}>
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

function primaryActionHref({
  mode,
  pathname,
  project,
}: {
  mode: "project-overview" | "project-workspace";
  pathname: string;
  project?: TopHeaderProjectIdentity;
}): string | null {
  if (mode === "project-overview" && project?.stage) {
    return `${pathname.replace(/\/$/, "")}/${project.stage}`;
  }
  if (mode === "project-workspace") {
    return nextWorkspaceHref(pathname);
  }
  return null;
}

const NEXT_STAGE: Record<string, string | null> = {
  research: "planning",
  planning: "script",
  script: "production",
  production: "publishing",
  publishing: "review",
  review: null,
};

function nextWorkspaceHref(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const currentStage = segments[2];
  if (!currentStage) return null;
  const nextStage = NEXT_STAGE[currentStage];
  if (!nextStage) return null;
  return `/${segments.slice(0, 2).join("/")}/${nextStage}`;
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
        <kbd className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px]">
          ⌘ K
        </kbd>
      </Link>
      <Button type="button" variant="outline" size="lg" aria-label="筛选项目">
        <span aria-hidden="true">⚙</span>
        筛选
      </Button>
      <Link
        href="/projects/new"
        className={buttonVariants({ size: "lg" })}
      >
        ＋ 新建项目
      </Link>
    </div>
  );
}
