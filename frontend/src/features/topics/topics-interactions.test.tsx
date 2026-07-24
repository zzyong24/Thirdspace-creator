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

// 选题中心 (选题中心大改 · Slice 2 三栏重构) island wiring test. Proves the needs-backend
// controls each issue their mapped contract op then the right navigation (promote → push
// to the new /projects/:id; drop/create → router.refresh()), the three-column body wires
// 选中态 (click a candidate → drives the right 详情 column), the AI 选题会 band renders the
// 4 出题按钮 + 当前依据 panel, and the funnel is GONE ([T-242] 候选池 C 位,漏斗移除 ——
// overview.funnel 仍随复合读返回但不再渲染) — all from a fixed VM (deterministic: no
// Date.now / Math.random / fetch). The mock client resolves immediately.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  promoteCandidate: vi.fn((i: unknown): Promise<unknown> => {
    void i;
    return Promise.resolve({ projectId: "proj-99" });
  }),
  patchCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createAITask: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "task-1" }),
  ),
  // CollabField(COLLAB-01/02): 采纳前 patch「删 + 改」后的 kept,再 confirm 物化。
  patchTaskResultItems: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "res-1" }),
  ),
  confirmTask: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({})),
  // [T-222] 立即采集:找 benchmark 定时作业 → runNow。
  listScheduledJobs: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve([{ id: "job-bench", enabled: true, sourceKind: "benchmark" }]),
  ),
  runScheduledJobNow: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({})),
};
const mockListTaskResults = vi.fn(
  (): Promise<Array<{ resultData: Record<string, unknown> }>> =>
    Promise.resolve([]),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createCandidate: (i: unknown) => mockClient.createCandidate(i),
    promoteCandidate: (i: unknown) => mockClient.promoteCandidate(i),
    patchCandidate: (i: unknown) => mockClient.patchCandidate(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: () => Promise.resolve({ status: "queued" }),
    listTaskResults: () => mockListTaskResults(),
    listTaskSteps: () => Promise.resolve([]),
    patchTaskResultItems: (i: unknown) => mockClient.patchTaskResultItems(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
    cancelTask: () => Promise.resolve({}),
    listScheduledJobs: (i: unknown) => mockClient.listScheduledJobs(i),
    runScheduledJobNow: (i: unknown) => mockClient.runScheduledJobNow(i),
  },
}));

import {
  CreateCandidateForm,
  IdeaDraftForm,
  CandidateCard,
  CandidateSortControl,
  TopicsWorkspace,
} from "./topics-interactive-region";
import { TopicGenerateBand } from "./topic-generate-island";
import { TopicsView, TopicsPage, type TopicsReadClient } from "./topics-page";
import type {
  CandidateResource,
  TopicsOverviewResource,
} from "@creatoros/backend/modules/candidate";

const ISO = "2026-06-21T00:00:00.000Z";

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
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function overview(
  over: Partial<TopicsOverviewResource> = {},
): TopicsOverviewResource {
  return {
    basis: {
      positioningLabel: "AI 工程 / 应用落地",
      commentSignals: 0,
      knowledgeCards: 11,
      highPerformers: 0,
    },
    sources: [
      { key: "comment", label: "评论问题", count: 0 },
      { key: "consultation", label: "客户咨询", count: 0 },
      { key: "knowledge", label: "知识库资料", count: 11 },
      { key: "highPerformer", label: "历史爆款", count: 0 },
      { key: "trend", label: "行业热点", count: 0 },
      { key: "review", label: "项目复盘", count: 3 },
      { key: "idea", label: "手动灵感", count: 1 },
    ],
    funnel: [
      { key: "collecting", label: "待收集", count: 0 },
      { key: "evaluating", label: "待评估", count: 1 },
      { key: "enriching", label: "待补充", count: 2 },
      { key: "promoted", label: "已立项", count: 0 },
      { key: "dropped", label: "已丢弃", count: 0 },
      { key: "recycled", label: "已发布回流", count: 3 },
    ],
    ...over,
  };
}

function filledCard(): CandidateResource["card"] {
  return {
    oneLiner: "一句话选题",
    targetAudience: "目标观众",
    audiencePain: "观众痛点",
    coreConflict: "核心冲突",
    hook: "推荐 Hook",
    contentStructure: ["第一步", "第二步"],
    format: "10 分钟",
    materialBasis: "素材依据",
    riskNote: "风险点",
    proposal: "立项建议",
    audiencePainScore: 86,
    materialScore: 78,
    productionDifficulty: "mid",
  };
}

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  for (const fn of Object.values(mockClient)) fn.mockClear();
});
afterEach(() => cleanup());

