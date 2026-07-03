import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 设置「校准」页签深度形态(T-063e)测试:
//  ① rubric 规则库:维度权重真值渲染;编辑权重(和=1)→ client.bumpRubricVersion + refresh;
//    和≠1 时保存禁用(不发假写)。
//  ② 待采纳规则建议:pending 行渲染 rationale/建议权重;「采纳」→ adoptRuleSuggestion;
//    「忽略」→ dismissRuleSuggestion(真 op,终态);空列表 → 诚实空态。
//  ③ 校准历史:已锁定待回流行(带录入入口)+ 回流对照表;全空 → 诚实空态。
// Deterministic —— mock client 即时 resolve,渲染无网络/时钟。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  bumpRubricVersion: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  adoptRuleSuggestion: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  dismissRuleSuggestion: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve(i),
  ),
  getPrediction: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ predictedConversion: { dimensions: [] } }),
  ),
  createResult: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createAITask: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "task-1" }),
  ),
  getTask: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  listTaskResults: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  confirmTask: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    bumpRubricVersion: (i: unknown) => mockClient.bumpRubricVersion(i),
    adoptRuleSuggestion: (i: unknown) => mockClient.adoptRuleSuggestion(i),
    dismissRuleSuggestion: (i: unknown) => mockClient.dismissRuleSuggestion(i),
    getPrediction: (i: unknown) => mockClient.getPrediction(i),
    createResult: (i: unknown) => mockClient.createResult(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
  },
}));

import { CalibrationSettingsPanel } from "./calibration-settings-panel";
import type {
  CalibrationOverviewResource,
  CalibrationRuleSuggestionResource,
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
    versionNumber: 3,
    dimensions: [
      { key: "hook", label: "钩子强度", weight: 0.5 },
      { key: "cta", label: "CTA 清晰度", weight: 0.5 },
    ],
    changeSummary: "",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  createdAt: "2026-07-01T00:00:00.000Z",
};

const SUGGESTION: CalibrationRuleSuggestionResource = {
  id: "sug-1",
  userId: "user-a",
  learningId: "learning-1",
  rubricId: "rubric-canonical",
  status: "pending",
  proposedDimension: {
    key: "altruism",
    label: "利他性",
    weight: 0.2,
    description: "复盘回流维度",
  },
  rationale: "利他导向的内容完播显著更高",
  adoptedVersionId: null,
  createdAt: "2026-07-02T00:00:00.000Z",
  adoptedAt: null,
};

const OVERVIEW: CalibrationOverviewResource = {
  kpis: {
    lockedPredictions: 1,
    completedReflows: 1,
    avgDeviationBand: "low",
    latestFinding: "钩子维度普遍高估",
  },
  pendingSubjects: [
    {
      subjectType: "content_output",
      subjectId: "out-1",
      title: "AI 原生浏览器实测",
      platform: "douyin",
      badge: "locked",
      predictionId: "pred-1",
    },
  ],
  reflowRows: [
    {
      predictionId: "pred-0",
      subjectId: "out-0",
      dimensions: [
        { key: "hook", label: "钩子强度", predicted: 4, actual: 3, deviation: -1 },
      ],
      deviationBand: "mid",
      reason: "开头 3 秒信息密度不足",
    },
  ],
  learnings: [],
};

