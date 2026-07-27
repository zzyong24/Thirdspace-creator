import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-103a] 稿面盲预测确认卡:对话内 calibration.diagnosis 卡在稿面场景(blindPredict != null)
// 长出「锁定为盲预测」确认门。点锁定 = 走既有端点链铸 immutable locked Prediction:
//   createAITask(calibration.diagnose) → 轮询 getTask=awaiting_confirmation
//   → confirmTask 铸 draft Prediction → listPredictions 取该 subject draft → lockPrediction 定死。
// 锁定后显「已锁定·不可改」+「看复盘」。非盲预测场景(blindPredict == null)只读展示,
// 无锁定按钮(引导去校准中心)。

const routerRefresh = vi.fn();
const createOutput = vi.fn();
const createAITask = vi.fn();
const getTask = vi.fn();
const confirmTask = vi.fn();
const listPredictions = vi.fn();
const lockPrediction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (...a: unknown[]) => createOutput(...a),
    createAITask: (...a: unknown[]) => createAITask(...a),
    getTask: (...a: unknown[]) => getTask(...a),
    confirmTask: (...a: unknown[]) => confirmTask(...a),
    listPredictions: (...a: unknown[]) => listPredictions(...a),
    lockPrediction: (...a: unknown[]) => lockPrediction(...a),
  },
}));

import { ChatDiagnosisCard } from "./chat-result-cards";

const DIAGNOSIS = {
  dimensions: [
    { key: "hook", score: 4, reason: "开头强", suggestion: "保持" },
    { key: "value", score: 3, reason: "干货够", suggestion: "再具体" },
  ],
  verdict: "可发",
  mainIssues: ["结尾弱"],
  priorityFixes: ["加 CTA"],
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  // 用真定时器 + pollIntervalMs={0}(去掉真等待)让轮询链确定性推进,规避
  // fake-timer × waitFor × async-await 交织的 flaky。
  createOutput.mockResolvedValue({ id: "out-new" });
  createAITask.mockResolvedValue({ id: "task-1" });
  getTask.mockResolvedValue({ status: "awaiting_confirmation" });
  confirmTask.mockResolvedValue({ id: "task-1", status: "awaiting_confirmation" });
  listPredictions.mockResolvedValue([
    { id: "pred-9", subjectId: "out-1", status: "draft", predictedScore: 3.4 },
  ]);
  lockPrediction.mockResolvedValue({ id: "pred-9", status: "locked" });
});

