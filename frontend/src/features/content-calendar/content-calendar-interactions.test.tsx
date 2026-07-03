import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Content-calendar island wiring test (Step 5b). Proves the needs-backend controls each
// issue their mapped contract op then router.refresh() (island → client.* →
// router.refresh seam): 新增计划 → createEntry; 改期/备注保存 → updateEntry; 标记已发布 →
// transitionEntry; 删除 → deleteEntry; 发布节奏保存 → upsertCadence. The attainment badge
// renders from the accounts.cadence.attainment envelope (% + 断更 banner). Deterministic
// — the mock client resolves immediately; NO Date.now / Math.random / fetch.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  updateEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  transitionEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  deleteEntry: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  upsertCadence: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  // [T-055h③/T-063c] 标记已发布可带链接 → 一并登记 publication。
  registerPublishedPublication: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve(i),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createEntry: (i: unknown) => mockClient.createEntry(i),
    updateEntry: (i: unknown) => mockClient.updateEntry(i),
    transitionEntry: (i: unknown) => mockClient.transitionEntry(i),
    deleteEntry: (i: unknown) => mockClient.deleteEntry(i),
    upsertCadence: (i: unknown) => mockClient.upsertCadence(i),
    registerPublishedPublication: (i: unknown) =>
      mockClient.registerPublishedPublication(i),
  },
}));

import {
  AddSlotForm,
  EntryRow,
  CadenceEditor,
  AttainmentBadge,
} from "./content-calendar-interactive-region";
import { ContentCalendarView } from "./content-calendar-view";
import type {
  ContentCalendarEntryResource,
  CadenceAttainmentResource,
} from "@creatoros/backend/modules/content-calendar";

const ACC = "acct-d";

