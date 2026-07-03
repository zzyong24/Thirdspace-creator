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

// 校准中心主线布局测试(T-067 布局重做)。页面围绕单一主线「预测 → 采集回流 → 对照」:
// 顶部 3 张真值指标卡 / 上段「进行中的预测」(每条预测的主线状态机:草稿可锁定 →
// 已锁定等待数据回流 → 已回流显示偏差档,行可展开看盲预测评分表)/ 中段回流对照表 /
// 右侧栏「发起新预测」补充入口。本测试证明:
//  - 指标带 / 预测行 / 评分表 / 回流对照 全渲染 REAL props(零造假);
//  - 经验沉淀 / AI 编导诊断常驻栏已删(用户裁决:经验归经验模块);
//  - 锁定预测 → client.lockPrediction then router.refresh;
//  - 开始预测 → client.createAITask({ taskType:"calibration.diagnose" }),无直接预测写入;
//  - 录入真实表现 → getPrediction + createResult(无 ingestionRunId);
//  - 空数据渲染诚实空态(引导去稿面发布包区),不 crash。
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
  getPrediction: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve(AWAITING)),
  createResult: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  refreshDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ recordsIngested: 2 }),
  ),
  loginDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
    getPrediction: (i: unknown) => mockClient.getPrediction(i),
    createResult: (i: unknown) => mockClient.createResult(i),
    refreshDouyin: (i: unknown) => mockClient.refreshDouyin(i),
    loginDouyin: (i: unknown) => mockClient.loginDouyin(i),
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

// 已回流的预测(reflowRows 里有它 → 行显示「已回流 · 低偏差」)。
const REFLOWED: PredictionResource = {
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
  predictedMetrics: {},
  predictedScore: 0,
  confidence: "high",
  status: "locked",
  lockedAt: "2026-06-21T00:00:00.000Z",
  createdAt: "2026-06-21T00:00:00.000Z",
};

// 已锁定、还没回流的预测(主线中段:「等待数据回流」+ 录入真实表现)。
const AWAITING: PredictionResource = {
  ...REFLOWED,
  id: "pred-2",
  subjectId: "dy-out-05",
  lockedAt: "2026-06-25T00:00:00.000Z",
};

