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

// 「继续」 routing uses next/navigation's useRouter; mock it so the island mounts
// under the test renderer (no real app-router provider).
const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: routerRefresh,
  }),
}));

vi.mock("@/lib/contract-client", () => ({
  client: {
    // GAP-COP-feed: the 最近任务 / 继续任务 feeds load from the real op on mount.
    listAITasks: (...args: unknown[]) => listTasks(...args),
    // T-004: in-chat candidate adoption goes through the candidates.create confirm gate.
    createCandidate: (...args: unknown[]) => createCandidate(...args),
  },
}));

// Mock useChat so the composer can be driven deterministically (no real /api/chat stream).
// `sendMessage` is captured; `messages` / `status` are injected per-test via the controls.
const sendMessage = vi.fn();
const stop = vi.fn();
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
    setMessages: vi.fn(),
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
  routerPush.mockReset();
  routerRefresh.mockReset();
  sendMessage.mockReset();
  stop.mockReset();
  mockMessages = [];
  mockStatus = "ready";
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
});