const EMPTY_OVERVIEW: CalibrationOverviewResource = {
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(
  over: Partial<React.ComponentProps<typeof CalibrationSettingsPanel>> = {},
) {
  return render(
    <CalibrationSettingsPanel
      rubric={RUBRIC}
      suggestions={[SUGGESTION]}
      overview={OVERVIEW}
      subjectTitles={{ "out-0": "旧作品对照", "out-1": "AI 原生浏览器实测" }}
      {...over}
    />,
  );
}

describe("CalibrationSettingsPanel(设置「校准」页签,T-063e)", () => {
  it("① 规则库:渲染真实维度与权重;编辑态改权重(和=1)→ bumpRubricVersion + refresh", async () => {
    renderPanel();
    const rows = screen.getAllByTestId("rubric-dimension-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("钩子强度");
    expect(rows[0]!.textContent).toContain("50%");

    fireEvent.click(screen.getByTestId("rubric-edit-button"));
    fireEvent.change(screen.getByLabelText("钩子强度 权重"), {
      target: { value: "0.6" },
    });
    fireEvent.change(screen.getByLabelText("CTA 清晰度 权重"), {
      target: { value: "0.4" },
    });
    fireEvent.click(screen.getByTestId("rubric-save-button"));
    await waitFor(() => expect(mockClient.bumpRubricVersion).toHaveBeenCalled());
    const call = mockClient.bumpRubricVersion.mock.calls[0]![0] as {
      params: { rubricId: string };
      body: { dimensions: Array<{ key: string; weight: number }> };
    };
    expect(call.params.rubricId).toBe("rubric-canonical");
    expect(call.body.dimensions).toEqual([
      { key: "hook", label: "钩子强度", weight: 0.6 },
      { key: "cta", label: "CTA 清晰度", weight: 0.4 },
    ]);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("① 规则库:权重和≠1 时保存禁用(不发假写);无 rubric → 诚实空态", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("rubric-edit-button"));
    fireEvent.change(screen.getByLabelText("钩子强度 权重"), {
      target: { value: "0.9" },
    });
    const save = screen.getByTestId("rubric-save-button");
    expect(save).toBeDisabled();
    expect(mockClient.bumpRubricVersion).not.toHaveBeenCalled();
    cleanup();
    renderPanel({ rubric: null });
    expect(screen.getByTestId("rubric-empty")).toBeInTheDocument();
  });

  it("② 待采纳建议:渲染 rationale + 建议权重;采纳 → adoptRuleSuggestion;忽略 → dismissRuleSuggestion", async () => {
    renderPanel();
    const row = screen.getByTestId("rule-suggestion-row");
    expect(row.textContent).toContain("利他性");
    expect(row.textContent).toContain("建议权重 20%");
    expect(row.textContent).toContain("利他导向的内容完播显著更高");

    fireEvent.click(screen.getByTestId("suggestion-adopt-button"));
    await waitFor(() =>
      expect(mockClient.adoptRuleSuggestion).toHaveBeenCalledWith(
        expect.objectContaining({ params: { suggestionId: "sug-1" } }),
      ),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());

    cleanup();
    vi.clearAllMocks();
    renderPanel();
    fireEvent.click(screen.getByTestId("suggestion-dismiss-button"));
    await waitFor(() =>
      expect(mockClient.dismissRuleSuggestion).toHaveBeenCalledWith(
        expect.objectContaining({ params: { suggestionId: "sug-1" } }),
      ),
    );
    expect(mockClient.adoptRuleSuggestion).not.toHaveBeenCalled();
  });

  it("② 待采纳建议:空列表 → 诚实空态(指去经验裁决台回流)", () => {
    renderPanel({ suggestions: [] });
    expect(screen.getByTestId("suggestions-empty")).toBeInTheDocument();
  });

  it("③ 校准历史:已锁定待回流行(带录入真实表现入口)+ 回流对照表;全空 → 诚实空态", () => {
    renderPanel();
    const locked = screen.getByTestId("locked-pending-row");
    expect(locked.textContent).toContain("AI 原生浏览器实测");
    expect(screen.getByTestId("record-result-trigger")).toBeInTheDocument();
    // 回流对照表(复用 ReflowTable)渲染逐维度真值。
    const reflow = screen.getByTestId("reflow-row");
    expect(reflow.textContent).toContain("旧作品对照");
    expect(reflow.textContent).toContain("开头 3 秒信息密度不足");

    cleanup();
    renderPanel({ overview: EMPTY_OVERVIEW });
    expect(screen.getByTestId("calibration-history-empty")).toBeInTheDocument();
  });
});
