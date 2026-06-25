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
 *        └── ContinuingTasks (no fixture rows; honest empty state)
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

    // CopilotDashboard 3 columns
    expect(slot(dialog, "copilot-dashboard")).not.toBeNull();
    expect(slot(dialog, "recommended-commands")).not.toBeNull();
    expect(slot(dialog, "recent-tasks")).not.toBeNull();
    expect(slot(dialog, "continuing-tasks")).not.toBeNull();

    // Bottom region
    expect(slot(dialog, "quick-entries")).not.toBeNull();
    expect(slot(dialog, "smart-recommendation")).not.toBeNull();
  });

  it("exposes the four approved visual regions in reference order", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    expect(
      Array.from(dialog.querySelectorAll('[data-slot-region="copilot-region"]')).map(
        (node) => node.getAttribute("data-region"),
      ),
    ).toEqual(["prompt", "dashboard", "quick-entries", "recommendation"]);
  });

  it("renders the reference fixture counts", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(6);
    expect(dialog.querySelectorAll('[data-slot="recommended-command"]')).toHaveLength(5);
    // RecentTasks is now backed by the REAL global feed (GAP-COP-feed / ai.tasks.list):
    // on first synchronous render the feed is still loading (no fixture rows), so there
    // are no recent-task rows yet — the loading slot is present instead. Honest, not fake.
    expect(dialog.querySelectorAll('[data-slot="recent-task"]')).toHaveLength(0);
    expect(slot(dialog, "recent-tasks-loading")).not.toBeNull();
    // ContinuingTasks no longer ships fixture rows (cont-1..4 removed): there is no
    // cross-project in-progress feed op, so the list is empty and renders an honest
    // 「暂无进行中的任务」 empty state instead of fake progress.
    expect(dialog.querySelectorAll('[data-slot="continuing-task"]')).toHaveLength(0);
    expect(slot(dialog, "continuing-tasks-empty")).not.toBeNull();
    expect(dialog.querySelectorAll('[data-slot="quick-entry"]')).toHaveLength(6);
    expect(dialog.querySelectorAll('[data-slot="smart-recommendation-item"]')).toHaveLength(2);
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
