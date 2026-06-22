import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Calibration island wiring test (Step 5). Proves the needs-backend controls each issue
// their mapped contract op then router.refresh() (the island → client.* →
// router.refresh seam): 盲预测→createPrediction, 锁定预测→lockPrediction, 回流校准→
// createResult, 新建评分维度版本→bumpRubricVersion. Also proves the decorative controls
// (据此修正定位, 采纳 AI 盲预测) issue NO Calibration network call. Deterministic — the
// mock client resolves immediately, no network/clock.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createPrediction: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "pred-new" }),
  ),
  lockPrediction: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createResult: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  bumpRubricVersion: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve(i),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createPrediction: (i: unknown) => mockClient.createPrediction(i),
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
    createResult: (i: unknown) => mockClient.createResult(i),
    bumpRubricVersion: (i: unknown) => mockClient.bumpRubricVersion(i),
  },
}));

import {
  BlindPredictForm,
  PredictionRow,
  BumpRubricVersionButton,
  ReviseFromCalibrationButton,
  AdoptAiPredictionButton,
} from "./calibration-interactive-region";
import type { PredictionResource } from "@/server/modules/calibration";

const DRAFT: PredictionResource = {
  id: "pred-1",
  userId: "user-a",
  subjectType: "content_output",
  subjectId: "output-1",
  rubricVersionId: "rubricver-1",
  predictedMetrics: {},
  predictedConversion: {},
  predictedScore: 19,
  confidence: "high",
  status: "draft",
  lockedAt: null,
  createdAt: "2026-06-21T00:00:00.000Z",
};

