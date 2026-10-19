// 跨页面/跨组件广播,用于「一处登录/绑定成功 → 其它打开的页面/侧栏即时感知」的失效场景。
//
// 用例(全在 loginDouyin 成功后 dispatch):
//   - AccountSwitcher(sidebar 当前号缓存): mount 时一次性 listAccounts,login 后 router.refresh()
//     刷不到 layout 里的 sidebar → 收事件重拉,左下账号名立刻翻新。
//   - AutomationsIsland(每行 latestRuns): mount 时一次拉,login 后 router.refresh() 也刷不到
//     异页 state → 收事件 router.refresh(),行内 needs_reconnect 红标立刻翻篇。
//
// 设计:window CustomEvent(标准 DOM API,不引入 mitt/bus)。命名空间 `creatoros:` 避免与
// 第三方库冲突。事件本身不带 payload(都是 "请重拉");监听者各自 router.refresh()。

declare global {
  interface WindowEventMap {
    "creatoros:accounts-changed": CustomEvent<AccountChangeDetail>;
  }
}

export interface AccountChangeDetail {
  readonly groupId?:string|null;
  /** 发起本次失效的组件；订阅者可避免把自己的广播再消费一遍。 */
  readonly source: "account-switcher" | "account-management" | "external";
  /** 已有调用方负责 router.refresh 时，其他订阅者不得再发起第二轮整页刷新。 */
  readonly routeRefreshScheduled: boolean;
}

/** 「账号/登录态变了」广播 — loginDouyin / mergeDouyinPlaceholders 等成功后调用。 */
export function notifyAccountsChanged(
  detail: AccountChangeDetail = {
    source: "external",
    routeRefreshScheduled: false,
  },
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("creatoros:accounts-changed", { detail:{groupId:readCurrentGroupId(),...detail} }),
  );
}

/** React hook:订阅账号态变化,触发回调。组件卸载自动解绑。 */
import * as React from "react";
import {readCurrentGroupId} from "./http-transport";
export function useAccountsChanged(
  handler: (detail: AccountChangeDetail) => void,
): void {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const ev = (event: WindowEventMap["creatoros:accounts-changed"]) =>
      handler(event.detail ?? {source:"external",routeRefreshScheduled:false});
    window.addEventListener("creatoros:accounts-changed", ev);
    return () => window.removeEventListener("creatoros:accounts-changed", ev);
  }, [handler]);
}
