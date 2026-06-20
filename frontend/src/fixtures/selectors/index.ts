/**
 * Public selectors that map canonical data to page ViewModels.
 *
 * Pages import selectors from this barrel. Selector functions are pure and
 * deterministic. Scenario handling for the five mandatory names lives in
 * `src/fixtures/scenarios.ts`.
 */

import { getPlatformIcon } from "@/lib/platform-icons";
import type { PlatformId } from "@/types/domain";
import type {
  ContentOutputSummary,
  DashboardViewModel,
  DataOverview,
  MetricCard,
  PlatformBadge,
  ProjectsViewModel,
  ProjectListRow,
  StatusTab,
} from "@/types/view-models";

import { canonicalDataset, getProjectPlatforms, listProjects } from "../canonical";

// Per-page selectors live in sibling modules and are re-exported here so
// pages import everything from the `@/fixtures/selectors` barrel.
export { buildResearchViewModel } from "./research";
export {
  buildContentOutputsForRender,
  buildProjectOverviewViewModel,
} from "./project-overview";
export { buildScriptViewModel } from "./script";
export { buildPlanningViewModel } from "./planning";
export { buildProductionViewModel } from "./production";
export { buildAnalyticsReviewViewModel } from "./review";
export { buildPublishingViewModel } from "./project-publishing";
export { buildKnowledgeViewModel } from "./knowledge";
export { buildAssetsViewModel } from "./assets";
export { buildSettingsViewModel } from "./settings";
export { buildPublishingCenterViewModel } from "./publishing-center";
export { buildSearchViewModel } from "./search";
export { buildExperienceViewModel } from "./experience";
export { buildCopilotViewModel } from "./copilot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function platformBadge(platform: PlatformId): PlatformBadge {
  const icon = getPlatformIcon(platform);
  return { id: icon.id === "unknown" ? platform : icon.id, label: icon.label };
}

// ---------------------------------------------------------------------------
// Notifications (COMP-006 / TopHeader notification popover)
// ---------------------------------------------------------------------------

export interface NotificationView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly type: string;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface NotificationsViewModel {
  readonly items: ReadonlyArray<NotificationView>;
  readonly unreadCount: number;
}

/**
 * Project the canonical `notifications` into the shape the TopHeader
 * popover consumes. Pure / deterministic — newest first by `createdAt`,
 * unread count derived from `readAt`.
 */
export function buildNotificationsViewModel(): NotificationsViewModel {
  const items = canonicalDataset.notifications
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map<NotificationView>((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.notificationType,
      read: notification.readAt !== null,
      createdAt: notification.createdAt,
    }));
  const unreadCount = items.filter((item) => !item.read).length;
  return { items, unreadCount };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface BuildProjectsViewModelOptions {
  rows?: ReadonlyArray<ProjectListRow>;
}

export type { ProjectListRow } from "@/types/view-models";

export function buildProjectsViewModel(
  options: BuildProjectsViewModelOptions = {},
): ProjectsViewModel {
  const projects = listProjects();
  const rows =
    options.rows ??
    projects.map<ProjectListRow>((project) => ({
      id: project.id,
      title: project.title,
      brief: project.brief,
      contentCategory: project.contentCategory,
      status: project.status,
      currentStage: project.currentStage,
      progressPct: project.progressPct,
      platforms: getProjectPlatforms(project.id).map(platformBadge),
      updatedAt: project.updatedAt,
      primaryOutputId: pickPrimaryOutputId(project.id),
      outputs: pickOutputsForProject(project.id),
      starred: project.starred,
    }));

  const tabs: ReadonlyArray<StatusTab> = [
    { id: "all", label: "全部", count: projects.length, active: true },
    {
      id: "active",
      label: "进行中",
      count: projects.filter((project) => project.status === "active").length,
      active: false,
    },
    {
      id: "paused",
      label: "已暂停",
      count: projects.filter((project) => project.status === "paused").length,
      active: false,
    },
    {
      id: "completed",
      label: "已完成",
      count: projects.filter((project) => project.status === "completed").length,
      active: false,
    },
  ];

  return {
    scenario: "default",
    kind: "projects",
    tabs,
    rows,
    loading: false,
    error: null,
    selectedId: null,
  };
}

function pickPrimaryOutputId(projectId: string): string {
  return (
    canonicalDataset.contentOutputs.find((output) => output.projectId === projectId)?.id ?? ""
  );
}

function pickOutputsForProject(projectId: string): ReadonlyArray<ContentOutputSummary> {
  return canonicalDataset.contentOutputs
    .filter((output) => output.projectId === projectId)
    .map<ContentOutputSummary>((output) => ({
      id: output.id,
      title: output.title,
      contentType: output.contentType,
      status: output.status,
    }));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Derived dashboard aggregations (R1-4).
//
// The summary metrics are DERIVED from the canonical dataset
// (Project / Publication / MetricValue / Asset / AssetFile) so the cards
// reconcile with the fixtures instead of carrying disconnected literals.
// Pure / deterministic — no Date.now / Math.random / network.
// ---------------------------------------------------------------------------

/**
 * The slice of the canonical dataset the dashboard selector reads. Parameterizing
 * over this `Pick` lets pages drive the selector from the mutable mock store
 * (which is structurally a superset) while defaulting to `canonicalDataset` for
 * back-compat. Pure / deterministic — no Date.now / Math.random / network.
 */
export type DashboardSource = Pick<
  typeof canonicalDataset,
  | "projects"
  | "tasks"
  | "publications"
  | "metricValues"
  | "contentOutputs"
  | "assets"
  | "assetFiles"
>;

/** Sum the `views` MetricValue rows across all platforms. */
function aggregateTotalViews(dataset: DashboardSource): number {
  return dataset.metricValues
    .filter((metric) => metric.metricKey === "views")
    .reduce((sum, metric) => sum + metric.numericValue, 0);
}

/** Total stored bytes across every asset file revision. */
function aggregateStorageBytes(dataset: DashboardSource): number {
  return dataset.assetFiles.reduce(
    (sum, file) => sum + file.fileSize,
    0,
  );
}

function formatWan(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(2)}w`;
  }
  return value.toLocaleString("zh-CN");
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)}GB`;
  }
  return `${mb.toFixed(1)}MB`;
}

