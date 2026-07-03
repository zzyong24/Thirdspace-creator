import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 稿面盲预测入口(T-063e)测试:
//  - 未预测:提示行 +「先盲预测」→ createAITask({ calibration.diagnose, subject=本项目
//    content_output })(现有盲预测流,零新 op);无 output 时先 createOutput 铸挂点。
//  - 已预测:显示真实 predictedScore(服务端派生)+ 状态;草稿态「锁定预测」→
//    lockPrediction + refresh;已锁定不再显锁定按钮,深链校准历史。
// [留验] T-064 稿面 client 岛 dev 不水合 —— 本入口的真机点击交互待 T-064 修复后走查;
// 此处单测锁定组件行为。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockClient = {
  createOutput: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "out-new" }),
  ),
  createAITask: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "task-1" }),
  ),
  getTask: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  confirmTask: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  lockPrediction: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
  },
}));

import { BlindPredictRow } from "./blind-predict-row";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlindPredictRow(稿面发布包区盲预测入口,T-063e)", () => {
  it("未预测:提示行 +「先盲预测」→ createAITask(calibration.diagnose,subject=现有 output),不再铸 output", async () => {
    render(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId="out-1"
        prediction={null}
      />,
    );
    const row = screen.getByTestId("blind-predict-row");
    expect(row.getAttribute("data-predicted")).toBe("false");
    fireEvent.click(screen.getByTestId("blind-predict-button"));
    await waitFor(() => expect(mockClient.createAITask).toHaveBeenCalledTimes(1));
    const arg = mockClient.createAITask.mock.calls[0]![0] as {
      body: {
        taskType: string;
        inputData: { subjectType: string; subjectId: string };
      };
    };
    expect(arg.body.taskType).toBe("calibration.diagnose");
    expect(arg.body.inputData).toEqual({
      subjectType: "content_output",
      subjectId: "out-1",
    });
    // 已有 output → 不重复铸挂点;不发直接预测写。
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
  });

  it("未预测且无 output:先 createOutput 铸挂点,再对新 output 起诊断任务", async () => {
    render(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId={null}
        prediction={null}
      />,
    );
    fireEvent.click(screen.getByTestId("blind-predict-button"));
    await waitFor(() => expect(mockClient.createAITask).toHaveBeenCalledTimes(1));
    expect(mockClient.createOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: "proj-1" },
        body: { title: "AI 原生浏览器实测" },
      }),
    );
    const arg = mockClient.createAITask.mock.calls[0]![0] as {
      body: { inputData: { subjectId: string } };
    };
    expect(arg.body.inputData.subjectId).toBe("out-new");
  });

  it("已预测(草稿):显示真实预测分 +「锁定预测」→ lockPrediction + refresh", async () => {
    render(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId="out-1"
        prediction={{
          predictionId: "pred-1",
          status: "draft",
          predictedScore: 3.6,
          lockedAt: null,
        }}
      />,
    );
    expect(screen.getByTestId("blind-predict-score").textContent).toBe("3.6");
    expect(screen.getByText("草稿 · 未锁定")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("blind-predict-lock-button"));
    await waitFor(() =>
      expect(mockClient.lockPrediction).toHaveBeenCalledWith(
        expect.objectContaining({ params: { predictionId: "pred-1" } }),
      ),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("已预测(已锁定):显示预测分 + 已锁定态,无锁定按钮,深链校准历史", () => {
    render(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId="out-1"
        prediction={{
          predictionId: "pred-1",
          status: "locked",
          predictedScore: 4.2,
          lockedAt: "2026-07-02T00:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByTestId("blind-predict-score").textContent).toBe("4.2");
    expect(screen.getByText("已锁定")).toBeInTheDocument();
    expect(screen.queryByTestId("blind-predict-lock-button")).toBeNull();
    expect(
      screen.getByTestId("blind-predict-history-link").getAttribute("href"),
    ).toBe("/settings?tab=calibration");
  });
});
