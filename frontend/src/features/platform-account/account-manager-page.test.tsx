import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountManagerPage, type AccountManagerReadClient, type AccountManagerViewModel } from "./account-manager-page";

vi.mock("./account-manager-view", () => ({
  AccountManagerView: ({ viewModel }: { viewModel: AccountManagerViewModel }) => <pre>{JSON.stringify(viewModel)}</pre>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
const readClient = (ports: object) => ports as AccountManagerReadClient;
const viewModelOf = (element: React.ReactElement<{ viewModel: AccountManagerViewModel }>) => element.props.viewModel;

describe("账号管理服务端并行读取", () => {
  it("账号、能力和组在任何一个完成前全部开始，保留原请求参数和选中账号", async () => {
    const accounts = deferred<unknown[]>(), capabilities = deferred<{ items: never[] }>(), groups = deferred<unknown[]>();
    const client = {
      listAccounts: vi.fn(() => accounts.promise),
      listCapabilities: vi.fn(() => capabilities.promise),
      listAccountGroups: vi.fn(() => groups.promise),
    };
    const pending = AccountManagerPage({ client: readClient(client), selectedAccountId: "real-account" });
    try {
      expect(client.listAccounts).toHaveBeenCalledTimes(1);
      expect(client.listCapabilities).toHaveBeenCalledTimes(1);
      expect(client.listAccountGroups).toHaveBeenCalledTimes(1);
      expect(client.listAccounts).toHaveBeenCalledWith({ params: undefined, query: { page: 1, pageSize: 100 }, body: undefined });
      expect(client.listCapabilities).toHaveBeenCalledWith({ params: undefined, query: undefined, body: undefined });
      expect(client.listAccountGroups).toHaveBeenCalledWith({ params: undefined, query: { page: 1, pageSize: 100, includeArchived: true }, body: undefined });
    } finally {
      accounts.resolve([]); capabilities.resolve({ items: [] }); groups.resolve([]);
      await pending;
    }
    expect(viewModelOf(await pending)).toEqual({ accounts: [], groups: [], capabilities: [], capabilitiesError: false, selectedAccountId: "real-account" });
  });

  it("能力读取拒绝只局部降级，账号与组成功结果保留", async () => {
    const client = {
      listAccounts: vi.fn().mockResolvedValue([]),
      listCapabilities: vi.fn().mockRejectedValue(new Error("能力暂不可读")),
      listAccountGroups: vi.fn().mockResolvedValue([]),
    };
    expect(viewModelOf(await AccountManagerPage({ client: readClient(client) }))).toEqual({ accounts: [], groups: [], capabilities: [], capabilitiesError: true, selectedAccountId: null });
  });

  it.each(["listAccounts", "listAccountGroups"] as const)("%s 拒绝仍拒绝页面，不把数据错误变成空成功", async failingPort => {
    const error = new Error("原账号归属读取失败");
    const client = {
      listAccounts: vi.fn().mockResolvedValue([]),
      listCapabilities: vi.fn().mockResolvedValue({ items: [] }),
      listAccountGroups: vi.fn().mockResolvedValue([]),
    };
    client[failingPort].mockRejectedValue(error);
    await expect(AccountManagerPage({ client: readClient(client) })).rejects.toBe(error);
  });

  it("缺少可选能力和组方法保留旧调用方默认值", async () => {
    const client = { listAccounts: vi.fn().mockResolvedValue([]) };
    expect(viewModelOf(await AccountManagerPage({ client: readClient(client) }))).toEqual({ accounts: [], groups: undefined, capabilities: [], capabilitiesError: false, selectedAccountId: null });
    expect(client.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("明确 viewModel 原样透传，不发起服务读取", async () => {
    const viewModel: AccountManagerViewModel = { accounts: [], groups: [], capabilitiesError: true, selectedAccountId: "selected" };
    const client = { listAccounts: vi.fn(), listCapabilities: vi.fn(), listAccountGroups: vi.fn() };
    expect(viewModelOf(await AccountManagerPage({ viewModel, client: readClient(client) }))).toBe(viewModel);
    for (const port of Object.values(client)) expect(port).not.toHaveBeenCalled();
  });

  it("没有会话 client 或 viewModel 时仍明确失败", async () => {
    await expect(AccountManagerPage({})).rejects.toThrow("账号读取需要当前会话");
  });
});
