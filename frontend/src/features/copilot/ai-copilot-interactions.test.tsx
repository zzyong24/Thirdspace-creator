/**
 * Behavior tests for the AI Copilot composer (page-specs §16; T-004 ChatBox slice 1).
 *
 * The composer is now driven by `useChat` (@ai-sdk/react) streaming against `/api/chat`
 * (NOT the old createMessage→poll-listMessages loop). These tests mock `@ai-sdk/react`'s
 * `useChat` so the composer can be exercised in jsdom WITHOUT a real stream (real streaming
 * needs a dev server + model key — covered by the server-side assembly unit tests instead).
 * They assert: submit calls `sendMessage({text})` + clears the composer; `stop()` shows
 * while streaming; the dashboard 继续任务 feed still works; and a `topic.generate` tool result
 * renders an in-chat candidate card that adopts through the candidates.create confirm gate.
 */

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listTasks = vi.fn();
const createCandidate = vi.fn();
// 会话持久化(本切片):读回历史 / 历史记录列表 走这两个契约读 op。
const listMessages = vi.fn();
const listConversations = vi.fn();

// 「继续」 routing uses next/navigation's useRouter; mock it so the island mounts
// under the test renderer (no real app-router provider).
const routerPush = vi.fn();
const routerRefresh = vi.fn();
// slice 2:面板读 ?surface & ?fn 装配 ChatContext + 预调工具。默认 query 无 fn(不自动预调),
// 个别用例改 mockSearch 注入 fn 断言预调。
let mockSearch = "copilot=open";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: routerRefresh,
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const createLearning = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: {
    // GAP-COP-feed: the 最近任务 / 继续任务 feeds load from the real op on mount.
    listAITasks: (...args: unknown[]) => listTasks(...args),
    // T-004: in-chat candidate adoption goes through the candidates.create confirm gate.
    createCandidate: (...args: unknown[]) => createCandidate(...args),
    // slice 2:复盘经验候选采纳 → learnings.create 直采门。
    createLearning: (...args: unknown[]) => createLearning(...args),
    // 会话持久化:二次进入读回 + 历史记录列表。
    listMessages: (...args: unknown[]) => listMessages(...args),
    listConversations: (...args: unknown[]) => listConversations(...args),
  },
}));

// Mock useChat so the composer can be driven deterministically (no real /api/chat stream).
// `sendMessage` is captured; `messages` / `status` are injected per-test via the controls.
const sendMessage = vi.fn();
const stop = vi.fn();
const setMessages = vi.fn();
let mockMessages: Array<{
  id: string;
  role: "user" | "assistant";
  parts: Array<Record<string, unknown>>;
}> = [];
let mockStatus = "ready";
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage: (...args: unknown[]) => sendMessage(...args),
    stop: (...args: unknown[]) => stop(...args),
    status: mockStatus,
    // 读回把历史喂 setMessages —— 捕获它断言二次进入读回。
    setMessages: (...args: unknown[]) => setMessages(...args),
    regenerate: vi.fn(),
  }),
}));

import { AICopilotContent } from "./ai-copilot-content";
import type { CopilotContentViewModel } from "./ai-copilot-content";

afterEach(() => cleanup());

const VM: CopilotContentViewModel = {
  scenario: "default",
  kind: "ai-copilot",
  loading: false,
  error: null,
  prompt: "",
  chips: [
    { id: "chip-1", label: "帮我写脚本开场", icon: "wand" },
    { id: "chip-2", label: "分析竞品", icon: "file-search" },
  ],
  recommendedCommands: [],
  recentTasks: [],
  continuingTasks: [],
  quickEntries: [],
  smartRecommendations: [],
};

