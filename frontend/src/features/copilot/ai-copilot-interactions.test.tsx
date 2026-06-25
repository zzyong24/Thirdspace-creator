/**
 * Behavior tests for the AI Copilot composer (page-specs §16, Copilot 做真).
 *
 * The composer is now wired to the REAL backend: submitting a prompt ensures a
 * conversation, posts the USER message, and polls `listMessages` for the assistant
 * reply produced async by the positioning-aware copilot runner. These tests mock
 * `@/lib/contract-client` (like research-notes-island.test.tsx) and assert the
 * backend calls + the optimistic user bubble + the polled assistant reply.
 */

import * as React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createConversation = vi.fn();
const createMessage = vi.fn();
const listMessages = vi.fn();
const listTasks = vi.fn();

// 「继续」 routing uses next/navigation's useRouter; mock it so the island mounts
// under the test renderer (no real app-router provider).
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/contract-client", () => ({
  client: {
    createConversation: (...args: unknown[]) => createConversation(...args),
    createMessage: (...args: unknown[]) => createMessage(...args),
    listMessages: (...args: unknown[]) => listMessages(...args),
    // GAP-COP-feed: the 最近任务 feed loads from the real op on mount; default empty.
    listAITasks: (...args: unknown[]) => listTasks(...args),
  },
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
  createConversation.mockReset();
  createMessage.mockReset();
  listMessages.mockReset();
  listTasks.mockReset();
  listTasks.mockResolvedValue([]);
  routerPush.mockReset();
});

describe("AI Copilot composer behavior (backend-wired)", () => {
  it("renders a CopilotHeader (page-specs §16 component tree)", () => {
    render(<AICopilotContent viewModel={VM} />);
    expect(document.querySelector('[data-slot="copilot-header"]')).not.toBeNull();
  });

  it("submit is disabled when the composer is empty and enabled after typing", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const submit = screen.getByLabelText("提交提示给 Copilot");
    expect(submit).toBeDisabled();

    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "你好");
    expect(submit).not.toBeDisabled();
  });

  it("submitting ensures a conversation, posts the user message, and renders the polled assistant reply", async () => {
    const user = userEvent.setup();
    createConversation.mockResolvedValue({ id: "conv-1" });
    // baseline (empty) → after reply lands (user + assistant)
    listMessages
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: "m-user", role: "user", content: "帮我做选题" },
        { id: "m-assistant", role: "assistant", content: "基于你的定位，建议从……" },
      ]);
    createMessage.mockResolvedValue({ id: "m-user", role: "user" });

    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "帮我做选题");

    // Optimistic user bubble appears immediately on submit.
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    await waitFor(() => {
      const list = document.querySelector(
        '[data-slot="copilot-messages"]',
      ) as HTMLElement;
      expect(within(list).getByText("帮我做选题")).not.toBeNull();
    });

    // Backend calls fired with the right shapes.
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { title: "AI 助手" } }),
    );
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { conversationId: "conv-1" },
        body: { content: "帮我做选题" },
      }),
    );

    // The polled assistant reply renders into the thread (poll interval is ~3s real-time).
    await waitFor(
      () => {
        const assistant = document.querySelector('[data-role="assistant"]');
        expect(assistant?.textContent ?? "").toContain("基于你的定位");
      },
      { timeout: 8000 },
    );

    // composer cleared after submit
    expect(textarea.value).toBe("");
  });

  it("renders the REAL continuing-task feed (in-progress only) and 「继续」 routes to the task's project/stage", async () => {
    const user = userEvent.setup();
    // ai.tasks.list returns a mix: two in-progress (running script / awaiting publish),
    // one terminal (succeeded) that must be filtered OUT of 继续任务, and one global
    // task with no projectId whose 继续 must be disabled.
    listTasks.mockResolvedValue([
      {
        id: "t-running",
        projectId: "proj-1",
        taskType: "script.draft",
        status: "running",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
      {
        id: "t-await",
        projectId: "proj-2",
        taskType: "publish.platform_adapt",
        status: "awaiting_confirmation",
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

    // The in-progress rows render; the terminal one does NOT appear under 继续任务.
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="continuing-task"][data-task-id="t-running"]'),
      ).not.toBeNull();
    });
    expect(
      document.querySelector('[data-slot="continuing-task"][data-task-id="t-await"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-slot="continuing-task"][data-task-id="t-done"]'),
    ).toBeNull();

    // The global (no-projectId) task is shown but its 继续 button is disabled.
    const globalResume = document.querySelector(
      '[data-slot="continuing-resume"][data-task-id="t-global"]',
    ) as HTMLButtonElement;
    expect(globalResume).not.toBeNull();
    expect(globalResume.disabled).toBe(true);

    // Clicking 继续 on the running script task routes to its project's script stage.
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
