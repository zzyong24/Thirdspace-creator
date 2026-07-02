import type { RequestContext } from "@creatoros/contract";
import type {
  DashboardPage,
  ProjectOverviewPage,
  GlobalSearchPage,
  PublishingCenterPage,
  MetricCard,
} from "./query-services.schema";

// =============================================================================
// Query services (SPEC §19) — page-composition reads. Each composer is built with
// FACADE interfaces declaring exactly the upstream public methods it calls; the
// composition root (persistence-client.ts) binds those facades to the real public
// services (via each module's index.ts). This module issues NO SQL: user scope is
// INHERITED by threading the request's `ctx` UNCHANGED into every downstream call
// (no ctx mutation, no userId override). The composers return page-shaped DTOs.
// =============================================================================

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

type ProjectStageName = DashboardPage["continueCreating"]["stage"];

const DEFAULT_STAGE: ProjectStageName = "research";
const DASHBOARD_ASSISTANT_PROMPT =
  "需要我帮你把今天的待办拆成可执行的脚本步骤吗？";

// A DTO-valid zero-value `continueCreating` (the empty scenario still validates).
function zeroContinueCreating(): DashboardPage["continueCreating"] {
  // `id` is z.string().min(1); the empty-scenario card carries a non-empty
  // sentinel so the DTO validates while signalling "no active project".
  return {
    heading: "开始新的创作",
    projectId: "none",
    projectTitle: "",
    stage: DEFAULT_STAGE,
    progressPct: 0,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  continueCreating: DashboardPage["continueCreating"] | null;
  todos: DashboardPage["todos"];
}
export interface DashboardMetrics {
  metrics: ReadonlyArray<MetricCard>;
  trend: DashboardPage["dataOverview"]["trend"];
}

export interface DashboardDeps {
  projects: {
    getDashboardSummary(ctx: RequestContext): Promise<DashboardSummary>;
  };
  publishing: {
    getRecentPublications(
      ctx: RequestContext,
    ): Promise<DashboardPage["recentPublications"]>;
  };
  analytics: {
    getDashboardMetrics(ctx: RequestContext): Promise<DashboardMetrics>;
  };
  learnings: {
    getSuggestions(ctx: RequestContext): Promise<DashboardPage["suggestions"]>;
  };
  notifications: {
    getUnreadCount(ctx: RequestContext): Promise<number>;
  };
  knowledge: {
    getTrendingTopics(
      ctx: RequestContext,
    ): Promise<DashboardPage["trendingTopics"]>;
  };
}

export interface DashboardQueryService {
  getDashboard(ctx: RequestContext): Promise<DashboardPage>;
}

export function createDashboardQueryService(
  deps: DashboardDeps,
): DashboardQueryService {
  return {
    async getDashboard(ctx) {
      try {
        // Every downstream call receives `ctx` UNCHANGED (the inherited-scope
        // invariant). notifications.getUnreadCount IS called (SPEC §19) — its
        // consumer is the shell badge, not a dashboardPage field (open question
        // #6), so the value is intentionally not slotted into the DTO body.
        const [summary, recentPublications, metricsBundle, suggestions, , topics] =
          await Promise.all([
            deps.projects.getDashboardSummary(ctx),
            deps.publishing.getRecentPublications(ctx),
            deps.analytics.getDashboardMetrics(ctx),
            deps.learnings.getSuggestions(ctx),
            deps.notifications.getUnreadCount(ctx),
            deps.knowledge.getTrendingTopics(ctx),
          ]);

        const continueCreating =
          summary.continueCreating ?? zeroContinueCreating();
        const todos = summary.todos ?? [];
        const metrics = metricsBundle.metrics ?? [];
        const trend = metricsBundle.trend ?? [];

        const isEmpty =
          todos.length === 0 &&
          recentPublications.length === 0 &&
          metrics.length === 0 &&
          topics.length === 0 &&
          suggestions.length === 0 &&
          summary.continueCreating === null;

        return {
          scenario: isEmpty ? "empty" : "default",
          kind: "dashboard",
          loading: false,
          error: null,
          metrics: [...metrics],
          continueCreating,
          todos: [...todos],
          trendingTopics: [...topics],
          recentPublications: [...recentPublications],
          dataOverview: { metrics: [...metrics], trend: [...trend] },
          suggestions: [...suggestions],
          assistantPrompt: DASHBOARD_ASSISTANT_PROMPT,
        };
      } catch (err) {
        // Error isolation: one failing upstream → render an error state, not a
        // 500. The DTO must still validate (other sections empty).
        return {
          scenario: "error",
          kind: "dashboard",
          loading: false,
          error: {
            code: "dashboard_compose_failed",
            message: err instanceof Error ? err.message : "组合面板数据失败",
          },
          metrics: [],
          continueCreating: zeroContinueCreating(),
          todos: [],
          trendingTopics: [],
          recentPublications: [],
          dataOverview: { metrics: [], trend: [] },
          suggestions: [],
          assistantPrompt: DASHBOARD_ASSISTANT_PROMPT,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Project Overview
// ---------------------------------------------------------------------------

export interface ProjectOverviewCore {
  projectId: string;
  projectTitle: string;
  stage: ProjectStageName;
  progressPct: number;
  stages: ProjectOverviewPage["stages"];
  outputs: ProjectOverviewPage["outputs"];
  activities: ProjectOverviewPage["activities"];
  projectInfo: ProjectOverviewPage["projectInfo"];
  milestones: ProjectOverviewPage["milestones"];
}
export interface ProjectAssetStats {
  assetStats: ProjectOverviewPage["assetStats"];
  recentFiles: ProjectOverviewPage["recentFiles"];
}

export interface ProjectOverviewDeps {
  projects: {
    getProjectOverview(
      ctx: RequestContext,
      projectId: string,
    ): Promise<ProjectOverviewCore>;
  };
  assets: {
    getProjectAssetStats(
      ctx: RequestContext,
      projectId: string,
    ): Promise<ProjectAssetStats>;
  };
  publishing: {
    getProjectPublishing(
      ctx: RequestContext,
      projectId: string,
    ): Promise<ProjectOverviewPage["publishing"]>;
  };
}

export interface ProjectOverviewQueryService {
  getProjectOverview(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ProjectOverviewPage>;
}

export function createProjectOverviewQueryService(
  deps: ProjectOverviewDeps,
): ProjectOverviewQueryService {
  return {
    async getProjectOverview(ctx, projectId) {
      // OwnershipError from the projects service PROPAGATES (not swallowed): a
      // cross-user / unknown project must 404, never render an empty page.
      const [core, assetStats, publishing] = await Promise.all([
        deps.projects.getProjectOverview(ctx, projectId),
        deps.assets.getProjectAssetStats(ctx, projectId),
        deps.publishing.getProjectPublishing(ctx, projectId),
      ]);

      const isEmpty =
        core.stages.length === 0 &&
        core.outputs.length === 0 &&
        core.activities.length === 0 &&
        publishing.length === 0;

      return {
        scenario: isEmpty ? "empty" : "default",
        kind: "project-overview",
        loading: false,
        error: null,
        projectId: core.projectId,
        projectTitle: core.projectTitle,
        stage: core.stage,
        progressPct: core.progressPct,
        stages: [...core.stages],
        assetStats: [...assetStats.assetStats],
        recentFiles: [...assetStats.recentFiles],
        activities: [...core.activities],
        projectInfo: [...core.projectInfo],
        outputs: [...core.outputs],
        publishing: [...publishing],
        milestones: [...core.milestones],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Global Search (takes over the Search module's interim composer — same grouping)
// ---------------------------------------------------------------------------

export interface SearchDocLike {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
}
export interface SearchHistoryLike {
  id: string;
  query: string;
  searchedAt: string;
}

export interface GlobalSearchDeps {
  search: {
    search(
      ctx: RequestContext,
      query: string,
      opts?: { entityType?: string; limit?: number },
    ): Promise<ReadonlyArray<SearchDocLike>>;
    /**
     * 全量分面计数(与 search() 同一 FTS 谓词、无 limit)。tab 计数的唯一真值
     * 来源 —— 不被 per-type top-N 截断,?type= 窄化时其它 tab 仍是真实命中数。
     */
    facets(
      ctx: RequestContext,
      query: string,
    ): Promise<{ entityType: ReadonlyArray<{ value: string; count: number }> }>;
    recordSearch(
      ctx: RequestContext,
      input: {
        query: string;
        filters: Record<string, unknown>;
        resultCount: number;
      },
    ): Promise<unknown>;
    listHistory(
      ctx: RequestContext,
      limit?: number,
    ): Promise<ReadonlyArray<SearchHistoryLike>>;
  };
}

export interface GlobalSearchQueryService {
  getGlobalSearch(
    ctx: RequestContext,
    q: string,
    type?: string,
  ): Promise<GlobalSearchPage>;
}

// The 4 locked result tabs (项目 / 知识 / 素材 / 视频), in the approved order.
const TAB_DEFS = [
  { id: "project", label: "项目", entityType: "project" },
  { id: "knowledge", label: "知识", entityType: "knowledge" },
  { id: "asset", label: "素材", entityType: "asset" },
  { id: "video", label: "视频", entityType: "video" },
] as const;

// [T-051 2d] 每个结果类型各取 top N。旧实现一次混查 limit-50 再分组,索引里
// artifact 等非 tab 类型的文档会挤占 50 条共享上限,导致有命中的项目/作品在
// 页面上显示 0 结果;分组查询后每类配额独立,挤占不复存在。
const PER_TYPE_LIMIT = 20;

// ?type= 分面白名单:只认 4 个 tab 的 entityType,非法值(如 artifact / 任意
// 字符串)按「未窄化」处理,而不是查出一个永远为空的页面。
function normalizeTypeFilter(type: string | undefined): string | undefined {
  return TAB_DEFS.some((t) => t.entityType === type) ? type : undefined;
}

const STATIC_FILTERS: GlobalSearchPage["filters"] = [
  { id: "f-type", label: "类型", options: ["项目", "知识", "素材", "视频"] },
  { id: "f-stage", label: "阶段", options: ["研究", "策划", "脚本", "拍摄", "发布", "复盘"] },
  { id: "f-tag", label: "标签", options: ["AI", "教程", "提示词", "Agent", "变现", "出海"] },
];
const STATIC_QUICK_ACTIONS: GlobalSearchPage["quickActions"] = [
  { id: "qa-new-project", label: "新建项目" },
  { id: "qa-knowledge", label: "查看知识库" },
  { id: "qa-assets", label: "上传素材" },
];
const STATIC_TIPS: GlobalSearchPage["tips"] = [
  "使用引号精确匹配: 'AI Browser'",
  "使用 - 排除关键词: 浏览器 -Chrome",
];

const PROJECT_STAGES = new Set<string>([
  "research", "planning", "script", "production", "publishing", "review",
]);
const ASSET_TYPES = new Set<string>(["image", "video", "audio", "document", "subtitle"]);
const PLATFORMS = new Set<string>([
  "youtube", "bilibili", "douyin", "xiaohongshu", "wechatVideo", "x",
]);

function parsePayload(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toProjectCard(doc: SearchDocLike): GlobalSearchPage["projects"][number] {
  const p = parsePayload(doc.body);
  const stage =
    typeof p.stage === "string" && PROJECT_STAGES.has(p.stage)
      ? (p.stage as ProjectStageName)
      : DEFAULT_STAGE;
  const progressPct = typeof p.progressPct === "number" ? p.progressPct : 0;
  const snippet = typeof p.snippet === "string" ? p.snippet : "";
  return { id: doc.entityId, title: doc.title, stage, progressPct, snippet };
}

function toKnowledgeCard(
  doc: SearchDocLike,
): GlobalSearchPage["knowledge"][number] {
  const p = parsePayload(doc.body);
  const excerpt = typeof p.excerpt === "string" ? p.excerpt : "";
  const tags = Array.isArray(p.tags)
    ? p.tags.filter((t): t is string => typeof t === "string")
    : [];
  return { id: doc.entityId, title: doc.title, excerpt, tags };
}

function toAssetCard(doc: SearchDocLike): GlobalSearchPage["assets"][number] {
  const p = parsePayload(doc.body);
  const assetType =
    typeof p.assetType === "string" && ASSET_TYPES.has(p.assetType)
      ? (p.assetType as GlobalSearchPage["assets"][number]["assetType"])
      : "document";
  return { id: doc.entityId, title: doc.title, assetType };
}

function toVideoCard(doc: SearchDocLike): GlobalSearchPage["videos"][number] {
  const p = parsePayload(doc.body);
  const platform =
    typeof p.platform === "string" && PLATFORMS.has(p.platform)
      ? (p.platform as GlobalSearchPage["videos"][number]["platform"])
      : "youtube";
  const durationLabel =
    typeof p.durationLabel === "string" ? p.durationLabel : "00:00";
  return { id: doc.entityId, title: doc.title, platform, durationLabel };
}

export function createGlobalSearchQueryService(
  deps: GlobalSearchDeps,
): GlobalSearchQueryService {
  return {
    async getGlobalSearch(ctx, q, type) {
      const rawQuery = typeof q === "string" ? q : "";
      const typeFilter = normalizeTypeFilter(
        typeof type === "string" && type ? type : undefined,
      );
      const hasQuery = rawQuery.trim() !== "";

      // [T-051 2d] 按 entityType 分组各查 top N(?type= 窄化时只查该类的卡片),
      // 与全量分面计数并行读。空查询短路:repo 对空串本来就返回 [],不发无谓查询。
      const tabsToFetch = typeFilter
        ? TAB_DEFS.filter((t) => t.entityType === typeFilter)
        : [...TAB_DEFS];
      let docsByType = new Map<string, ReadonlyArray<SearchDocLike>>();
      let facetEntityType: ReadonlyArray<{ value: string; count: number }> = [];
      if (hasQuery) {
        const [groups, facets] = await Promise.all([
          Promise.all(
            tabsToFetch.map(
              async (t) =>
                [
                  t.entityType,
                  await deps.search.search(ctx, rawQuery, {
                    entityType: t.entityType,
                    limit: PER_TYPE_LIMIT,
                  }),
                ] as const,
            ),
          ),
          deps.search.facets(ctx, rawQuery),
        ]);
        docsByType = new Map(groups);
        facetEntityType = facets.entityType;
      }

      // 防御性再过滤一次 entityType:分组正确性不依赖上游是否已按类型过滤。
      const docsOf = (et: string) =>
        (docsByType.get(et) ?? []).filter((d) => d.entityType === et);
      const projects = docsOf("project").map(toProjectCard);
      const knowledge = docsOf("knowledge").map(toKnowledgeCard);
      const assets = docsOf("asset").map(toAssetCard);
      const videos = docsOf("video").map(toVideoCard);

      // tab 计数 = 全量分面计数(artifact 等非 tab 类型的桶被忽略)。这让计数
      // 不受 PER_TYPE_LIMIT 截断,且窄化到某一类时其它 tab 仍显示真实命中数。
      const fullCount = new Map(
        facetEntityType.map((b) => [b.value, b.count] as const),
      );
      const resultTabs = TAB_DEFS.map((t) => ({
        id: t.id,
        label: t.label,
        count: fullCount.get(t.entityType) ?? 0,
      }));

      // History is written server-side as a post-commit side-effect of the read
      // (the Search spec-gap resolution — no invented mutation endpoint). Skip
      // empty queries; never let a history failure fail the page render.
      if (hasQuery) {
        // resultCount 记全量命中数(窄化时记该类的全量),与 tab 计数同源。
        const resultCount = typeFilter
          ? (fullCount.get(typeFilter) ?? 0)
          : TAB_DEFS.reduce(
              (acc, t) => acc + (fullCount.get(t.entityType) ?? 0),
              0,
            );
        await deps.search.recordSearch(ctx, {
          query: rawQuery,
          filters: typeFilter ? { type: typeFilter } : {},
          resultCount,
        });
      }

      const history = (await deps.search.listHistory(ctx, 10)).map((h) => ({
        id: h.id,
        query: h.query,
        searchedAt: h.searchedAt,
      }));

      return {
        scenario: hasQuery ? "default" : "empty",
        kind: "search",
        loading: false,
        error: null,
        query: rawQuery,
        resultTabs,
        projects,
        knowledge,
        assets,
        videos,
        filters: STATIC_FILTERS,
        quickActions: STATIC_QUICK_ACTIONS,
        history,
        tips: STATIC_TIPS,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Publishing Center (selector only — NO transport op; composed server-side)
// ---------------------------------------------------------------------------

export interface PublishingMetricsBundle {
  metrics: ReadonlyArray<MetricCard>;
  platformComparison: PublishingCenterPage["platformComparison"];
  trend: PublishingCenterPage["trend"];
  topContent: PublishingCenterPage["topContent"];
}

export interface PublishingCenterDeps {
  publishing: {
    listPublicationsForUser(
      ctx: RequestContext,
    ): Promise<PublishingCenterPage["rows"]>;
  };
  analytics: {
    getPublishingMetrics(
      ctx: RequestContext,
    ): Promise<PublishingMetricsBundle>;
  };
}

export interface PublishingCenterQueryService {
  getPublishingCenter(ctx: RequestContext): Promise<PublishingCenterPage>;
}

const PUBLISHING_CONTENT_TABS: PublishingCenterPage["contentTabs"] = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "image", label: "图文" },
  { id: "audio", label: "音频" },
];

export function createPublishingCenterQueryService(
  deps: PublishingCenterDeps,
): PublishingCenterQueryService {
  return {
    async getPublishingCenter(ctx) {
      const [rows, metricsBundle] = await Promise.all([
        deps.publishing.listPublicationsForUser(ctx),
        deps.analytics.getPublishingMetrics(ctx),
      ]);

      const isEmpty = rows.length === 0;

      return {
        scenario: isEmpty ? "empty" : "default",
        kind: "publishing-center",
        loading: false,
        error: null,
        contentTabs: PUBLISHING_CONTENT_TABS,
        rows: [...rows],
        metrics: [...metricsBundle.metrics],
        platformComparison: [...metricsBundle.platformComparison],
        trend: [...metricsBundle.trend],
        topContent: [...metricsBundle.topContent],
      };
    },
  };
}
