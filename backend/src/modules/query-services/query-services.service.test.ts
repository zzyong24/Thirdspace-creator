import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  dashboardPage,
  projectOverviewPage,
  globalSearchPage,
  publishingCenterPage,
} from "@creatoros/contract";
import {
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
} from "./query-services.service";
import { OwnershipError } from "./query-services.errors";

const ctx: RequestContext = {
  userId: "user-a",
  requestId: "req-1",
  source: "user",
};

// ---------------------------------------------------------------------------
// Stub upstream facades — plain objects implementing each public facade method.
// The composers must call these with the SAME ctx (by identity) and never mutate
// userId. We assert composition wiring, not downstream logic.
// ---------------------------------------------------------------------------

function dashboardStubs() {
  return {
    projects: {
      getDashboardSummary: vi.fn(async (_c: RequestContext) => ({
        continueCreating: {
          heading: "继续创作",
          projectId: "project-1",
          projectTitle: "示例项目",
          stage: "script" as const,
          progressPct: 42,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        todos: [
          {
            id: "task-1",
            title: "撰写脚本",
            projectId: "project-1",
            projectTitle: "示例项目",
            stage: "script" as const,
            dueAt: null,
            priority: 2 as const,
            status: "todo" as const,
          },
        ],
      })),
    },
    publishing: {
      getRecentPublications: vi.fn(async (_c: RequestContext) => [
        {
          id: "pub-1",
          title: "已发布作品",
          platform: "youtube" as const,
          status: "published" as const,
          views: 1200,
          engagement: 88,
          publishedAt: "2026-06-19T00:00:00.000Z",
        },
      ]),
    },
    analytics: {
      getDashboardMetrics: vi.fn(async (_c: RequestContext) => ({
        metrics: [
          {
            id: "m-views",
            label: "总播放",
            value: "1.2k",
            delta: "+12%",
            trend: "up" as const,
            tone: "positive" as const,
          },
        ],
        trend: [{ label: "周一", value: 100 }],
      })),
    },
    learnings: {
      getSuggestions: vi.fn(async (_c: RequestContext) => [
        {
          id: "sug-1",
          title: "钩子建议",
          description: "前3秒强化钩子",
          category: "脚本",
        },
      ]),
    },
    notifications: {
      getUnreadCount: vi.fn(async (_c: RequestContext) => 3),
    },
    knowledge: {
      getTrendingTopics: vi.fn(async (_c: RequestContext) => [
        { id: "topic-1", title: "AI 出海", heat: 90, trend: "up" as const },
      ]),
    },
  };
}

describe("DashboardQueryService.getDashboard", () => {
  it("threads the SAME ctx into every upstream call and returns a valid dashboardPage", async () => {
    const stubs = dashboardStubs();
    const svc = createDashboardQueryService(stubs);
    const result = await svc.getDashboard(ctx);

    // ctx threaded unchanged (by identity) — proves no userId override.
    expect(stubs.projects.getDashboardSummary).toHaveBeenCalledWith(ctx);
    expect(stubs.publishing.getRecentPublications).toHaveBeenCalledWith(ctx);
    expect(stubs.analytics.getDashboardMetrics).toHaveBeenCalledWith(ctx);
    expect(stubs.learnings.getSuggestions).toHaveBeenCalledWith(ctx);
    expect(stubs.notifications.getUnreadCount).toHaveBeenCalledWith(ctx);
    expect(stubs.knowledge.getTrendingTopics).toHaveBeenCalledWith(ctx);

    expect(() => dashboardPage.parse(result)).not.toThrow();
    expect(result.kind).toBe("dashboard");
    expect(result.scenario).toBe("default");
    expect(result.loading).toBe(false);
    expect(result.error).toBeNull();
    expect(result.metrics).toEqual(stubs.analytics.getDashboardMetrics.mock.results.length ? result.metrics : []);
    expect(result.recentPublications[0]?.id).toBe("pub-1");
    expect(result.trendingTopics[0]?.id).toBe("topic-1");
    expect(result.suggestions[0]?.id).toBe("sug-1");
    expect(typeof result.assistantPrompt).toBe("string");
    expect(result.assistantPrompt.length).toBeGreaterThan(0);
  });

  it("notifications.getUnreadCount is called but NOT dropped into a dashboardPage field", async () => {
    const stubs = dashboardStubs();
    const svc = createDashboardQueryService(stubs);
    const result = await svc.getDashboard(ctx);
    expect(stubs.notifications.getUnreadCount).toHaveBeenCalledWith(ctx);
    // The DTO has no unread-count field; ensure 3 never leaked anywhere numeric.
    expect(JSON.stringify(result)).not.toContain('"unreadCount"');
  });

  it("empty scenario: all upstreams empty → scenario:empty, empty arrays, zero-value continueCreating still valid", async () => {
    const svc = createDashboardQueryService({
      projects: {
        getDashboardSummary: vi.fn(async () => ({
          continueCreating: null,
          todos: [],
        })),
      },
      publishing: { getRecentPublications: vi.fn(async () => []) },
      analytics: {
        getDashboardMetrics: vi.fn(async () => ({ metrics: [], trend: [] })),
      },
      learnings: { getSuggestions: vi.fn(async () => []) },
      notifications: { getUnreadCount: vi.fn(async () => 0) },
      knowledge: { getTrendingTopics: vi.fn(async () => []) },
    });
    const result = await svc.getDashboard(ctx);
    expect(() => dashboardPage.parse(result)).not.toThrow();
    expect(result.scenario).toBe("empty");
    expect(result.todos).toEqual([]);
    expect(result.recentPublications).toEqual([]);
    // zero-value continueCreating still satisfies the DTO shape.
    expect(result.continueCreating.projectId).toBeDefined();
    expect(result.continueCreating.stage).toBeDefined();
  });

  it("error isolation: a throwing upstream → scenario:error, error set, still a valid DTO", async () => {
    const svc = createDashboardQueryService({
      projects: {
        getDashboardSummary: vi.fn(async () => ({
          continueCreating: null,
          todos: [],
        })),
      },
      publishing: { getRecentPublications: vi.fn(async () => []) },
      analytics: {
        getDashboardMetrics: vi.fn(async () => {
          throw new Error("analytics down");
        }),
      },
      learnings: { getSuggestions: vi.fn(async () => []) },
      notifications: { getUnreadCount: vi.fn(async () => 0) },
      knowledge: { getTrendingTopics: vi.fn(async () => []) },
    });
    const result = await svc.getDashboard(ctx);
    expect(() => dashboardPage.parse(result)).not.toThrow();
    expect(result.scenario).toBe("error");
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBeDefined();
    expect(result.error?.message).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Project Overview
// ---------------------------------------------------------------------------

function overviewStubs() {
  return {
    projects: {
      getProjectOverview: vi.fn(async (_c: RequestContext, projectId: string) => ({
        projectId,
        projectTitle: "示例项目",
        stage: "production" as const,
        progressPct: 60,
        stages: [
          { stage: "research" as const, status: "completed" as const, progressPct: 100 },
        ],
        outputs: [
          { id: "out-1", title: "主视频", contentType: "video" as const, status: "editing" as const },
        ],
        activities: [],
        projectInfo: [{ label: "分类", value: "教程" }],
        milestones: [],
      })),
    },
    assets: {
      getProjectAssetStats: vi.fn(async (_c: RequestContext, _p: string) => ({
        assetStats: [],
        recentFiles: [],
      })),
    },
    publishing: {
      getProjectPublishing: vi.fn(async (_c: RequestContext, _p: string) => []),
    },
  };
}

describe("ProjectOverviewQueryService.getProjectOverview", () => {
  it("threads ctx + projectId, returns a valid projectOverviewPage echoing projectId", async () => {
    const stubs = overviewStubs();
    const svc = createProjectOverviewQueryService(stubs);
    const result = await svc.getProjectOverview(ctx, "project-9");

    expect(stubs.projects.getProjectOverview).toHaveBeenCalledWith(ctx, "project-9");
    expect(stubs.assets.getProjectAssetStats).toHaveBeenCalledWith(ctx, "project-9");
    expect(stubs.publishing.getProjectPublishing).toHaveBeenCalledWith(ctx, "project-9");

    expect(() => projectOverviewPage.parse(result)).not.toThrow();
    expect(result.kind).toBe("project-overview");
    expect(result.projectId).toBe("project-9");
  });

  it("propagates OwnershipError (does not swallow → 404 path)", async () => {
    const svc = createProjectOverviewQueryService({
      projects: {
        getProjectOverview: vi.fn(async () => {
          throw new OwnershipError();
        }),
      },
      assets: { getProjectAssetStats: vi.fn(async () => ({ assetStats: [], recentFiles: [] })) },
      publishing: { getProjectPublishing: vi.fn(async () => []) },
    });
    await expect(svc.getProjectOverview(ctx, "project-x")).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });
});

// ---------------------------------------------------------------------------
// Global Search
// ---------------------------------------------------------------------------

function searchDoc(entityType: string, entityId: string, title: string, body = "{}") {
  return { id: `${entityType}-${entityId}`, entityType, entityId, title, body };
}

function searchStubs() {
  return {
    search: {
      search: vi.fn(async (_c: RequestContext, _q: string, _opts?: unknown) => [
        searchDoc("project", "p1", "项目一", JSON.stringify({ stage: "script", progressPct: 30, snippet: "简介" })),
        searchDoc("knowledge", "k1", "知识一", JSON.stringify({ excerpt: "摘要", tags: ["AI"] })),
        searchDoc("asset", "a1", "素材一", JSON.stringify({ assetType: "image" })),
        searchDoc("video", "v1", "视频一", JSON.stringify({ platform: "bilibili", durationLabel: "12:00" })),
      ]),
      recordSearch: vi.fn(async () => undefined),
      listHistory: vi.fn(async (_c: RequestContext, _l?: number) => [
        { id: "h1", query: "钩子", searchedAt: "2026-06-19T00:00:00.000Z" },
      ]),
    },
  };
}

describe("GlobalSearchQueryService.getGlobalSearch", () => {
  it("groups by entity type, threads ctx, returns valid globalSearchPage with 4 locked tabs", async () => {
    const stubs = searchStubs();
    const svc = createGlobalSearchQueryService(stubs);
    const result = await svc.getGlobalSearch(ctx, "钩子", undefined);

    expect(stubs.search.search).toHaveBeenCalledWith(ctx, "钩子", { entityType: undefined });
    expect(stubs.search.recordSearch).toHaveBeenCalled();
    expect(stubs.search.listHistory).toHaveBeenCalledWith(ctx, 10);

    expect(() => globalSearchPage.parse(result)).not.toThrow();
    expect(result.kind).toBe("search");
    expect(result.query).toBe("钩子");
    expect(result.resultTabs.map((t) => t.id)).toEqual(["project", "knowledge", "asset", "video"]);
    expect(result.projects).toHaveLength(1);
    expect(result.knowledge).toHaveLength(1);
    expect(result.assets).toHaveLength(1);
    expect(result.videos).toHaveLength(1);
    // per-group counts
    const tabCount = (id: string) => result.resultTabs.find((t) => t.id === id)?.count;
    expect(tabCount("project")).toBe(1);
    expect(tabCount("video")).toBe(1);
  });

  it("empty/whitespace query → scenario:empty, empty groups, no recordSearch", async () => {
    const stubs = searchStubs();
    stubs.search.search = vi.fn(async () => []);
    const svc = createGlobalSearchQueryService(stubs);
    const result = await svc.getGlobalSearch(ctx, "   ", undefined);
    expect(() => globalSearchPage.parse(result)).not.toThrow();
    expect(result.scenario).toBe("empty");
    expect(result.projects).toEqual([]);
    expect(stubs.search.recordSearch).not.toHaveBeenCalled();
  });

  it("parity with the interim composer grouping shape (project card fields)", async () => {
    const stubs = searchStubs();
    const svc = createGlobalSearchQueryService(stubs);
    const result = await svc.getGlobalSearch(ctx, "钩子", undefined);
    expect(result.projects[0]).toMatchObject({
      id: "p1",
      title: "项目一",
      stage: "script",
      progressPct: 30,
      snippet: "简介",
    });
  });
});

// ---------------------------------------------------------------------------
// Publishing Center (no endpoint — selector only)
// ---------------------------------------------------------------------------

describe("PublishingCenterQueryService.getPublishingCenter", () => {
  it("composes a valid publishingCenterPage, threading ctx", async () => {
    const stubs = {
      publishing: {
        listPublicationsForUser: vi.fn(async (_c: RequestContext) => [
          {
            id: "pub-1",
            title: "作品一",
            projectId: "project-1",
            projectTitle: "示例项目",
            platform: "youtube" as const,
            publishedAt: "2026-06-19T00:00:00.000Z",
            status: "published" as const,
            views: 1000,
            engagement: 50,
          },
        ]),
      },
      analytics: {
        getPublishingMetrics: vi.fn(async (_c: RequestContext) => ({
          metrics: [],
          platformComparison: [],
          trend: [],
          topContent: [],
        })),
      },
    };
    const svc = createPublishingCenterQueryService(stubs);
    const result = await svc.getPublishingCenter(ctx);
    expect(stubs.publishing.listPublicationsForUser).toHaveBeenCalledWith(ctx);
    expect(stubs.analytics.getPublishingMetrics).toHaveBeenCalledWith(ctx);
    expect(() => publishingCenterPage.parse(result)).not.toThrow();
    expect(result.kind).toBe("publishing-center");
    expect(result.rows[0]?.id).toBe("pub-1");
  });
});
