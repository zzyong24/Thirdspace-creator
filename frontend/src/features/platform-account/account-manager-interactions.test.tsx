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
  // [T-146] 扫码绑定新抖音号复用设置页同款 loginDouyin;默认 mock 成功登录。
  loginDouyin: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createAccount: (i: unknown) => mockClient.createAccount(i),
    updateAccount: (i: unknown) => mockClient.updateAccount(i),
    archiveAccount: (i: unknown) => mockClient.archiveAccount(i),
    loginDouyin: (i: unknown) => mockClient.loginDouyin(i),
  },
}));

import {
  CreateAccountForm,
  AccountRow,
  PLATFORMS,
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
  // [T-146] 抖音-only:PLATFORMS 收敛为单元素 douyin(此前 6 平台)。
  it("PLATFORMS is douyin-only", () => {
    expect([...PLATFORMS]).toEqual(["douyin"]);
  });

  // [T-146] 扫码绑定新抖音号:点扫码按钮 → 复用设置页同款 client.loginDouyin,
  // 成功后 router.refresh() 读回新号(端到端 headed 扫码真机待验)。
  it("扫码绑定新抖音号 issues client.loginDouyin then router.refresh", async () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByTestId("bind-douyin-scan"));
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    const arg = mockClient.loginDouyin.mock.calls[0]![0] as { body: unknown };
    expect(arg.body).toEqual({});
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("扫码超时(loggedIn=false)提示重试且不 refresh", async () => {
    mockClient.loginDouyin.mockResolvedValueOnce({ loggedIn: false });
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByTestId("bind-douyin-scan"));
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/未检测到登录/)).toBeTruthy(),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("手动登记(次入口)issues client.createAccount platform=douyin then refresh", async () => {
    render(<CreateAccountForm />);
    // 手动表单默认折叠;先展开次入口。
    fireEvent.click(screen.getByTestId("manual-account-toggle"));
    fireEvent.change(screen.getByLabelText("账号 handle"), {
      target: { value: "@new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    await waitFor(() => expect(mockClient.createAccount).toHaveBeenCalledTimes(1));
    const arg = mockClient.createAccount.mock.calls[0]![0] as {
      body: { accountHandle: string; platform: string };
    };
    expect(arg.body.accountHandle).toBe("@new");
    // 抖音-only:平台恒 douyin(无平台下拉)。
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

  it("the platform filter is client-local (抖音-only): filtering issues NO mutation", () => {
    render(
      <AccountManagerView viewModel={{ accounts: [DOUYIN, BILI] }} />,
    );
    // both rows visible under 全部(既有非抖音号仍显示,不隐藏历史数据)。
    expect(screen.getAllByTestId("account-row")).toHaveLength(2);
    // [T-146] 抖音-only:tab 只剩「全部 + 抖音」,B站 tab 已移除。
    expect(screen.queryByRole("button", { name: "B站" })).toBeNull();
    // filter to 抖音 → only the douyin row, no network call
    fireEvent.click(screen.getByRole("button", { name: "抖音" }));
    const rows = screen.getAllByTestId("account-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-platform", "douyin");
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