function buildDashboardMetrics(dataset: DashboardSource): ReadonlyArray<MetricCard> {
  const activeProjects = dataset.projects.filter(
    (project) => project.status === "active",
  ).length;
  const completedPublications = dataset.publications.filter(
    (publication) => publication.status === "published",
  ).length;
  const totalViews = aggregateTotalViews(dataset);
  const assetCount = dataset.assets.length;
  const storageBytes = aggregateStorageBytes(dataset);

  return [
    {
      id: "m-active-projects",
      label: "进行中项目",
      value: String(activeProjects),
      delta: "+1",
      trend: "up",
      tone: "positive",
    },
    {
      id: "m-publications",
      label: "已完成",
      value: String(completedPublications),
      delta: "+1",
      trend: "up",
      tone: "positive",
    },
    {
      id: "m-views",
      label: "累计播放",
      value: formatWan(totalViews),
      delta: "+12%",
      trend: "up",
      tone: "positive",
    },
    {
      id: "m-assets",
      label: "素材库",
      value: String(assetCount),
      delta: "+1.2%",
      trend: "up",
      tone: "positive",
    },
    {
      id: "m-storage",
      label: "存储使用",
      value: formatBytes(storageBytes),
      delta: "-0.5%",
      trend: "down",
      tone: "warning",
    },
  ];
}

function buildDataOverview(metrics: ReadonlyArray<MetricCard>): DataOverview {
  // The reference design renders the inner 2x2 grid using
  // 已发布 / 累计播放 / 素材库 / 存储使用 (4 of the 5 top-row metrics),
  // skipping 进行中项目. We pick the matching subset by id so the
  // dashboard selector is the single source of truth and the grid keeps
  // its four compact metrics.
  const subsetIds = new Set([
    "m-publications",
    "m-views",
    "m-assets",
    "m-storage",
  ]);
  const subset = metrics.filter((metric) => subsetIds.has(metric.id));
  return {
    metrics: subset,
    trend: [
      { label: "周一", value: 1840 },
      { label: "周二", value: 2210 },
      { label: "周三", value: 1980 },
      { label: "周四", value: 2740 },
      { label: "周五", value: 3120 },
      { label: "周六", value: 2960 },
      { label: "周日", value: 3380 },
    ],
  };
}

export function buildDashboardViewModel(
  dataset: DashboardSource = canonicalDataset,
): DashboardViewModel {
  const continueProject =
    dataset.projects.find((project) => project.status === "active") ?? dataset.projects[0];

  const continueCreating = {
    heading: "继续创作",
    projectId: continueProject.id,
    projectTitle: continueProject.title,
    stage: continueProject.currentStage,
    progressPct: continueProject.progressPct,
    updatedAt: continueProject.updatedAt,
  } as const;

  const todos = dataset.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    .map((task) => {
      const project = dataset.projects.find((p) => p.id === task.projectId);
      return {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectTitle: project?.title ?? "",
        stage: task.stage,
        dueAt: task.dueAt,
        priority: task.priority,
        status: task.status,
      };
    });

  const recentPublications = dataset.publications
    .slice()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .map((publication) => {
      const platformMetrics = dataset.metricValues.filter(
        (m) => m.dimensions["platform"] === publication.platform,
      );
      const metricViews = platformMetrics
        .filter((m) => m.metricKey === "views")
        .reduce((sum, m) => sum + m.numericValue, 0);
      // Engagement is DERIVED (likes + comments for this platform) rather
      // than a hard-coded zero so the row reconciles with the fixtures.
      const engagement = platformMetrics
        .filter((m) => m.metricKey === "likes" || m.metricKey === "comments")
        .reduce((sum, m) => sum + m.numericValue, 0);
      return {
        id: publication.id,
        title: dataset.contentOutputs.find((c) => c.id === publication.contentOutputId)?.title ?? "",
        platform: publication.platform,
        status: publication.status,
        views: metricViews,
        engagement,
        publishedAt: publication.publishedAt ?? publication.updatedAt,
      };
    });

  const metrics = buildDashboardMetrics(dataset);

  return {
    scenario: "default",
    kind: "dashboard",
    metrics,
    continueCreating,
    todos,
    trendingTopics: [
      { id: "topic-1", title: "AI Native Browser 深度解析", heat: 92, trend: "up" },
      { id: "topic-2", title: "本地优先栈", heat: 78, trend: "up" },
      { id: "topic-3", title: "代理任务设计", heat: 66, trend: "flat" },
    ],
    recentPublications,
    dataOverview: buildDataOverview(metrics),
    suggestions: [
      {
        id: "sg-1",
        title: "把研究阶段结论补充到脚本",
        description: "研究产物《竞品浏览器对比》尚未被脚本引用。",
        category: "script",
      },
      {
        id: "sg-2",
        title: "上传开场 B-Roll",
        description: "开场 15 秒还缺 1 段视频素材。",
        category: "production",
      },
    ],
    assistantPrompt: "今天想先做点什么？",
    loading: false,
    error: null,
  };
}

function priorityOrder(priority: number): number {
  return priority;
}
