import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-136§D-bind⑤] 账号页极简版 island 测试:整页 = 「扫码绑定新抖音号」单一主操作 +
// 账号行(真实昵称 + 移除)。证:①扫码 → client.loginDouyin + router.refresh;②超时诚实提示不
// refresh;③移除 → client.archiveAccount + refresh;④删了手动登记表单 / 平台 tab / 密钥徽标 /
// 涨粉基线框(废设计不再渲染);⑤已移除(archived)的号不显。确定性 —— mock client 即时 resolve。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  archiveAccount: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  // 扫码绑定复用设置页同款 loginDouyin;默认 mock 成功登录。
  loginDouyin: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
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
  accountHandle: "@抖音真实昵称",
  externalAccountId: "sec-uid-d", // [T-201b]
  secretReference: null,
  followerBaseline: 1000,
  status: "active",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
};
const ARCHIVED: PlatformAccountResource = {
  ...DOUYIN,
  id: "acct-arch",
  accountHandle: "@已移除的号",
  status: "archived",
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("account-manager 极简版 island wiring", () => {
  // 抖音-only:PLATFORMS 收敛为单元素 douyin。
  it("PLATFORMS is douyin-only", () => {
    expect([...PLATFORMS]).toEqual(["douyin"]);
  });

  // 扫码绑定新抖音号:点扫码 → 复用设置页同款 client.loginDouyin,成功后 router.refresh()
  // 读回真实号(后端 upsert 去重 + 占位合并;端到端 headed 扫码真机待验)。
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
    await waitFor(() => expect(screen.getByText(/未检测到登录/)).toBeTruthy());
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  // 废设计已删:扫码卡里不再有手动登记表单(handle / 密钥引用 / 涨粉基线 / 「新增账号」)。
  it("扫码卡不再渲染手动登记表单 / 密钥 / 涨粉基线", () => {
    render(<CreateAccountForm />);
    expect(screen.queryByTestId("manual-account-toggle")).toBeNull();
    expect(screen.queryByTestId("manual-account-form")).toBeNull();
    expect(screen.queryByLabelText("账号 handle")).toBeNull();
    expect(screen.queryByLabelText("密钥引用")).toBeNull();
    expect(screen.queryByLabelText("涨粉基线")).toBeNull();
    expect(screen.queryByRole("button", { name: "新增账号" })).toBeNull();
  });

  // [⑥] 移除:点「移除」不直接删 —— 弹二次确认框,须逐字键入确认句才放行 archiveAccount。
  it("移除弹二次确认框,键入确认句后才 archiveAccount + refresh", async () => {
    render(<AccountRow account={DOUYIN} />);
    // 点「移除」→ 弹框,尚未调 archiveAccount。
    fireEvent.click(screen.getByTestId("account-remove"));
    await waitFor(() =>
      expect(screen.getByTestId("account-remove-dialog")).toBeTruthy(),
    );
    expect(mockClient.archiveAccount).not.toHaveBeenCalled();
    // 「确认移除」在键入前禁用。
    const confirmBtn = screen.getByTestId(
      "account-remove-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    // 键入正确确认句 → 放行。
    fireEvent.change(screen.getByTestId("account-remove-confirm-input"), {
      target: { value: "我已确认移除该账户" },
    });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(mockClient.archiveAccount).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.archiveAccount.mock.calls[0]![0] as {
      params: { accountId: string };
    };
    expect(arg.params.accountId).toBe("acct-d");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  // [⑥] 键入错误确认句 → 「确认移除」保持禁用,不调 archiveAccount。
  it("确认句不匹配时「确认移除」禁用且不删", async () => {
    render(<AccountRow account={DOUYIN} />);
    fireEvent.click(screen.getByTestId("account-remove"));
    await waitFor(() =>
      expect(screen.getByTestId("account-remove-dialog")).toBeTruthy(),
    );
    fireEvent.change(screen.getByTestId("account-remove-confirm-input"), {
      target: { value: "确认移除" }, // 不等于完整确认句
    });
    const confirmBtn = screen.getByTestId(
      "account-remove-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(mockClient.archiveAccount).not.toHaveBeenCalled();
  });

  // [⑥] 末号保护:isOnlyAccount → 「移除」禁用,无二次确认框可开。
  it("最后一个号(isOnlyAccount)的移除按钮禁用", () => {
    render(<AccountRow account={DOUYIN} isOnlyAccount />);
    const btn = screen.getByTestId("account-remove") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(screen.queryByTestId("account-remove-dialog")).toBeNull();
  });

  // 账号行极简:显真实昵称,不再有密钥徽标 / 涨粉基线框 / 保存基线按钮。
  it("账号行只显真实昵称 + 移除,无密钥徽标 / 涨粉基线 / 保存基线", () => {
    render(<AccountRow account={DOUYIN} />);
    expect(screen.getByText("@抖音真实昵称")).toBeTruthy();
    expect(screen.getByTestId("account-remove")).toBeTruthy();
    expect(screen.queryByTestId("account-secret-indicator")).toBeNull();
    expect(
      screen.queryByLabelText(`涨粉基线 ${DOUYIN.accountHandle}`),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "保存基线" })).toBeNull();
  });

  // 抖音号 ID:契约随行带 externalId 时显「抖音号 <ID>」;无则不显(不造假)。
  it("无 externalId 时不显抖音号 ID(不造假)", () => {
    render(<AccountRow account={DOUYIN} />);
    expect(
      document.querySelector('[data-slot="account-external-id"]'),
    ).toBeNull();
  });

  it("有 externalId 时显抖音号 ID", () => {
    render(
      <AccountRow
        account={
          {
            ...DOUYIN,
            externalId: "douyin12345",
          } as unknown as PlatformAccountResource
        }
      />,
    );
    const idEl = document.querySelector('[data-slot="account-external-id"]');
    expect(idEl?.textContent).toContain("douyin12345");
  });
});

describe("account-manager 极简版 view", () => {
  // 删了平台筛选 tab(全部/抖音):整页无 tab 按钮。
  it("无平台筛选 tab(全部/抖音)", () => {
    render(<AccountManagerView viewModel={{ accounts: [DOUYIN] }} />);
    expect(screen.queryByTestId("account-platform-filter")).toBeNull();
    expect(screen.queryByRole("button", { name: "全部" })).toBeNull();
    expect(screen.queryByRole("button", { name: "B站" })).toBeNull();
  });

  // 只显活跃号:archived 的不进列表(移除即消失,可逆)。
  it("只显活跃号,已移除(archived)的不显", () => {
    render(
      <AccountManagerView viewModel={{ accounts: [DOUYIN, ARCHIVED] }} />,
    );
    const rows = screen.getAllByTestId("account-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-account-id", "acct-d");
    expect(screen.queryByText("@已移除的号")).toBeNull();
  });

  // [⑥] 只有一个 active 号 → 该行移除按钮禁用(末号保护,视图侧传 isOnlyAccount）。
  it("只有一个号时,该号移除按钮禁用", () => {
    render(<AccountManagerView viewModel={{ accounts: [DOUYIN] }} />);
    const btn = screen.getByTestId("account-remove") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("无号时显空态引导扫码", () => {
    render(<AccountManagerView viewModel={{ accounts: [] }} />);
    const empty = screen.getByTestId("account-empty-state");
    expect(empty.textContent).toContain("扫码绑定新抖音号");
    // 扫码主按钮仍在(空态也能扫码绑定)。
    expect(screen.getByTestId("bind-douyin-scan")).toBeTruthy();
  });
});
