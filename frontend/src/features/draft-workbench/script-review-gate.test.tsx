import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 稿面编导文案审核门(T-086 SPEC §3 · T-103b 对话化 · **T-108 修真**)测试:
//  - 未审:显「未审」提示 +「审核」按钮(不报错)。
//  - 有报告:verdict 徽章 + summary + modelLabel(非专用醒目)+ L1/L2 命中列表。
//  - 报告版本 < 当前脚本版本:显「稿已改动,建议重审」+ 软门提示条。
//  - [T-108]「审核」→ **先 flush 保存编辑器最新** → **自动发进稿面右栏常驻 rail**
//    (onOpenChat: fn=review.script + selection=content_output + autoSend),不再 router.push
//    深链开全局弹层、不再后台 triggerScriptReview 轮询(审核/改写在对话卡 ChatReviewReportCard 里完成)。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  // [T-103b] 深链前先自愈铸 content_output 挂点(纯站内项目还没铸时)。
  createOutput: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "co-1" }),
  ),
  // 改写确认门链(readCurrentVersion → createArtifactVersion → restoreArtifact)。
  getArtifact: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ id: "a1", currentVersionId: "v2" }),
  ),
  listArtifactVersions: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve([
        {
          id: "v2",
          versionNumber: 2,
          contentText: "开头私信我领取",
          contentData: { sections: [{ id: "s1", heading: "开场", body: "开头私信我领取" }] },
        },
      ]),
  ),
  createArtifactVersion: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "v3", versionNumber: 3 }),
  ),
  restoreArtifact: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "a1" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    getArtifact: (i: unknown) => mockClient.getArtifact(i),
    listArtifactVersions: (i: unknown) => mockClient.listArtifactVersions(i),
    createArtifactVersion: (i: unknown) => mockClient.createArtifactVersion(i),
    restoreArtifact: (i: unknown) => mockClient.restoreArtifact(i),
  },
}));

import { ScriptReviewGate, ReviewSoftGateHint } from "./script-review-gate";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
  type DraftChatRequest,
} from "./draft-chat-request";
import type { ScriptReviewReportResource } from "@creatoros/contract";

