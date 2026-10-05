import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-136§D-bind⑤][T-201c] 账号页极简版 island 测试:整页 = 「扫码绑定新抖音号」单一主操作 +
// 账号行(真实昵称 + 隐藏)。证:①扫码 → client.loginDouyin + router.refresh;②超时诚实提示不
// refresh;③隐藏 → client.archiveAccount + refresh;④删了手动登记表单 / 平台 tab / 密钥徽标 /
// 涨粉基线框(废设计不再渲染);⑤已隐藏(archived)的号不显。确定性 —— mock client 即时 resolve。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  archiveAccount: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  // 扫码绑定复用设置页同款 loginDouyin;默认 mock 成功登录。
  loginDouyin: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
  beginBind: vi.fn((i: unknown): Promise<unknown> => Promise.resolve({
    status: "bound", accountId: "acct-new", bindAttemptId: "bind-1",
  })),
  startCollection: vi.fn((i: unknown): Promise<unknown> => Promise.resolve({
    attemptId: "run-1", status: "queued",
  })),
  getCollection: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({ status: "complete" })),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    archiveAccount: (i: unknown) => mockClient.archiveAccount(i),
    loginDouyin: (i: unknown) => mockClient.loginDouyin(i),
    beginBind: (i: unknown) => mockClient.beginBind(i),
    startCollection: (i: unknown) => mockClient.startCollection(i),
    getCollection: (i: unknown) => mockClient.getCollection(i),
  },
}));

