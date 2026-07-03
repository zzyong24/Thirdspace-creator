import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 复盘页「预测 vs 实际」对照(T-063e)测试:
//  - buildPredictionComparison:本项目 subject(outputs + publications)命中的盲预测
//    才入行;回流行按 predictionId 关联;无预测 → null(诚实);读失败按区降级。
//  - PredictionComparisonSection:已回流渲逐维度 预测/真实/偏差;未回流显「等待
//    发布数据回流」;vm=null → 「本项目未做盲预测」空态。

import {
  buildPredictionComparison,
  type PredictionComparisonClient,
} from "./review-workspace-data";
import { PredictionComparisonSection } from "./prediction-comparison-section";

afterEach(() => cleanup());

const PREDICTIONS = [
  {
    id: "pred-1",
    subjectType: "content_output",
    subjectId: "out-1",
    status: "locked",
    predictedScore: 3.8,
    lockedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "pred-other",
    subjectType: "content_output",
    subjectId: "out-other-project",
    status: "locked",
    predictedScore: 2.0,
    lockedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

const OVERVIEW = {
  reflowRows: [
    {
      predictionId: "pred-1",
      subjectId: "out-1",
      deviationBand: "mid",
      reason: "钩子高估",
      dimensions: [
        { key: "hook", label: "钩子强度", predicted: 4, actual: 3, deviation: -1 },
      ],
    },
  ],
};

function makeClient(
  over: Partial<Record<keyof PredictionComparisonClient, unknown>> = {},
): PredictionComparisonClient {
  return {
    listOutputs: vi.fn().mockResolvedValue([{ id: "out-1" }]),
    listPublications: vi.fn().mockResolvedValue([{ id: "pub-1" }]),
    listPredictions: vi.fn().mockResolvedValue(PREDICTIONS),
    overview: vi.fn().mockResolvedValue(OVERVIEW),
    ...(over as object),
  } as PredictionComparisonClient;
}

describe("buildPredictionComparison(复盘对照读侧,T-063e)", () => {
  it("只收本项目 subject 命中的盲预测,回流行按 predictionId 关联", async () => {
    const vm = await buildPredictionComparison("proj-1", makeClient());
    expect(vm).not.toBeNull();
    expect(vm!.rows).toHaveLength(1);
    const row = vm!.rows[0]!;
    expect(row.predictionId).toBe("pred-1");
    expect(row.predictedScore).toBe(3.8);
    expect(row.status).toBe("locked");
    expect(row.reflow).not.toBeNull();
    expect(row.reflow!.deviationBand).toBe("mid");
    expect(row.reflow!.dimensions[0]!.deviation).toBe(-1);
  });

  it("本项目无盲预测 → null;outputs 读失败 → null(诚实空,不编造)", async () => {
    const noHit = await buildPredictionComparison(
      "proj-1",
      makeClient({ listPredictions: vi.fn().mockResolvedValue([]) }),
    );
    expect(noHit).toBeNull();
    const readFail = await buildPredictionComparison(
      "proj-1",
      makeClient({ listOutputs: vi.fn().mockRejectedValue(new Error("boom")) }),
    );
    expect(readFail).toBeNull();
  });

  it("overview 读失败 → 预测行保留、reflow=null(按区降级,不沉整块)", async () => {
    const vm = await buildPredictionComparison(
      "proj-1",
      makeClient({ overview: vi.fn().mockRejectedValue(new Error("boom")) }),
    );
    expect(vm!.rows[0]!.reflow).toBeNull();
  });
});

describe("PredictionComparisonSection(复盘对照展示,T-063e)", () => {
  it("已回流:渲染预测分 + 逐维度 预测/真实/偏差 表", () => {
    render(
      <PredictionComparisonSection
        vm={{
          rows: [
            {
              predictionId: "pred-1",
              status: "locked",
              predictedScore: 3.8,
              lockedAt: "2026-07-01T00:00:00.000Z",
              reflow: {
                deviationBand: "mid",
                reason: "钩子高估",
                dimensions: [
                  {
                    key: "hook",
                    label: "钩子强度",
                    predicted: 4,
                    actual: 3,
                    deviation: -1,
                  },
                ],
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("comparison-predicted-score").textContent).toBe(
      "3.8",
    );
    const row = screen.getByTestId("prediction-comparison-row");
    expect(row.textContent).toContain("钩子强度");
    expect(row.textContent).toContain("钩子高估");
    expect(row.textContent).toContain("中偏差");
  });

  it("未回流:显示「等待发布数据回流」;vm=null → 诚实空态「本项目未做盲预测」", () => {
    render(
      <PredictionComparisonSection
        vm={{
          rows: [
            {
              predictionId: "pred-1",
              status: "locked",
              predictedScore: 3.8,
              lockedAt: null,
              reflow: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("comparison-awaiting-reflow")).toBeInTheDocument();
    cleanup();
    render(<PredictionComparisonSection vm={null} />);
    expect(
      screen.getByTestId("prediction-comparison-empty").textContent,
    ).toContain("本项目未做盲预测");
  });
});
