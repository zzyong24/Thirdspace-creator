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
// 4 出题按钮 + 当前依据 panel, and the funnel renders the 6 states — all from a fixed VM
// (deterministic: no Date.now / Math.random / fetch). The mock client resolves immediately.

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
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createCandidate: (i: unknown) => mockClient.createCandidate(i),
    promoteCandidate: (i: unknown) => mockClient.promoteCandidate(i),
    patchCandidate: (i: unknown) => mockClient.patchCandidate(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: () => Promise.resolve({ status: "queued" }),
    listTaskResults: () => Promise.resolve([]),
    confirmTask: () => Promise.resolve({}),
  },
}));

import {
  CreateCandidateForm,
  CandidateCard,
  CandidateSortControl,
  TopicsWorkspace,
} from "./topics-interactive-region";
import { TopicGenerateBand } from "./topic-generate-island";
import { TopicsView } from "./topics-page";
import type {
  CandidateResource,
  TopicsOverviewResource,
} from "@/server/modules/candidate";

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
  it("renders the three columns, the AI band (4 buttons + basis panel) and the 6-state funnel", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate({ card: filledCard() })],
          overview: overview(),
          sort: "predictedScore",
        }}
      />,
    );
    // three-column body
    expect(screen.getByTestId("topics-three-column")).toBeInTheDocument();
    expect(screen.getByTestId("topics-sources")).toBeInTheDocument();
    expect(screen.getByTestId("topics-detail")).toBeInTheDocument();
    // AI band: 4 出题按钮 + 当前依据 panel
    expect(
      within(screen.getByTestId("topics-generate-buttons")).getAllByRole(
        "button",
      ),
    ).toHaveLength(4);
    const basis = screen.getByTestId("topics-basis-panel");
    expect(within(basis).getByText("AI 工程 / 应用落地")).toBeInTheDocument();
    // 7 source rows
    expect(screen.getAllByTestId("topics-source-row")).toHaveLength(7);
    // 6 funnel stages
    expect(screen.getAllByTestId("funnel-stage")).toHaveLength(6);
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

  it("shows the empty-card CTA in the detail panel when the selected candidate has no card", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate()], // empty card
          overview: overview(),
          sort: "predictedScore",
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
    // open the inline form first
    fireEvent.click(screen.getByText("新建选题卡"));
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

  it("立项为 Project → client.promoteCandidate then push to the new /projects/:id", async () => {
    render(<CandidateCard candidate={candidate()} />);
    fireEvent.click(screen.getByText("立项为 Project"));
    await waitFor(() =>
      expect(mockClient.promoteCandidate).toHaveBeenCalledTimes(1),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/projects/proj-99");
  });

  it("丢弃 → client.patchCandidate{status:'dropped'} then router.refresh", async () => {
    render(<CandidateCard candidate={candidate()} />);
    fireEvent.click(screen.getByText("丢弃"));
    await waitFor(() =>
      expect(mockClient.patchCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.patchCandidate.mock.calls[0]![0] as {
      body: { status: string };
    };
    expect(arg.body.status).toBe("dropped");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("补全选题卡 → client.createAITask(topic.enrich, candidateId)", async () => {
    render(<CandidateCard candidate={candidate()} />);
    fireEvent.click(screen.getByText("补全选题卡"));
    await waitFor(() =>
      expect(mockClient.createAITask).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createAITask.mock.calls[0]![0] as {
      body: { taskType: string; inputData: { candidateId: string } };
    };
    expect(arg.body.taskType).toBe("topic.enrich");
    expect(arg.body.inputData.candidateId).toBe("cand-1");
  });

  it("排序控制 → navigates /topics?sort=<key> (re-issues the sorted list)", () => {
    render(<CandidateSortControl sort="predictedScore" />);
    fireEvent.change(screen.getByTestId("candidate-sort-control"), {
      target: { value: "demandCount" },
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/topics?sort=demandCount");
  });

  it("基于定位出题 → client.createAITask(topic.generate, basis:positioning)", async () => {
    render(<TopicGenerateBand basis={overview().basis} />);
    fireEvent.click(screen.getByText("基于定位出题"));
    await waitFor(() =>
      expect(mockClient.createAITask).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createAITask.mock.calls[0]![0] as {
      body: { taskType: string; inputData: { basis: string } };
    };
    expect(arg.body.taskType).toBe("topic.generate");
    expect(arg.body.inputData.basis).toBe("positioning");
  });

  it("promote button is disabled for an already-promoted candidate", () => {
    render(<CandidateCard candidate={candidate({ status: "promoted" })} />);
    const card = screen.getByTestId("candidate-card");
    const promote = within(card).getByText("立项为 Project");
    expect(promote.closest("button")).toBeDisabled();
  });
});
