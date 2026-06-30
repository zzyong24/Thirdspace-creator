/**
 * Interaction + state tests for the Production Workspace page
 * (Increment 4 functional remediation).
 *
 * Covers:
 *  - a wired action: switching the active asset category tab,
 *  - the LOADING / ERROR / EMPTY state rendering driven by the
 *    ViewModel envelope (via `buildPageScenario`).
 *
 * These are additive — the default-state contract assertions live in
 * `production-workspace-page.test.tsx` and are untouched.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProductionViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { ProductionWorkspacePage } from "./production-workspace-page";

// The interactive island mounts `useRouter()`; these local-state tests render
// without wiring (island degrades to local behavior) so a stub router suffices.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

const PROJECT_ID = "project-ainativebrowser";

afterEach(() => {
  cleanup();
});

describe("ProductionWorkspacePage interactions", () => {
  it("switches the active asset category tab on click", () => {
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} />,
    );
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-slot="asset-category-tab"]',
      ),
    );
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs[0]!.getAttribute("data-pressed")).toBe("true");
    expect(tabs[1]!.getAttribute("data-pressed")).toBe("false");

    fireEvent.click(tabs[1]!);

    expect(tabs[0]!.getAttribute("data-pressed")).toBe("false");
    expect(tabs[1]!.getAttribute("data-pressed")).toBe("true");
  });

  it("toggles a settings switch from its controlled state", () => {
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-slot="settings-row-toggle"]',
    );
    expect(toggle).not.toBeNull();
    const before = toggle!.getAttribute("aria-checked");
    fireEvent.click(toggle!);
    expect(toggle!.getAttribute("aria-checked")).not.toBe(before);
  });

  it("appends a timeline segment and selects it via 添加章节", () => {
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} />,
    );
    const before = container.querySelectorAll(
      '[data-slot="timeline-segment-card"]',
    ).length;
    const addButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="timeline-add-segment"]',
    );
    expect(addButton).not.toBeNull();
    fireEvent.click(addButton!);
    const after = container.querySelectorAll(
      '[data-slot="timeline-segment-card"]',
    );
    expect(after.length).toBe(before + 1);
    const selected = container.querySelector(
      '[data-slot="timeline-segment-card"][data-selected="true"]',
    );
    expect(selected).not.toBeNull();
  });

  // T-010: 视频导出 = NLE 级真实渲染(本任务不做真),按钮真禁用 + 标「规划中」。
  // 不再有「点了 → data-export-state=done + 假成功提示」的误导流程。
  it("marks the export button as planned (disabled, no fake success)", () => {
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} />,
    );
    const exportButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="export-button"]',
    );
    expect(exportButton).not.toBeNull();
    expect(exportButton!.disabled).toBe(true);
    expect(exportButton!.getAttribute("data-planned")).toBe("true");
    expect(exportButton!.getAttribute("data-export-state")).toBe("planned");
    // 显式「规划中」说明存在,且不再有假成功结果。
    expect(
      container.querySelector('[data-slot="export-planned-note"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="export-result"]'),
    ).toBeNull();
  });
});

describe("ProductionWorkspacePage states", () => {
  it("renders the LOADING state", () => {
    const vm = buildPageScenario(
      () => buildProductionViewModel(PROJECT_ID),
      "loading",
    );
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(
      container.querySelector('[data-page-state="loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="production-grid"]'),
    ).toBeNull();
  });

  it("renders the ERROR state", () => {
    const vm = buildPageScenario(
      () => buildProductionViewModel(PROJECT_ID),
      "error",
    );
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    const message = container.querySelector(
      '[data-slot="page-state-error-message"]',
    );
    expect(message).not.toBeNull();
    expect(message!.textContent ?? "").toContain("示例错误");
  });

  it("renders the EMPTY state", () => {
    const vm = buildPageScenario(
      () => buildProductionViewModel(PROJECT_ID),
      "empty",
    );
    const { container } = render(
      <ProductionWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
