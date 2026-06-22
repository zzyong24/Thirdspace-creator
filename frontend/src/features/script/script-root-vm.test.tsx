/**
 * GAP-SCR-1 — Script root VM 读侧做真 (版本列表 / 大纲 / AI建议 / 金句).
 *
 * Locks the per-field override behaviour of `ScriptWorkspacePage`:
 *   - `versionsOverride` (REAL artifacts.versions.list) replaces the fixture
 *     version cards; an empty override renders the "暂无版本记录" empty state,
 *   - `outlineOverride` (derived from the CURRENT version's section headings)
 *     replaces the fixture outline,
 *   - `goldenQuotesOverride` (derived from emphasis sections) replaces the
 *     fixture quotes,
 *   - `aiSuggestionsGuide` swaps the AI 写作建议 card for its honest "AI 生成区"
 *     empty-state guidance (no fixture桩) — there is no deterministic suggestions
 *     producer this wave.
 *
 * The page mounts `ScriptDraftIsland` (→ AdoptCandidateCard → useRouter) when the
 * fixture project resolves a script artifact id, so `next/navigation` is stubbed.
 */

import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

import { ScriptWorkspacePage } from "./script-workspace-page";

const PROJECT_ID = "project-ainativebrowser";

afterEach(() => {
  cleanup();
});

describe("ScriptWorkspacePage — GAP-SCR-1 root VM overrides", () => {
  it("renders REAL version cards from versionsOverride", () => {
    const { container } = render(
      <ScriptWorkspacePage
        projectId={PROJECT_ID}
        versionsOverride={[
          { id: "ver-2", label: "脚本 · v2 · AI 草稿", createdAt: "2026-06-22T10:00:00.000Z" },
          { id: "ver-1", label: "脚本 · v1", createdAt: "2026-06-21T10:00:00.000Z" },
        ]}
      />,
    );
    const cards = container.querySelectorAll(
      '[data-slot="version-history-card"]',
    );
    expect(cards).toHaveLength(2);
    expect(container.textContent).toContain("脚本 · v2 · AI 草稿");
    // Real ids drive the per-card restore target.
    expect(
      container.querySelector('[data-version-id="ver-2"]'),
    ).not.toBeNull();
  });

  it("shows the empty version state when versionsOverride is an empty array", () => {
    const { container } = render(
      <ScriptWorkspacePage projectId={PROJECT_ID} versionsOverride={[]} />,
    );
    expect(
      container.querySelectorAll('[data-slot="version-history-card"]'),
    ).toHaveLength(0);
    const strip = container.querySelector(
      '[data-slot="version-history-strip"]',
    ) as HTMLElement;
    expect(strip.textContent).toContain("暂无版本记录");
  });

  it("renders the REAL outline derived from section headings", () => {
    const { container } = render(
      <ScriptWorkspacePage
        projectId={PROJECT_ID}
        outlineOverride={[
          { id: "o-1", heading: "开场钩子", position: 0 },
          { id: "o-2", heading: "核心论点", position: 1 },
        ]}
      />,
    );
    const rows = container
      .querySelector('[data-slot="outline-structure-card"]')
      ?.querySelectorAll('[data-slot="outline-row"]');
    expect(rows).toHaveLength(2);
    expect(container.textContent).toContain("开场钩子");
    expect(container.textContent).toContain("核心论点");
  });

  it("shows the outline empty-state guidance when outlineOverride is empty", () => {
    const { container } = render(
      <ScriptWorkspacePage projectId={PROJECT_ID} outlineOverride={[]} />,
    );
    const card = container.querySelector(
      '[data-slot="outline-structure-card"]',
    ) as HTMLElement;
    expect(
      card.querySelectorAll('[data-slot="outline-row"]'),
    ).toHaveLength(0);
    expect(card.textContent).toContain("保存或生成脚本后");
  });

  it("renders REAL golden quotes from goldenQuotesOverride", () => {
    const { container } = render(
      <ScriptWorkspacePage
        projectId={PROJECT_ID}
        goldenQuotesOverride={[{ id: "q-1", text: "这就是 AI 原生浏览器" }]}
      />,
    );
    const rows = container
      .querySelector('[data-slot="golden-quotes-card"]')
      ?.querySelectorAll('[data-slot="golden-quote-row"]');
    expect(rows).toHaveLength(1);
    expect(container.textContent).toContain("这就是 AI 原生浏览器");
  });

  it("renders the AI suggestions honest empty-state when aiSuggestionsGuide is set", () => {
    const { container } = render(
      <ScriptWorkspacePage projectId={PROJECT_ID} aiSuggestionsGuide />,
    );
    const card = container.querySelector(
      '[data-slot="ai-writing-suggestions-card"]',
    ) as HTMLElement;
    expect(card.getAttribute("data-ai-region")).toBe("true");
    expect(card.getAttribute("data-empty")).toBe("guide");
    // No fixture桩 suggestion rows when in guide mode.
    expect(
      card.querySelectorAll('[data-slot="ai-suggestion-row"]'),
    ).toHaveLength(0);
    expect(card.textContent).toContain("帮我写分镜脚本");
  });
});
