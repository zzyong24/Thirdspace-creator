import { describe, it, expect } from "vitest";
import { dashboardPage } from "../../src/pages/dashboard.js";
import { projectOverviewPage } from "../../src/pages/project-overview.js";
import { globalSearchPage } from "../../src/pages/global-search.js";
import { publishingCenterPage } from "../../src/pages/publishing-center.js";
import { pagesOperations } from "../../src/operations/pages.js";

// The frontend selectors live in a separate package and use `@/` path aliases
// + JSX-only type imports, so importing `buildDashboardViewModel()` into this
// node/NodeNext package is awkward. Per the task fallback, we instead assert the
// three page endpoints' method+path and parse a hand-built minimal dashboard
// object that matches the shape `buildDashboardViewModel()` produces.

describe("pages contract", () => {
  it("registers the three page composition endpoints with method + path", () => {
    expect(pagesOperations.getProjectOverview.method).toBe("GET");
    expect(pagesOperations.getProjectOverview.path).toBe(
      "/projects/:projectId/overview",
    );
    expect(pagesOperations.getDashboard.method).toBe("GET");
    expect(pagesOperations.getDashboard.path).toBe("/analytics/dashboard");
    expect(pagesOperations.getGlobalSearch.method).toBe("GET");
    expect(pagesOperations.getGlobalSearch.path).toBe("/search");
  });

  it("attaches non-empty FR placeholders to every page endpoint", () => {
    expect(pagesOperations.getProjectOverview.fr.length).toBeGreaterThan(0);
    expect(pagesOperations.getDashboard.fr.length).toBeGreaterThan(0);
    expect(pagesOperations.getGlobalSearch.fr.length).toBeGreaterThan(0);
  });

  it("does NOT register a publishing-center endpoint (composed client-side)", () => {
    const paths = Object.values(pagesOperations).map((e) => e.path);
    expect(paths).not.toContain("/publishing-center");
    // but the DTO is still exported for reuse
    expect(publishingCenterPage).toBeDefined();
  });

  it("parses a minimal dashboard page DTO matching the FE view model shape", () => {
    const dashboard = {
      scenario: "default",
      kind: "dashboard",
      loading: false,
      error: null,
      metrics: [
        {
          id: "m-active-projects",
          label: "进行中项目",
          value: "3",
          delta: "+1",
          trend: "up",
          tone: "positive",
        },
      ],
      continueCreating: {
        heading: "继续创作",
        projectId: "project-ainativebrowser",
        projectTitle: "AI Native Browser 深度解析",
        stage: "script",
        progressPct: 58,
        updatedAt: "2026-06-13T02:00:00.000Z",
      },
      todos: [
        {
          id: "task-1",
          title: "撰写开场脚本",
          projectId: "project-ainativebrowser",
          projectTitle: "AI Native Browser 深度解析",
          stage: "script",
          dueAt: null,
          priority: 1,
          status: "todo",
        },
      ],
      trendingTopics: [
        { id: "topic-1", title: "AI Native Browser 深度解析", heat: 92, trend: "up" },
      ],
      recentPublications: [
        {
          id: "pub-1",
          title: "首发视频",
          platform: "youtube",
          status: "published",
          views: 18400,
          engagement: 1200,
          publishedAt: "2026-06-10T02:00:00.000Z",
        },
      ],
      dataOverview: {
        metrics: [],
        trend: [{ label: "周一", value: 1840 }],
      },
      suggestions: [
        {
          id: "sg-1",
          title: "把研究阶段结论补充到脚本",
          description: "研究产物尚未被脚本引用。",
          category: "script",
        },
      ],
      assistantPrompt: "今天想先做点什么？",
    };

    const parsed = dashboardPage.parse(dashboard);
    expect(parsed.kind).toBe("dashboard");
    expect(parsed.metrics[0].tone).toBe("positive");
    expect(parsed.continueCreating.stage).toBe("script");
  });

  it("rejects an unknown publication status in the dashboard DTO", () => {
    expect(() =>
      dashboardPage.parse({
        scenario: "default",
        kind: "dashboard",
        loading: false,
        error: null,
        metrics: [],
        continueCreating: {
          heading: "继续创作",
          projectId: "p",
          projectTitle: "t",
          stage: "script",
          progressPct: 0,
          updatedAt: "2026-06-13T02:00:00.000Z",
        },
        todos: [],
        trendingTopics: [],
        recentPublications: [
          {
            id: "pub-1",
            title: "x",
            platform: "youtube",
            status: "live", // not a PublicationStatus member
            views: 0,
            engagement: 0,
            publishedAt: "2026-06-10T02:00:00.000Z",
          },
        ],
        dataOverview: { metrics: [], trend: [] },
        suggestions: [],
        assistantPrompt: "",
      }),
    ).toThrow();
  });

  it("parses a minimal project-overview page DTO", () => {
    const parsed = projectOverviewPage.parse({
      scenario: "default",
      kind: "project-overview",
      loading: false,
      error: null,
      projectId: "project-ainativebrowser",
      projectTitle: "AI Native Browser 深度解析",
      stage: "script",
      progressPct: 58,
      stages: [{ stage: "research", status: "completed", progressPct: 100 }],
      assetStats: [],
      recentFiles: [
        {
          id: "f-1",
          name: "脚本 v1",
          type: "doc",
          fileKind: "script",
          updatedAt: "2026-06-13T02:00:00.000Z",
        },
      ],
      activities: [
        {
          id: "a-1",
          title: "创建项目",
          occurredAt: "2026-06-13T02:00:00.000Z",
          tone: "info",
          eventType: "project.created",
        },
      ],
      projectInfo: [{ label: "类型", value: "视频" }],
      outputs: [
        { id: "o-1", title: "主视频", contentType: "video", status: "drafting" },
      ],
      publishing: [
        {
          id: "pb-1",
          platform: "bilibili",
          status: "draft",
          publishedAt: null,
        },
      ],
      milestones: [
        {
          id: "ms-1",
          title: "发布",
          targetAt: "2026-07-01T02:00:00.000Z",
          status: "pending",
        },
      ],
    });
    expect(parsed.kind).toBe("project-overview");
    expect(parsed.outputs[0].contentType).toBe("video");
  });

  it("parses a minimal global-search page DTO with grouped results", () => {
    const parsed = globalSearchPage.parse({
      scenario: "default",
      kind: "search",
      loading: false,
      error: null,
      query: "browser",
      resultTabs: [{ id: "project", label: "项目", count: 12 }],
      projects: [
        {
          id: "project-ainativebrowser",
          title: "AI Native Browser 深度解析",
          stage: "script",
          progressPct: 58,
          snippet: "全面解析",
        },
      ],
      knowledge: [{ id: "k-1", title: "笔记", excerpt: "摘要", tags: ["ai"] }],
      assets: [{ id: "as-1", title: "封面图", assetType: "image" }],
      videos: [
        { id: "v-1", title: "首发", platform: "youtube", durationLabel: "12:30" },
      ],
      filters: [{ id: "f-type", label: "类型", options: ["项目", "知识"] }],
      quickActions: [{ id: "qa-1", label: "新建项目" }],
      history: [
        { id: "h-1", query: "browser", searchedAt: "2026-06-13T02:00:00.000Z" },
      ],
      tips: ["使用引号精确匹配"],
    });
    expect(parsed.kind).toBe("search");
    expect(parsed.assets[0].assetType).toBe("image");
    expect(parsed.projects).toHaveLength(1);
  });

  it("parses a minimal publishing-center page DTO (reuse, no endpoint)", () => {
    const parsed = publishingCenterPage.parse({
      scenario: "default",
      kind: "publishing-center",
      loading: false,
      error: null,
      contentTabs: [{ id: "all", label: "全部" }],
      rows: [
        {
          id: "pb-1",
          title: "首发视频",
          projectId: "project-ainativebrowser",
          projectTitle: "AI Native Browser 深度解析",
          platform: "youtube",
          publishedAt: "2026-06-10T02:00:00.000Z",
          status: "published",
          views: 18400,
          engagement: 1200,
        },
      ],
      metrics: [],
      platformComparison: [{ platform: "youtube", value: 18400 }],
      trend: [{ label: "周一", value: 1840 }],
      topContent: [{ id: "tc-1", title: "首发视频", value: "1.84w" }],
    });
    expect(parsed.kind).toBe("publishing-center");
    expect(parsed.rows[0].platform).toBe("youtube");
  });
});