const PLANNED: ContentCalendarEntryResource = {
  id: "cal-1",
  userId: "user-a",
  accountId: ACC,
  plannedAt: "2026-07-21T09:00:00.000Z",
  contentOutputId: null,
  candidateId: null,
  status: "planned",
  note: "",
  publishedAt: null,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

const LAGGING_ATTAINMENT: CadenceAttainmentResource = {
  accountId: ACC,
  from: "2026-06-22T00:00:00.000Z",
  to: "2026-07-20T00:00:00.000Z",
  plannedCount: 1,
  publishedCount: 3,
  missedCount: 1,
  expectedCount: 4,
  attainmentRatio: 0.75,
  gapDays: 9,
  isLagging: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("content-calendar island wiring", () => {
  it("新增计划 issues client.createEntry then router.refresh", async () => {
    render(<AddSlotForm accountId={ACC} />);
    fireEvent.change(screen.getByLabelText("计划时间"), {
      target: { value: "2026-07-25T09:00:00.000Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增计划" }));
    await waitFor(() => expect(mockClient.createEntry).toHaveBeenCalledTimes(1));
    const arg = mockClient.createEntry.mock.calls[0]![0] as {
      params: { accountId: string };
      body: { plannedAt: string };
    };
    expect(arg.params.accountId).toBe(ACC);
    expect(arg.body.plannedAt).toBe("2026-07-25T09:00:00.000Z");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("改期 issues client.updateEntry with the new plannedAt", async () => {
    render(<EntryRow entry={PLANNED} />);
    fireEvent.change(screen.getByLabelText(`改期 ${PLANNED.id}`), {
      target: { value: "2026-07-28T09:00:00.000Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mockClient.updateEntry).toHaveBeenCalledTimes(1));
    const arg = mockClient.updateEntry.mock.calls[0]![0] as {
      params: { entryId: string };
      body: { plannedAt?: string };
    };
    expect(arg.params.entryId).toBe("cal-1");
    expect(arg.body.plannedAt).toBe("2026-07-28T09:00:00.000Z");
  });

  it("标记已发布 issues client.transitionEntry { status: published }", async () => {
    render(<EntryRow entry={PLANNED} />);
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    await waitFor(() =>
      expect(mockClient.transitionEntry).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.transitionEntry.mock.calls[0]![0] as {
      params: { entryId: string };
      body: { status: string };
    };
    expect(arg.params.entryId).toBe("cal-1");
    expect(arg.body.status).toBe("published");
  });

  it("[T-055h③] 挂 output 的条目带链接标记 → 先 registerPublishedPublication 再 transitionEntry", async () => {
    const entry = { ...PLANNED, contentOutputId: "output-1" };
    render(<EntryRow entry={entry} />);
    fireEvent.change(screen.getByLabelText(`发布链接 ${entry.id}`), {
      target: {
        value: "https://www.douyin.com/video/7423000000000000001",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    await waitFor(() =>
      expect(mockClient.registerPublishedPublication).toHaveBeenCalledTimes(1),
    );
    const reg = mockClient.registerPublishedPublication.mock.calls[0]![0] as {
      params: { outputId: string };
      body: { platform: string; externalId: string };
    };
    expect(reg.params.outputId).toBe("output-1");
    expect(reg.body.platform).toBe("douyin");
    expect(reg.body.externalId).toBe("7423000000000000001");
    await waitFor(() =>
      expect(mockClient.transitionEntry).toHaveBeenCalledTimes(1),
    );
  });

  it("[T-055h③] 链接解析不出编号 → 就地提示,状态不改、不发写 op(不做假登记)", async () => {
    const entry = { ...PLANNED, contentOutputId: "output-1" };
    render(<EntryRow entry={entry} />);
    fireEvent.change(screen.getByLabelText(`发布链接 ${entry.id}`), {
      target: { value: "https://v.douyin.com/iAbCdEf/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "标记已发布" }));
    expect(
      screen.getByTestId("calendar-publish-link-error"),
    ).toBeInTheDocument();
    expect(mockClient.registerPublishedPublication).not.toHaveBeenCalled();
    expect(mockClient.transitionEntry).not.toHaveBeenCalled();
  });

  it("[T-055h③] 无 output 的条目不渲染链接输入,标记走原 transitionEntry", async () => {
    render(<EntryRow entry={PLANNED} />);
    expect(screen.queryByLabelText(`发布链接 ${PLANNED.id}`)).toBeNull();
  });

  it("删除 issues client.deleteEntry then router.refresh", async () => {
    render(<EntryRow entry={PLANNED} />);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(mockClient.deleteEntry).toHaveBeenCalledTimes(1));
    const arg = mockClient.deleteEntry.mock.calls[0]![0] as {
      params: { entryId: string };
    };
    expect(arg.params.entryId).toBe("cal-1");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("发布节奏保存 issues client.upsertCadence with the chosen frequency", async () => {
    render(<CadenceEditor accountId={ACC} cadence={null} />);
    fireEvent.change(screen.getByLabelText("发布频率"), {
      target: { value: "daily" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存节奏" }));
    await waitFor(() =>
      expect(mockClient.upsertCadence).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.upsertCadence.mock.calls[0]![0] as {
      params: { accountId: string };
      body: { frequency: string };
    };
    expect(arg.params.accountId).toBe(ACC);
    expect(arg.body.frequency).toBe("daily");
  });

  it("renders attainment % + 断更 banner from the attainment envelope (no client clock)", () => {
    render(<AttainmentBadge attainment={LAGGING_ATTAINMENT} />);
    expect(screen.getByText("节奏达成率 75%")).toBeTruthy();
    const banner = screen.getByTestId("cadence-gap-banner");
    expect(banner.textContent).toContain("已断更 9 天");
  });

  it("renders entries by their real server status (no client-invented state, C-2)", () => {
    render(
      <ContentCalendarView
        viewModel={{
          accountId: ACC,
          accounts: [],
          entries: [
            PLANNED,
            { ...PLANNED, id: "cal-2", status: "missed" },
            { ...PLANNED, id: "cal-3", status: "published" },
          ],
          cadence: null,
          attainment: LAGGING_ATTAINMENT,
          window: { from: LAGGING_ATTAINMENT.from, to: LAGGING_ATTAINMENT.to },
        }}
      />,
    );
    const rows = screen.getAllByTestId("calendar-entry-row");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual([
      "planned",
      "missed",
      "published",
    ]);
    // no mutation fired on a pure render.
    expect(mockClient.createEntry).not.toHaveBeenCalled();
  });
});
