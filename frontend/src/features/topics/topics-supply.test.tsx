import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-235e] 选题中心「被服务感知」测试(SPEC daily-topic-autopilot §2.5,三决策):
//   ① 今日新选题条带:createdAt≥dayStartIso 过滤、来源徽标(🔥跟拍|/实验|前缀 + source 枚举)、
//     一句依据、空态诚实「今晨采集无新信号」。
//   ② 供给链健康条:lastRun 缺失 → 「—」诚实降级;有实绩 → ✓HH:mm;计数派生纯函数。
//   ③ 统一「信号源」弹窗三 tab 切换 + 网页信源登记 wiring(trend.sources.create → refresh)。
//   ④ 候选卡「实验」徽标(card.attributionId)点开显示 angle 里的归因引用。
// 全部固定 VM(deterministic:渲染无 Date.now —— dayStartIso 由测试显式传入)。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createTrendSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  toggleTrendSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  removeTrendSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  // [T-235c] 指定收藏夹登记 CRUD(信号源弹窗 tab4)。
  createFavoritesFolder: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  toggleFavoritesFolder: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  removeFavoritesFolder: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  listScheduledJobs: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  runScheduledJobNow: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({})),
  patchCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  promoteCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve({})),
  createBenchmarkSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  toggleBenchmarkSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  removeBenchmarkSource: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createTrendSource: (i: unknown) => mockClient.createTrendSource(i),
    toggleTrendSource: (i: unknown) => mockClient.toggleTrendSource(i),
    removeTrendSource: (i: unknown) => mockClient.removeTrendSource(i),
    createFavoritesFolder: (i: unknown) => mockClient.createFavoritesFolder(i),
    toggleFavoritesFolder: (i: unknown) => mockClient.toggleFavoritesFolder(i),
    removeFavoritesFolder: (i: unknown) => mockClient.removeFavoritesFolder(i),
    listScheduledJobs: (i: unknown) => mockClient.listScheduledJobs(i),
    runScheduledJobNow: (i: unknown) => mockClient.runScheduledJobNow(i),
    patchCandidate: (i: unknown) => mockClient.patchCandidate(i),
    promoteCandidate: (i: unknown) => mockClient.promoteCandidate(i),
    createBenchmarkSource: (i: unknown) => mockClient.createBenchmarkSource(i),
    toggleBenchmarkSource: (i: unknown) => mockClient.toggleBenchmarkSource(i),
    removeBenchmarkSource: (i: unknown) => mockClient.removeBenchmarkSource(i),
  },
}));

import {
  TodayTopicsStrip,
  SupplyHealthStrip,
  SignalSourcesButton,
  parseSupplyBadge,
  filterTodayCandidates,
  deriveSupplySegments,
} from "./topics-supply-region";
import { CandidateCard } from "./topics-interactive-region";
import type { CandidateResource } from "@creatoros/backend/modules/candidate";
import type { TrendSourceResource } from "@creatoros/backend/modules/trend-sources";
import type { FavoritesFolderResource } from "@creatoros/backend/modules/favorites";

// 固定「今天」:本地 2026-07-11 零点(dayStartIso 由服务端算好传入,测试显式构造)。
const DAY_START = new Date(2026, 6, 11, 0, 0, 0, 0);
const DAY_START_ISO = DAY_START.toISOString();
const TODAY_ISO = new Date(2026, 6, 11, 9, 45).toISOString();
const YESTERDAY_ISO = new Date(2026, 6, 10, 21, 0).toISOString();

function candidate(over: Partial<CandidateResource> = {}): CandidateResource {
  return {
    id: "cand-1",
    userId: "user-a",
    title: "选题标题",
    angle: "切入角度",
    source: "idea",
    contentRole: null,
    productAnchorId: null,
    positioningFit: 80,
    predictedScore: 70,
    demandCount: 2,
    status: "pool",
    aiTaskId: null,
    card: {
      contentStructure: [],
      audiencePainScore: null,
      materialScore: null,
      productionDifficulty: null,
    },
    createdAt: TODAY_ISO,
    updatedAt: TODAY_ISO,
    ...over,
  };
}

// [T-235c] 指定收藏夹登记 fixture(信号源弹窗 tab4)。
function favoritesFolder(
  over: Partial<FavoritesFolderResource> = {},
): FavoritesFolderResource {
  return {
    id: "ff-1",
    userId: "user-a",
    accountId: null,
    name: "选题库",
    collectsId: null,
    note: null,
    enabled: true,
    lastSyncedAt: null,
    createdAt: TODAY_ISO,
    updatedAt: TODAY_ISO,
    ...over,
  };
}

