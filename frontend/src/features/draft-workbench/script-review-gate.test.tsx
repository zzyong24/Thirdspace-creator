import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 稿面编导文案审核门(T-086 SPEC §3 · T-103b 对话化 · **T-108 修真**)测试:
//  - 未审:显「未审」提示 +「审核」按钮(不报错)。
//  - 有报告:verdict 徽章 + summary + 实际文本模型名 + L1/L2 命中列表。
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
  modelLabel: "MiniMax-M3",
  reviewedAt: "2026-07-03T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
  React.useEffect(() => {
    capturedRequest = request;
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

  it("有报告:verdict 徽章 + L1/L2 命中 + 通用文本模型 + 版本过期提示", () => {
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
    // 审核报告只展示实际文本模型名。
    const model = screen.getByTestId("script-review-model");
    expect(model.textContent).toContain("MiniMax-M3");
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

  it("旧版残缺报告不渲染三态、模型或命中，只提示重新审核", () => {
    render(
      <ScriptReviewGate
        projectId="p1"
        projectTitle="标题"
        outputId="co-1"
        currentVersion={2}
        initialReport={{
          ...passReport,
          verdict: "block",
          summary: "语义审核暂未完成，本报告仅包含基础规则检查。",
        }}
      />,
    );
    expect(screen.getByTestId("script-review-incomplete").textContent).toContain(
      "上次审核未完成",
    );
    expect(screen.queryByTestId("script-review-verdict")).toBeNull();
    expect(screen.queryByTestId("script-review-model")).toBeNull();
    expect(screen.getByTestId("script-review-trigger").textContent).toContain(
      "重试审核",
    );
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
    render(
      <ReviewSoftGateHint report={null} currentVersion={2} projectId="p1" />,
    );
    expect(screen.getByTestId("script-review-soft-gate")).toBeTruthy();
    expect(screen.getByTestId("script-review-soft-gate-action")).toBeTruthy();
  });

  it("verdict=pass 且版本一致 → 不显提示", () => {
    render(
      <ReviewSoftGateHint
        report={{ ...passReport, verdict: "pass", artifactVersion: 2 }}
        currentVersion={2}
        projectId="p1"
      />,
    );
    expect(screen.queryByTestId("script-review-soft-gate")).toBeNull();
  });

  it("verdict≠pass 但版本一致(已重新审核)→ 不再提示(T-393 用户拍板:审过即过,block 由硬门管)", () => {
    render(
      <ReviewSoftGateHint
        report={{ ...passReport, verdict: "block", artifactVersion: 2 }}
        currentVersion={2}
        projectId="p1"
      />,
    );
    expect(screen.queryByTestId("script-review-soft-gate")).toBeNull();
  });

  it("报告 stale(版本落后)→ 显「脚本已改动」提示", () => {
    render(
      <ReviewSoftGateHint
        report={{ ...passReport, verdict: "pass", artifactVersion: 1 }}
        currentVersion={2}
        projectId="p1"
      />,
    );
    expect(screen.getByTestId("script-review-soft-gate").textContent).toContain(
      "脚本已改动",
    );
  });

  it("[T-539] 目标已在同屏时仍高亮审核卡与审核按钮，并把焦点交给审核按钮", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderWithProvider(
      <>
        <ScriptReviewGate
          projectId="p1"
          projectTitle="标题"
          outputId="co-1"
          currentVersion={2}
          initialReport={null}
        />
        <ReviewSoftGateHint report={null} currentVersion={2} projectId="p1" />
      </>,
    );

    fireEvent.click(screen.getByTestId("script-review-soft-gate-action"));

    const gate = screen.getByTestId("script-review-gate");
    const trigger = screen.getByTestId("script-review-trigger");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(gate.getAttribute("data-attention")).toBe("true");
    expect(trigger.getAttribute("data-attention")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(gate.className).toContain(
      "data-[attention=true]:ring-brand/20",
    );
    expect(trigger.className).toContain(
      "data-[attention=true]:bg-brand",
    );

    // 重复点击重启反馈时长，不能被第一次点击的旧 timer 提前清掉。
    vi.advanceTimersByTime(1_000);
    fireEvent.click(screen.getByTestId("script-review-soft-gate-action"));
    vi.advanceTimersByTime(1_000);
    expect(gate.getAttribute("data-attention")).toBe("true");
    vi.advanceTimersByTime(600);
    expect(gate.hasAttribute("data-attention")).toBe(false);
    expect(trigger.hasAttribute("data-attention")).toBe(false);
  });

  it("[T-539] 用户设置减少动态效果时即时定位，但仍保留高亮反馈", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    renderWithProvider(
      <>
        <ScriptReviewGate
          projectId="p1"
          projectTitle="标题"
          outputId="co-1"
          currentVersion={2}
          initialReport={null}
        />
        <ReviewSoftGateHint report={null} currentVersion={2} projectId="p1" />
      </>,
    );

    fireEvent.click(screen.getByTestId("script-review-soft-gate-action"));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
    expect(
      screen.getByTestId("script-review-gate").getAttribute("data-attention"),
    ).toBe("true");
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

it("T-1066 慢创建超过两分钟后继续开审核，迟到结果复用不重复创建", async () => {
  vi.useFakeTimers();
  const { act } = await import("@testing-library/react");
  let resolve!: (value: unknown) => void;
  mockClient.createOutput.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  renderWithProvider(<ScriptReviewGate projectId="slow-project" projectTitle="慢稿件" outputId={null} currentVersion={1} initialReport={passReport} />);
  fireEvent.click(screen.getByTestId("script-review-trigger"));
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
  expect(capturedRequest).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(capturedRequest?.functionKey).toBe("review.script");
  expect(mockClient.createOutput).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ id: "late-original-output" }); });
  fireEvent.click(screen.getByTestId("script-review-trigger"));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(mockClient.createOutput).toHaveBeenCalledTimes(1);
  expect(capturedRequest?.selection?.id).toBe("late-original-output");
});
