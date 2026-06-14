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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";

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
  { id: "script", label: "脚本", status: "in_progress" },
  { id: "production", label: "拍摄", status: "pending" },
  { id: "publishing", label: "发布", status: "pending" },
  { id: "review", label: "复盘", status: "pending" },
];

const SearchIcon = creatorIcons.search;
const BellIcon = creatorIcons.notifications;
const ShareIcon = creatorIcons.share;
const MoreIcon = creatorIcons.more;

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function TopHeader({
  mode = "global",
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
  return (
    <header
      data-slot="app-top-header"
      data-testid="app-top-header"
      data-mode={resolvedMode}
      data-masked={overlayMasked ? "true" : "false"}
      className={cn(
        "flex h-header shrink-0 items-center gap-3 border-b border-border bg-surface px-(--page-gutter)",
        "min-w-0",
        className,
      )}
    >
      {resolvedMode === "search" ? (
        <SearchField
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
        <PageHeading title={pageTitle} description={pageDescription} />
      )}
      <HeaderActions
        mode={resolvedMode}
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
}: {
  title?: string;
  description?: string;
}) {
  if (!title) {
    return <div data-slot="header-page-heading" className="min-w-0 flex-1" />;
  }
  return (
    <div
      data-slot="header-page-heading"
      className="flex min-w-0 flex-1 flex-col"
    >
      <h1 className="truncate text-md font-semibold text-foreground">
        {title}
      </h1>
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
      className="flex min-w-0 flex-1 items-center gap-(--card-gap)"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {project?.title ?? "项目"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {project?.updatedLabel ?? "最近更新 —"}
        </span>
      </div>
      {mode === "project-workspace" ? (
        <ProjectStageStepper stages={stages} />
      ) : null}
    </div>
  );
}

function ProjectStageStepper({
  stages,
}: {
  stages: NonNullable<TopHeaderProps["projectStages"]>;
}) {
  return (
    <ol
      data-slot="header-stage-stepper"
      aria-label="项目六阶段"
      className="hidden items-center gap-1 overflow-x-auto md:flex"
    >
      {stages.map((stage) => (
        <li
          key={stage.id}
          data-status={stage.status}
          className="flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              stage.status === "completed" && "bg-success",
              stage.status === "in_progress" && "bg-brand",
              stage.status === "pending" && "bg-border-strong",
              stage.status === "skipped" && "bg-warning",
            )}
          />
          {stage.label}
        </li>
      ))}
    </ol>
  );
}

function SearchField({
  placeholder,
  value,
}: {
  placeholder: string;
  value?: string;
}) {
  return (
    <form
      role="search"
      data-slot="header-search"
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="sr-only" htmlFor="app-header-search">
        全局搜索
      </label>
      <div className="relative flex flex-1 items-center">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="app-header-search"
          type="search"
          placeholder={placeholder}
          defaultValue={value}
          autoComplete="off"
          className="h-9 w-full pl-8"
        />
      </div>
    </form>
  );
}

function HeaderActions({
  mode,
  primaryActionLabel,
  secondaryActionLabel,
}: {
  mode: TopHeaderMode;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}) {
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="通知"
      >
        <BellIcon className="size-4" aria-hidden="true" />
      </Button>
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
