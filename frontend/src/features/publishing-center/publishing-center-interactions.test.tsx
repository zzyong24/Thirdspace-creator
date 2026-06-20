/**
 * Interaction + state tests for the Publishing Center page
 * (Increment 4 functional remediation).
 *
 * Covers wired actions:
 *  - content-type tab switching filters the publication table,
 *  - the search box narrows the rows,
 *  - filter chips narrow the rows,
 *  - row checkboxes + select-all drive the batch-selected count,
 *  - pagination changes the visible page,
 *  - a row "查看" action marks the row active,
 * and the LOADING / ERROR / EMPTY state rendering driven by the
 * ViewModel envelope (via `buildPageScenario`).
 *
 * These are additive — the default-state contract assertions live in
 * `publishing-center-page.test.tsx` and are untouched.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { PublishingCenterPage } from "./publishing-center-page";

afterEach(() => {
  cleanup();
});

function countRows(container: HTMLElement): number {
  return container.querySelectorAll(
    '[data-slot="publication-performance-row"]',
  ).length;
}

describe("PublishingCenterPage interactions", () => {
  it("filters the table by a content-type tab", () => {
    const { container } = render(<PublishingCenterPage />);
    const before = countRows(container);
    expect(before).toBeGreaterThan(1);
    const imageTab = container.querySelector<HTMLButtonElement>(
      '[data-slot="page-tab"][data-tab-id="image"]',
    );
    expect(imageTab).not.toBeNull();
    fireEvent.click(imageTab!);
    expect(imageTab!.getAttribute("data-pressed")).toBe("true");
    const filtered = countRows(container);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(before);
  });

  it("filters the table by the search input", () => {
    const { container } = render(<PublishingCenterPage />);
    const before = countRows(container);
    const search = container.querySelector<HTMLInputElement>(
      '[data-slot="publishing-search-input"]',
    );
    expect(search).not.toBeNull();
    fireEvent.change(search!, { target: { value: "不存在的内容zzz" } });
    expect(countRows(container)).toBe(0);
    expect(
      container.querySelector('[data-slot="publication-table-empty"]'),
    ).not.toBeNull();
    fireEvent.change(search!, { target: { value: "" } });
    expect(countRows(container)).toBe(before);
  });

  it("narrows rows with a filter chip", () => {
    const { container } = render(<PublishingCenterPage />);
    const before = countRows(container);
    const recent7 = container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="publishing-filter-chip"]',
    )[1];
    expect(recent7).not.toBeNull();
    fireEvent.click(recent7);
    expect(recent7.getAttribute("data-active")).toBe("true");
    expect(countRows(container)).toBeLessThanOrEqual(before);
  });

  it("tracks the batch-selected count via a row checkbox", () => {
    const { container } = render(<PublishingCenterPage />);
    const count = container.querySelector(
      '[data-slot="batch-selected-count"]',
    );
    expect(count?.textContent).toBe("0");
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-slot="publication-row-checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);
    expect(
      container.querySelector('[data-slot="batch-selected-count"]')?.textContent,
    ).toBe("1");
  });

  it("selects all visible rows via the select-all control", () => {
    const { container } = render(<PublishingCenterPage />);
    const visible = countRows(container);
    const selectAll = container.querySelector<HTMLButtonElement>(
      '[data-slot="batch-select-all"]',
    );
    expect(selectAll).not.toBeNull();
    fireEvent.click(selectAll!);
    expect(
      container.querySelector('[data-slot="batch-selected-count"]')?.textContent,
    ).toBe(String(visible));
  });

  it("changes the page via pagination", () => {
    const { container } = render(<PublishingCenterPage />);
    const pages = container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="pagination-page"]',
    );
    // The default canonical dataset pads to 8 rows → page size 6 → 2 pages.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const firstPageFirstRow = container
      .querySelector('[data-slot="publication-performance-row"]')
      ?.getAttribute("data-publication-id");
    fireEvent.click(pages[1]!);
    expect(pages[1]!.getAttribute("data-page-current")).toBe("true");
    const secondPageFirstRow = container
      .querySelector('[data-slot="publication-performance-row"]')
      ?.getAttribute("data-publication-id");
    expect(secondPageFirstRow).not.toBe(firstPageFirstRow);
  });

  it("activates a row via its 查看 action", () => {
    const { container } = render(<PublishingCenterPage />);
    const row = container.querySelector<HTMLTableRowElement>(
      '[data-slot="publication-performance-row"]',
    );
    expect(row!.getAttribute("data-active")).toBe("false");
    const action = row!.querySelector<HTMLButtonElement>(
      '[data-slot="publication-row-action"]',
    );
    fireEvent.click(action!);
    expect(row!.getAttribute("data-active")).toBe("true");
  });
});

describe("PublishingCenterPage states", () => {
  it("renders the LOADING state", () => {
    const vm = buildPageScenario(
      () => buildPublishingCenterViewModel(),
      "loading",
    );
    const { container } = render(<PublishingCenterPage viewModel={vm} />);
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="publication-table"]'),
    ).toBeNull();
  });

  it("renders the ERROR state", () => {
    const vm = buildPageScenario(
      () => buildPublishingCenterViewModel(),
      "error",
    );
    const { container } = render(<PublishingCenterPage viewModel={vm} />);
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-error"]'),
    ).not.toBeNull();
  });

  it("renders the EMPTY state", () => {
    const vm = buildPageScenario(
      () => buildPublishingCenterViewModel(),
      "empty",
    );
    const { container } = render(<PublishingCenterPage viewModel={vm} />);
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
