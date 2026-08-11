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
  getPrediction: vi.fn((_i: unknown): Promise<unknown> =>
    Promise.resolve({
      predictedConversion: {
        dimensions: [
          {
            key: "hook",
            reason: "开头太慢",
            suggestion: "把结果提前到第一句",
          },
          {
            key: "cta",
            score: 4,
            reason: "行动明确",
            suggestion: "",
          },
        ],
      },
      predictedMetrics: {
        diagnosis: {
          verdict: "钩子需要前置",
          mainIssues: ["开头进入正题太晚"],
          priorityFixes: ["第一句先给结果"],
        },
      },
    }),
  ),
  getTask: vi.fn((_i: unknown): Promise<unknown> =>
    Promise.resolve({ status: "awaiting_confirmation" }),
  ),
  listTaskResults: vi.fn((_i: unknown): Promise<unknown> =>
    Promise.resolve([
      {
        resultData: {
          validationStatus: "valid",
          validationErrors: [],
          canAdopt: true,
          contentData: {
            sections: [
              {
                heading: "修订开场",
                body: "先说结果，再解释为什么。",
              },
            ],
          },
        },
      },
    ]),
  ),
  confirmTask: vi.fn((_i: unknown): Promise<unknown> =>
    Promise.resolve({ id: "task-revision-1", status: "succeeded" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    createAITask: (i: unknown) => mockClient.createAITask(i),
    lockPrediction: (i: unknown) => mockClient.lockPrediction(i),
    getPrediction: (i: unknown) => mockClient.getPrediction(i),
    getTask: (i: unknown) => mockClient.getTask(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    confirmTask: (i: unknown) => mockClient.confirmTask(i),
  },
}));

import { BlindPredictRow } from "./blind-predict-row";
import { ChatScriptDraftCard } from "../copilot/chat-script-draft-card";
import { SCRIPT_WRITE_EVENT } from "@/features/script/script-write-signal";
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
  // 在 effect 里暴露请求，避免 render 期间改模块变量破坏组件纯度；同时记录
  // 「按钮触发的请求」在 flush 之后到达(链:flush → openChat)。
  React.useEffect(() => {
    capturedRequest = request;
    if (request) callOrder.push("openChat");
  }, [request]);
  // 注册 mock flush(替编辑器)——按钮 flushSave() 会调它。
  React.useEffect(() => {
    registerFlush(flushSaveMock);
    return () => registerFlush(null);
  }, [registerFlush]);
  // 模拟常驻 Copilot 收到 script.draft 请求后返回异步任务卡：这让本测试把
  // 「建议入口 → 候选预览 → 用户采纳写回」作为一条真实交互链验证。
  return request?.functionKey === "script.draft" ? (
    <ChatScriptDraftCard
      taskId="task-revision-1"
      projectId="proj-1"
      error={null}
      pollIntervalMs={0}
    />
  ) : null;
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
          stale: false,
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

  it("已预测(已锁定):显示预测分 + 已锁定态,无锁定按钮,有盲预测结果弹窗入口", () => {
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
          stale: false,
        }}
      />,
    );
    expect(screen.getByTestId("blind-predict-score").textContent).toBe("4.2");
    expect(screen.getByText("已锁定")).toBeInTheDocument();
    expect(screen.queryByTestId("blind-predict-lock-button")).toBeNull();
    // [T-394] 原「看校准历史」深链 /settings?tab=calibration 是 404 死链,已改弹窗看盲预测结果。
    expect(
      screen.getByTestId("blind-predict-result-trigger").textContent,
    ).toContain("看盲预测结果");
  });

  it("T-767 锁定预测早于当前稿时保留历史结果，但恢复重新盲预测入口", async () => {
    renderWithProvider(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId="out-1"
        prediction={{
          predictionId: "pred-old",
          status: "locked",
          predictedScore: 4.2,
          lockedAt: "2026-07-02T00:00:00.000Z",
          stale: true,
        }}
      />,
    );

    expect(screen.getByText("稿已改动")).toBeInTheDocument();
    expect(screen.queryByText("已锁定")).toBeNull();
    expect(screen.getByTestId("blind-predict-result-trigger")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("blind-predict-button"));
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturedRequest?.functionKey).toBe("calibration.diagnose"));
  });

  it("详情缺失维度分不伪装 0，并可按建议生成修订稿候选再采纳写回", async () => {
    const onScriptWrite = vi.fn();
    window.addEventListener(SCRIPT_WRITE_EVENT, onScriptWrite);
    renderWithProvider(
      <BlindPredictRow
        projectId="proj-1"
        projectTitle="AI 原生浏览器实测"
        outputId="out-1"
        prediction={{
          predictionId: "pred-1",
          status: "locked",
          predictedScore: 4,
          lockedAt: "2026-07-02T00:00:00.000Z",
          stale: false,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("blind-predict-result-trigger"));
    await waitFor(() => expect(mockClient.getPrediction).toHaveBeenCalled());
    expect(
      await screen.findByTestId("blind-predict-dimension-score-hook"),
    ).toHaveTextContent("—/5");

    fireEvent.click(
      screen.getByRole("button", { name: "按建议修改原稿" }),
    );
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturedRequest).not.toBeNull());
    expect(capturedRequest!.functionKey).toBe("script.draft");
    expect(capturedRequest!.autoSend).toBe(true);
    expect(capturedRequest!.selection).toEqual({
      kind: "content_output",
      id: "out-1",
      title: "AI 原生浏览器实测",
    });
    expect(capturedRequest!.prefill).toContain("第一句先给结果");
    expect(capturedRequest!.prefill).toContain("把结果提前到第一句");

    // AI 只生成候选：预览出现前后都没有写回；必须由用户主动点采纳。
    expect(await screen.findByText("先说结果，再解释为什么。")).toBeInTheDocument();
    expect(mockClient.confirmTask).not.toHaveBeenCalled();
    expect(onScriptWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "采纳写入稿面" }));
    await waitFor(() =>
      expect(mockClient.confirmTask).toHaveBeenCalledWith({
        params: { taskId: "task-revision-1" },
        query: undefined,
        body: undefined,
      }),
    );
    await waitFor(() => expect(onScriptWrite).toHaveBeenCalledTimes(1));
    expect(
      (onScriptWrite.mock.calls[0]![0] as CustomEvent<{ html: string }>).detail
        .html,
    ).toContain("先说结果");
    expect(mockClient.lockPrediction).not.toHaveBeenCalled();
    window.removeEventListener(SCRIPT_WRITE_EVENT, onScriptWrite);
  });
});
