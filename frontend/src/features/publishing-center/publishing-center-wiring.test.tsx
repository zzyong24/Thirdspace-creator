/**
 * Interaction tests for the Publishing Center needs-backend batch controls
 * (module 10 Step 5b). The 3 batch mutations fire `publications.transition` over
 * the typed client (mocked here) per selected row, then router.refresh():
 *   - 批量发布 → transition { status: "published" } for each selected non-published
 *     row (already-published rows are skipped — FE-level idempotency)
 *   - 批量下架 → transition { status: "removed" } for each selected published row
 *   - 修改时间 → transition { status: "scheduled" } for each selected draft row
 *
 * Wired-local controls (内容类型 tabs, filter chips, pagination) issue NO transition.
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import { PublishingCenterInteractiveRegion } from "./publishing-center-interactive-region";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  transitionPublication: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "pub", status: "published" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    transitionPublication: (i: unknown) => mockClient.transitionPublication(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  mockClient.transitionPublication.mockClear();
  mockRouter.refresh.mockClear();
});

function renderIsland() {
  const vm = buildPublishingCenterViewModel();
  return { vm, ...render(<PublishingCenterInteractiveRegion viewModel={vm} />) };
}

function clickBatch(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-slot="batch-action-button"][data-action-label="${label}"]`,
  );
  expect(button).not.toBeNull();
  fireEvent.click(button!);
  return button!;
}

function selectAllVisible(container: HTMLElement) {
  fireEvent.click(
    container.querySelector<HTMLButtonElement>(
      '[data-slot="batch-select-all"]',
    )!,
  );
}

describe("Publishing Center batch wiring", () => {
  it("批量发布 transitions each selected non-published row to published, then refresh", async () => {
    const { vm, container } = renderIsland();
    selectAllVisible(container);
    // The visible page rows (PAGE_SIZE = 6) that are not already published.
    const visible = vm.publications.slice(0, 6);
    const toPublish = visible.filter((r) => r.status !== "published");

    clickBatch(container, "批量发布");

    if (toPublish.length === 0) {
      // No eligible rows → no transition (idempotent no-op).
      expect(mockClient.transitionPublication).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() =>
      expect(mockClient.transitionPublication).toHaveBeenCalledTimes(
        toPublish.length,
      ),
    );
    expect(mockClient.transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({ body: { status: "published" } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("批量下架 transitions each selected published row to removed", async () => {
    const { vm, container } = renderIsland();
    selectAllVisible(container);
    const visible = vm.publications.slice(0, 6);
    const toRemove = visible.filter((r) => r.status === "published");

    clickBatch(container, "批量下架");

    if (toRemove.length === 0) {
      expect(mockClient.transitionPublication).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() =>
      expect(mockClient.transitionPublication).toHaveBeenCalledTimes(
        toRemove.length,
      ),
    );
    expect(mockClient.transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({ body: { status: "removed" } }),
    );
  });

  it("修改时间 transitions each selected draft row to scheduled", async () => {
    const { vm, container } = renderIsland();
    selectAllVisible(container);
    const visible = vm.publications.slice(0, 6);
    const toReschedule = visible.filter((r) => r.status === "draft");

    clickBatch(container, "修改时间");

    if (toReschedule.length === 0) {
      expect(mockClient.transitionPublication).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() =>
      expect(mockClient.transitionPublication).toHaveBeenCalledTimes(
        toReschedule.length,
      ),
    );
    expect(mockClient.transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({ body: { status: "scheduled" } }),
    );
  });

  it("batch buttons are disabled with no selection — wired-local tabs issue no transition", async () => {
    const { container } = renderIsland();
    // Nothing selected: clicking a disabled batch button is a no-op.
    const publishBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="batch-action-button"][data-action-label="批量发布"]',
    );
    expect(publishBtn!.disabled).toBe(true);

    // A wired-local content-type tab issues no transition.
    const tab = container.querySelector<HTMLButtonElement>(
      '[data-slot="page-tab"]',
    );
    tab?.click();
    expect(mockClient.transitionPublication).not.toHaveBeenCalled();
  });
});