// 草稿预测(可锁定)。
const DRAFT: PredictionResource = {
  ...REFLOWED,
  id: "pred-3",
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
      predictionId: null,
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
  "dy-out-05": "等待回流的作品",
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
      predictions={overrides?.predictions ?? [REFLOWED, AWAITING]}
      rubric={overrides?.rubric ?? RUBRIC}
      subjectTitles={SUBJECT_TITLES}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("calibration mainline layout (T-067)", () => {
  it("renders the 3-KPI band from real overview values (最近发现卡已收窄删除)", () => {
    renderWorkbench();
    const band = screen.getByTestId("calibration-kpi-band");
    expect(within(band).getByText("3")).toBeTruthy(); // lockedPredictions
    expect(within(band).getByText("2")).toBeTruthy(); // completedReflows
    expect(within(band).getByText("低（预测准）")).toBeTruthy(); // avgDeviationBand low
    // 第 4 张「最近发现」卡已删 —— latestFinding 不再在指标带出现。
    expect(within(band).queryByText(/实际低于预测 2/)).toBeNull();
  });

  it("进行中的预测:每行 作品名+预测分+锁定时间+主线状态(等待回流/已回流偏差)", () => {
    renderWorkbench();
    const section = screen.getByTestId("calibration-active-predictions");
    const rows = within(section).getAllByTestId("prediction-row");
    expect(rows).toHaveLength(2);
    // 已回流行:标题 + 偏差档 badge。
    const reflowedRow = rows.find(
      (r) => r.getAttribute("data-prediction-id") === "pred-1",
    )!;
    expect(reflowedRow.getAttribute("data-state")).toBe("reflowed");
    expect(within(reflowedRow).getByText("AI 产出差不是工具的锅")).toBeTruthy();
    expect(
      within(reflowedRow).getByTestId("prediction-deviation-badge").textContent,
    ).toContain("低偏差");
    // 预测分 = 维度均分 (4+2)/2 = 3.0;锁定时间 = ISO 日期切片。
    expect(within(reflowedRow).getByText("3.0")).toBeTruthy();
    expect(within(reflowedRow).getByText("2026-06-21")).toBeTruthy();
    // 待回流行:等待数据回流 badge + 录入真实表现入口。
    const awaitingRow = rows.find(
      (r) => r.getAttribute("data-prediction-id") === "pred-2",
    )!;
    expect(awaitingRow.getAttribute("data-state")).toBe("awaiting");
    expect(within(awaitingRow).getByTestId("prediction-awaiting-badge")).toBeTruthy();
    expect(within(awaitingRow).getByTestId("record-result-trigger")).toBeTruthy();
  });

  it("展开预测行 → 逐维度盲预测评分表(rubric label/权重 + reason + suggestion)", () => {
    renderWorkbench();
    const section = screen.getByTestId("calibration-active-predictions");
    const row = within(section)
      .getAllByTestId("prediction-row")
      .find((r) => r.getAttribute("data-prediction-id") === "pred-1")!;
    fireEvent.click(within(row).getByTestId("prediction-row-toggle"));
    const table = within(row).getByTestId("score-table");
    expect(within(table).getAllByTestId("score-row")).toHaveLength(2);
    expect(within(table).getByText("钩子强度")).toBeTruthy(); // rubric label
    expect(within(table).getByText("权重 20%")).toBeTruthy();
    expect(within(table).getByText(/几乎无 CTA/)).toBeTruthy(); // reason
    expect(within(table).getByText(/结尾补一句/)).toBeTruthy(); // suggestion
  });

  it("草稿预测行显示锁定按钮;锁定 → lockPrediction then router.refresh", async () => {
    renderWorkbench({ predictions: [DRAFT] });
    const row = screen.getByTestId("prediction-row");
    expect(row.getAttribute("data-state")).toBe("draft");
    fireEvent.click(within(row).getByTestId("lock-prediction-button"));
    await waitFor(() =>
      expect(mockClient.lockPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.lockPrediction.mock.calls[0]![0] as {
      params: { predictionId: string };
    };
    expect(arg.params.predictionId).toBe("pred-3");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("已锁定预测行显示 已锁定 badge,不显示锁定按钮", () => {
    renderWorkbench({ predictions: [AWAITING] });
    expect(screen.getByTestId("prediction-awaiting-badge")).toBeTruthy();
    expect(screen.queryByTestId("lock-prediction-button")).toBeNull();
  });

  it("侧栏发起新预测:开始预测 → createAITask({ calibration.diagnose }),无直接预测写入", async () => {
    renderWorkbench({ predictions: [] });
    const rail = screen.getByTestId("calibration-new-prediction");
    fireEvent.click(within(rail).getByTestId("start-prediction-button"));
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

  it("录入真实表现(FLY-02)→ getPrediction 取维度 + createResult(actualMetrics,无 ingestionRunId)then refresh", async () => {
    renderWorkbench({ predictions: [AWAITING] });
    fireEvent.click(screen.getByTestId("record-result-trigger"));
    // getPrediction 解析 AWAITING → 维度 hook/cta 渲染成可填输入。
    await waitFor(() => expect(mockClient.getPrediction).toHaveBeenCalled());
    const hookInput = await screen.findByLabelText("hook 真实分");
    fireEvent.change(hookInput, { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("record-result-submit"));
    await waitFor(() => expect(mockClient.createResult).toHaveBeenCalledTimes(1));
    const arg = mockClient.createResult.mock.calls[0]![0] as {
      params: { predictionId: string };
      body: { actualMetrics: Record<string, number>; ingestionRunId?: string };
    };
    expect(arg.params.predictionId).toBe("pred-2");
    expect(arg.body.actualMetrics).toMatchObject({ hook: 3 });
    // §C-4:前端不传 run,服务端自建 manual run。
    expect(arg.body.ingestionRunId).toBeUndefined();
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("renders the 发布后回流对照 table with 预测/真实/偏差 columns", () => {
    renderWorkbench();
    const reflow = screen.getByTestId("calibration-reflow");
    expect(within(reflow).getByTestId("reflow-row")).toBeTruthy();
    expect(within(reflow).getByText("AI 产出差不是工具的锅")).toBeTruthy();
    expect(within(reflow).getByText("评估维度")).toBeTruthy();
    expect(within(reflow).getByText("真实分")).toBeTruthy();
  });

  it("经验沉淀 / AI 编导诊断常驻栏已删(用户裁决:经验归经验模块)", () => {
    renderWorkbench();
    expect(screen.queryByTestId("calibration-learnings")).toBeNull();
    expect(screen.queryByText("经验沉淀")).toBeNull();
    expect(screen.queryByTestId("calibration-diagnosis")).toBeNull();
    expect(screen.queryByText("AI 编导诊断")).toBeNull();
    // learnings 数据仍在 props 里(契约未改)但页面不渲染它。
    expect(screen.queryByText("钩子要前3秒给反差")).toBeNull();
  });

  it("拉取抖音真实表现(采集回收一步)→ refreshDouyin then refresh", async () => {
    renderWorkbench();
    fireEvent.click(screen.getByTestId("refresh-douyin-button"));
    await waitFor(() =>
      expect(mockClient.refreshDouyin).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(screen.getByText(/已更新 2 条作品的真实表现/)).toBeTruthy();
  });

  it("empty data renders honest empty states (引导去稿面发布包区,不 crash 不造假)", () => {
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
    expect(screen.getByTestId("predictions-empty").textContent).toContain(
      "发布包区",
    );
    expect(screen.getByTestId("pending-empty")).toBeTruthy();
    expect(screen.getByTestId("reflow-empty")).toBeTruthy();
  });

  it("侧栏只列未预测的内容 —— 已锁定/已回流的主体不重复出现在发起新预测里", () => {
    const overview: CalibrationOverviewResource = {
      ...OVERVIEW,
      pendingSubjects: [
        ...OVERVIEW.pendingSubjects,
        {
          subjectType: "content_output",
          subjectId: "dy-out-05",
          title: "等待回流的作品",
          platform: "抖音",
          badge: "locked",
          predictionId: "pred-2",
        },
      ],
    };
    renderWorkbench({ overview });
    const rail = screen.getByTestId("calibration-new-prediction");
    const rows = within(rail).getAllByTestId("pending-subject-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-subject-id")).toBe("dy-out-09");
  });
});
