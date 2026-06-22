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
