import { describe, expect, it, vi } from "vitest";
import { fetchDouyinUserPosts, fetchDouyinCollectsFolders, fetchDouyinCollectsVideos } from "./douyin-cdp";
import { fetchDouhotLowFollowerBreakout } from "./douhot-cdp";

const entries = [
  (signal: AbortSignal, open: () => Promise<never>) => fetchDouyinUserPosts({ authDir: "/fixture", secUid: "id", signal }, { openContext: open }),
  (signal: AbortSignal, open: () => Promise<never>) => fetchDouyinCollectsFolders({ authDir: "/fixture", signal }, { openContext: open }),
  (signal: AbortSignal, open: () => Promise<never>) => fetchDouyinCollectsVideos({ authDir: "/fixture", collectsId: "id", signal }, { openContext: open }),
  (signal: AbortSignal, open: () => Promise<never>) => fetchDouhotLowFollowerBreakout({ authDir: "/fixture", keyword: "q", board: "low_follower_breakout", signal }, { openPage: open }),
];
describe("采集浏览器取消释放拥有的上下文", () => {
  it.each(entries)("预取消不启动浏览器", async run => {
    const abort = new AbortController(); abort.abort(); const open = vi.fn();
    await expect(run(abort.signal, open)).rejects.toThrow(); expect(open).not.toHaveBeenCalled();
  });
  it.each(entries)("启动途中取消，取得上下文后只关闭一次", async run => {
    const abort = new AbortController(); const close = vi.fn(async () => {});
    const open = async () => { abort.abort(); return { close, page: {} } as never; };
    await expect(run(abort.signal, open)).rejects.toThrow(); expect(close).toHaveBeenCalledTimes(1);
  });
  it.each(entries)("运行中取消打断浏览器等待并关闭一次", async run => {
    const abort = new AbortController(); let reject!: (error: Error) => void;
    const cookies = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
    const close = vi.fn(async () => { reject(new Error("context closed")); });
    const open = async () => ({ close, cookies, page: { context: () => ({ cookies }) } }) as never;
    const work = run(abort.signal, open); const result = expect(work).rejects.toThrow();
    await vi.waitFor(() => expect(cookies).toHaveBeenCalled()); abort.abort(); await result;
    expect(close).toHaveBeenCalledTimes(1);
  });
});
