/**
 * Interaction + state tests for the Knowledge & Memory page
 * (Increment 4 functional remediation).
 *
 * Covers:
 *  - a wired action: the search input narrows the rendered recent list,
 *  - the filter chips narrow the list by knowledge type + row selection,
 *  - the LOADING / ERROR / EMPTY state rendering driven by the
 *    ViewModel envelope (via `buildPageScenario`).
 *
 * These are additive — the default-state contract assertions live in
 * `knowledge-page.test.tsx` and are untouched.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildKnowledgeViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { KnowledgePage } from "./knowledge-page";

afterEach(() => {
  cleanup();
});

function countRows(container: HTMLElement): number {
  return container.querySelectorAll('[data-slot="recent-knowledge-row"]')
    .length;
}

describe("KnowledgePage interactions", () => {
  it("filters the recent list by the search input", () => {
    const { container } = render(<KnowledgePage />);
    const before = countRows(container);
    expect(before).toBeGreaterThan(1);
    const search = container.querySelector<HTMLInputElement>(
      '[data-slot="knowledge-search-input"]',
    );
    expect(search).not.toBeNull();
    // A query that matches no row title/tag narrows the list to zero.
    fireEvent.change(search!, { target: { value: "不存在的查询zzz" } });
    expect(countRows(container)).toBe(0);
    expect(
      container.querySelector('[data-slot="recent-knowledge-empty"]'),
    ).not.toBeNull();
    // Clearing restores the full list.
    fireEvent.change(search!, { target: { value: "" } });
    expect(countRows(container)).toBe(before);
  });

  it("filters the list by a type chip", () => {
    const { container } = render(<KnowledgePage />);
    const before = countRows(container);
    const noteChip = container.querySelector<HTMLButtonElement>(
      '[data-slot="knowledge-filter-chip"][data-filter-id="笔记"]',
    );
    expect(noteChip).not.toBeNull();
    fireEvent.click(noteChip!);
    expect(noteChip!.getAttribute("data-pressed")).toBe("true");
    const filtered = countRows(container);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThanOrEqual(before);
    // Every visible row is of type 笔记.
    const types = Array.from(
      container.querySelectorAll('[data-slot="recent-knowledge-row"] td'),
    );
    // (the second cell per row is the type — assert at least one 笔记 cell)
    expect(
      Array.from(
        container.querySelectorAll('[data-slot="recent-knowledge-row"]'),
      ).every((row) => (row.textContent ?? "").includes("笔记")),
    ).toBe(true);
    void types;
  });

  it("selects a recent-knowledge row on click", () => {
    const { container } = render(<KnowledgePage />);
    const row = container.querySelector<HTMLTableRowElement>(
      '[data-slot="recent-knowledge-row"]',
    );
    expect(row).not.toBeNull();
    expect(row!.getAttribute("data-selected")).toBe("false");
    fireEvent.click(row!);
    expect(row!.getAttribute("data-selected")).toBe("true");
  });
});

describe("KnowledgePage states", () => {
  it("renders the LOADING state", () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "loading");
    const { container } = render(<KnowledgePage viewModel={vm} />);
    expect(
      container.querySelector('[data-page-state="loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="knowledge-grid"]'),
    ).toBeNull();
  });

  it("renders the ERROR state", () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "error");
    const { container } = render(<KnowledgePage viewModel={vm} />);
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-error"]'),
    ).not.toBeNull();
  });

  it("renders the EMPTY state", () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "empty");
    const { container } = render(<KnowledgePage viewModel={vm} />);
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
