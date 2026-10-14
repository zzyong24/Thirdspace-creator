import { expect, it, vi } from "vitest";
import { BrowserProfileBusyError } from "./execution-browser-profile-lease.service";
import { waitForChatWebProfile } from "./chat-web-profile-wait";

it("占用后真实释放才重获；只获取资源，不重发业务操作", async () => {
  const acquire = vi.fn().mockRejectedValueOnce(new BrowserProfileBusyError()).mockResolvedValue({ leaseId: "new" });
  expect(await waitForChatWebProfile(acquire, new AbortController().signal, { pollMs: 1 })).toEqual({ leaseId: "new" });
  expect(acquire).toHaveBeenCalledTimes(2);
});
it("持续占用有界退出，保留同一个忙错误", async () => {
  let elapsed = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const busy = new BrowserProfileBusyError(), acquire = vi.fn(async () => { elapsed += 10000; throw busy; });
  try {
    await expect(waitForChatWebProfile(acquire, new AbortController().signal, { timeoutMs: 20, pollMs: 2 })).rejects.toBe(busy);
    expect(acquire.mock.calls.length).toBeGreaterThan(1);
    expect(acquire.mock.calls.length).toBeLessThan(30);
    expect(acquire).toHaveBeenCalledTimes(12);
    expect(elapsed).toBe(120000);
  } finally { clock.mockRestore(); }
});
it("等待中取消立即退出，此后不再获取", async () => {
  const controller = new AbortController(), reason = new Error("用户取消"), acquire = vi.fn(async () => { throw new BrowserProfileBusyError(); });
  const pending = waitForChatWebProfile(acquire, controller.signal, { pollMs: 1000 });
  const rejected = expect(pending).rejects.toThrow();
  await Promise.resolve(); controller.abort(reason); await rejected;
  expect(acquire).toHaveBeenCalledTimes(1);
});
it("取消先于首次获取", async () => {
  const controller = new AbortController(), acquire = vi.fn(); controller.abort();
  await expect(waitForChatWebProfile(acquire, controller.signal)).rejects.toThrow();
  expect(acquire).not.toHaveBeenCalled();
});
it.each(["STALE_EXECUTION", "权限失败", "未知提交"])("%s 不重试", async message => {
  const error = new Error(message), acquire = vi.fn(async () => { throw error; });
  await expect(waitForChatWebProfile(acquire, new AbortController().signal)).rejects.toBe(error);
  expect(acquire).toHaveBeenCalledTimes(1);
});
it("每次获取仍核对权限，等待中变为陈旧执行不能继续", async () => {
  const stale = new Error("STALE_EXECUTION"), acquire = vi.fn().mockRejectedValueOnce(new BrowserProfileBusyError()).mockRejectedValue(stale);
  await expect(waitForChatWebProfile(acquire, new AbortController().signal, { pollMs: 1 })).rejects.toBe(stale);
  expect(acquire).toHaveBeenCalledTimes(2);
});
