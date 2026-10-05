import {StrictMode} from "react";
import {act, renderHook, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {CURRENT_ACCOUNT_KEY} from "@/lib/http-transport";
import {writeAssistantEngine} from "./assistant-engine";
import {useAssistantEngine} from "./use-assistant-engine";

const status = (available = true) => new Response(JSON.stringify({engines: [{
  engine: "codex", installed: true, available, version: "0.159.3", loginStatus: "authenticated",
}]}), {status: 200});
const choose = () => window.localStorage.setItem("creatoros:assistant-engine:v1", "codex");

describe("T-1055 共享编导偏好及真实状态", () => {
  beforeEach(() => writeAssistantEngine("pi"));
  it("默认 CreatorOS 直接可用，不读取本地 Codex", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const {result} = renderHook(() => useAssistantEngine());
    await act(async () => {});
    expect(result.current).toMatchObject({engine: "pi", available: true, checking: false});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("存量 Codex 偏好从实际 API 读状态，并复用当前账号 header", async () => {
    choose(); window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "account-a");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(status());
    const {result} = renderHook(() => useAssistantEngine());
    expect(result.current).toMatchObject({engine: "codex", available: false, checking: true});
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(fetch).toHaveBeenCalledWith("/api/chat/engines", expect.objectContaining({headers: {"x-account-id": "account-a"}, credentials: "same-origin", signal: expect.any(AbortSignal)}));
    expect(result.current.status).toContain("0.159.3");
  });

  it("同窗设置变化立即同步，退出 Codex 取消在途状态请求", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const {result} = renderHook(() => useAssistantEngine());
    act(() => writeAssistantEngine("codex"));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0][1]?.signal;
    act(() => writeAssistantEngine("pi"));
    expect(result.current).toMatchObject({engine: "pi", available: true});
    expect(signal?.aborted).toBe(true);
  });

  it("跨窗 storage 与账号变更同步；忽略旧账号未遵守取消的晚回执", async () => {
    choose(); window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "account-a");
    const pending: Array<(response: Response) => void> = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const {result} = renderHook(() => useAssistantEngine());
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    act(() => {
      window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "account-b");
      window.dispatchEvent(new StorageEvent("storage", {key: CURRENT_ACCOUNT_KEY}));
    });
    expect(result.current.available).toBe(false);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({"x-account-id": "account-b"});
    await act(async () => pending[1](status(false)));
    expect(result.current.available).toBe(false);
    await act(async () => pending[0](status(true)));
    expect(result.current).toMatchObject({accountId: "account-b", available: false});
    act(() => {
      window.localStorage.setItem("creatoros:assistant-engine:v1", "pi");
      window.dispatchEvent(new StorageEvent("storage", {key: "creatoros:assistant-engine:v1"}));
    });
    expect(result.current).toMatchObject({engine: "pi", available: true});
  });

  it("同窗切账号广播重新读取，卸载会取消请求及晚回执", async () => {
    choose(); window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "account-a");
    let resolve!: (value: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(r => {resolve = r;}));
    const {result, unmount} = renderHook(() => useAssistantEngine());
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    act(() => {
      window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "account-b");
      window.dispatchEvent(new CustomEvent("creatoros:accounts-changed"));
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(result.current.accountId).toBe("account-b");
    const signal = fetch.mock.calls[1][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(status()));
    expect(result.current.available).toBe(false);
  });

  it("设置重新检查同时刷新打开的聊天，单实例在途请求先取消", async () => {
    choose();
    let resolve!: (value: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise(r => {resolve = r;})).mockImplementation(async () => status());
    const first = renderHook(() => useAssistantEngine());
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0][1]?.signal;
    const second = renderHook(() => useAssistantEngine());
    await waitFor(() => expect(second.result.current.available).toBe(true));
    act(() => second.result.current.recheck());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(first.result.current.available).toBe(true));
    await act(async () => resolve(status(false)));
    expect(first.result.current.available).toBe(true);
  });

  it("真实状态读取失败显示未核实，重新检查可恢复", async () => {
    choose();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(Error("unavailable")).mockResolvedValue(status());
    const {result} = renderHook(() => useAssistantEngine());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe("本地 Codex 状态暂未核实");
    act(() => result.current.recheck());
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("只写入失败时仍执行会话内选择，另一个窗口的新选择会接管", async () => {
    const realSetItem = window.localStorage.setItem.bind(window.localStorage);
    const blockedWrite = vi.spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => {throw Error("quota");});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => status());
    const {result} = renderHook(() => useAssistantEngine());
    act(() => writeAssistantEngine("codex"));
    expect(blockedWrite).toHaveBeenCalledWith("creatoros:assistant-engine:v1", "codex");
    await waitFor(() => expect(result.current).toMatchObject({engine: "codex", available: true}));
    act(() => {
      realSetItem("creatoros:assistant-engine:v1", "pi");
      window.dispatchEvent(new StorageEvent("storage", {key: "creatoros:assistant-engine:v1"}));
    });
    expect(result.current.engine).toBe("pi");
  });

  it("不可写的存储仍保留本次会话的真实用户选择", async () => {
    vi.spyOn(Object.getPrototypeOf(window.localStorage), "setItem").mockImplementation(() => {throw Error("blocked");});
    vi.spyOn(Object.getPrototypeOf(window.localStorage), "getItem").mockImplementation(() => {throw Error("blocked");});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(status());
    const {result} = renderHook(() => useAssistantEngine());
    act(() => writeAssistantEngine("codex"));
    await waitFor(() => expect(result.current).toMatchObject({engine: "codex", available: true}));
    act(() => writeAssistantEngine("pi"));
    expect(result.current.engine).toBe("pi");
  });

  it("StrictMode 取消首个挂载请求，不产生重复状态调用", async () => {
    choose(); const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(status());
    const {result} = renderHook(() => useAssistantEngine(), {wrapper: StrictMode});
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(fetch).toHaveBeenCalledOnce();
  });
});