function trendSource(
  over: Partial<TrendSourceResource> = {},
): TrendSourceResource {
  return {
    id: "ts-1",
    userId: "user-a",
    accountId: null,
    name: "某垂类热榜",
    url: "https://example.com/hot",
    sourceType: "web",
    domain: "example.com",
    note: null,
    enabled: true,
    createdAt: TODAY_ISO,
    updatedAt: TODAY_ISO,
    ...over,
  };
}

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  for (const fn of Object.values(mockClient)) fn.mockClear();
});
afterEach(() => cleanup());

// ── ① 今日新选题条带 ────────────────────────────────────────────────────────────────
describe("[T-235e] 今日新选题条带", () => {
  it("只收 createdAt≥今日零点的候选;徽标解析 title 前缀(🔥跟拍|/实验|)与 source 枚举", () => {
    render(
      <TodayTopicsStrip
        dayStartIso={DAY_START_ISO}
        candidates={[
          candidate({
            id: "c-darkhorse",
            title: "🔥跟拍|低粉黑马选题",
            source: "benchmark",
            angle: "赞粉比 2.3,窗口未关",
          }),
          candidate({
            id: "c-exp",
            title: "实验|换悬念 Hook 再试",
            source: "trend",
            card: {
              contentStructure: [],
              audiencePainScore: null,
              materialScore: null,
              productionDifficulty: null,
              attributionId: "attr-1",
            },
          }),
          candidate({ id: "c-trend", source: "trend", title: "常规热点题" }),
          candidate({
            id: "c-old",
            title: "昨天的旧候选",
            createdAt: YESTERDAY_ISO,
          }),
        ]}
      />,
    );
    const cards = screen.getAllByTestId("today-topic-card");
    expect(cards).toHaveLength(3); // 昨天的不进条带
    const strip = screen.getByTestId("today-topics-strip");
    expect(within(strip).getByText("🔥跟拍·时效")).toBeInTheDocument();
    expect(within(strip).getByText("实验")).toBeInTheDocument();
    expect(within(strip).getByText("热点")).toBeInTheDocument();
    // 展示标题剥掉前缀(data 层不动)。
    expect(within(strip).getByText("低粉黑马选题")).toBeInTheDocument();
    expect(within(strip).getByText("换悬念 Hook 再试")).toBeInTheDocument();
    // 一句依据 = card.oneLiner / angle。
    expect(
      within(strip).getByText("赞粉比 2.3,窗口未关"),
    ).toBeInTheDocument();
    expect(screen.queryByText("昨天的旧候选")).toBeNull();
  });

  it("[T-279] 点今日新选题卡 → 派 TOPIC_FOCUS 信号(带 candidateId)+ 键盘 Enter 同效", async () => {
    const seen: string[] = [];
    const listener = (e: Event): void => {
      seen.push((e as CustomEvent<{ candidateId: string }>).detail.candidateId);
    };
    window.addEventListener("creatoros:topic-focus", listener);
    render(
      <TodayTopicsStrip
        dayStartIso={DAY_START_ISO}
        candidates={[candidate({ id: "c-click", title: "可点的今日候选" })]}
      />,
    );
    const card = screen.getByTestId("today-topic-card");
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(seen).toEqual(["c-click", "c-click"]);
    window.removeEventListener("creatoros:topic-focus", listener);
  });

  it("空态诚实:今日无新候选 → 「今晨采集无新信号」", () => {
    render(
      <TodayTopicsStrip
        dayStartIso={DAY_START_ISO}
        candidates={[candidate({ createdAt: YESTERDAY_ISO })]}
      />,
    );
    expect(screen.getByTestId("today-topics-empty")).toHaveTextContent(
      "今晨采集无新信号",
    );
  });

  it("filterTodayCandidates:dayStartIso 缺失/非法 → 空(不猜「今天」)", () => {
    expect(filterTodayCandidates([candidate()], undefined)).toHaveLength(0);
    expect(filterTodayCandidates([candidate()], "not-a-date")).toHaveLength(0);
  });

  it("parseSupplyBadge:attributionId 无前缀也算实验;未知 source 原样透出", () => {
    expect(
      parseSupplyBadge(
        candidate({
          card: {
            contentStructure: [],
            audiencePainScore: null,
            materialScore: null,
            productionDifficulty: null,
            attributionId: "attr-9",
          },
        }),
      ),
    ).toMatchObject({ badge: "实验", tone: "experiment", title: "选题标题" });
    expect(parseSupplyBadge(candidate({ source: "demand" })).badge).toBe("需求");
    // [T-235c] 收藏夹跟拍候选徽标 = 「收藏」(STRIP_SOURCE_LABELS favorites 投影)。
    expect(parseSupplyBadge(candidate({ source: "favorites" })).badge).toBe(
      "收藏",
    );
  });
});

