import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Calibration workbench island test (校准中心大改 · Slice 2). The 校准中心 is a three-column
// 校准工作台 whose middle (发布前预测评分表) + right (AI 编导诊断) columns share the selected
// prediction. This proves:
//  - the KPI band / 评分表 / 诊断 / 回流对照 / 经验沉淀 render REAL props (no fabrication);
//  - 锁定预测版本 → client.lockPrediction then router.refresh;
//  - 开始预测 → client.createAITask({ taskType:"calibration.diagnose" }) (the AI poll/confirm
//    island), issuing NO direct prediction write;
//  - empty data renders honest empty states, never crashes.
// Deterministic — the mock client resolves immediately, no network/clock in render.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  lockPrediction: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createAITask: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "task-1" }),
  ),
  getTask: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  confirmTask: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
  },
}));

import { CalibrationWorkbench } from "./calibration-interactive-region";
import type {
  CalibrationOverviewResource,
  PredictionResource,
  RubricResource,
} from "@creatoros/backend/modules/calibration";

const RUBRIC: RubricResource = {
  id: "rubric-canonical",
  userId: "user-a",
  name: "变现加权评分标准",
  currentVersionId: "rubricver-1",
  currentVersion: {
    id: "rubricver-1",
    userId: "user-a",
    rubricId: "rubric-canonical",
    versionNumber: 1,
    dimensions: [
      { key: "hook", label: "钩子强度", weight: 0.2 },
      { key: "cta", label: "CTA 清晰度", weight: 0.15 },
    ],
    changeSummary: "",
    createdAt: "2026-06-21T00:00:00.000Z",
  },
  createdAt: "2026-06-21T00:00:00.000Z",
};

const LOCKED: PredictionResource = {
  id: "pred-1",
  userId: "user-a",
  subjectType: "content_output",
  subjectId: "dy-out-00",
  rubricVersionId: "rubricver-1",
  predictedConversion: {
    dimensions: [
      { key: "hook", score: 4, reason: "钩子抓人", suggestion: "更具体" },
      { key: "cta", score: 2, reason: "几乎无 CTA", suggestion: "结尾补一句" },
    ],
  },
  predictedMetrics: {
    performance: { 完播率: 68, 收藏率: 22, 评论率: 8, 转化意向: 30 },
    diagnosis: {
      verdict: "传播力强但转化弱",
      mainIssues: ["几乎无 CTA", "产品铺路不足"],
      priorityFixes: ["结尾补一句行动召唤"],
    },
  },
  predictedScore: 0,
  confidence: "high",
  status: "locked",
  lockedAt: "2026-06-21T00:00:00.000Z",
  createdAt: "2026-06-21T00:00:00.000Z",
};

const DRAFT: PredictionResource = {
  ...LOCKED,
  id: "pred-2",
  subjectId: "dy-out-09",
  status: "draft",
  lockedAt: null,
};

const OVERVIEW: CalibrationOverviewResource = {
  kpis: {
    lockedPredictions: 3,
    completedReflows: 2,
    avgDeviationBand: "low",
    latestFinding: "钩子强度: 实际低于预测 2",
  },
  pendingSubjects: [
    {
      subjectType: "content_output",
      subjectId: "dy-out-09",
      title: "待校准的内容标题",
      platform: "",
      badge: "unpredicted",
    },
  ],
  reflowRows: [
    {
      predictionId: "pred-1",
      subjectId: "dy-out-00",
      dimensions: [
        { key: "hook", label: "钩子强度", predicted: 4, actual: 4, deviation: 0 },
        { key: "cta", label: "CTA 清晰度", predicted: 2, actual: 2, deviation: 0 },
      ],
      deviationBand: "low",
      reason: "钩子强度: 实际低于预测 2",
    },
  ],
  learnings: [
    {
      id: "learning-1",
      title: "钩子要前3秒给反差",
      insight: "通用开场完播率低 20 个点",
    },
  ],
};

const SUBJECT_TITLES = {
  "dy-out-00": "AI 产出差不是工具的锅",
  "dy-out-09": "待校准的内容标题",
};

