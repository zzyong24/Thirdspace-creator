/**
 * Contract tests for the Script Workspace page (Task 15).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §7, decision-log D-008):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Script stage active (current stage
 *    indicator on the stepper, primary action "进入下一步:拍摄制作").
 *  - The Script Tabs row exposes exactly four tabs in the locked
 *    spec order 主脚本 / 章节 / 引用 / 摘要.
 *  - The Main column hosts, in this fixed order:
 *      RichTextEditor (a single shell containing the EditorToolbar,
 *      the ScriptDocument and the EditorStatusBar)
 *      → VersionHistoryStrip (horizontal cards).
 *  - The RichTextEditor toolbar exposes role="toolbar" with buttons
 *    that advertise approved accessible state via aria-pressed (no
 *    full rich-text editor framework per D-008).
 *  - The ScriptDocument surfaces section headings, visible time codes
 *    (e.g. [00:00]) and a purple emphasis span on the golden-quote
 *    section.
 *  - The EditorStatusBar surfaces a visible word count and save
 *    status label.
 *  - The VersionHistoryStrip is a horizontal strip of version cards
 *    that lives BELOW the editor shell.
 *  - The Right rail hosts, in this fixed order: OutlineStructureCard,
 *    then AIWritingSuggestionsCard, then GoldenQuotesCard.
 *  - The page is wrapped in exactly one AppShell, with the sidebar
 *    marking "项目" as the active nav item.
 *
 * The page is a Server Component. The test renders it inside the
 * shared AppShell the same way `(creator)/layout.tsx` does so the
 * header mode / sidebar-active assertions run against the same DOM a
 * real route render would produce.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The page now mounts the ScriptDraftIsland (script.draft node) → AdoptCandidateCard,
// which calls `useRouter()`. Stub `next/navigation` so the structural render mounts
// without a real App Router provider; these tests never trigger a write, so a no-op
// router suffices.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

type ScriptWorkspacePageProps = React.ComponentProps<
  typeof import("./script-workspace-page").ScriptWorkspacePage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="script"` because the page IS
// the Script Workspace — the active stage must reflect the page
// context.
async function renderWorkspace(
  projectId = "project-ainativebrowser",
  overrides: Partial<ScriptWorkspacePageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { ScriptWorkspacePage } = await import("./script-workspace-page");
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Script Workspace surfaces "script" as the active step in the
  // header stepper; the other five stages are still pending from the
  // perspective of this workspace.
  const projectStages = STAGE_ORDER.map((stageName) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      stageName === "script"
        ? ("in_progress" as const)
        : stageName === "research" || stageName === "planning"
          ? ("completed" as const)
          : ("pending" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/script`}
      headerMode="project-workspace"
      primaryActionLabel="进入下一步:拍摄制作"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "script",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <ScriptWorkspacePage projectId={projectId} {...overrides} />
    </AppShell>,
  );
}

const STAGE_ORDER = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;

const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

describe("ScriptWorkspacePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in project-workspace mode", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("project-workspace");
  });

  it("surfaces the project identity AI Native Browser with a six-stage stepper", async () => {
    const { container } = await renderWorkspace();
    const identity = container.querySelector(
      '[data-slot="header-project-identity"]',
    ) as HTMLElement;
    expect(identity).not.toBeNull();
    expect(identity.textContent ?? "").toContain("AI Native Browser 深度解析");
    const stepperItems = identity.querySelectorAll(
      '[data-slot="header-stage-stepper"] li',
    );
    expect(stepperItems).toHaveLength(6);
    const expectedStageLabels = ["研究", "策划", "脚本", "拍摄", "发布", "复盘"];
    stepperItems.forEach((item, index) => {
      expect(item.textContent ?? "").toContain(expectedStageLabels[index]);
    });
  });

  it("marks the Script stage as active in the stepper", async () => {
    const { container } = await renderWorkspace();
    const stepper = container.querySelector(
      '[data-slot="header-stage-stepper"]',
    );
    expect(stepper).not.toBeNull();
    const activeItems = stepper!.querySelectorAll(
      '[data-status="in_progress"]',
    );
    expect(activeItems).toHaveLength(1);
    expect((activeItems[0] as HTMLElement).textContent ?? "").toContain(
      "脚本",
    );
  });

  it("exposes the 进入下一步:拍摄制作 primary action in the header", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector(
      '[data-slot="app-top-header"]',
    ) as HTMLElement;
    expect(header).not.toBeNull();
    const primaryAction = within(header).getByRole("link", {
      name: /进入下一步:拍摄制作/,
    });
    expect(primaryAction).toHaveAttribute(
      "href",
      "/projects/project-ainativebrowser/production",
    );
  });

  it("renders the six reference Script Tabs in order", async () => {
    const { container } = await renderWorkspace();
    const tabsSection = container.querySelector(
      '[data-slot="script-tabs"]',
    ) as HTMLElement;
    expect(tabsSection).not.toBeNull();
    const tabTriggers = tabsSection.querySelectorAll(
      '[data-slot="page-tabs"] [data-tab-id]',
    );
    expect(tabTriggers).toHaveLength(6);
    const tabIds = Array.from(tabTriggers).map((tab) =>
      tab.getAttribute("data-tab-id"),
    );
    expect(tabIds).toEqual([
      "outline",
      "master-script",
      "quotes",
      "mode",
      "ai-rewrite",
      "versions",
    ]);
    const tabLabels = Array.from(tabTriggers).map(
      (tab) => tab.textContent ?? "",
    );
    expect(tabLabels).toEqual([
      "大纲",
      "正文",
      "金句卡片",
      "脚本模式",
      "AI 改写",
      "版本记录",
    ]);
  });

  it("renders the editor toolbar with role=toolbar and buttons with aria-pressed", async () => {
    const { container } = await renderWorkspace();
    const toolbar = container.querySelector(
      '[data-slot="editor-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    // The toolbar exposes its accessible label.
    expect(toolbar.getAttribute("aria-label") ?? "").toMatch(/工具栏|toolbar/i);
    // Every toolbar control must advertise aria-pressed (D-008:
    // static toolbar with accessible state).
    const buttons = toolbar.querySelectorAll(
      '[data-slot="editor-toolbar-button"]',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    buttons.forEach((button) => {
      expect(button.hasAttribute("aria-pressed")).toBe(true);
    });
    // The bold button starts pressed (B is the canonical "current
    // emphasis" toggle on the screenshot).
    const bold = toolbar.querySelector(
      '[data-slot="editor-toolbar-button"][data-format="bold"]',
    );
    expect(bold).not.toBeNull();
    expect(bold!.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders the script document with sections, time codes, and purple emphasis text", async () => {
    const { container } = await renderWorkspace();
    const document = container.querySelector(
      '[data-slot="script-document"]',
    ) as HTMLElement;
    expect(document).not.toBeNull();

    // At least three section headings (hook + intro + body).
    const headings = document.querySelectorAll(
      '[data-slot="script-section-heading"]',
    );
    expect(headings.length).toBeGreaterThanOrEqual(3);

    // Each section heading carries a visible time code in [mm:ss]
    // form. We assert at least three time codes appear in the DOM
    // and that they match the format.
    const timeCodes = document.querySelectorAll(
      '[data-slot="script-section-timecode"]',
    );
    expect(timeCodes.length).toBeGreaterThanOrEqual(3);
    timeCodes.forEach((node) => {
      expect(node.textContent ?? "").toMatch(/\[\d{2}:\d{2}\]/);
    });

    // The golden-quote emphasis text is rendered as a purple span
    // (D-008 / page-specs §7: 正文中的紫色强调文字需保留).
    const emphasis = document.querySelector(
      '[data-slot="script-emphasis"]',
    );
    expect(emphasis).not.toBeNull();
    const emphasisClass = emphasis!.className ?? "";
    expect(emphasisClass).toMatch(/text-(brand|accent)/);

    // The body paragraphs are visible.
    const bodies = document.querySelectorAll(
      '[data-slot="script-section-body"]',
    );
    expect(bodies.length).toBeGreaterThanOrEqual(3);
  });

  it("renders the editor status bar with word count and save status", async () => {
    const { container } = await renderWorkspace();
    const statusBar = container.querySelector(
      '[data-slot="editor-status-bar"]',
    ) as HTMLElement;
    expect(statusBar).not.toBeNull();
    // Word count is exposed as a numeric label and the save status is
    // exposed as one of the approved Chinese labels.
    expect(statusBar.textContent ?? "").toMatch(/字数|词数|word/i);
    expect(statusBar.textContent ?? "").toMatch(/已保存|保存|saved/i);
    // Slot details are explicit so styles and test selectors can rely
    // on them.
    expect(
      statusBar.querySelector('[data-slot="editor-status-word-count"]'),
    ).not.toBeNull();
    expect(
      statusBar.querySelector('[data-slot="editor-status-save-status"]'),
    ).not.toBeNull();
  });

  it("groups toolbar, document, and status bar inside a single editor shell", async () => {
    const { container } = await renderWorkspace();
    const shell = container.querySelector(
      '[data-slot="rich-text-editor"]',
    ) as HTMLElement;
    expect(shell).not.toBeNull();
    // The toolbar, document and status bar all live inside the same
    // shell so the visual treatment matches the screenshot.
    const toolbarInside = shell.querySelector('[data-slot="editor-toolbar"]');
    const documentInside = shell.querySelector('[data-slot="script-document"]');
    const statusBarInside = shell.querySelector(
      '[data-slot="editor-status-bar"]',
    );
    expect(toolbarInside).not.toBeNull();
    expect(documentInside).not.toBeNull();
    expect(statusBarInside).not.toBeNull();
    // The status bar sits below the document, NOT above.
    const relation = documentInside!.compareDocumentPosition(statusBarInside!);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the version history strip horizontally below the editor", async () => {
    const { container } = await renderWorkspace();
    const strip = container.querySelector(
      '[data-slot="version-history-strip"]',
    ) as HTMLElement;
    expect(strip).not.toBeNull();
    const cards = strip.querySelectorAll(
      '[data-slot="version-history-card"]',
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    // The cards live in a horizontal layout (the container uses
    // flex-row with overflow-x-auto, no vertical stacking).
    const stripClass = strip.className ?? "";
    expect(stripClass).toMatch(/flex-row/);
    expect(stripClass).toMatch(/overflow-x-auto/);

    // The strip lives BELOW the editor shell, never above it.
    const editor = container.querySelector(
      '[data-slot="rich-text-editor"]',
    ) as HTMLElement;
    expect(editor).not.toBeNull();
    const relation = editor.compareDocumentPosition(strip);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("preserves the approved order of Main column blocks (editor → version strip)", async () => {
    const { container } = await renderWorkspace();
    const main = container.querySelector(
      '[data-slot="script-main-column"]',
    ) as HTMLElement;
    expect(main).not.toBeNull();
    const orderedNodes = [
      "rich-text-editor",
      "version-history-strip",
    ].map((slot) => main.querySelector(`[data-slot="${slot}"]`));
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the right rail in spec order (OutlineStructure → AI Suggestions → Golden Quotes)", async () => {
    const { container } = await renderWorkspace();
    const rightRail = container.querySelector(
      '[data-slot="script-right-rail"]',
    ) as HTMLElement;
    expect(rightRail).not.toBeNull();
    const orderedNodes = [
      "outline-structure-card",
      "ai-writing-suggestions-card",
      "golden-quotes-card",
    ].map((slot) => rightRail.querySelector(`[data-slot="${slot}"]`));
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Each right-rail card surfaces at least one item so it is not an
    // empty shell.
    expect(
      rightRail
        .querySelector('[data-slot="outline-structure-card"]')
        ?.querySelectorAll('[data-slot="outline-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="ai-writing-suggestions-card"]')
        ?.querySelectorAll('[data-slot="ai-suggestion-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="golden-quotes-card"]')
        ?.querySelectorAll('[data-slot="golden-quote-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  });

  it("is wrapped in the shared AppShell with exactly one sidebar and one top header", async () => {
    const { container } = await renderWorkspace();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("marks the Projects nav item as the active page in the sidebar", async () => {
    await renderWorkspace();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/projects");
    expect(active.textContent?.trim()).toBe("项目");
  });

  it("does not introduce a chat-style script editor or hide versions on a separate page", async () => {
    const { container } = await renderWorkspace();
    // Per page-specs §7 and D-008 the page must NOT become a chat
    // writing surface and must NOT push the version history onto a
    // separate page.
    expect(
      container.querySelector('[data-slot="chat-style-editor"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="version-history-page"]'),
    ).toBeNull();
    // The version history lives in the same shell as the editor
    // (specifically in the `version-history-strip` slot).
    expect(
      container.querySelector('[data-slot="version-history-strip"]'),
    ).not.toBeNull();
  });
});