// ── ② 供给链健康条 ─────────────────────────────────────────────────────────────────
describe("[T-235e] 供给链健康条", () => {
  it("数据读不到 → 时间/今日计数环节显「—」诚实降级;整条链到 /automations", () => {
    render(
      <SupplyHealthStrip
        health={undefined}
        candidates={[candidate()]}
        dayStartIso={undefined}
      />,
    );
    const strip = screen.getByTestId("supply-health-strip");
    expect(strip).toHaveAttribute("href", "/automations");
    const segs = screen.getAllByTestId("supply-health-segment");
    expect(segs).toHaveLength(5);
    // 对标采集 / 拆解 / 黑马 / 出题 都拿不到 → 「—」;待审 = pool 总数(候选自身可数)。
    const byKey = (k: string) =>
      segs.find((s) => s.getAttribute("data-segment") === k)!;
    expect(byKey("collect")).toHaveTextContent("—");
    expect(byKey("teardown")).toHaveTextContent("—");
    expect(byKey("darkhorse")).toHaveTextContent("—");
    expect(byKey("generate")).toHaveTextContent("—");
    expect(byKey("review")).toHaveTextContent("1");
  });

  it("有调度实绩 → ✓HH:mm;计数从今日候选派生(拆解=benchmark、黑马=🔥跟拍|前缀)", () => {
    const segs = deriveSupplySegments({
      health: {
        benchmarkLastRunAt: new Date(2026, 6, 11, 9, 30).toISOString(),
        topicDailyLastRunAt: new Date(2026, 6, 11, 9, 40).toISOString(),
      },
      dayStartIso: DAY_START_ISO,
      candidates: [
        candidate({ id: "a", source: "benchmark", title: "🔥跟拍|黑马题" }),
        candidate({ id: "b", source: "benchmark", title: "普通拆解题" }),
        candidate({ id: "c", source: "trend", title: "热点题" }),
        candidate({
          id: "d",
          source: "idea",
          title: "旧题",
          createdAt: YESTERDAY_ISO,
          status: "promoted",
        }),
      ],
    });
    const byKey = (k: string) => segs.find((s) => s.key === k)!;
    expect(byKey("collect").value).toBe("✓09:30");
    expect(byKey("teardown").value).toBe("2");
    expect(byKey("darkhorse").value).toBe("⚡1");
    expect(byKey("generate").value).toBe("✓09:40·3");
    expect(byKey("review").value).toBe("3"); // pool 态总数(promoted 不算待审)
  });
});

