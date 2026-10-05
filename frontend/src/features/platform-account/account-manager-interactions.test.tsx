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
  listAccountGroups: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  listAccounts: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
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
    listAccountGroups: (i: unknown) => mockClient.listAccountGroups(i),
    listAccounts: (i: unknown) => mockClient.listAccounts(i),
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

  it("扫码响应在卸载后不会写回反馈或刷新工作区", async () => {
    let resolve!:(value:unknown)=>void;mockClient.loginDouyin.mockReturnValueOnce(new Promise(result=>{resolve=result;}));
    const mounted=render(<CreateAccountForm/>);fireEvent.click(screen.getByTestId("bind-douyin-scan"));mounted.unmount();resolve({loggedIn:true});await Promise.resolve();expect(mockRouter.refresh).not.toHaveBeenCalled();
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

describe("account-manager 组管理视图", () => {
 const groups=(accounts:PlatformAccountResource[])=>[{id:"group",userId:"user-a",name:"创作者工作区",status:"active" as const,version:1,createdAt:DOUYIN.createdAt,updatedAt:DOUYIN.updatedAt,members:accounts.map((account,index)=>({id:`member-${index}`,accountId:account.id,groupId:"group",platform:account.platform,accountHandle:account.accountHandle,status:account.status,version:1,joinedAt:account.createdAt,leftAt:null}))}];
 it("显示实际组成员和隐藏状态，提供恢复入口", async () => {
  const all=[DOUYIN,ARCHIVED];mockClient.listAccountGroups.mockResolvedValue(groups(all));mockClient.listAccounts.mockResolvedValue(all);
  render(<AccountManagerView viewModel={{accounts:all,groups:groups(all)}}/>);
  fireEvent.click(screen.getAllByText("账号管理与能力")[1]!);
  expect(await screen.findByRole("button",{name:"恢复平台账号"})).toBeVisible();
  expect(screen.getAllByTestId("account-row")).toHaveLength(2);
 });
 it("现有最后一个平台账号的隐藏保护仍生效", () => {
  mockClient.listAccountGroups.mockResolvedValue(groups([DOUYIN]));mockClient.listAccounts.mockResolvedValue([DOUYIN]);
  render(<AccountManagerView viewModel={{accounts:[DOUYIN],groups:groups([DOUYIN])}}/>);
  expect(screen.getByTestId("account-remove")).toBeDisabled();
 });
 it("没有组时先允许创建工作区，未绑定不阻止创作", () => {
  mockClient.listAccountGroups.mockResolvedValue([]);mockClient.listAccounts.mockResolvedValue([]);
  render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);
  expect(screen.getByRole("button",{name:"创建账号组"})).toBeVisible();
  expect(screen.getByText(/没有平台账号也可以创建项目/)).toBeVisible();
  expect(screen.queryByTestId("bind-douyin-scan")).not.toBeInTheDocument();
 });
});