function renderWorkbench(
  overrides?: Partial<{
    overview: CalibrationOverviewResource;
    predictions: PredictionResource[];
    rubric: RubricResource | null;
  }>,
) {
  return render(
    <CalibrationWorkbench
      overview={overrides?.overview ?? OVERVIEW}
      predictions={overrides?.predictions ?? [LOCKED]}
      rubric={overrides?.rubric ?? RUBRIC}
      subjectTitles={SUBJECT_TITLES}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("calibration workbench", () => {
  it("renders the 4-KPI band from real overview values", () => {
    renderWorkbench();
    const band = screen.getByTestId("calibration-kpi-band");
    expect(within(band).getByText("3")).toBeTruthy(); // lockedPredictions
    expect(within(band).getByText("2")).toBeTruthy(); // completedReflows
    expect(within(band).getByText("低（预测准）")).toBeTruthy(); // avgDeviationBand low
    // latestFinding surfaces as a KPI hint
    expect(within(band).getByText(/实际低于预测 2/)).toBeTruthy();
  });

  it("renders the 维度评分表 with reason + suggestion from the selected prediction", () => {
    renderWorkbench();
    const table = screen.getByTestId("score-table");
    expect(within(table).getAllByTestId("score-row")).toHaveLength(2);
    // label resolved from the rubric version, reason + suggestion from the jsonb
    expect(within(table).getByText("钩子强度")).toBeTruthy();
    expect(within(table).getByText(/几乎无 CTA/)).toBeTruthy();
    expect(within(table).getByText(/结尾补一句/)).toBeTruthy();
  });

  it("renders the AI 编导诊断 (verdict / 主要问题 / 优先修改 / 预测表现)", () => {
    renderWorkbench();
    const diag = screen.getByTestId("calibration-diagnosis");
    expect(within(diag).getByText("传播力强但转化弱")).toBeTruthy();
    expect(within(diag).getByText("产品铺路不足")).toBeTruthy();
    expect(within(diag).getByText("结尾补一句行动召唤")).toBeTruthy();
    expect(within(diag).getByText("68%")).toBeTruthy(); // 完播率 perf chip
  });

  it("锁定预测版本 → lockPrediction then router.refresh (draft only)", async () => {
    renderWorkbench({ predictions: [DRAFT] });
    fireEvent.click(screen.getByTestId("lock-prediction-button"));
    await waitFor(() =>
      expect(mockClient.lockPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.lockPrediction.mock.calls[0]![0] as {
      params: { predictionId: string };
    };
    expect(arg.params.predictionId).toBe("pred-2");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("a locked prediction shows the 已锁定 badge, not a lock button", () => {
    renderWorkbench({ predictions: [LOCKED] });
    expect(screen.getByTestId("prediction-locked-badge")).toBeTruthy();
    expect(screen.queryByTestId("lock-prediction-button")).toBeNull();
  });

  it("开始预测 → createAITask({ calibration.diagnose }) — no direct prediction write", async () => {
    renderWorkbench({ predictions: [] });
    fireEvent.click(screen.getByTestId("start-prediction-button"));
    await waitFor(() =>
      expect(mockClient.createAITask).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createAITask.mock.calls[0]![0] as {
      body: { taskType: string; inputData: { subjectId: string } };
    };
    expect(arg.body.taskType).toBe("calibration.diagnose");
    expect(arg.body.inputData.subjectId).toBe("dy-out-09");
    // no fake parallel prediction write
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
  });

  it("renders the 发布后回流对照 table with 预测/真实/偏差 columns", () => {
    renderWorkbench();
    const reflow = screen.getByTestId("calibration-reflow");
    expect(within(reflow).getByTestId("reflow-row")).toBeTruthy();
    expect(within(reflow).getByText("AI 产出差不是工具的锅")).toBeTruthy();
    expect(within(reflow).getByText("评估维度")).toBeTruthy();
    expect(within(reflow).getByText("真实分")).toBeTruthy();
  });

  it("renders 经验沉淀 learning cards from overview.learnings", () => {
    renderWorkbench();
    const panel = screen.getByTestId("calibration-learnings");
    expect(within(panel).getByText("钩子要前3秒给反差")).toBeTruthy();
    expect(within(panel).getByText(/完播率低 20 个点/)).toBeTruthy();
  });

  it("empty data renders honest empty states (no crash, no fabrication)", () => {
    const empty: CalibrationOverviewResource = {
      kpis: {
        lockedPredictions: 0,
        completedReflows: 0,
        avgDeviationBand: "none",
        latestFinding: "",
      },
      pendingSubjects: [],
      reflowRows: [],
      learnings: [],
    };
    renderWorkbench({ overview: empty, predictions: [], rubric: null });
    expect(screen.getByTestId("pending-empty")).toBeTruthy();
    expect(screen.getByTestId("prediction-no-selection")).toBeTruthy();
    expect(screen.getByTestId("reflow-empty")).toBeTruthy();
    expect(screen.getByTestId("learnings-empty")).toBeTruthy();
  });

  it("goal tabs switch the active filter (presentation only)", () => {
    renderWorkbench();
    const tabs = screen.getByTestId("goal-tabs");
    expect(within(tabs).getByTestId("goal-tab-all").getAttribute("data-active")).toBe(
      "true",
    );
    fireEvent.click(within(tabs).getByTestId("goal-tab-转化"));
    expect(
      within(tabs).getByTestId("goal-tab-转化").getAttribute("data-active"),
    ).toBe("true");
  });
});