const passReport: ScriptReviewReportResource = {
  id: "rep-0",
  projectId: "p1",
  artifactId: "a1",
  artifactVersion: 2,
  verdict: "pass",
  summary: "通过。",
  lintFindings: [
    {
      ruleId: "r1",
      quote: "第一",
      offset: 0,
      tier: "official_hard",
      category: "绝对化",
      replacement: "较早",
      note: "公约34",
    },
  ],
  llmFindings: [
    {
      quote: "私信我",
      category: "导流",
      severity: "warn",
      reason: "疑似站外导流",
      suggestion: "评论区交流",
      ruleRef: null,
    },
  ],
  modelLabel: "默认模型(非专用审核模型)",
  reviewedAt: "2026-07-03T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// [T-108] 测试探针 + Provider 包装:捕获 rail 收到的对话请求,并注册 mock flushSave(编辑器 flush
// 替身)记录调用顺序。稿面「审核」按钮 → context.flushSave + openChat。
let capturedRequest: DraftChatRequest | null = null;
const callOrder: string[] = [];
const flushSaveMock = vi.fn(async () => {
  callOrder.push("flush");
});
function ChatRequestProbe() {
  const { request, registerFlush } = useDraftChatRequest();
  capturedRequest = request;
  React.useEffect(() => {
    if (request) callOrder.push("openChat");
  }, [request]);
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

describe("ScriptReviewGate(稿面审核门,T-086 · T-103b · T-108 自动发+flush)", () => {
  it("未审:显「未审」提示 +「审核」按钮,不报错", () => {
    render(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={1}
        initialReport={null}
      />,
    );
    expect(screen.getByTestId("script-review-unreviewed")).toBeTruthy();
    expect(screen.getByTestId("script-review-trigger")).toBeTruthy();
  });

  it("有报告:verdict 徽章 + L1/L2 命中 + 非专用模型醒目标注 + 版本过期提示", () => {
    render(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={3}
        initialReport={passReport}
      />,
    );
    expect(screen.getByTestId("script-review-verdict").textContent).toContain(
      "通过",
    );
    // 报告 v2 < 当前 v3 → 过期提示。
    expect(screen.getByTestId("script-review-stale")).toBeTruthy();
    // 非专用模型醒目标注。
    const model = screen.getByTestId("script-review-model");
    expect(model.textContent).toContain("非专用");
    // L1 + L2 命中各一条。
    const findings = screen.getByTestId("script-review-findings");
    expect(findings.textContent).toContain("第一");
    expect(findings.textContent).toContain("私信我");
    // 「应用改写」确认门可用(两条命中各带 replacement/suggestion → 两个应用按钮)。
    const apply = document.querySelectorAll(
      '[data-slot="script-review-apply-rewrite"]',
    );
    expect(apply.length).toBe(2);
    expect((apply[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("[T-108]「审核」→ flush 保存最新 → 自动发进稿面右栏常驻 rail(fn=review.script + autoSend,不再 router.push 深链/后台轮询)", async () => {
    renderWithProvider(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={3}
        initialReport={null}
      />,
    );
    fireEvent.click(screen.getByTestId("script-review-trigger"));
    // 先 flush 保存编辑器最新内容(审最新版,非 DB 旧版)。
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    // 对话请求进 rail:置顶 review.script + content_output selection + autoSend + 审核话术。
    await waitFor(() => expect(capturedRequest).not.toBeNull());
    expect(capturedRequest!.functionKey).toBe("review.script");
    expect(capturedRequest!.autoSend).toBe(true);
    expect(capturedRequest!.selection).toEqual({
      kind: "content_output",
      id: "co-1",
      title: "标题",
    });
    expect(capturedRequest!.prefill.length).toBeGreaterThan(0);
    // 链序:flush 在 openChat(请求到达)之前。
    expect(callOrder.indexOf("flush")).toBeLessThan(callOrder.indexOf("openChat"));
    // 绝不再 router.push 开全局弹层;已有 outputId → 不再自愈铸 output。
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockClient.createOutput).not.toHaveBeenCalled();
  });

  it("[T-108]「审核」无 outputId → flush → 先自愈铸 content_output 再自动发带其 id", async () => {
    renderWithProvider(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId={null}
        currentVersion={1}
        initialReport={null}
      />,
    );
    fireEvent.click(screen.getByTestId("script-review-trigger"));
    await waitFor(() => expect(flushSaveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(mockClient.createOutput).toHaveBeenCalledWith({
        params: { projectId: "p1" },
        query: undefined,
        body: { title: "标题" },
      });
    });
    await waitFor(() => expect(capturedRequest).not.toBeNull());
    expect(capturedRequest!.selection?.id).toBe("co-1"); // 用自愈铸出的 output id
    expect(capturedRequest!.autoSend).toBe(true);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("改写确认门:点「应用改写」→ 单点替换 → createArtifactVersion(不自动改稿)", async () => {
    render(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={2}
        initialReport={passReport}
      />,
    );
    // 渲染时不应有任何写入调用(改写是候选,非自动)。
    expect(mockClient.createArtifactVersion).not.toHaveBeenCalled();

    // 点 L2 命中「私信我」→「评论区交流」的应用按钮(第 2 个,L1 在前 L2 在后)。
    const apply = document.querySelectorAll(
      '[data-slot="script-review-apply-rewrite"]',
    );
    fireEvent.click(apply[1] as HTMLButtonElement);

    await waitFor(() => {
      expect(mockClient.createArtifactVersion).toHaveBeenCalledTimes(1);
    });
    const call = mockClient.createArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: { contentText: string; contentData?: { sections: { body?: string }[] } };
    };
    expect(call.params.artifactId).toBe("a1");
    // 命中片段被替换,原文其余保留(单点替换,不是重写全文)。
    expect(call.body.contentData?.sections[0]?.body).toBe("开头评论区交流领取");
    // 写后出「已应用 · 撤销」。
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="script-review-rewrite-applied"]'),
      ).toBeTruthy();
    });
  });

  it("改写确认门:「撤销」→ restoreArtifact 回写前版本", async () => {
    render(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={2}
        initialReport={passReport}
      />,
    );
    const apply = document.querySelectorAll(
      '[data-slot="script-review-apply-rewrite"]',
    );
    fireEvent.click(apply[1] as HTMLButtonElement);
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="script-review-rewrite-undo"]'),
      ).toBeTruthy();
    });
    fireEvent.click(
      document.querySelector(
        '[data-slot="script-review-rewrite-undo"]',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(mockClient.restoreArtifact).toHaveBeenCalledWith({
        params: { artifactId: "a1" },
        query: undefined,
        body: { versionId: "v2" },
      });
    });
  });
});

describe("ReviewSoftGateHint(软门提示,不阻断)", () => {
  it("无报告 → 显提示 +「先去审核」", () => {
    render(<ReviewSoftGateHint report={null} currentVersion={2} />);
    expect(screen.getByTestId("script-review-soft-gate")).toBeTruthy();
    expect(screen.getByTestId("script-review-soft-gate-action")).toBeTruthy();
  });

  it("verdict=pass 且版本一致 → 不显提示", () => {
    render(
      <ReviewSoftGateHint
        report={{ ...passReport, verdict: "pass", artifactVersion: 2 }}
        currentVersion={2}
      />,
    );
    expect(screen.queryByTestId("script-review-soft-gate")).toBeNull();
  });

  it("verdict≠pass → 显提示(不禁用原动作,operations 不阻断)", () => {
    render(
      <ReviewSoftGateHint
        report={{ ...passReport, verdict: "block", artifactVersion: 2 }}
        currentVersion={2}
      />,
    );
    expect(screen.getByTestId("script-review-soft-gate").textContent).toContain(
      "阻断",
    );
  });
});

// 契约 client 装配 smoke(T-086 item 1):6 个新 op 都在 typed client 上可调(自 ENDPOINTS
// 自动生成,方法名 = ENDPOINTS 键)。用真 ENDPOINTS + createClient 铸一个 client(绕开本
// 文件对 @/lib/contract-client 的 mock)—— 方法存在即证明装配路径打通。
describe("contract client 装配 smoke(reviewRules.* + scriptReviews.*)", () => {
  it("6 个新 op 方法都在 client 上暴露", async () => {
    const { ENDPOINTS, createClient } = await import("@creatoros/contract");
    const smokeClient = createClient(ENDPOINTS, {
      request: () => Promise.resolve({}),
    });
    for (const m of [
      "listReviewRules",
      "createReviewRule",
      "patchReviewRule",
      "deleteReviewRule",
      "getLatestScriptReview",
      "triggerScriptReview",
    ] as const) {
      expect(typeof (smokeClient as Record<string, unknown>)[m]).toBe(
        "function",
      );
    }
  });
});