beforeEach(() => {
  listTasks.mockReset();
  listTasks.mockResolvedValue([]);
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-1" });
  createLearning.mockReset();
  createLearning.mockResolvedValue({ id: "learn-1" });
  routerPush.mockReset();
  routerRefresh.mockReset();
  sendMessage.mockReset();
  stop.mockReset();
  setMessages.mockReset();
  listMessages.mockReset();
  listMessages.mockResolvedValue([]);
  listConversations.mockReset();
  listConversations.mockResolvedValue([]);
  mockMessages = [];
  mockStatus = "ready";
  mockSearch = "copilot=open";
  // 每个用例从干净的会话存档起步(前一个用例可能写过 localStorage)。
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("AI Copilot composer behavior (useChat-driven, T-004)", () => {
  it("renders a CopilotHeader (page-specs §16 component tree)", () => {
    render(<AICopilotContent viewModel={VM} />);
    expect(document.querySelector('[data-slot="copilot-header"]')).not.toBeNull();
  });

  it("submit is disabled when empty, enabled after typing", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const submit = screen.getByLabelText("提交提示给 Copilot");
    expect(submit).toBeDisabled();

    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "你好");
    expect(submit).not.toBeDisabled();
  });

  it("submitting calls sendMessage({text}) and clears the composer", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "基于最近评论出 5 个选题");

    await user.click(screen.getByLabelText("提交提示给 Copilot"));

    expect(sendMessage).toHaveBeenCalledWith({
      text: "基于最近评论出 5 个选题",
    });
    expect(textarea.value).toBe("");
  });

  it("shows a stop button (not submit) while streaming", () => {
    mockStatus = "streaming";
    render(<AICopilotContent viewModel={VM} />);
    expect(screen.queryByTestId("stop-button")).not.toBeNull();
    expect(screen.queryByTestId("submit-button")).toBeNull();
  });

  it("renders assistant text parts + a topic.generate candidate card, and 采纳 calls candidates.create", async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: "a-1",
        role: "assistant",
        parts: [
          { type: "text", text: "给你出 1 个选题：" },
          {
            // useChat tool part shape: type `tool-<name>`, state output-available, output.
            type: "tool-topic.generate",
            toolCallId: "tc-1",
            state: "output-available",
            input: { basis: "comments" },
            output: {
              kind: "topic.candidates",
              items: [
                {
                  title: "反直觉开头对你有效",
                  angle: "用数据打破直觉",
                  contentRole: "traffic",
                  predictedScore: 82,
                  reason: "评论里反复问",
                },
              ],
            },
          },
        ],
      },
    ];

    render(<AICopilotContent viewModel={VM} />);

    // assistant text bubble renders.
    expect(screen.getByText("给你出 1 个选题：")).not.toBeNull();
    // candidate card renders the tool-result candidate.
    const card = document.querySelector('[data-slot="chat-candidate-card"]');
    expect(card).not.toBeNull();
    expect(screen.getByText("反直觉开头对你有效")).not.toBeNull();

    // 采纳 → candidates.create (confirm gate; AI never writes the entity directly).
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: "反直觉开头对你有效",
            angle: "用数据打破直觉",
            source: "idea",
            contentRole: "traffic",
          }),
        }),
      );
    });
  });

  it("slice 2:渲染 calibration.diagnose 工具结果为维度评分卡(只读展示)", () => {
    mockMessages = [
      {
        id: "a-2",
        role: "assistant",
        parts: [
          { type: "text", text: "诊断如下：" },
          {
            type: "tool-calibration.diagnose",
            toolCallId: "tc-2",
            state: "output-available",
            input: { title: "我的视频" },
            output: {
              kind: "calibration.diagnosis",
              diagnosis: {
                dimensions: [
                  { key: "hook", score: 4, reason: "开头强", suggestion: "保持" },
                ],
                verdict: "可发",
                mainIssues: ["结尾弱"],
                priorityFixes: ["加 CTA"],
              },
            },
          },
        ],
      },
    ];
    render(<AICopilotContent viewModel={VM} />);
    expect(
      document.querySelector('[data-slot="chat-diagnosis-card"]'),
    ).not.toBeNull();
    expect(screen.getByText("4 / 5")).not.toBeNull();
    expect(screen.getByText(/综合判断/)).not.toBeNull();
  });

  it("slice 2:渲染 review.analyze 工具结果为经验卡,采纳 → learnings.create", async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: "a-3",
        role: "assistant",
        parts: [
          {
            type: "tool-review.analyze",
            toolCallId: "tc-3",
            state: "output-available",
            input: { subject: "我的视频" },
            output: {
              kind: "review.learnings",
              items: [{ title: "前3秒给结果", insight: "完播更高" }],
            },
          },
        ],
      },
    ];
    render(<AICopilotContent viewModel={VM} />);
    expect(
      document.querySelector('[data-slot="chat-learnings-card"]'),
    ).not.toBeNull();
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(createLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { title: "前3秒给结果", insight: "完播更高" },
        }),
      );
    });
  });

  it("slice 2:一键岛预调 —— 面板带 ?fn 打开且对话为空 → 自动发预调话术(预调该工具)", async () => {
    // 模拟从校准「对话诊断」深链进入:?surface=calibration&fn=calibration.diagnose。
    mockSearch = "copilot=open&surface=calibration&fn=calibration.diagnose";
    render(<AICopilotContent viewModel={VM} />);
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining("诊断") }),
      );
    });
  });

  it("renders the REAL continuing-task feed (in-progress only) and 「继续」 routes to the task's project/stage", async () => {
    const user = userEvent.setup();
    listTasks.mockResolvedValue([
      {
        id: "t-running",
        projectId: "proj-1",
        taskType: "script.draft",
        status: "running",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
      {
        id: "t-done",
        projectId: "proj-3",
        taskType: "research.gather",
        status: "succeeded",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
      {
        id: "t-global",
        projectId: null,
        taskType: "topic.generate",
        status: "queued",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-slot="continuing-task"][data-task-id="t-running"]',
        ),
      ).not.toBeNull();
    });
    // terminal task filtered OUT of 继续任务.
    expect(
      document.querySelector(
        '[data-slot="continuing-task"][data-task-id="t-done"]',
      ),
    ).toBeNull();

    // global (no-projectId) task shown but its 继续 disabled.
    const globalResume = document.querySelector(
      '[data-slot="continuing-resume"][data-task-id="t-global"]',
    ) as HTMLButtonElement;
    expect(globalResume).not.toBeNull();
    expect(globalResume.disabled).toBe(true);

    const resume = document.querySelector(
      '[data-slot="continuing-resume"][data-task-id="t-running"]',
    ) as HTMLButtonElement;
    await user.click(resume);
    expect(routerPush).toHaveBeenCalledWith("/projects/proj-1/script");
  });

  it("clicking a suggested-action chip fills the composer with its label", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    await user.click(screen.getByText("帮我写脚本开场"));
    expect(textarea.value).toBe("帮我写脚本开场");
    expect(screen.getByLabelText("提交提示给 Copilot")).not.toBeDisabled();
  });

  it("会话持久化:该 surface 存过 conversationId → 挂载读回历史(listMessages → setMessages 映射)", async () => {
    // 预置该 surface(默认 topics)的存档 + 后端返回两条历史消息。
    window.localStorage.setItem("copilot:conv:topics", "conv-restore");
    listMessages.mockResolvedValueOnce([
      { id: "m1", role: "user", content: "上次问的" },
      { id: "m2", role: "assistant", content: "上次答的" },
    ]);
    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { conversationId: "conv-restore" },
        }),
      );
    });
    // 映射后的 UIMessage[] 喂给 setMessages(读回填充对话)。
    await waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "上次问的" }],
        }),
        expect.objectContaining({
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "上次答的" }],
        }),
      ]);
    });
  });

  it("会话持久化:读回失败(会话被删)→ 清失效存档 + 静默降级为空会话(不抛)", async () => {
    window.localStorage.setItem("copilot:conv:topics", "conv-gone");
    listMessages.mockRejectedValueOnce(new Error("404 conversation not found"));
    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalled();
    });
    // 失效存档被清除,降级为干净空会话。
    await waitFor(() => {
      expect(window.localStorage.getItem("copilot:conv:topics")).toBeNull();
    });
  });

  it("历史记录按钮做实:点开 → listConversations 列出会话;点某条 → 读回该会话消息", async () => {
    const user = userEvent.setup();
    listConversations.mockResolvedValueOnce([
      { id: "conv-a", title: "选题：AI 浏览器", createdAt: "2026-06-20T08:30:00.000Z" },
      { id: "conv-b", title: "选题：短视频留存", createdAt: "2026-06-21T09:00:00.000Z" },
    ]);
    listMessages.mockResolvedValueOnce([
      { id: "x1", role: "assistant", content: "会话 A 的历史" },
    ]);
    render(<AICopilotContent viewModel={VM} />);

    // 点「历史记录」→ 懒加载列表。
    await user.click(screen.getByRole("button", { name: /历史记录/ }));
    await waitFor(() => {
      expect(listConversations).toHaveBeenCalled();
    });
    const item = await screen.findByText("选题：AI 浏览器");
    expect(item).not.toBeNull();

    // 点某条 → 读回该会话消息(listMessages 带其 id + setMessages 填充)。
    await user.click(item);
    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ params: { conversationId: "conv-a" } }),
      );
    });
    await waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "x1",
          parts: [{ type: "text", text: "会话 A 的历史" }],
        }),
      ]);
    });
  });

  it("新对话:点「新对话」→ 清空会话 + 清该 surface 存档", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("copilot:conv:topics", "conv-existing");
    render(<AICopilotContent viewModel={VM} />);

    await user.click(screen.getByRole("button", { name: /新对话/ }));
    expect(setMessages).toHaveBeenCalledWith([]);
    expect(window.localStorage.getItem("copilot:conv:topics")).toBeNull();
  });
});
