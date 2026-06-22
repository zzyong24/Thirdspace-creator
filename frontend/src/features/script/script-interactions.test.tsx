/**
 * Behavior tests for the Script editor island (Increment 4 / page-specs §7).
 *
 * Covers the client interactivity added in the functional remediation:
 *  - the toolbar buttons are ENABLED (no longer all `disabled`),
 *  - the bold button starts pressed and toggles aria-pressed on click,
 *  - editing a section body updates client state AND flips the visible
 *    save-status indicator to the "未保存" (dirty) state,
 *  - the Save action returns the indicator to "已保存".
 *
 * Determinism: state is seeded purely from the ViewModel; no timers /
 * network are involved.
 */

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptInteractiveRegion } from "./script-interactive-region";
import type { ScriptSectionView, ScriptViewModel } from "@/types/view-models";

// next/navigation + contract-client stubs — the real 保存 (with an artifactId) flows
// island → client.createArtifactVersion → router.refresh(). The local-only render
// (no artifactId) never touches either, so the existing structural tests stay green.
const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockCreateArtifactVersion = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "av-new", input }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) => mockCreateArtifactVersion(input),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockCreateArtifactVersion.mockClear();
});

const SECTIONS: ReadonlyArray<ScriptSectionView> = [
  {
    id: "sec-1",
    type: "hook",
    heading: "开场 15 秒",
    body: "你有没有想过浏览器也能帮你完成任务？",
    emphasis: false,
    startSeconds: 0,
    endSeconds: 15,
  },
  {
    id: "sec-2",
    type: "golden_quote",
    heading: "金句",
    body: "AI Native Browser 不是工具，而是同事。",
    emphasis: true,
    startSeconds: 60,
    endSeconds: 75,
  },
];

const TOOLBAR_STATE: ScriptViewModel["toolbarState"] = {
  wordCount: 0,
  savedAt: "",
  status: "saved",
};

function renderEditor() {
  return render(
    <ScriptInteractiveRegion sections={SECTIONS} toolbarState={TOOLBAR_STATE} />,
  );
}

describe("Script editor interactivity", () => {
  it("renders toolbar format buttons that are enabled (not all disabled)", () => {
    renderEditor();
    const toolbar = document.querySelector(
      '[data-slot="editor-toolbar"]',
    ) as HTMLElement;
    const buttons = toolbar.querySelectorAll<HTMLButtonElement>(
      '[data-slot="editor-toolbar-button"]',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    // At least one toolbar button is interactive (not disabled).
    expect(Array.from(buttons).some((b) => !b.disabled)).toBe(true);
  });

  it("bold starts pressed and toggles aria-pressed on click", async () => {
    const user = userEvent.setup();
    renderEditor();
    const bold = document.querySelector(
      '[data-slot="editor-toolbar-button"][data-format="bold"]',
    ) as HTMLButtonElement;
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    await user.click(bold);
    expect(bold.getAttribute("aria-pressed")).toBe("false");
  });

  it("editing a section body updates state and flips the save status to dirty", async () => {
    const user = userEvent.setup();
    renderEditor();
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    expect(status.getAttribute("data-save-status")).toBe("saved");

    const body = screen.getByLabelText("编辑「开场 15 秒」段落") as HTMLTextAreaElement;
    await user.type(body, "！");
    expect(body.value).toContain("！");
    expect(status.getAttribute("data-save-status")).toBe("dirty");
    expect(status.textContent ?? "").toMatch(/未保存/);
  });

  it("Save returns the status indicator to 已保存", async () => {
    const user = userEvent.setup();
    renderEditor();
    const body = screen.getByLabelText("编辑「开场 15 秒」段落") as HTMLTextAreaElement;
    await user.type(body, "补充");
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    expect(status.getAttribute("data-save-status")).toBe("dirty");

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(status.getAttribute("data-save-status")).toBe("saved");
    expect(status.textContent ?? "").toMatch(/已保存/);
  });

  it("the golden-quote section body keeps the purple emphasis slot and is editable", async () => {
    const user = userEvent.setup();
    renderEditor();
    const emphasis = document.querySelector(
      '[data-slot="script-emphasis"]',
    ) as HTMLTextAreaElement;
    expect(emphasis).not.toBeNull();
    expect(emphasis.className).toMatch(/text-brand/);
    await user.type(emphasis, "。");
    expect(emphasis.value).toContain("。");
  });

  it("word count reflects the live edited bodies", async () => {
    const user = userEvent.setup();
    renderEditor();
    const wordCount = document.querySelector(
      '[data-slot="editor-status-word-count"]',
    ) as HTMLElement;
    const before = wordCount.textContent ?? "";
    const body = screen.getByLabelText("编辑「开场 15 秒」段落") as HTMLTextAreaElement;
    await user.type(body, "ABCDE");
    expect(wordCount.textContent ?? "").not.toBe(before);
  });

  it("local-only Save (no artifactId) does NOT call the contract client", async () => {
    const user = userEvent.setup();
    renderEditor();
    const body = screen.getByLabelText("编辑「开场 15 秒」段落") as HTMLTextAreaElement;
    await user.type(body, "补充");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });

  it("real Save (with artifactId) persists a new version via createArtifactVersion and refreshes", async () => {
    const user = userEvent.setup();
    render(
      <ScriptInteractiveRegion
        sections={SECTIONS}
        toolbarState={TOOLBAR_STATE}
        artifactId="artifact-1"
      />,
    );
    const body = screen.getByLabelText("编辑「开场 15 秒」段落") as HTMLTextAreaElement;
    await user.type(body, "！");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1),
    );
    const call = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: {
        contentText: string;
        contentData: { sections: Array<{ id: string; heading: string; body: string }> };
        changeSummary: string;
      };
    };
    expect(call.params).toEqual({ artifactId: "artifact-1" });
    expect(call.body.changeSummary).toBe("编辑脚本");
    // contentData carries the section id→heading→body map in section order.
    expect(call.body.contentData.sections.map((s) => s.id)).toEqual([
      "sec-1",
      "sec-2",
    ]);
    expect(call.body.contentData.sections[0]!.heading).toBe("开场 15 秒");
    expect(call.body.contentData.sections[0]!.body).toContain("！");
    // contentText is a readable heading+body concatenation.
    expect(call.body.contentText).toContain("开场 15 秒");
    expect(call.body.contentText).toContain("金句");

    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(status.getAttribute("data-save-status")).toBe("saved"),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });
});