describe("topics view (pure render, deterministic)", () => {
  it("renders the three columns and the AI band (4 buttons + basis panel), with NO funnel ([T-242])", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate({ card: filledCard() })],
          overview: overview(),
          sort: "predictedScore",
          pendingReview: null,
        }}
      />,
    );
    // three-column body
    expect(screen.getByTestId("topics-three-column")).toBeInTheDocument();
    expect(screen.getByTestId("topics-sources")).toBeInTheDocument();
    expect(screen.getByTestId("topics-detail")).toBeInTheDocument();
    // AI band: 4 出题深链(T-060① 弹窗退役 → Copilot 预填)+ 当前依据 panel
    expect(
      within(screen.getByTestId("topics-generate-actions")).getAllByRole(
        "link",
      ),
    ).toHaveLength(4);
    const basis = screen.getByTestId("topics-basis-panel");
    expect(within(basis).getByText("AI 工程 / 应用落地")).toBeInTheDocument();
    // 7 source rows
    expect(screen.getAllByTestId("topics-source-row")).toHaveLength(7);
    // [T-242] 漏斗已移除:即便 VM 带 funnel 数据也不渲染(候选池 C 位,反向断言)。
    expect(screen.queryByTestId("topics-funnel")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("funnel-stage")).toHaveLength(0);
    // T-482：旧「信号源」弹窗从选题中心退役，统一进入内容雷达。
    expect(screen.queryByTestId("signal-sources-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("content-radar-link")).toHaveAttribute(
      "href",
      "/intelligence",
    );
  });

  it("hides dropped candidates from the pool board", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [
            candidate({ id: "cand-1", status: "pool" }),
            candidate({ id: "cand-2", status: "dropped", title: "已丢" }),
          ],
          overview: overview(),
          sort: "predictedScore",
          pendingReview: null,
        }}
      />,
    );
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(1);
  });

  it("surfaces the 4 score chips, rendering 「—」 for null metrics (never fabricated)", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate()],
          overview: overview(),
          sort: "predictedScore",
          pendingReview: null,
        }}
      />,
    );
    const card = screen.getByTestId("candidate-card");
    expect(within(card).getByText("定位契合")).toBeInTheDocument();
    expect(within(card).getByText("受众痛感")).toBeInTheDocument();
    expect(within(card).getByText("素材充足")).toBeInTheDocument();
    expect(within(card).getByText("制作难度")).toBeInTheDocument();
    // null 指标 → 「—」 (3 of them: 受众痛感/素材充足/制作难度)
    expect(within(card).getAllByText("—")).toHaveLength(3);
  });

  it("[T-482] 内容雷达候选卡和详情都提供可点击的原视频链接", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [
            candidate({
              source: "benchmark",
              card: {
                ...filledCard(),
                sourceReferences: [
                  {
                    kind: "original_video",
                    platform: "douyin",
                    label: "原视频",
                    url: "https://www.douyin.com/video/7350000000000000000",
                    intelligenceItemId: "item-1",
                  },
                ],
              },
            }),
          ],
          overview: overview(),
          sort: "predictedScore",
          pendingReview: null,
        }}
      />,
    );

    const cardLink = within(screen.getByTestId("candidate-card")).getByRole(
      "link",
      { name: /原视频/ },
    );
    expect(cardLink).toHaveAttribute(
      "href",
      "https://www.douyin.com/video/7350000000000000000",
    );
    expect(cardLink).toHaveAttribute("target", "_blank");

    const detailLink = within(screen.getByTestId("topics-detail")).getByRole(
      "link",
      { name: /原视频/ },
    );
    expect(detailLink).toHaveAttribute(
      "href",
      "https://www.douyin.com/video/7350000000000000000",
    );
  });

  it("shows the empty-card CTA in the detail panel when the selected candidate has no card", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate()], // empty card
          overview: overview(),
          sort: "predictedScore",
          pendingReview: null,
        }}
      />,
    );
    expect(screen.getByTestId("detail-empty-card")).toBeInTheDocument();
  });
});

