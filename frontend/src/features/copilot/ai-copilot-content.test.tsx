/**
 * Contract tests for the AI Copilot dialog (Task 24 / page-specs §16).
 *
 * Spec invariants under test:
 *  - The dialog is rendered inside exactly ONE shared AppShell.
 *  - The OverlayController is mounted once and centers the panel
 *    (NOT a right-side drawer — page-specs §16 "弹窗居中").
 *  - The component tree matches page-specs §16:
 *      PromptComposer
 *        ├── PromptInput (textarea)
 *        ├── SuggestedActionChips (4 chips)
 *        └── SubmitButton
 *      CopilotDashboard
 *        ├── RecommendedCommands (4 cards)
 *        ├── RecentTasks (real feed; loading/empty state, no fixture rows)
 *        └── ContinuingTasks (real in-progress feed; loading/empty state, no fixture rows)
 *      QuickEntries (3 entries)
 *      SmartRecommendation (2 items)
 *  - The dialog closes when `data-overlay-close` is clicked (close button).
 *  - The submit button does NOT post a real network request — its parent
 *    form has no `action` and no `onSubmit` handler.
 *  - No message-thread UI is rendered.
 *  - The dialog is `role="dialog"` with `aria-modal="true"`.
 */

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCopilotViewModel } from "@/fixtures/selectors/copilot";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("copilot=open"),
}));

import { AppShell } from "@/components/shell/app-shell";
import { OverlayController } from "@/components/overlays/overlay-controller";
import { AICopilotDialog } from "@/components/overlays/ai-copilot-dialog";

afterEach(() => cleanup());

function renderDialog() {
  return render(
    <AppShell pathname="/">
      <main data-page="test">
        <p>underlay</p>
      </main>
      <OverlayController>
        <AICopilotDialog pathname="/" />
      </OverlayController>
    </AppShell>,
  );
}

function slot(dialog: HTMLElement, name: string) {
  return dialog.querySelector(`[data-slot="${name}"]`);
}

describe("AI Copilot dialog (Task 24)", () => {
  it("renders the dialog inside the single shared AppShell with one sidebar and one top-header", () => {
    renderDialog();
    expect(screen.getAllByTestId("app-shell")).toHaveLength(1);
    expect(screen.getAllByTestId("app-sidebar")).toHaveLength(1);
    expect(screen.getAllByTestId("app-top-header")).toHaveLength(1);
  });

  it("renders the dialog with role=dialog and aria-modal=true and is centered (not a right-side drawer)", () => {
    renderDialog();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    const layer = panel.closest('[data-slot="overlay-layer"]');
    expect(layer).not.toBeNull();
    expect(layer!.className).toContain("items-center");
    expect(layer!.className).toContain("justify-center");
    expect(layer!.className).not.toContain("justify-end");
  });

  it("renders the page-specs §16 component tree in order", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    // PromptComposer
    expect(slot(dialog, "prompt-composer")).not.toBeNull();
    expect(slot(dialog, "prompt-input")).not.toBeNull();
    expect(slot(dialog, "suggested-action-chips")).not.toBeNull();
    expect(slot(dialog, "submit-button")).not.toBeNull();

    // [T-354] 次区(CopilotDashboard 三卡:推荐指令/最近任务/继续任务 + 快捷入口/智能推荐)
    // 已整体下架(用户真机反馈冗余)—— 对话 + 快捷 chip 已覆盖;任务进度走对话区顶部通知卡。
    expect(slot(dialog, "copilot-dashboard")).toBeNull();
    expect(slot(dialog, "recommended-commands")).toBeNull();
    expect(slot(dialog, "recent-tasks")).toBeNull();
    expect(slot(dialog, "continuing-tasks")).toBeNull();
    expect(slot(dialog, "quick-entries")).toBeNull();
    expect(slot(dialog, "smart-recommendation")).toBeNull();
  });

  it("exposes the prompt region only ([T-354] secondary regions removed)", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    expect(
      Array.from(dialog.querySelectorAll('[data-slot-region="copilot-region"]')).map(
        (node) => node.getAttribute("data-region"),
      ),
    ).toEqual(["prompt"]);
  });

  it("renders the reference fixture counts", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    // [T-231⑨] 6 → 5:「优化标题」chip 已删(无对应工具,诚实优先);余下 5 个全部
    // 绑 functionKey + 完整预填话术(真预调,见 fixtures/selectors/copilot.ts)。
    // [T-354] 次区计数断言随次区下架删除(recommended-command/recent-task/continuing-task/
    // quick-entry/smart-recommendation 均不再渲染)。
    expect(dialog.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(5);
    expect(dialog.querySelectorAll('[data-slot="recommended-command"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-slot="recent-task"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-slot="continuing-task"]')).toHaveLength(0);
    expect(slot(dialog, "recent-tasks-loading")).toBeNull();
    expect(slot(dialog, "continuing-tasks-loading")).toBeNull();
    expect(dialog.querySelectorAll('[data-slot="quick-entry"]')).toHaveLength(0);
    expect(
      dialog.querySelectorAll('[data-slot="smart-recommendation-item"]'),
    ).toHaveLength(0);
  });

  it("生成封面入口绑定专用封面工具，并要求自动选择最新且最关联的已发布作品", () => {
    const viewModel = buildCopilotViewModel();
    const cover = viewModel.chips.find((chip) => chip.id === "cover");

    expect(cover?.functionKey).toBe("cover.generate");
    expect(cover?.prefill).toContain("最新且最关联");
    expect(cover?.prefill).toContain("直接生成");
  });

  it("renders the close button with data-overlay-close so the controller's delegated click handler closes the dialog", () => {
    renderDialog();
    const closeButton = document.querySelector('[data-slot="ai-copilot-close"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton).toHaveAttribute("data-overlay-close");
    expect(closeButton).toHaveAttribute("aria-label", "关闭 AI 助手");
  });

  it("does NOT render a message thread UI", () => {
    renderDialog();
    expect(document.querySelector('[data-slot="message-thread"]')).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("does NOT post a real network request: the submit button is type=submit and is inside a form with no action", () => {
    renderDialog();
    const submit = document.querySelector('[data-slot="submit-button"]') as HTMLElement;
    expect(submit).not.toBeNull();
    expect(submit).toHaveAttribute("type", "submit");
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBeNull();
    // The textarea has no fetch consumer.
    const textarea = document.querySelector(
      '[data-slot="prompt-input"]',
    ) as HTMLElement;
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });
});