import {
  CreateAccountForm,
  AccountRow,
  ConnectXhsAccount,
  ConnectKuaishouAccount,
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
  accountHandle: "@已隐藏的号",
  status: "archived",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("account-manager 极简版 island wiring", () => {
  // 抖音-only:PLATFORMS 收敛为单元素 douyin。
  it("PLATFORMS is douyin-only", () => {
    expect([...PLATFORMS]).toEqual(["douyin"]);
  });

  // 扫码绑定新抖音号:点扫码 → client.loginDouyin **必带 forceNew: true**([T-330] 后端走
  // staging 隔离扫码,不会命中旧号 sessionid 直接登进旧号),成功后 router.refresh()
  // 读回真实号(后端按 sec_uid upsert 去重 + 占位合并;端到端 headed 扫码真机待验)。
  it("扫码绑定新抖音号 issues client.loginDouyin(forceNew) then router.refresh", async () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByTestId("bind-douyin-scan"));
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    const arg = mockClient.loginDouyin.mock.calls[0]![0] as { body: unknown };
    expect(arg.body).toEqual({ forceNew: true });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("小红书和快手扫码入口各自调用真实绑定操作", async () => {
    render(<><ConnectXhsAccount /><ConnectKuaishouAccount /></>);
    fireEvent.click(screen.getByTestId("bind-xiaohongshu-scan"));
    await waitFor(() => expect(mockClient.beginBind).toHaveBeenCalledTimes(1));
    expect((mockClient.beginBind.mock.calls[0]![0] as { body: { platform: string } }).body.platform).toBe("xiaohongshu");
    fireEvent.click(screen.getByTestId("bind-kuaishou-scan"));
    await waitFor(() => expect(mockClient.beginBind).toHaveBeenCalledTimes(2));
    expect((mockClient.beginBind.mock.calls[1]![0] as { body: { platform: string } }).body.platform).toBe("kuaishou");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId("view-xiaohongshu-works"));
    expect(window.localStorage.getItem("creatoros:current-account")).toBe("acct-new");
    expect(document.cookie).toContain("creatoros_current_account=acct-new");
    expect(mockRouter.push).toHaveBeenCalledWith("/accounts/works");
  });

  // [T-330] 后端诚实失败(如「扫码成功但读不回账号身份」)→ 错误 message 内联透传给用户,
  // 不吞成笼统文案;且不 refresh(没有假成功)。
  it("扫码绑定失败时透传后端明确错误文案且不 refresh", async () => {
    mockClient.loginDouyin.mockRejectedValueOnce(
      new Error(
        "扫码成功但账号资料与作品列表均未返回可验证身份,已放弃本次绑定,请重试",
      ),
    );
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByTestId("bind-douyin-scan"));
    await waitFor(() =>
      expect(screen.getByText(/未返回可验证身份/)).toBeTruthy(),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
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

  // [⑥][T-201c] 隐藏:点「隐藏」不直接生效 —— 弹二次确认框,须逐字键入确认句才放行 archiveAccount。
  it("隐藏弹二次确认框,键入确认句后才 archiveAccount + refresh", async () => {
    render(<AccountRow account={DOUYIN} />);
    // 点「隐藏」→ 弹框,尚未调 archiveAccount。
    fireEvent.click(screen.getByTestId("account-remove"));
    await waitFor(() =>
      expect(screen.getByTestId("account-remove-dialog")).toBeTruthy(),
    );
    expect(mockClient.archiveAccount).not.toHaveBeenCalled();
    // 「确认隐藏」在键入前禁用。
    const confirmBtn = screen.getByTestId(
      "account-remove-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    // 键入正确确认句 → 放行。
    fireEvent.change(screen.getByTestId("account-remove-confirm-input"), {
      target: { value: "我已确认隐藏该账户" },
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

  // [⑥][T-201c] 键入错误确认句 → 「确认隐藏」保持禁用,不调 archiveAccount。
  it("确认句不匹配时「确认隐藏」禁用且不删", async () => {
    render(<AccountRow account={DOUYIN} />);
    fireEvent.click(screen.getByTestId("account-remove"));
    await waitFor(() =>
      expect(screen.getByTestId("account-remove-dialog")).toBeTruthy(),
    );
    fireEvent.change(screen.getByTestId("account-remove-confirm-input"), {
      target: { value: "确认隐藏" }, // 不等于完整确认句
    });
    const confirmBtn = screen.getByTestId(
      "account-remove-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(mockClient.archiveAccount).not.toHaveBeenCalled();
  });

  // [⑥][T-201c] 末号保护:isOnlyAccount → 「隐藏」禁用,无二次确认框可开。
  it("最后一个号(isOnlyAccount)的隐藏按钮禁用", () => {
    render(<AccountRow account={DOUYIN} isOnlyAccount />);
    const btn = screen.getByTestId("account-remove") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(screen.queryByTestId("account-remove-dialog")).toBeNull();
  });

  // 账号行极简:显真实昵称,不再有密钥徽标 / 涨粉基线框 / 保存基线按钮。
  it("账号行只显真实昵称 + 隐藏,无密钥徽标 / 涨粉基线 / 保存基线", () => {
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
  it("作品目录入口只出现在已接入目录的小红书和快手账号", () => {
    const xhs = { ...DOUYIN, id: "acct-x", platform: "xiaohongshu" as const };
    const kuaishou = { ...DOUYIN, id: "acct-k", platform: "kuaishou" as const };
    const accounts = [DOUYIN, xhs, kuaishou];
    const { rerender } = render(
      <AccountManagerView viewModel={{ accounts, selectedAccountId: DOUYIN.id }} />,
    );
    expect(screen.queryByRole("link", { name: "查看当前账号作品与数据" })).toBeNull();
    rerender(<AccountManagerView viewModel={{ accounts, selectedAccountId: xhs.id }} />);
    expect(screen.getByRole("link", { name: "查看当前账号作品与数据" })).toHaveAttribute("href", "/accounts/works");
    rerender(<AccountManagerView viewModel={{ accounts, selectedAccountId: kuaishou.id }} />);
    expect(screen.getByRole("link", { name: "查看当前账号作品与数据" })).toHaveAttribute("href", "/accounts/works");
  });

  it("已绑定账号显示已绑定，不把平台接入状态误写成待账号核验", () => {
    const xhs = { ...DOUYIN, id: "acct-x", platform: "xiaohongshu" as const };
    render(<AccountManagerView viewModel={{
      accounts: [DOUYIN, xhs],
      capabilities: [{ platform: "xiaohongshu", capability: "bind", supported: true,
        authState: "authorized", runtimeState: "ready", reasonCode: null, lastVerifiedAt: null }],
    }} />);
    const platform = document.querySelector('[data-testid="platform-capability-overview"] [data-platform="xiaohongshu"]');
    expect(platform?.textContent).toContain("账号绑定已绑定");
    expect(platform?.textContent).not.toContain("待账号核验");
    expect(document.querySelector('[data-testid="platform-capability-overview"] [data-platform="douyin"]')?.textContent).toContain("账号绑定已绑定");
  });

  // 删了平台筛选 tab(全部/抖音):整页无 tab 按钮。
  it("无平台筛选 tab(全部/抖音)", () => {
    render(<AccountManagerView viewModel={{ accounts: [DOUYIN] }} />);
    expect(screen.queryByTestId("account-platform-filter")).toBeNull();
    expect(screen.queryByRole("button", { name: "全部" })).toBeNull();
    expect(screen.queryByRole("button", { name: "B站" })).toBeNull();
  });

  // [T-201c] 只显活跃号:archived 的不进列表(隐藏即消失,可逆)。
  it("只显活跃号,已隐藏(archived)的不显", () => {
    render(
      <AccountManagerView viewModel={{ accounts: [DOUYIN, ARCHIVED] }} />,
    );
    const rows = screen.getAllByTestId("account-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-account-id", "acct-d");
    expect(screen.queryByText("@已隐藏的号")).toBeNull();
  });

  // [⑥][T-201c] 只有一个 active 号 → 该行隐藏按钮禁用(末号保护,视图侧传 isOnlyAccount）。
  it("只有一个号时,该号隐藏按钮禁用", () => {
    render(<AccountManagerView viewModel={{ accounts: [DOUYIN] }} />);
    const btn = screen.getByTestId("account-remove") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("无号时显空态引导扫码", () => {
    render(<AccountManagerView viewModel={{ accounts: [] }} />);
    const empty = screen.getByTestId("account-empty-state");
    expect(empty.textContent).toContain("选择平台后扫码");
    // 扫码主按钮仍在(空态也能扫码绑定)。
    expect(screen.getByRole("button", {name:"绑定账号"})).toBeTruthy();
  });
});


describe("T-1051 先选平台再授权", () => {
  it("首屏只有绑定入口，选平台前不显示扫码或启动登录", () => {
    render(<AccountManagerView viewModel={{accounts:[],selectedAccountId:null}} />);
    expect(screen.queryByTestId("bind-douyin-scan")).toBeNull();
    expect(screen.queryByTestId("bind-xiaohongshu-scan")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"绑定账号"}));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mockClient.loginDouyin).not.toHaveBeenCalled();
    expect(mockClient.beginBind).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"小红书"}));
    expect(screen.getByTestId("bind-xiaohongshu-scan")).toBeVisible();
    expect(screen.queryByTestId("bind-douyin-scan")).toBeNull();
    expect(mockClient.beginBind).not.toHaveBeenCalled();
  });
  it("授权中不能关闭切平台或重复发起，失败后可返回重选", async () => {
    let reject!: (reason: Error)=>void;
    mockClient.beginBind.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    render(<AccountManagerView viewModel={{accounts:[],selectedAccountId:null}} />);
    fireEvent.click(screen.getByRole("button",{name:"绑定账号"}));
    fireEvent.click(screen.getByRole("button",{name:"快手"}));
    fireEvent.click(screen.getByTestId("bind-kuaishou-scan"));
    expect(screen.getByRole("button",{name:"返回选择平台"})).toBeDisabled();
    expect(screen.queryByRole("button",{name:"关闭"})).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByTestId("bind-kuaishou-scan"));
    expect(mockClient.beginBind).toHaveBeenCalledOnce();
    reject(new Error("身份未核验，请重试"));
    await screen.findByText("身份未核验，请重试");
    expect(screen.getByRole("button",{name:"返回选择平台"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:"返回选择平台"}));
    expect(screen.getByRole("button",{name:"抖音"})).toBeVisible();
  });
});