describe("topics three-column selection", () => {
  it("clicking a candidate selects it and drives the right detail column", () => {
    render(
      <TopicsWorkspace
        candidates={[
          candidate({ id: "cand-1", title: "第一条", card: filledCard() }),
          candidate({
            id: "cand-2",
            title: "第二条",
            card: { ...filledCard(), oneLiner: "第二条的一句话" },
          }),
        ]}
        sources={overview().sources}
        sort="predictedScore"
      />,
    );
    // default selection is the first card-bearing candidate → detail shows its oneLiner
    const detail = screen.getByTestId("topics-detail");
    expect(within(detail).getByText("一句话选题")).toBeInTheDocument();
    // click the 2nd candidate → detail switches
    fireEvent.click(
      screen.getByText("第二条").closest("[data-testid='candidate-card']")!,
    );
    expect(within(detail).getByText("第二条的一句话")).toBeInTheDocument();
  });
});

describe("topics islands (needs-backend wiring)", () => {
  it("新建选题卡 → client.createCandidate(source:'idea') then router.refresh", async () => {
    render(<CreateCandidateForm />);
    // open the 手动详填 form first (A1 把主 CTA 让给「编导起草」,12 字段表单降级成手动详填)
    fireEvent.click(screen.getByText("手动详填"));
    fireEvent.change(screen.getByLabelText("选题标题"), {
      target: { value: "新选题" },
    });
    fireEvent.submit(screen.getByTestId("create-candidate-form"));
    await waitFor(() =>
      expect(mockClient.createCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createCandidate.mock.calls[0]![0] as {
      body: { source: string; title: string };
    };
    expect(arg.body).toMatchObject({ source: "idea", title: "新选题" });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("新建选题卡·评分/可行性 → patchCandidate 带上数字评分 + 难度枚举(越界不收)", async () => {
    mockClient.createCandidate.mockResolvedValueOnce({ id: "cand-scored" });
    render(<CreateCandidateForm />);
    fireEvent.click(screen.getByText("手动详填"));
    fireEvent.change(screen.getByLabelText("选题标题"), {
      target: { value: "带评分的选题" },
    });
    fireEvent.change(screen.getByLabelText("受众痛感评分"), {
      target: { value: "88" },
    });
    // 越界值应被丢弃(不 patch)。
    fireEvent.change(screen.getByLabelText("素材充足评分"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText("制作难度"), {
      target: { value: "mid" },
    });
    fireEvent.submit(screen.getByTestId("create-candidate-form"));
    await waitFor(() =>
      expect(mockClient.patchCandidate).toHaveBeenCalledTimes(1),
    );
    const patchArg = mockClient.patchCandidate.mock.calls[0]![0] as {
      body: { card: Record<string, unknown> };
    };
    expect(patchArg.body.card).toMatchObject({
      audiencePainScore: 88,
      productionDifficulty: "mid",
    });
    // 越界的 materialScore 不应出现在 card 里。
    expect(patchArg.body.card).not.toHaveProperty("materialScore");
  });

  it("[T-103c] 编导起草(IdeaDraftForm)→ createCandidate(idea) 再打开 Copilot 深链(topic.enrich, 不再后台轮询)", async () => {
    mockClient.createCandidate.mockResolvedValueOnce({ id: "cand-new" });
    render(<IdeaDraftForm />);
    fireEvent.change(screen.getByLabelText("一句话起选题"), {
      target: { value: "副业避坑指南" },
    });
    fireEvent.click(screen.getByText("编导起草"));
    // 第一步:建裸卡(title=这句话, source=idea)
    await waitFor(() =>
      expect(mockClient.createCandidate).toHaveBeenCalledTimes(1),
    );
    const cArg = mockClient.createCandidate.mock.calls[0]![0] as {
      body: { title: string; source: string };
    };
    expect(cArg.body).toMatchObject({ title: "副业避坑指南", source: "idea" });
    // 第二步:打开 Copilot 深链(surface=topics, fn=topic.enrich, selection=刚建的候选)—— 补全进对话,
    // 不再后台 createAITask 轮询。
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    const href = mockRouter.push.mock.calls[0]![0] as string;
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=topics");
    expect(href).toContain("fn=topic.enrich");
    expect(href).toContain("selKind=candidate");
    expect(href).toContain("selId=cand-new");
    expect(href).toContain("prefill=");
    // 编导起草不再直接起后台任务 —— 补全全部走对话确认门。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("立项为 Project → client.promoteCandidate then push to the new /projects/:id", async () => {
    render(<CandidateCard candidate={candidate()} />);
    fireEvent.click(screen.getByText("立项为 Project"));
    await waitFor(() =>
      expect(mockClient.promoteCandidate).toHaveBeenCalledTimes(1),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/projects/proj-99");
  });

  it("[T-216] 丢弃 → 弹窗填原因 → client.patchCandidate{status:'dropped',dropReason} then router.refresh", async () => {
    render(<CandidateCard candidate={candidate()} />);
    // 点「丢弃」先开弹窗(不立即 patch)。
    fireEvent.click(screen.getByText("丢弃"));
    expect(mockClient.patchCandidate).not.toHaveBeenCalled();
    // 填一句原因,确认丢弃。
    fireEvent.change(screen.getByTestId("drop-reason-input"), {
      target: { value: "太理论了没人看" },
    });
    fireEvent.click(screen.getByText("确认丢弃"));
    await waitFor(() =>
      expect(mockClient.patchCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.patchCandidate.mock.calls[0]![0] as {
      body: { status: string; dropReason?: string };
    };
    expect(arg.body.status).toBe("dropped");
    expect(arg.body.dropReason).toBe("太理论了没人看");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("[T-216] 留空原因直接确认丢弃 → 只带 status,不带 dropReason", async () => {
    render(<CandidateCard candidate={candidate()} />);
    fireEvent.click(screen.getByText("丢弃"));
    fireEvent.click(screen.getByText("确认丢弃"));
    await waitFor(() =>
      expect(mockClient.patchCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.patchCandidate.mock.calls[0]![0] as {
      body: { status: string; dropReason?: string };
    };
    expect(arg.body.status).toBe("dropped");
    expect(arg.body).not.toHaveProperty("dropReason");
  });

  it("[T-103c] 补全选题卡 → Copilot 深链预填(topic.enrich, selection=候选;不再 createAITask 轮询)", () => {
    render(<CandidateCard candidate={candidate()} />);
    const link = screen.getByTestId("enrich-button");
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=topics");
    expect(href).toContain("fn=topic.enrich");
    expect(href).toContain("selKind=candidate");
    expect(href).toContain("selId=cand-1");
    expect(href).toContain("prefill=");
    // 补全不再后台起任务 —— 走对话确认门物化。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("排序控制 → navigates /topics?sort=<key> (re-issues the sorted list)", () => {
    render(<CandidateSortControl sort="predictedScore" />);
    fireEvent.change(screen.getByTestId("candidate-sort-control"), {
      target: { value: "demandCount" },
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/topics?sort=demandCount");
  });

  it("[T-060①] 基于定位出题 → Copilot 深链预填(不再 createAITask 弹窗)", () => {
    render(<TopicGenerateBand basis={overview().basis} />);
    const link = screen.getByTestId("topics-generate-positioning");
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=topics");
    expect(href).toContain("fn=topic.generate");
    expect(href).toContain("prefill=");
    // 任何出题动作都不直接起任务 —— 全部进对话由确认门物化。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("[T-060①] 弹窗任务流退役:无待审阅 pill、无审阅弹窗", () => {
    render(
      <TopicGenerateBand
        basis={overview().basis}
        pendingReview={{ taskId: "task-x", basis: "trend", count: 2 }}
      />,
    );
    expect(screen.queryByTestId("topics-pending-review")).toBeNull();
    expect(screen.queryByTestId("topics-review-list")).toBeNull();
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("promote button is disabled for an already-promoted candidate", () => {
    render(<CandidateCard candidate={candidate({ status: "promoted" })} />);
    const card = screen.getByTestId("candidate-card");
    const promote = within(card).getByText("立项为 Project");
    expect(promote.closest("button")).toBeDisabled();
  });
});

describe("[T-244] 来源行 → 候选池过滤器", () => {
  // 可映射到 candidates.source 枚举的两行(行业热点→trend / 手动灵感→idea)是真过滤器;
  // 其余 5 行(评论/咨询/知识库/历史爆款/复盘)映射不了,保持纯展示(绝不做假过滤)。
  function pool() {
    return [
      candidate({ id: "cand-idea", source: "idea", title: "灵感候选" }),
      candidate({ id: "cand-trend", source: "trend", title: "热点候选" }),
    ];
  }

  it("7 行仍全渲染:2 行(热点/灵感)是可点 button,其余 5 行纯展示非按钮", () => {
    render(
      <TopicsWorkspace
        candidates={pool()}
        sources={overview().sources}
        sort="predictedScore"
      />,
    );
    const rows = screen.getAllByTestId("topics-source-row");
    expect(rows).toHaveLength(7);
    const buttons = rows.filter((r) => r.tagName === "BUTTON");
    expect(buttons.map((b) => b.getAttribute("data-source-filter"))).toEqual([
      "trend",
      "idea",
    ]);
    // 不可映射的 5 行不是按钮(无 onClick 语义,T-051 去假可点样式继续适用)。
    expect(rows.filter((r) => r.tagName === "LI")).toHaveLength(5);
  });

  it("点「手动灵感」→ URL 导航 ?source=idea(保留 sort)", () => {
    render(
      <TopicsWorkspace
        candidates={pool()}
        sources={overview().sources}
        sort="demandCount"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "按手动灵感过滤候选池" }));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/topics?sort=demandCount&source=idea",
    );
  });

  it("再点当前激活来源 → 清除过滤(URL 去掉 ?source=),行带 aria-pressed 高亮 + 候选池提示", () => {
    render(
      <TopicsWorkspace
        candidates={pool().filter((c) => c.source === "idea")}
        allCandidates={pool()}
        sources={overview().sources}
        sort="predictedScore"
        sourceFilter="idea"
      />,
    );
    // 过滤态提示在候选池标题旁。
    expect(screen.getByTestId("pool-source-filter-hint").textContent).toContain(
      "手动灵感",
    );
    const active = screen.getByRole("button", { name: "取消按手动灵感过滤" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(active);
    expect(mockRouter.push).toHaveBeenCalledWith("/topics?sort=predictedScore");
  });

  it("池里没有该来源的候选 → 来源行禁用(点了不导航)", () => {
    // 只有 idea 候选 → trend 行禁用。
    render(
      <TopicsWorkspace
        candidates={[candidate({ source: "idea" })]}
        sources={overview().sources}
        sort="predictedScore"
      />,
    );
    const trendRow = screen.getByRole("button", { name: "按行业热点过滤候选池" });
    expect(trendRow).toBeDisabled();
    fireEvent.click(trendRow);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("排序切换保留当前来源过滤(?sort= 与 ?source= 互不冲掉)", () => {
    render(<CandidateSortControl sort="predictedScore" sourceFilter="idea" />);
    fireEvent.change(screen.getByTestId("candidate-sort-control"), {
      target: { value: "demandCount" },
    });
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/topics?sort=demandCount&source=idea",
    );
  });

  function readClient(candidates: CandidateResource[]) {
    const listCandidates = vi.fn(
      (i: { query?: { source?: string } }): Promise<unknown> => {
        const src = i.query?.source;
        return Promise.resolve(
          src ? candidates.filter((c) => c.source === src) : candidates,
        );
      },
    );
    const client = {
      listCandidates,
      overviewTopics: () => Promise.resolve(overview()),
      listBenchmarkSources: () => Promise.resolve([]),
      listTrendSources: () => Promise.resolve([]),
      listScheduledJobs: () => Promise.resolve([]),
      getPositioningCenter: () => Promise.resolve({ keywords: [] }),
    } as unknown as TopicsReadClient;
    return { client, listCandidates };
  }

  it("合法 ?source= → 服务端读侧多发一次带 source 的 candidates.list,池子只渲染该来源", async () => {
    const { client, listCandidates } = readClient(pool());
    render(await TopicsPage({ sort: "predictedScore", source: "idea", client }));
    expect(listCandidates).toHaveBeenCalledTimes(2);
    const second = listCandidates.mock.calls[1]![0] as {
      query: { source?: string; sort?: string; status?: string };
    };
    expect(second.query.source).toBe("idea");
    expect(second.query.sort).toBe("predictedScore");
    expect(second.query.status).toBe("pool");
    // 候选池只剩 idea 来源那条;trend 候选被服务端过滤掉。
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(1);
    expect(screen.getByTestId("pool-source-filter-hint")).toBeInTheDocument();
  });

  it("白名单挡非法 ?source=:静默回全部(不透传、不发第二次过滤读)", async () => {
    const { client, listCandidates } = readClient(pool());
    render(
      await TopicsPage({
        sort: "predictedScore",
        source: "__evil__",
        client,
      }),
    );
    expect(listCandidates).toHaveBeenCalledTimes(1);
    const only = listCandidates.mock.calls[0]![0] as {
      query: { source?: string; status?: string };
    };
    expect(only.query.source).toBeUndefined();
    expect(only.query.status).toBe("pool");
    expect(screen.queryByTestId("pool-source-filter-hint")).toBeNull();
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(2);
  });
});
