import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-235e] 选题中心「被服务感知」测试(SPEC daily-topic-autopilot §2.5,三决策):
//   ① 今日新选题条带:createdAt≥dayStartIso 过滤、来源徽标(🔥跟拍|/实验|前缀 + source 枚举)、
//     一句依据、空态诚实「今天早上暂时没找到新选题」。
//   ② 供给链健康条:lastRun 缺失 → 「—」诚实降级;有实绩 → ✓HH:mm;计数派生纯函数。
//   ③ 候选卡「实验」徽标(card.attributionId)点开显示 angle 里的归因引用。
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
  // [T-349b] 对标作品单条抓逐字稿。
  transcribeBenchmarkWork: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ status: "done", transcript: "抓到的逐字稿正文" }),
  ),
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
    transcribeBenchmarkWork: (i: unknown) => mockClient.transcribeBenchmarkWork(i),
  },
}));

import {
  TodayTopicsStrip,
  SupplyHealthStrip,
  parseSupplyBadge,
  filterTodayCandidates,
  deriveSupplySegments,
} from "./topics-supply-region";
import { CandidateCard } from "./topics-interactive-region";
import type { CandidateResource } from "@creatoros/backend/modules/candidate";

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

  it("空态诚实:今日无新候选 → 「今天早上暂时没找到新选题」", () => {
    render(
      <TodayTopicsStrip
        dayStartIso={DAY_START_ISO}
        candidates={[candidate({ createdAt: YESTERDAY_ISO })]}
      />,
    );
    expect(screen.getByTestId("today-topics-empty")).toHaveTextContent(
      "今天早上暂时没找到新选题",
    );
  });

  it("filterTodayCandidates:dayStartIso 缺失/非法 → 空(不猜「今天」)", () => {
    expect(filterTodayCandidates([candidate()], undefined)).toHaveLength(0);
    expect(filterTodayCandidates([candidate()], "not-a-date")).toHaveLength(0);
  });

  it("filterTodayCandidates 只投影仍在 pool 的今日选题，丢弃项不再回流条带", () => {
    expect(
      filterTodayCandidates(
        [
          candidate({ id: "pool", status: "pool" }),
          candidate({ id: "dropped", status: "dropped" }),
          candidate({ id: "promoted", status: "promoted" }),
        ],
        DAY_START_ISO,
      ).map((c) => c.id),
    ).toEqual(["pool"]);
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
