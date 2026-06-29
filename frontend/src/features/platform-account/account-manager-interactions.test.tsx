import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Account-manager island wiring test (Step 5a). Proves the needs-backend controls each
// issue their mapped contract op then router.refresh() (the island → client.* →
// router.refresh seam); the client-local platform filter issues NO mutation; and the
// raw secretReference value is NEVER rendered (only a masked indicator, §7.1).
// Deterministic — the mock client resolves immediately, no network/clock.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createAccount: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  updateAccount: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  archiveAccount: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createAccount: (i: unknown) => mockClient.createAccount(i),
    updateAccount: (i: unknown) => mockClient.updateAccount(i),
    archiveAccount: (i: unknown) => mockClient.archiveAccount(i),
  },
}));

import {
  CreateAccountForm,
  AccountRow,
} from "./account-manager-interactive-region";
import { AccountManagerView } from "./account-manager-view";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";

const DOUYIN: PlatformAccountResource = {
  id: "acct-d",
  userId: "user-a",
  platform: "douyin",
  accountHandle: "@douyin-main",
  secretReference: "env:DOUYIN_TOKEN_REF",
  followerBaseline: 1000,
  status: "active",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
};
const BILI: PlatformAccountResource = {
  ...DOUYIN,
  id: "acct-b",
  platform: "bilibili",
  accountHandle: "@bili-main",
  secretReference: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("account-manager island wiring", () => {
  it("新增账号 issues client.createAccount then router.refresh", async () => {
    render(<CreateAccountForm />);
    fireEvent.change(screen.getByLabelText("账号 handle"), {
      target: { value: "@new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    await waitFor(() => expect(mockClient.createAccount).toHaveBeenCalledTimes(1));
    const arg = mockClient.createAccount.mock.calls[0]![0] as {
      body: { accountHandle: string; platform: string };
    };
    expect(arg.body.accountHandle).toBe("@new");
    expect(arg.body.platform).toBe("douyin");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("保存基线 issues client.updateAccount with the new followerBaseline", async () => {
    render(<AccountRow account={DOUYIN} />);
    fireEvent.change(screen.getByLabelText(`涨粉基线 ${DOUYIN.accountHandle}`), {
      target: { value: "2500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存基线" }));
    await waitFor(() => expect(mockClient.updateAccount).toHaveBeenCalledTimes(1));
    const arg = mockClient.updateAccount.mock.calls[0]![0] as {
      params: { accountId: string };
      body: { followerBaseline: number };
    };
    expect(arg.params.accountId).toBe("acct-d");
    expect(arg.body.followerBaseline).toBe(2500);
  });

  it("归档 issues client.archiveAccount then router.refresh", async () => {
    render(<AccountRow account={DOUYIN} />);
    fireEvent.click(screen.getByRole("button", { name: "归档" }));
    await waitFor(() =>
      expect(mockClient.archiveAccount).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.archiveAccount.mock.calls[0]![0] as {
      params: { accountId: string };
    };
    expect(arg.params.accountId).toBe("acct-d");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("the platform filter is client-local: filtering issues NO mutation", () => {
    render(
      <AccountManagerView viewModel={{ accounts: [DOUYIN, BILI] }} />,
    );
    // both rows visible under 全部
    expect(screen.getAllByTestId("account-row")).toHaveLength(2);
    // filter to bilibili → only the bilibili row, no network call
    fireEvent.click(screen.getByRole("button", { name: "B站" }));
    const rows = screen.getAllByTestId("account-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-platform", "bilibili");
    expect(mockClient.createAccount).not.toHaveBeenCalled();
    expect(mockClient.updateAccount).not.toHaveBeenCalled();
    expect(mockClient.archiveAccount).not.toHaveBeenCalled();
  });

  it("never renders the raw secretReference value (only a masked indicator, §7.1)", () => {
    render(<AccountManagerView viewModel={{ accounts: [DOUYIN, BILI] }} />);
    // the raw reference string must NOT appear in the DOM.
    expect(screen.queryByText("env:DOUYIN_TOKEN_REF")).toBeNull();
    // a configured account shows the masked indicator.
    const indicators = screen.getAllByTestId("account-secret-indicator");
    expect(indicators.some((el) => el.textContent === "已配置密钥引用")).toBe(true);
    expect(indicators.some((el) => el.textContent === "未配置密钥")).toBe(true);
  });
});
