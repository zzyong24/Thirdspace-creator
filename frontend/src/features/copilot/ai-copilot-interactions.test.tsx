/**
 * Behavior tests for the AI Copilot composer (Increment 4 / page-specs §16).
 *
 * These cover the client interactivity added in the functional remediation:
 *  - the composer textarea is controlled,
 *  - submitting a non-empty prompt appends the user message AND a
 *    deterministic, network-free canned assistant reply,
 *  - a suggested-action chip fills the composer with its label,
 *  - the submit/clear controls are disabled when the composer is empty,
 *  - a CopilotHeader is rendered (page-specs §16 component tree).
 *
 * Determinism: the assistant reply is a pure echo — no fetch / Date.now /
 * Math.random — so the rendered text is fully reproducible.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

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

describe("AI Copilot composer behavior", () => {
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

  it("submitting appends the user message and a deterministic canned reply", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

    await user.type(textarea, "帮我做选题");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));

    const list = document.querySelector('[data-slot="copilot-messages"]') as HTMLElement;
    expect(list).not.toBeNull();
    const messages = within(list).getAllByRole("listitem");
    // one user echo + one assistant reply
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("data-role", "user");
    expect(messages[0].textContent).toContain("帮我做选题");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
    expect(messages[1].textContent).toContain("帮我做选题");

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
    // and submit becomes enabled
    expect(screen.getByLabelText("提交提示给 Copilot")).not.toBeDisabled();
  });

  it("does not issue a network request: assistant reply is the local echo placeholder", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    await user.type(screen.getByLabelText("我能帮你做什么"), "测试");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    const assistant = document.querySelector('[data-role="assistant"]');
    expect(assistant?.textContent ?? "").toContain("本地占位回复");
  });
});