const LOCKED: PredictionResource = {
  ...DRAFT,
  id: "pred-2",
  status: "locked",
  lockedAt: "2026-06-21T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("calibration island wiring", () => {
  it("盲预测 → createPrediction then router.refresh", async () => {
    render(<BlindPredictForm rubricVersionId="rubricver-1" />);
    fireEvent.change(screen.getByLabelText("预测内容 id"), {
      target: { value: "output-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "盲预测" }));
    await waitFor(() =>
      expect(mockClient.createPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createPrediction.mock.calls[0]![0] as {
      body: { subjectId: string; rubricVersionId: string };
    };
    expect(arg.body.subjectId).toBe("output-9");
    expect(arg.body.rubricVersionId).toBe("rubricver-1");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("renders anchored scoring rows (default merged dims) with 0/3/5 guidance", () => {
    render(<BlindPredictForm rubricVersionId="rubricver-1" />);
    // Merged 传播+变现 rubric: 6 anchored dimensions, each with its anchor description
    // + a 0-5 score select, so scoring is anchored not blind.
    expect(screen.getAllByTestId(/^rubric-scoring-row-/)).toHaveLength(6);
    expect(screen.getByTestId("rubric-scoring-row-hook")).toBeTruthy();
    expect(screen.getByTestId("rubric-scoring-row-emotion")).toBeTruthy();
    expect(screen.getByTestId("rubric-scoring-row-quotable")).toBeTruthy();
    // Anchor text rendered as guidance.
    expect(screen.getByText(/无法停止处理的具体场景或断言/)).toBeTruthy();
    // Per-dimension 0-5 score input present.
    expect(
      screen.getByLabelText("钩子强度 评分（0-5，对照锚点）"),
    ).toBeTruthy();
  });

  it("prefers server RubricVersion dimensions when passed (anchors flow through)", () => {
    render(
      <BlindPredictForm
        rubricVersionId="rubricver-1"
        dimensions={[
          {
            key: "hook",
            label: "钩子强度",
            weight: 1,
            description: "服务端锚点描述",
          },
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^rubric-scoring-row-/);
    expect(rows).toHaveLength(1);
    expect(screen.getByText("服务端锚点描述")).toBeTruthy();
  });

  it("GAP-CAL-1: per-dim scores are threaded into createPrediction.predictedConversion", async () => {
    // Use a single explicit dimension so the expected predictedConversion is exact.
    render(
      <BlindPredictForm
        rubricVersionId="rubricver-1"
        dimensions={[
          { key: "hook", label: "钩子强度", weight: 1, description: "锚点" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("预测内容 id"), {
      target: { value: "output-x" },
    });
    // Score the dimension — now PERSISTED via predictedConversion (no longer local-only).
    fireEvent.change(screen.getByLabelText("钩子强度 评分（0-5，对照锚点）"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "盲预测" }));
    await waitFor(() =>
      expect(mockClient.createPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createPrediction.mock.calls[0]![0] as {
      body: Record<string, unknown>;
    };
    expect(arg.body).toEqual({
      subjectType: "content_output",
      subjectId: "output-x",
      rubricVersionId: "rubricver-1",
      predictedMetrics: {},
      // The scored dimension rides predictedConversion (key=dim.key, value=0-5) so the
      // server deriveScore computes a real 变现加权 predictedScore.
      predictedConversion: { hook: 5 },
      confidence: "med",
    });
  });

  it("GAP-CAL-1: unedited dimensions default to 3 in predictedConversion", async () => {
    render(
      <BlindPredictForm
        rubricVersionId="rubricver-1"
        dimensions={[
          { key: "hook", label: "钩子强度", weight: 0.5, description: "a" },
          { key: "cta", label: "CTA 清晰度", weight: 0.5, description: "b" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("预测内容 id"), {
      target: { value: "output-y" },
    });
    fireEvent.click(screen.getByRole("button", { name: "盲预测" }));
    await waitFor(() =>
      expect(mockClient.createPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createPrediction.mock.calls[0]![0] as {
      body: { predictedConversion: Record<string, number> };
    };
    expect(arg.body.predictedConversion).toEqual({ hook: 3, cta: 3 });
  });

  it("锁定预测 → lockPrediction (draft row only)", async () => {
    render(<PredictionRow prediction={DRAFT} />);
    fireEvent.click(screen.getByRole("button", { name: "锁定预测" }));
    await waitFor(() =>
      expect(mockClient.lockPrediction).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.lockPrediction.mock.calls[0]![0] as {
      params: { predictionId: string };
    };
    expect(arg.params.predictionId).toBe("pred-1");
  });

  it("回流校准 → createResult (locked row, with run id)", async () => {
    render(<PredictionRow prediction={LOCKED} />);
    fireEvent.change(
      screen.getByLabelText(`回流 IngestionRun ${LOCKED.id}`),
      { target: { value: "run-7" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "回流校准" }));
    await waitFor(() =>
      expect(mockClient.createResult).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createResult.mock.calls[0]![0] as {
      params: { predictionId: string };
      body: { ingestionRunId: string };
    };
    expect(arg.params.predictionId).toBe("pred-2");
    expect(arg.body.ingestionRunId).toBe("run-7");
  });

  it("回流校准 is disabled for an unlocked prediction (no createResult)", () => {
    render(<PredictionRow prediction={DRAFT} />);
    const btn = screen.getByRole("button", { name: "回流校准" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mockClient.createResult).not.toHaveBeenCalled();
  });

  it("新建评分维度版本 → bumpRubricVersion", async () => {
    render(<BumpRubricVersionButton rubricId="rubric-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "新建评分维度版本" }),
    );
    await waitFor(() =>
      expect(mockClient.bumpRubricVersion).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.bumpRubricVersion.mock.calls[0]![0] as {
      params: { rubricId: string };
    };
    expect(arg.params.rubricId).toBe("rubric-1");
  });

  it("GAP-CAL-1: flywheel buttons are disabled + 「规划中」 (no fake empty onClick)", () => {
    render(
      <>
        <ReviseFromCalibrationButton />
        <AdoptAiPredictionButton />
      </>,
    );
    const revise = screen.getByRole("button", {
      name: "据此修正定位 / 新增选题（规划中）",
    });
    const adopt = screen.getByRole("button", { name: "采纳 AI 盲预测（规划中）" });
    // Honest 「规划中」: disabled, no network call possible (no目标 op this wave).
    expect(revise).toBeDisabled();
    expect(adopt).toBeDisabled();
    expect(revise.getAttribute("data-planned")).toBe("true");
    expect(adopt.getAttribute("data-planned")).toBe("true");
    fireEvent.click(revise);
    fireEvent.click(adopt);
    expect(mockClient.createPrediction).not.toHaveBeenCalled();
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
    expect(mockClient.createResult).not.toHaveBeenCalled();
    expect(mockClient.bumpRubricVersion).not.toHaveBeenCalled();
  });
});
