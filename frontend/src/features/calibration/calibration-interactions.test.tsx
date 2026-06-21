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

  it("decorative controls issue NO Calibration network call", () => {
    render(
      <>
        <ReviseFromCalibrationButton />
        <AdoptAiPredictionButton />
      </>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "据此修正定位 / 新增选题" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "采纳 AI 盲预测" }));
    expect(mockClient.createPrediction).not.toHaveBeenCalled();
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
    expect(mockClient.createResult).not.toHaveBeenCalled();
    expect(mockClient.bumpRubricVersion).not.toHaveBeenCalled();
  });
});