describe("ChatDiagnosisCard(盲预测确认卡,T-103a)", () => {
  it("非盲预测(blindPredict=null):只读展示,无锁定按钮", () => {
    render(<ChatDiagnosisCard diagnosis={DIAGNOSIS} blindPredict={null} />);
    expect(
      document.querySelector('[data-slot="chat-diagnosis-card"]'),
    ).not.toBeNull();
    expect(screen.getByText("4 / 5")).toBeTruthy();
    expect(screen.getByText(/综合判断/)).toBeTruthy();
    expect(
      document.querySelector('[data-slot="chat-diagnosis-lock"]'),
    ).toBeNull();
    // 只读态引导去校准中心。
    expect(screen.getByText(/去校准中心/)).toBeTruthy();
  });

  it("盲预测场景:渲「锁定为盲预测」按钮 + 确认门说明(渲染不落库)", () => {
    render(
      <ChatDiagnosisCard
        diagnosis={DIAGNOSIS}
        blindPredict={{
          outputId: "out-1",
          projectId: "proj-1",
          projectTitle: "AI 原生浏览器实测",
        }}
      />,
    );
    expect(
      document.querySelector('[data-slot="chat-diagnosis-lock"]'),
    ).not.toBeNull();
    expect(screen.getByText("锁定为盲预测")).toBeTruthy();
    // 渲染阶段不触发任何写。
    expect(createAITask).not.toHaveBeenCalled();
    expect(lockPrediction).not.toHaveBeenCalled();
  });

  it("点锁定:走既有端点链(createAITask→confirmTask→listPredictions→lockPrediction)铸 immutable,已有 output 不重复铸", async () => {
    const user = userEvent.setup();
    render(
      <ChatDiagnosisCard
        diagnosis={DIAGNOSIS}
        pollIntervalMs={0}
        blindPredict={{
          outputId: "out-1",
          projectId: "proj-1",
          projectTitle: "AI 原生浏览器实测",
        }}
      />,
    );
    await user.click(screen.getByText("锁定为盲预测"));
    // 起诊断任务(既有盲预测端点),subject=已有 content_output → 不重复铸 output。
    await waitFor(() => expect(createAITask).toHaveBeenCalledTimes(1));
    expect(createOutput).not.toHaveBeenCalled();
    const taskArg = createAITask.mock.calls[0]![0] as {
      body: {
        taskType: string;
        attemptId: string;
        inputData: { subjectType: string; subjectId: string };
      };
    };
    expect(taskArg.body.taskType).toBe("calibration.diagnose");
    expect(taskArg.body.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(taskArg.body.inputData).toEqual({
      subjectType: "content_output",
      subjectId: "out-1",
    });
    // 轮询 awaiting_confirmation → confirmTask 铸 draft Prediction。
    await waitFor(() => expect(confirmTask).toHaveBeenCalledTimes(1));
    // confirm 后从 listPredictions 取该 subject draft → lockPrediction 定死(immutable)。
    await waitFor(() =>
      expect(lockPrediction).toHaveBeenCalledWith(
        expect.objectContaining({ params: { predictionId: "pred-9" } }),
      ),
    );
    // 锁定后:已锁定态 + 看复盘链接,refresh 让稿面行同步。
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="chat-diagnosis-locked"]'),
      ).not.toBeNull(),
    );
    expect(screen.getByText("已锁定 · 不可改")).toBeTruthy();
    expect(
      document.querySelector('[data-slot="chat-diagnosis-retro-link"]'),
    ).not.toBeNull();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("盲预测场景无 output:锁定时先 createOutput 铸挂点,再对新 output 起诊断", async () => {
    const user = userEvent.setup();
    listPredictions.mockResolvedValue([
      { id: "pred-new", subjectId: "out-new", status: "draft", predictedScore: 3.1 },
    ]);
    render(
      <ChatDiagnosisCard
        diagnosis={DIAGNOSIS}
        pollIntervalMs={0}
        blindPredict={{
          outputId: null,
          projectId: "proj-1",
          projectTitle: "AI 原生浏览器实测",
        }}
      />,
    );
    await user.click(screen.getByText("锁定为盲预测"));
    await waitFor(() =>
      expect(createOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { projectId: "proj-1" },
          body: { title: "AI 原生浏览器实测" },
        }),
      ),
    );
    await waitFor(() => expect(createAITask).toHaveBeenCalledTimes(1));
    const taskArg = createAITask.mock.calls[0]![0] as {
      body: { attemptId: string; inputData: { subjectId: string } };
    };
    expect(taskArg.body.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(taskArg.body.inputData.subjectId).toBe("out-new");
    await waitFor(() =>
      expect(lockPrediction).toHaveBeenCalledWith(
        expect.objectContaining({ params: { predictionId: "pred-new" } }),
      ),
    );
  });

  it("诚实:取不到 draft(如没配模型 confirm 空)→ 置 error 态,不假装锁成功", async () => {
    const user = userEvent.setup();
    listPredictions.mockResolvedValue([]); // 没铸出 draft(降级/失败)
    render(
      <ChatDiagnosisCard
        diagnosis={DIAGNOSIS}
        pollIntervalMs={0}
        blindPredict={{
          outputId: "out-1",
          projectId: "proj-1",
          projectTitle: "AI 原生浏览器实测",
        }}
      />,
    );
    await user.click(screen.getByText("锁定为盲预测"));
    await waitFor(() => expect(confirmTask).toHaveBeenCalled());
    // 取不到 draft → 不 lockPrediction,不假装锁定,显式错误提示。
    await waitFor(() => expect(screen.getByText(/锁定失败/)).toBeTruthy());
    expect(lockPrediction).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="chat-diagnosis-locked"]'),
    ).toBeNull();
  });
});
