import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Publishing workspace 内容日历 cells wiring test (Step 5a, module 22 接管). Proves:
//  - with calendarWiring, clicking an EMPTY calendar cell issues
//    accounts.calendar.entries.create { plannedAt } via the mocked client then
//    router.refresh() (the inert calendar is now backed by a real op, C-2).
//  - the plannedAt is deterministic from the injected weekStart base instant (no
//    Date.now in the region/cell, C-5).
//  - without calendarWiring (default), the cells stay decorative (NOT buttons) and
//    issue no mutation.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createPublicationRevision: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createEntry: (i: unknown) => mockClient.createEntry(i),
    createPublicationRevision: (i: unknown) =>
      mockClient.createPublicationRevision(i),
  },
}));

import { PublishingInteractiveRegion } from "./publishing-interactive-region";
import { buildPublishingViewModel } from "@/fixtures/selectors";

const PROJECT_ID = "project-ainativebrowser";
const WEEK_START = "2026-07-20T00:00:00.000Z"; // injected base instant (C-5)

function viewModel() {
  return buildPublishingViewModel(PROJECT_ID);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("publishing 内容日历 cells wiring", () => {
  it("clicking an empty cell issues createEntry { plannedAt } then router.refresh", async () => {
    render(
      <PublishingInteractiveRegion
        viewModel={viewModel()}
        calendarWiring={{ accountId: "acct-d", weekStart: WEEK_START }}
      />,
    );
    // The fixture's 周四 is the empty cell (index 3) — exposed as a create affordance.
    const cell = screen.getByRole("button", { name: "为周四新增计划" });
    fireEvent.click(cell);
    await waitFor(() => expect(mockClient.createEntry).toHaveBeenCalledTimes(1));
    const arg = mockClient.createEntry.mock.calls[0]![0] as {
      params: { accountId: string };
      body: { plannedAt: string };
    };
    expect(arg.params.accountId).toBe("acct-d");
    // index 3 → weekStart + 3 days, deterministic.
    expect(arg.body.plannedAt).toBe("2026-07-23T00:00:00.000Z");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("without calendarWiring the cells stay decorative (no button, no mutation)", () => {
    const { container } = render(
      <PublishingInteractiveRegion viewModel={viewModel()} />,
    );
    expect(
      screen.queryByRole("button", { name: "为周四新增计划" }),
    ).toBeNull();
    const cells = container.querySelectorAll(
      '[data-slot="content-calendar-cell"]',
    );
    expect(cells.length).toBe(7);
    for (const c of cells) {
      expect(c.getAttribute("data-clickable")).toBe("false");
    }
    expect(mockClient.createEntry).not.toHaveBeenCalled();
  });
});
