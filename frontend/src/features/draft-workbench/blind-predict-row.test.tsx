import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 稿面盲预测入口(T-063e → T-103a)测试:
//  - 未预测:提示行 +「先盲预测」→ **不再** createAITask 轮询;点击 = 确保 content_output
//    挂点(无 output 时先 createOutput)→ router.push 深链打开稿面右栏编导对话
//    (?copilot=open&surface=project&fn=calibration.diagnose&selKind=content_output&selId=…
//    &prefill=…),诊断/锁定在对话卡里完成。
//  - 已预测:显示真实 predictedScore(服务端派生)+ 状态;草稿态「锁定预测」→
//    lockPrediction + refresh(对话锁定的补锁兜底);已锁定不再显锁定按钮,深链校准历史。

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
  lockPrediction: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
  },
}));

import { BlindPredictRow } from "./blind-predict-row";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlindPredictRow(稿面发布包区盲预测入口,T-103a 对话化)", () => {
  it("未预测(已有 output):「先盲预测」→ router.push 深链打开对话,不再 createAITask 轮询", async () => {
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
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    const href = mockRouter.push.mock.calls[0]![0] as string;
    // query-only 深链:开右栏对话(surface=project)+ 预调 calibration.diagnose + 带 content_output selection + 预填。
    expect(href.startsWith("?")).toBe(true);
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=project");
    expect(href).toContain("fn=calibration.diagnose");
    expect(href).toContain("selKind=content_output");
    expect(href).toContain("selId=out-1");
    expect(href).toContain("prefill=");
    // 已迁移:不再走后台轮询流,不 createAITask,不重复铸 output。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
  });

  it("未预测且无 output:先 createOutput 铸挂点,深链 selId 带新 output id", async () => {
    render(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId={null}
        prediction={null}
      />,
    );
    fireEvent.click(screen.getByTestId("blind-predict-button"));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    expect(mockClient.createOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: "proj-1" },
        body: { title: "AI 原生浏览器实测" },
      }),
    );
    const href = mockRouter.push.mock.calls[0]![0] as string;
    expect(href).toContain("selId=out-new");
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("已预测(草稿):显示真实预测分 +「锁定预测」补锁 → lockPrediction + refresh", async () => {
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
