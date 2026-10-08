import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router={refresh:vi.fn()};
const list=vi.fn();
vi.mock("next/navigation",()=>({useRouter:()=>router}));
vi.mock("@/lib/contract-client",()=>({client:{listAccountGroups:(input:unknown)=>list(input)}}));
import { AccountSwitcher } from "./account-switcher";
import { CURRENT_ACCOUNT_KEY, CURRENT_GROUP_KEY, CURRENT_GROUP_COOKIE } from "@/lib/http-transport";
import { beginForegroundActivity, resetForegroundActivitiesForTest } from "@/lib/foreground-activity";
import { notifyAccountsChanged } from "@/lib/account-events";
const group=(id:string,members:unknown[]=[])=>({id,userId:"u",name:`组${id}`,status:"active",version:1,members});
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();document.cookie=`${CURRENT_GROUP_COOKIE}=; Path=/; Max-Age=0`;resetForegroundActivitiesForTest();});
afterEach(cleanup);
describe("账号组全局切换",()=>{
 it("读取组而非平台账号，空组也能自动成为工作区",async()=>{
  list.mockResolvedValue([group("a")]);render(<AccountSwitcher collapsed={false}/>);
  await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("a"));
  expect(screen.getByTestId("account-switcher-trigger")).toHaveAttribute("aria-label","当前账号组：组a");
 });
 it("旧平台账号只通过唯一成员关系映射到组",async()=>{
  localStorage.setItem(CURRENT_ACCOUNT_KEY,"legacy");list.mockResolvedValue([group("a"),group("b",[{accountId:"legacy",leftAt:null}])]);
  render(<AccountSwitcher collapsed={false}/>);await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("b"));
  expect(localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBeNull();
 });
 it("切组同步cookie并清理真实账号筛选，广播仅一次，不重复拉列表",async()=>{
  const user=userEvent.setup();localStorage.setItem(CURRENT_GROUP_KEY,"a");list.mockResolvedValue([group("a"),group("b")]);
  render(<AccountSwitcher collapsed={false}/>);await screen.findByText("组a");localStorage.setItem(CURRENT_ACCOUNT_KEY,"filter");
  await user.click(screen.getByTestId("account-switcher-trigger"));await user.click(screen.getByText("组b"));
  expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("b");expect(localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBeNull();
  expect(document.cookie).toContain(`${CURRENT_GROUP_COOKIE}=b`);await waitFor(()=>expect(router.refresh).toHaveBeenCalled());expect(list).toHaveBeenCalledTimes(1);
 });
 it("前台操作未确认不能切组，取消保持原工作区",async()=>{
  const user=userEvent.setup();localStorage.setItem(CURRENT_GROUP_KEY,"a");list.mockResolvedValue([group("a"),group("b")]);
  render(<AccountSwitcher collapsed={false}/>);await screen.findByText("组a");const end=beginForegroundActivity("生成中");
  await user.click(screen.getByTestId("account-switcher-trigger"));await user.click(screen.getByText("组b"));
  expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("a");expect(screen.getByTestId("account-switch-confirm")).toBeVisible();
  fireEvent.click(screen.getByTestId("account-switch-cancel"));expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("a");end();
 });
 it("卸载后的响应不能选择工作区或刷新",async()=>{
  let resolve!:(rows:unknown[])=>void;list.mockReturnValue(new Promise(r=>{resolve=r;}));const mounted=render(<AccountSwitcher collapsed={false}/>);mounted.unmount();resolve([group("late")]);
  await Promise.resolve();expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBeNull();expect(router.refresh).not.toHaveBeenCalled();
 });
 it("列表失效时最多一个在途请求，旧响应不回写",async()=>{
  let resolve!:(rows:unknown[])=>void;list.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValue([group("fresh")]);
  render(<AccountSwitcher collapsed={false}/>);notifyAccountsChanged();notifyAccountsChanged();expect(list).toHaveBeenCalledTimes(1);
  resolve([group("stale")]);await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("fresh"));expect(list).toHaveBeenCalledTimes(2);
 });
 it("无组保留真实管理入口，读失败保留重试",async()=>{
  list.mockRejectedValue(new Error("offline"));render(<AccountSwitcher collapsed={false}/>);
  await screen.findByText("账号组列表暂不可用");expect(screen.getByRole("button",{name:"重试"})).toBeVisible();
 });
});
