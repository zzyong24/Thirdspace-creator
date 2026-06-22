/**
 * Interaction + state tests for the Publishing Workspace page
 * (Increment 4 functional remediation).
 *
 * Covers:
 *  - a wired action: the Confirm Publish CLIENT lifecycle transition
 *    (draft → ready/scheduled) reflected in the UI,
 *  - the editable title field + tab switching,
 *  - the LOADING / ERROR / EMPTY state rendering driven by the
 *    ViewModel envelope (via `buildPageScenario`).
 *
 * These are additive — the default-state contract assertions live in
 * `publishing-workspace-page.test.tsx` and are untouched.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPublishingViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { PublishingWorkspacePage } from "./publishing-workspace-page";

// The interactive island mounts `useRouter()`; these local-state tests render
// WITHOUT wiring (island degrades to local behavior) so a stub router suffices and
// the typed client is never reached.
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

describe("PublishingWorkspacePage interactions", () => {
  it("transitions the publish lifecycle on Confirm Publish (no network)", () => {
    const fetchSpy = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const { container } = render(
        <PublishingWorkspacePage projectId={PROJECT_ID} />,
      );
      const button = container.querySelector<HTMLButtonElement>(
        '[data-slot="confirm-publish-button"]',
      );
      expect(button).not.toBeNull();
      expect(button!.getAttribute("data-publish-state")).toBe("draft");
      expect(
        container.querySelector('[data-slot="confirm-publish-result"]'),
      ).toBeNull();

      fireEvent.click(button!);

      expect(button!.getAttribute("data-publish-state")).not.toBe("draft");
      expect(
        container.querySelector('[data-slot="confirm-publish-result"]'),
      ).not.toBeNull();
      // No network publication happened.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("edits the title field (controlled input)", () => {
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '[data-slot="title-input"]',
    );
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "新的发布标题" } });
    expect(input!.value).toBe("新的发布标题");
  });

  it("switches the active publishing tab on click", () => {
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} />,
    );
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-slot="publishing-tab"]',
      ),
    );
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs[0]!.getAttribute("data-pressed")).toBe("true");
    fireEvent.click(tabs[1]!);
    expect(tabs[0]!.getAttribute("data-pressed")).toBe("false");
    expect(tabs[1]!.getAttribute("data-pressed")).toBe("true");
  });

  it("toggles a platform card selection", () => {
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} />,
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-slot="platform-select"]',
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(true);
    fireEvent.click(checkbox!);
    expect(checkbox!.checked).toBe(false);
  });
});

describe("PublishingWorkspacePage states", () => {
  it("renders the LOADING state", () => {
    const vm = buildPageScenario(
      () => buildPublishingViewModel(PROJECT_ID),
      "loading",
    );
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(
      container.querySelector('[data-page-state="loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="publishing-grid"]'),
    ).toBeNull();
  });

  it("renders the ERROR state", () => {
    const vm = buildPageScenario(
      () => buildPublishingViewModel(PROJECT_ID),
      "error",
    );
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-error"]'),
    ).not.toBeNull();
  });

  it("renders the EMPTY state", () => {
    const vm = buildPageScenario(
      () => buildPublishingViewModel(PROJECT_ID),
      "empty",
    );
    const { container } = render(
      <PublishingWorkspacePage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
