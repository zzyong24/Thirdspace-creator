/**
 * Project Overview page (Task 12 / page-specs §4).
 *
 * The project-overview Header mode landing page. Composes:
 *  - a full-width ProjectProgressCard with the six-stage stepper and
 *    the overall-progress bar,
 *  - a left-wide Main column with AssetSummaryCard (5 stats),
 *    RecentFilesCard and ProjectActivityCard,
 *  - a right-narrow Side column with ProjectInfoCard, OutputPlanCard,
 *    PublishingStatusCard and MilestoneCard.
 *
 * Layout invariants (locked by the page spec):
 *  - full-width progress card on top,
 *  - left-wide / right-narrow grid (Main column wider than Side column),
 *  - five asset stats in the asset summary card,
 *  - the four right-rail cards in the order ProjectInfo, OutputPlan,
 *    PublishingStatus, Milestone.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page only provides the content slot.
 */

import * as React from "react";
import Link from "next/link";
import {
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Wand2,
} from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { ProjectStageStepper } from "@/components/navigation/project-stage-stepper";
import { ProjectOverviewActions } from "@/features/project-overview/project-actions";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { getProjectById, getProjectPlatforms } from "@/fixtures/canonical";
import {
  buildContentOutputsForRender,
  buildProjectOverviewViewModel,
} from "@/fixtures/selectors";
import type { ContentOutput, ProjectStageName } from "@/types/domain";
import type { ProjectOverviewViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProjectOverviewPageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ProjectOverviewViewModel;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProjectOverviewPage({
  projectId,
  viewModel,
}: ProjectOverviewPageProps) {
  const vm = viewModel ?? buildProjectOverviewViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="project-overview"
      data-project-id={vm.projectId}
      className="flex flex-col gap-section-gap"
    >
      <ProjectProgressCard
        projectTitle={vm.projectTitle}
        currentStage={vm.stage}
        overallProgressPct={vm.progressPct}
        stages={vm.stages}
        projectId={vm.projectId}
      />
      <div
        data-slot="project-overview-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-3"
      >
        <div
          data-slot="project-overview-main-column"
          className="flex flex-col gap-card-gap lg:col-span-2"
        >
          <AssetSummaryCard stats={vm.assetStats} />
          <RecentFilesCard files={vm.recentFiles} />
          <ProjectActivityCard activities={vm.activities} />
        </div>
        <div
          data-slot="project-overview-side-column"
          className="flex flex-col gap-3 lg:col-span-1"
        >
          <ProjectInfoCard
            projectId={vm.projectId}
            entries={vm.projectInfo}
          />
          <OutputPlanCard
            projectId={vm.projectId}
            outputs={buildContentOutputsForRender(vm.projectId)}
          />
          <PublishingStatusCard
            projectId={vm.projectId}
            entries={vm.publishing}
          />
          <MilestoneCard entries={vm.milestones} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ProjectProgressCard (full-width, top of page)
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProjectStageName, string> = {
  research: "选题调研",
  planning: "策划构思",
  script: "脚本撰写",
  production: "拍摄制作",
  publishing: "渠道发布",
  review: "数据复盘",
};

const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

function ProjectProgressCard({
  projectTitle,
  currentStage,
  overallProgressPct,
  stages,
  projectId,
}: {
  projectTitle: string;
  currentStage: ProjectStageName;
  overallProgressPct: number;
  stages: ProjectOverviewViewModel["stages"];
  projectId: string;
}) {
  return (
    <div data-slot="project-progress-card">
      <SectionCard
        title="项目进度"
        description={`当前阶段 · ${STAGE_LABELS[currentStage]}`}
      >
        <div className="flex flex-col gap-4">
          <div
            data-slot="project-progress-header"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1
                data-slot="project-overview-title"
                className="truncate font-heading text-[15px] font-semibold text-foreground"
              >
                {projectTitle}
              </h1>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {`项目 ID · ${projectId}`}
              </p>
            </div>
            <div
              data-slot="project-progress-actions"
              className="flex flex-wrap items-center gap-2"
            >
              <Button type="button" variant="outline" size="sm">
                编辑信息
              </Button>
              {/* Mutating header affordances (收藏 / 归档 / 进入下一步) are a
                  Client island so they can call the mock backend and revalidate
                  the server tree. The 进入工作台 navigation stays a plain Link. */}
              <ProjectOverviewActions
                projectId={projectId}
                currentStage={currentStage}
                starred={getProjectById(projectId)?.starred ?? false}
              />
              <Link
                href={workspaceHrefForProject(projectId, currentStage)}
                className={buttonVariants({ size: "sm" })}
              >
                <Wand2 aria-hidden="true" className="size-4" />
                进入工作台
              </Link>
            </div>
          </div>
          <ProjectStageStepper
            currentStage={currentStage}
            stages={STAGE_ORDER.map((stageName) => {
              const stage = stages.find((entry) => entry.stage === stageName);
              return {
                id: stageName,
                label: STAGE_LABELS[stageName],
                status: stage?.status ?? "pending",
              };
            })}
          />
          <div
            data-slot="overall-progress"
            className="flex flex-col gap-1"
          >
            <ProgressBar
              value={overallProgressPct}
              tone="brand"
              showValue
              label="整体进度"
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function workspaceHrefForProject(
  projectId: string,
  currentStage: ProjectStageName,
): string {
  return `/projects/${projectRouteSlug(projectId)}/${currentStage}`;
}

function projectRouteSlug(projectId: string): string {
  if (projectId === "project-ainativebrowser") return "ai-native-browser";
  return projectId.replace(/^project-/, "");
}

// ---------------------------------------------------------------------------
// AssetSummaryCard (Main column, 5 stats)
// ---------------------------------------------------------------------------

function AssetSummaryCard({
  stats,
}: {
  stats: ProjectOverviewViewModel["assetStats"];
}) {
  return (
    <div data-slot="asset-summary-card">
      <SectionCard
        title="项目资产概览"
        description="文档、脚本、素材、数据与经验沉淀"
      >
        <ul
          data-slot="asset-summary-list"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {stats.map((stat) => (
            <li
              key={stat.id}
              data-slot="asset-stat"
              data-stat-id={stat.id}
              data-tone={stat.tone}
              className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-3"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </span>
              <span
                data-slot="asset-stat-value"
                className="text-[20px] font-semibold leading-tight tabular-nums text-foreground"
              >
                {stat.value}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {stat.delta}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentFilesCard
// ---------------------------------------------------------------------------

function RecentFilesCard({
  files,
}: {
  files: ProjectOverviewViewModel["recentFiles"];
}) {
  return (
    <div data-slot="recent-files-card">
      <SectionCard
        title="最近文件"
        description="项目内最近编辑或更新的文件"
      >
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无最近文件。</p>
        ) : (
          <ul
            data-slot="recent-files-list"
            aria-label="最近文件"
            className="flex flex-col gap-1.5"
          >
            {files.map((file) => {
              const Icon = fileTypeIcon(file.fileKind);
              return (
                <li
                  key={file.id}
                  data-slot="recent-file-row"
                  data-file-kind={file.fileKind}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      data-slot="recent-file-icon"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-muted-foreground"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {file.type}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRecentTimestamp(file.updatedAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectActivityCard
// ---------------------------------------------------------------------------

function ProjectActivityCard({
  activities,
}: {
  activities: ProjectOverviewViewModel["activities"];
}) {
  return (
    <div data-slot="project-activity-card">
      <SectionCard
        title="项目动态"
        description="脚本、里程碑与证据的最新变化"
      >
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无项目动态。</p>
        ) : (
          <ul
            data-slot="project-activity-list"
            aria-label="项目动态"
            className="flex flex-col gap-1.5"
          >
            {activities.map((activity) => (
              <li
                key={activity.id}
                data-slot="project-activity-row"
                data-tone={activity.tone}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar
                    aria-hidden="true"
                    size="sm"
                    data-slot="project-activity-avatar"
                  >
                    <AvatarFallback>
                      {activityActorInitials(activity)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-foreground">
                      {activity.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {activityActorLabel(activity)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatRecentTimestamp(activity.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectInfoCard (Side column, first)
// ---------------------------------------------------------------------------

function ProjectInfoCard({
  projectId,
  entries,
}: {
  projectId: string;
  entries: ProjectOverviewViewModel["projectInfo"];
}) {
  return (
    <div data-slot="project-info-card">
      <SectionCard
        title="项目信息"
        description={projectId}
      >
        <dl
          data-slot="project-info-list"
          className="flex flex-col gap-2"
        >
          {entries.map((entry) => (
            <div
              key={entry.label}
              data-slot="project-info-row"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <dt className="text-muted-foreground">{entry.label}</dt>
              <dd className="text-right text-foreground">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OutputPlanCard (Side column, second)
// ---------------------------------------------------------------------------

function OutputPlanCard({
  projectId,
  outputs,
}: {
  projectId: string;
  outputs: ReadonlyArray<ContentOutput>;
}) {
  const platforms = getProjectPlatforms(projectId);
  return (
    <div data-slot="output-plan-card">
      <SectionCard
        title="输出规划"
        description="已规划的内容与目标平台"
      >
        <div
          data-slot="output-plan-platforms"
          className="flex flex-wrap items-center gap-2"
          aria-label="目标平台"
        >
          {platforms.map((platform) => (
            <PlatformIcon
              key={platform}
              platform={platform}
              size="xs"
              showLabel
            />
          ))}
        </div>
        <ul
          data-slot="output-plan-list"
          className="mt-3 flex flex-col gap-2"
          aria-label="内容输出"
        >
          {outputs.map((output) => (
            <li
              key={output.id}
              data-slot="output-plan-row"
              className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {output.title}
                </span>
                <StatusBadge status={output.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TagChip label={output.contentType} tone="brand" size="sm" />
                <span>{output.aspectRatio}</span>
                <span>{`约 ${Math.round(output.targetDurationSeconds / 60)} 分钟`}</span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PublishingStatusCard (Side column, third)
// ---------------------------------------------------------------------------

function PublishingStatusCard({
  projectId,
  entries,
}: {
  projectId: string;
  entries: ProjectOverviewViewModel["publishing"];
}) {
  return (
    <div data-slot="publishing-status-card">
      <SectionCard
        title="发布状态"
        description="各平台发布进度"
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {`项目 ${projectId} 暂无发布记录。`}
          </p>
        ) : (
          <ul
            data-slot="publishing-status-list"
            className="flex flex-col gap-2"
            aria-label="发布状态"
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-slot="publishing-status-row"
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PlatformIcon platform={entry.platform} size="xs" />
                  <span className="truncate text-sm text-foreground">
                    {entry.platform}
                  </span>
                </div>
                <StatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MilestoneCard (Side column, fourth)
// ---------------------------------------------------------------------------

function MilestoneCard({
  entries,
}: {
  entries: ProjectOverviewViewModel["milestones"];
}) {
  return (
    <div data-slot="milestone-card">
      <SectionCard
        title="里程碑"
        description="关键节点与交付物"
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无里程碑。</p>
        ) : (
          <ul
            data-slot="milestone-list"
            className="flex flex-col gap-2"
            aria-label="里程碑"
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-slot="milestone-row"
                data-status={entry.status}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {entry.title}
                  </span>
                  <StatusBadge
                    status={entry.status === "completed" ? "completed" : "todo"}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {`目标 · ${formatRecentTimestamp(entry.targetAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRecentTimestamp(iso: string): string {
  // Render as a deterministic YYYY-MM-DD HH:mm label so the test can
  // assert on presence without depending on a non-deterministic
  // relative-time formatter. Page is a Server Component and runs in
  // a fixed timezone (Asia/Shanghai) anchored on FIXED_NOW.
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return iso;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function fileTypeIcon(
  kind: ProjectOverviewViewModel["recentFiles"][number]["fileKind"],
): React.ComponentType<{ className?: string }> {
  switch (kind) {
    case "script":
      return FileText;
    case "shot":
      return FileVideo;
    case "data":
      return FileBarChart2;
    default:
      return FileSpreadsheet;
  }
}

const PROJECT_OWNER_DISPLAY_NAME = "Zyong Zhu";

function activityActorLabel(
  activity: ProjectOverviewViewModel["activities"][number],
): string {
  switch (activity.eventType) {
    case "artifact_updated":
      return `${PROJECT_OWNER_DISPLAY_NAME} · 脚本编辑`;
    case "evidence_linked":
      return `${PROJECT_OWNER_DISPLAY_NAME} · 证据关联`;
    case "milestone_completed":
      return `${PROJECT_OWNER_DISPLAY_NAME} · 里程碑`;
    default:
      return PROJECT_OWNER_DISPLAY_NAME;
  }
}

function activityActorInitials(
  activity: ProjectOverviewViewModel["activities"][number],
): string {
  const label = activityActorLabel(activity);
  // Take the first letter of the first two CJK / word characters.
  const chars = Array.from(label).filter((c) => /\p{L}|\p{N}/u.test(c));
  if (chars.length === 0) return "Z";
  if (chars.length === 1) return chars[0]!.toUpperCase();
  return (chars[0]! + chars[1]!).toUpperCase();
}