// ── ③ 统一「信号源」弹窗三 tab ───────────────────────────────────────────────────────
describe("[T-235e] 信号源弹窗", () => {
  it("三 tab 切换:网页信源 → 对标博主 → 黑马关键词", async () => {
    const user = userEvent.setup();
    render(
      <SignalSourcesButton
        benchmarkSources={[]}
        trendSources={[trendSource()]}
        darkhorseKeywords={["AI 工程", "副业"]}
      />,
    );
    await user.click(screen.getByTestId("signal-sources-trigger"));
    // 默认 tab = 网页信源:表单 + 已登记行 + 需登录提示。
    expect(screen.getByTestId("trend-source-form")).toBeInTheDocument();
    expect(screen.getByTestId("trend-source-row")).toBeInTheDocument();
    expect(screen.getByTestId("trend-source-login-hint")).toHaveTextContent(
      "网站登录保管库",
    );
    // 切到对标博主 tab:登记表单 + 立即采集(T-222 行为整体迁入)。
    await user.click(screen.getByTestId("signal-tab-benchmark"));
    expect(screen.getByTestId("benchmark-source-form")).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-collect-now")).toBeInTheDocument();
    // 切到黑马关键词 tab:定位 keywords chips + env 提示(展示型 v1,不可编辑)。
    await user.click(screen.getByTestId("signal-tab-darkhorse"));
    const chips = screen.getByTestId("darkhorse-keywords-chips");
    expect(within(chips).getByText("AI 工程")).toBeInTheDocument();
    expect(screen.getByText(/CREATOROS_DARKHORSE_KEYWORDS/)).toBeInTheDocument();
  });

  it("网页信源登记 → client.createTrendSource(url 必填,sourceType 交服务端派生)→ refresh", async () => {
    const user = userEvent.setup();
    render(<SignalSourcesButton benchmarkSources={[]} trendSources={[]} />);
    await user.click(screen.getByTestId("signal-sources-trigger"));
    fireEvent.change(screen.getByLabelText("信源 URL"), {
      target: { value: "https://news.ycombinator.com/rss" },
    });
    fireEvent.submit(screen.getByTestId("trend-source-form"));
    await waitFor(() =>
      expect(mockClient.createTrendSource).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createTrendSource.mock.calls[0]![0] as {
      body: { url: string; sourceType?: string };
    };
    expect(arg.body.url).toBe("https://news.ycombinator.com/rss");
    expect(arg.body.sourceType).toBeUndefined();
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  // ── [T-235c] tab4:指定收藏夹 ──────────────────────────────────────────────────
  it("收藏夹 tab:引导文案 + 登记行(collectsId 匹配态徽标)+ 空态诚实", async () => {
    const user = userEvent.setup();
    render(
      <SignalSourcesButton
        benchmarkSources={[]}
        trendSources={[]}
        favoritesFolders={[
          favoritesFolder({ id: "ff-1", name: "选题库" }), // 未匹配 → 待首采匹配
          favoritesFolder({
            id: "ff-2",
            name: "对标爆款",
            collectsId: "7372169017362909234", // 已按名匹配回填 → 已对上
          }),
        ]}
      />,
    );
    await user.click(screen.getByTestId("signal-sources-trigger"));
    await user.click(screen.getByTestId("signal-tab-favorites"));
    // 引导文案:只采登记的指定夹,不碰其他收藏(隐私红线登记页就说清)。
    expect(screen.getByTestId("favorites-folder-guide")).toHaveTextContent(
      "只采集这里登记的指定夹",
    );
    const rows = screen.getAllByTestId("favorites-folder-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("待首采匹配");
    expect(rows[1]).toHaveTextContent("已对上");
  });

  it("收藏夹登记 → client.createFavoritesFolder(夹名必填)→ refresh;空态提示", async () => {
    const user = userEvent.setup();
    render(
      <SignalSourcesButton
        benchmarkSources={[]}
        trendSources={[]}
        favoritesFolders={[]}
        defaultTab="favorites"
      />,
    );
    await user.click(screen.getByTestId("signal-sources-trigger"));
    expect(screen.getByTestId("favorites-folder-empty")).toHaveTextContent(
      "还没有登记收藏夹",
    );
    fireEvent.change(screen.getByLabelText("收藏夹名"), {
      target: { value: "选题库" },
    });
    fireEvent.submit(screen.getByTestId("favorites-folder-form"));
    await waitFor(() =>
      expect(mockClient.createFavoritesFolder).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createFavoritesFolder.mock.calls[0]![0] as {
      body: { name: string };
    };
    expect(arg.body.name).toBe("选题库");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("收藏夹行停用/删除 → toggle/remove op(enabled 取反,folderId 透传)", async () => {
    const user = userEvent.setup();
    render(
      <SignalSourcesButton
        benchmarkSources={[]}
        trendSources={[]}
        favoritesFolders={[favoritesFolder({ id: "ff-1" })]}
        defaultTab="favorites"
      />,
    );
    await user.click(screen.getByTestId("signal-sources-trigger"));
    await user.click(screen.getByRole("button", { name: "停用" }));
    await waitFor(() =>
      expect(mockClient.toggleFavoritesFolder).toHaveBeenCalledTimes(1),
    );
    const toggleArg = mockClient.toggleFavoritesFolder.mock.calls[0]![0] as {
      params: { folderId: string };
      body: { enabled: boolean };
    };
    expect(toggleArg.params.folderId).toBe("ff-1");
    expect(toggleArg.body.enabled).toBe(false);
    await user.click(screen.getByLabelText("删除收藏夹登记"));
    await waitFor(() =>
      expect(mockClient.removeFavoritesFolder).toHaveBeenCalledTimes(1),
    );
  });

  it("黑马关键词空态:关键词跟随定位,指路定位中心(不编辑、不新建存储)", async () => {
    const user = userEvent.setup();
    render(
      <SignalSourcesButton
        benchmarkSources={[]}
        darkhorseKeywords={[]}
        defaultTab="darkhorse"
      />,
    );
    await user.click(screen.getByTestId("signal-sources-trigger"));
    expect(screen.getByTestId("darkhorse-keywords-empty")).toHaveTextContent(
      "关键词跟随定位",
    );
  });
});

// ── ④ 候选卡「实验」徽标 ─────────────────────────────────────────────────────────────
describe("[T-235e] 候选卡实验徽标", () => {
  it("card.attributionId 存在 → 徽标;点开显示 angle 里的归因引用", () => {
    render(
      <CandidateCard
        candidate={candidate({
          angle: "归因:上一条爆款验证了「具体数字 Hook」",
          card: {
            contentStructure: [],
            audiencePainScore: null,
            materialScore: null,
            productionDifficulty: null,
            attributionId: "attr-1",
          },
        })}
      />,
    );
    const badge = screen.getByTestId("experiment-badge");
    expect(screen.queryByTestId("experiment-attribution")).toBeNull();
    fireEvent.click(badge);
    expect(screen.getByTestId("experiment-attribution")).toHaveTextContent(
      "归因:上一条爆款验证了「具体数字 Hook」",
    );
  });

  it("无 attributionId → 不显示实验徽标(常规候选不冒充实验)", () => {
    render(<CandidateCard candidate={candidate()} />);
    expect(screen.queryByTestId("experiment-badge")).toBeNull();
  });
});
