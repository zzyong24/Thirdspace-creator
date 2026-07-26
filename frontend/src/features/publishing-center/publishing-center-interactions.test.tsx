/**
 * Interaction + state tests for the Publishing Center page
 * (Increment 4 functional remediation).
 *
 * Covers wired actions:
 *  - content-type tab switching filters the publication table,
 *  - the search box narrows the rows,
 *  - filter chips narrow the rows,
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

  // [T-231①] 批量选择/批量操作已删(live publisher 是 mock,批量 transition 会
  // 铸假数据/毁真数据),对应的 batch-selected-count / select-all 测试同步移除。
  it("no batch operation bar nor row checkboxes render", () => {
    const { container } = render(<PublishingCenterPage />);
    expect(
      container.querySelector('[data-slot="batch-operation-bar"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="publication-row-checkbox"]'),
    ).toBeNull();
  });

  it("does not leave batch selection counters or select-all controls behind", () => {
    const { container } = render(<PublishingCenterPage />);
    expect(
      container.querySelector('[data-slot="batch-selected-count"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="batch-select-all"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-slot="publication-row-checkbox"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="batch-operation-bar"]'),
    ).toHaveLength(0);
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

  // [T-073] 平台侧已隐藏行:默认过滤,「显示已隐藏」开关切换后可见(带「已隐藏」徽标)。
  it("hides platform-hidden rows by default and reveals them via the toggle", () => {
    const base = buildPublishingCenterViewModel();
    // 把第一行标成平台侧已隐藏(hiddenAt 语义 → row.hidden)。
    const hiddenId = base.publications[0]!.id;
    const vm = {
      ...base,
      publications: base.publications.map((row) =>
        row.id === hiddenId ? { ...row, hidden: true } : row,
      ),
    };
    const { container } = render(<PublishingCenterPage viewModel={vm} />);
    // 默认:隐藏行不渲染。
    expect(
      container.querySelector(`[data-publication-id="${hiddenId}"]`),
    ).toBeNull();
    // 开关存在(hiddenCount>0)且带计数。
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-slot="publishing-show-hidden-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute("aria-pressed")).toBe("false");
    // 打开开关 → 隐藏行显示,行上带「已隐藏」徽标 + data-hidden。
    fireEvent.click(toggle!);
    expect(toggle!.getAttribute("aria-pressed")).toBe("true");
    const row = container.querySelector(
      `[data-publication-id="${hiddenId}"]`,
    );
    expect(row).not.toBeNull();
    expect(row!.getAttribute("data-hidden")).toBe("true");
    expect(
      row!.querySelector('[data-slot="publication-hidden-badge"]')?.textContent,
    ).toBe("已隐藏");
    // 再切回 → 重新过滤。
    fireEvent.click(toggle!);
    expect(
      container.querySelector(`[data-publication-id="${hiddenId}"]`),
    ).toBeNull();
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
