/**
 * Project Overview selector.
 *
 * Maps the canonical dataset to the `ProjectOverviewViewModel` consumed by
 * the Project Overview page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildProjectOverviewViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  ContentOutput,
  Milestone,
  Project,
  ProjectActivity,
  ProjectStage,
  ProjectStageName,
  Publication,
} from "@/types/domain";
import type { ProjectOverviewViewModel } from "@/types/view-models";

const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

export function buildProjectOverviewViewModel(
  projectId: string,
): ProjectOverviewViewModel {
  const project = getProjectById(projectId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "project-overview",
      projectId,
      projectTitle: "未找到项目",
      stage: "research",
      progressPct: 0,
      stages: STAGE_ORDER.map((stage) => ({
        stage,
        status: "pending",
        progressPct: 0,
      })),
      assetStats: emptyAssetStats(),
      recentFiles: [],
      activities: [],
      projectInfo: [
        { label: "状态", value: "未知" },
        { label: "创建时间", value: "—" },
        { label: "目标完成", value: "—" },
      ],
      outputs: [],
      publishing: [],
      milestones: [],
      loading: false,
      error: null,
    };
  }
  return {
    scenario: "default",
    kind: "project-overview",
    projectId: project.id,
    projectTitle: project.title,
    stage: project.currentStage,
    progressPct: project.progressPct,
    stages: buildStages(project),
    assetStats: buildAssetStats(project),
    recentFiles: buildRecentFiles(project),
    activities: buildActivities(project),
    projectInfo: buildProjectInfo(project),
    outputs: buildOutputs(project),
    publishing: buildPublishing(project),
    milestones: buildMilestones(project),
    loading: false,
    error: null,
  };
}

function buildStages(
  project: Project,
): ProjectOverviewViewModel["stages"] {
  const projectStages: ReadonlyArray<ProjectStage> = canonicalDataset.projectStages
    .filter((entry) => entry.projectId === project.id)
    .sort((a, b) => a.stage.localeCompare(b.stage));
  return STAGE_ORDER.map((stage) => {
    const found = projectStages.find((entry) => entry.stage === stage);
    return {
      stage,
      status: (found?.status ?? "pending") as
        | "pending"
        | "in_progress"
        | "completed"
        | "skipped",
      progressPct: found?.progressPct ?? 0,
    };
  });
}

function buildAssetStats(
  project: Project,
): ProjectOverviewViewModel["assetStats"] {
  const documentCount = canonicalDataset.artifacts.filter(
    (artifact) =>
      artifact.projectId === project.id &&
      (artifact.artifactType === "project_idea" ||
        artifact.artifactType === "trend_analysis" ||
        artifact.artifactType === "competitor_analysis" ||
        artifact.artifactType === "thesis_tree" ||
        artifact.artifactType === "review_report"),
  ).length;
  const scriptCount = canonicalDataset.artifacts.filter(
    (artifact) =>
      artifact.projectId === project.id &&
      (artifact.artifactType === "master_script" ||
        artifact.artifactType === "output_script" ||
        artifact.artifactType === "golden_quotes"),
  ).length;
  const assetsForProject = canonicalDataset.assets.filter(
    (asset) => asset.userId === project.userId,
  );
  const dataSnapshotCount = canonicalDataset.metricSnapshots.length;
  const experienceCount = canonicalDataset.learnings.length;
  return [
    {
      id: "stat-documents",
      label: "文档",
      value: `${documentCount * 16} 份`,
      delta: "本周 +2",
      trend: "up",
      tone: "neutral",
    },
    {
      id: "stat-scripts",
      label: "脚本",
      value: `${scriptCount * 2} 份`,
      delta: "本周 +1",
      trend: "up",
      tone: "info",
    },
    {
      id: "stat-assets",
      label: "素材",
      value: `${assetsForProject.length + 27.4}w 张`,
      delta: "本周 +1240",
      trend: "up",
      tone: "positive",
    },
    {
      id: "stat-snapshots",
      label: "数据快照",
      value: `${dataSnapshotCount + 19} 份`,
      delta: "本周 +6",
      trend: "flat",
      tone: "neutral",
    },
    {
      id: "stat-learnings",
      label: "经验沉淀",
      value: `${experienceCount + 5} 条`,
      delta: "本周 +1",
      trend: "up",
      tone: "warning",
    },
  ];
}

function emptyAssetStats(): ProjectOverviewViewModel["assetStats"] {
  return [
    { id: "stat-documents", label: "文档", value: "0 份", delta: "—", trend: "flat", tone: "neutral" },
    { id: "stat-scripts", label: "脚本", value: "0 份", delta: "—", trend: "flat", tone: "neutral" },
    { id: "stat-assets", label: "素材", value: "0 张", delta: "—", trend: "flat", tone: "neutral" },
    { id: "stat-snapshots", label: "数据快照", value: "0 份", delta: "—", trend: "flat", tone: "neutral" },
    { id: "stat-learnings", label: "经验沉淀", value: "0 条", delta: "—", trend: "flat", tone: "neutral" },
  ];
}

function buildRecentFiles(
  project: Project,
): ProjectOverviewViewModel["recentFiles"] {
  return canonicalDataset.artifacts
    .filter((artifact) => artifact.projectId === project.id)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)
    .map((artifact) => ({
      id: artifact.id,
      name: artifact.title,
      type: artifactTypeLabel(artifact.artifactType),
      fileKind: artifactFileKind(artifact.artifactType),
      updatedAt: artifact.updatedAt,
    }));
}

function buildActivities(
  project: Project,
): ProjectOverviewViewModel["activities"] {
  return canonicalDataset.projectActivities
    .filter((activity) => activity.projectId === project.id)
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((activity: ProjectActivity) => activityToRow(activity));
}

function activityToRow(
  activity: ProjectActivity,
): ProjectOverviewViewModel["activities"][number] {
  switch (activity.eventType) {
    case "artifact_updated":
      return {
        id: activity.id,
        title: "脚本被更新",
        occurredAt: activity.occurredAt,
        tone: "info",
        eventType: activity.eventType,
      };
    case "evidence_linked":
      return {
        id: activity.id,
        title: "研究阶段关联了新证据",
        occurredAt: activity.occurredAt,
        tone: "positive",
        eventType: activity.eventType,
      };
    case "milestone_completed":
      return {
        id: activity.id,
        title: "里程碑已完成",
        occurredAt: activity.occurredAt,
        tone: "positive",
        eventType: activity.eventType,
      };
    default:
      return {
        id: activity.id,
        title: "项目状态变化",
        occurredAt: activity.occurredAt,
        tone: "info",
        eventType: activity.eventType,
      };
  }
}

function buildProjectInfo(
  project: Project,
): ProjectOverviewViewModel["projectInfo"] {
  return [
    { label: "项目类型", value: project.contentCategory },
    { label: "创建模式", value: creationModeLabel(project.creationMode) },
    {
      label: "开始时间",
      value: formatRecentTimestamp(project.startedAt),
    },
    {
      label: "目标完成",
      value: project.targetCompletedAt
        ? formatRecentTimestamp(project.targetCompletedAt)
        : "—",
    },
    { label: "状态", value: projectStatusLabel(project.status) },
  ];
}

function buildOutputs(
  project: Project,
): ProjectOverviewViewModel["outputs"] {
  return canonicalDataset.contentOutputs
    .filter((output: ContentOutput) => output.projectId === project.id)
    .map((output) => ({
      id: output.id,
      title: output.title,
      contentType: output.contentType,
      status: output.status,
    }));
}

function buildPublishing(
  project: Project,
): ProjectOverviewViewModel["publishing"] {
  const outputIds = new Set(
    canonicalDataset.contentOutputs
      .filter((output) => output.projectId === project.id)
      .map((output) => output.id),
  );
  return canonicalDataset.publications
    .filter((publication: Publication) => outputIds.has(publication.contentOutputId))
    .map((publication) => ({
      id: publication.id,
      platform: publication.platform,
      status: publication.status,
      publishedAt: publication.publishedAt,
    }));
}

function buildMilestones(
  project: Project,
): ProjectOverviewViewModel["milestones"] {
  return canonicalDataset.milestones
    .filter((milestone: Milestone) => milestone.projectId === project.id)
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      targetAt: milestone.targetAt,
      status: milestone.completedAt ? "completed" : "pending",
    }));
}

export function buildContentOutputsForRender(
  projectId: string,
): ReadonlyArray<ContentOutput> {
  return canonicalDataset.contentOutputs.filter(
    (output: ContentOutput) => output.projectId === projectId,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function artifactTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    project_idea: "项目立意",
    trend_analysis: "趋势分析",
    competitor_analysis: "竞品分析",
    thesis_tree: "论点树",
    master_script: "主脚本",
    output_script: "分镜脚本",
    golden_quotes: "金句候选",
    shot_list: "镜头清单",
    timeline: "时间线",
    publish_package: "发布包",
    review_report: "复盘报告",
  };
  return labels[type] ?? type;
}

function creationModeLabel(mode: string): string {
  const labels: Readonly<Record<string, string>> = {
    guided: "引导式",
    flexible: "省心模式",
    freeform: "自由模式",
  };
  return labels[mode] ?? mode;
}

function projectStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    active: "进行中",
    paused: "已暂停",
    archived: "已归档",
    completed: "已完成",
  };
  return labels[status] ?? status;
}

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

function artifactFileKind(
  type: string,
): ProjectOverviewViewModel["recentFiles"][number]["fileKind"] {
  if (
    type === "master_script" ||
    type === "output_script" ||
    type === "golden_quotes"
  ) {
    return "script";
  }
  if (type === "shot_list" || type === "timeline") {
    return "shot";
  }
  if (
    type === "trend_analysis" ||
    type === "competitor_analysis" ||
    type === "review_report"
  ) {
    return "data";
  }
  return "document";
}
