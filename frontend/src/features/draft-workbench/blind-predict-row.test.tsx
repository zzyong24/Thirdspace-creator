import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 稿面盲预测入口(T-063e → T-103a → **T-108 修真**)测试:
//  - 未预测:提示行 +「先盲预测」→ **不再** createAITask 轮询、**不再** router.push 深链开全局弹层;
//    点击 = **先 flush 保存编辑器最新** → 确保 content_output 挂点(无 output 时先 createOutput)
//    → **onOpenChat 自动发进稿面右栏常驻 rail**(functionKey=calibration.diagnose +
//    selection=content_output + autoSend=true + 盲预测话术),诊断/锁定在对话卡里完成。
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
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
  type DraftChatRequest,
} from "./draft-chat-request";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// [T-108] 测试探针:挂在同一个 Provider 下,把 rail 收到的对话请求暴露给断言,并注册一个
// mock flushSave(= 编辑器 flush 的替身)记录调用顺序。稿面按钮 → context.flushSave + openChat。
let capturedRequest: DraftChatRequest | null = null;
const callOrder: string[] = [];
const flushSaveMock = vi.fn(async () => {
  callOrder.push("flush");
});
function ChatRequestProbe() {
  const { request, registerFlush } = useDraftChatRequest();
  capturedRequest = request;
  // 记录「按钮触发的请求」在 flush 之后到达(链:flush → openChat)。
  React.useEffect(() => {
    if (request) callOrder.push("openChat");
  }, [request]);
  // 注册 mock flush(替编辑器)——按钮 flushSave() 会调它。
  React.useEffect(() => {
    registerFlush(flushSaveMock);
    return () => registerFlush(null);
  }, [registerFlush]);
  return null;
}
function renderWithProvider(ui: React.ReactNode) {
  return render(
    <DraftChatRequestProvider>
      {ui}
      <ChatRequestProbe />
    </DraftChatRequestProvider>,
  );
}

afterEach(() => {
  capturedRequest = null;
  callOrder.length = 0;
  flushSaveMock.mockClear();
});

describe("BlindPredictRow(稿面发布包区盲预测入口,T-103a → T-108 预填常驻 rail)", () => {
  it("未预测(已有 output):「先盲预测」→ flush 保存 → onOpenChat 自动发进 rail(不再 router.push 深链、不再 createAITask 轮询)", async () => {
    renderWithProvider(
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
    // [T-108 v2] 先 flush 保存编辑器最新内容(诊断最新版)。
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    // 对话请求进 rail(context):置顶 calibration.diagnose + content_output selection + autoSend + 盲预测话术。
    await waitFor(() => expect(capturedRequest).not.toBeNull());
    expect(capturedRequest!.functionKey).toBe("calibration.diagnose");
    expect(capturedRequest!.autoSend).toBe(true);
    expect(capturedRequest!.selection).toEqual({
      kind: "content_output",
      id: "out-1",
      title: "AI 原生浏览器实测",
    });
    expect(capturedRequest!.prefill.length).toBeGreaterThan(0);
    // nonce 单调(SSR 安全计数器,非 Date.now/Random)—— 首次点击 = 1。
    expect(capturedRequest!.nonce).toBe(1);
    // 链序:flush 在 openChat(请求到达)之前(先保存最新,再自动发)。
    expect(callOrder.indexOf("flush")).toBeLessThan(callOrder.indexOf("openChat"));
    // 已迁移:绝不再 router.push 开全局弹层,不 createAITask 轮询,不重复铸 output。
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
  });

  it("未预测且无 output:flush → createOutput 铸挂点,rail 请求 selection.id 带新 output id", async () => {
    renderWithProvider(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId={null}
        prediction={null}
      />,
    );
    fireEvent.click(screen.getByTestId("blind-predict-button"));
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClient.createOutput).toHaveBeenCalled());
    expect(mockClient.createOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: "proj-1" },
        body: { title: "AI 原生浏览器实测" },
      }),
    );
    await waitFor(() => expect(capturedRequest).not.toBeNull());
    expect(capturedRequest!.selection?.id).toBe("out-new");
    expect(capturedRequest!.autoSend).toBe(true);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockClient.createAITask).not.toHaveBeenCalled();
  });

  it("已预测(草稿):显示真实预测分 +「锁定预测」补锁 → lockPrediction + refresh", async () => {
    renderWithProvider(
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
    renderWithProvider(
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
