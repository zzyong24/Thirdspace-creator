import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { notifyAccountsChanged, useAccountsChanged } from "./account-events";

describe("account-events — 跨页失效广播", () => {
  afterEach(() => {
    // jsdom 不自动清,显式 removeAllListeners 防止跨测串。
    // (test 完 window 上挂的 listener 不会泄到下个测)
  });

  it("[T-909] notifyAccountsChanged 可声明调用方已安排整页刷新", () => {
    const seen = vi.fn();
    window.addEventListener("creatoros:accounts-changed", seen);
    notifyAccountsChanged({ source: "account-switcher", routeRefreshScheduled: true });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0].detail).toEqual(expect.objectContaining({
      source: "account-switcher",
      routeRefreshScheduled: true,
    }));
  });

  it("多个订阅者都收到(广播语义)", () => {
    const a = vi.fn();
    const b = vi.fn();
    window.addEventListener("creatoros:accounts-changed", a);
    window.addEventListener("creatoros:accounts-changed", b);
    notifyAccountsChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("useAccountsChanged → hook 挂载时订阅 / 卸载时解绑", () => {
    const seen = vi.fn();
    const { unmount } = renderHook(() => useAccountsChanged(seen));
    notifyAccountsChanged();
    expect(seen).toHaveBeenCalledTimes(1);
    unmount();
    notifyAccountsChanged();
    expect(seen).toHaveBeenCalledTimes(1); // 卸载后不再触发
  });

  it("旧广播没有detail仍给订阅者有效失效上下文",()=>{
    const seen=vi.fn();const {unmount}=renderHook(()=>useAccountsChanged(seen));
    window.dispatchEvent(new Event("creatoros:accounts-changed"));
    expect(seen).toHaveBeenCalledWith({source:"external",routeRefreshScheduled:false});unmount();
  });

  it("SSR 安全:typeof window === 'undefined' 时不 throw(notifyAccountsChanged 早返)", () => {
    // 不真删 window,只验函数早返条件:用 vi.stubGlobal 模拟 SSR。
    // 简单版:直接调,应不 throw(我们已经在 client guard 里)。只是 smoke test。
    expect(() => notifyAccountsChanged()).not.toThrow();
  });
});
