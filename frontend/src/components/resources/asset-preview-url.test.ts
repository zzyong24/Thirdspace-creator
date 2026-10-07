import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import type { ResourceAsset } from "./types";

// [Bug-6 T-019] 缓存 TTL 强制 ≤ token TTL:local-fs 默认 15min 签名 → 我们 10min 缓存。
// 否则用户看一会儿图就全消失(token 过期后,缓存还认为 URL 有用 → onError → fallback)。

// 用 vi.useFakeTimers 控时间;vi.setSystemTime 移时钟。
const mockGetDownloadUrl = vi.fn<(p: { params: { assetId: string } }) => Promise<{ url?: string }>>();
vi.mock("@/lib/contract-client", () => ({
  client: {
    getDownloadUrl: (p: { params: { assetId: string } }) => mockGetDownloadUrl(p),
  },
}));

// 每个 case 用独立 module 实例,避免 module-scope cache 串味。
beforeEach(() => {
  vi.resetModules();
  mockGetDownloadUrl.mockReset();
  vi.useFakeTimers();
});

it("T-1073 预览元数据缓存超过256项淘汰最久未用项",async()=>{
  mockGetDownloadUrl.mockImplementation(async ({params})=>({url:`https://signed/${params.assetId}`}));
  const {resolveAssetPreviewUrl}=await import('./asset-preview-url');
  for(let i=0;i<300;i++)await resolveAssetPreviewUrl(`bounded-${i}`);
  await resolveAssetPreviewUrl('bounded-0');
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(301);
});

it("到期自动清除小元数据并停止清理timer，同素材共享在途且invalidate拒旧回填",async()=>{
 const {resolveAssetPreviewUrl,invalidateAssetPreviewUrl}=await import('./asset-preview-url');
 let release!:(value:{url:string})=>void;
 mockGetDownloadUrl.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({url:'https://signed/new'});
 const first=resolveAssetPreviewUrl('same');expect(resolveAssetPreviewUrl('same')).toBe(first);
 await Promise.resolve();invalidateAssetPreviewUrl('same');
 expect(await resolveAssetPreviewUrl('same')).toBe('https://signed/new');
 release({url:'https://signed/old'});expect(await first).toBeNull();
 expect(await resolveAssetPreviewUrl('same')).toBe('https://signed/new');
 await vi.advanceTimersByTimeAsync(600000);
 expect(vi.getTimerCount()).toBe(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("真实缩略图消费者共享URL读取，到期重挂恢复，卸载与切scope拒旧签名", async () => {
  const { AssetThumbnail } = await import("./asset-thumbnail");
  const { CURRENT_GROUP_KEY } = await import("@/lib/http-transport");
  const asset: ResourceAsset = { id: "consumer-asset", name: "合成图片", type: "image", mimeType: "image/png", fileSizeBytes: 1, width: 1, height: 1, durationMs: null, tags: [], thumbnailToken: "synthetic", updatedAt: "2026-10-07" };
  localStorage.setItem(CURRENT_GROUP_KEY, "preview-group-a");
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/first.png" });
  const first = render(React.createElement(React.Fragment, null, React.createElement(AssetThumbnail, { asset }), React.createElement(AssetThumbnail, { asset })));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(first.container.querySelectorAll('img[src="https://signed/first.png"]')).toHaveLength(2);
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  first.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/refreshed.png" });
  const refreshed = render(React.createElement(AssetThumbnail, { asset }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(refreshed.container.querySelector("img")?.getAttribute("src")).toBe("https://signed/refreshed.png");
  expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  refreshed.unmount();
  let finish!: (value: { url: string }) => void;
  mockGetDownloadUrl.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pendingAsset = { ...asset, id: "pending-consumer-asset" };
  const pending = render(React.createElement(AssetThumbnail, { asset: pendingAsset }));
  await act(async () => { await Promise.resolve(); });
  localStorage.setItem(CURRENT_GROUP_KEY, "preview-group-b");
  await act(async () => { finish({ url: "https://signed/old-group.png" }); });
  expect(pending.container.querySelector("img")).toBeNull();
  pending.unmount();
  mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/new-group.png" });
  const current = render(React.createElement(AssetThumbnail, { asset: pendingAsset }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(current.container.querySelector("img")?.getAttribute("src")).toBe("https://signed/new-group.png");
  localStorage.removeItem(CURRENT_GROUP_KEY);
});

describe("asset-preview-url TTL 缓存 (Bug-6 T-019)", () => {
  it("首次调用 → 走 dispatch 并缓存(TTL 10min)", async () => {
    mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/1.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const u = await resolveAssetPreviewUrl("asset-1");
    expect(u).toBe("https://signed/1.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("TTL 内(<10min)再次调用 → 不再走 dispatch", async () => {
    mockGetDownloadUrl.mockResolvedValue({ url: "https://signed/2.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    await resolveAssetPreviewUrl("asset-2");
    // 5 分钟后 —— 还在 10min TTL 内,缓存命中。
    vi.setSystemTime(t0 + 5 * 60 * 1000);
    const u = await resolveAssetPreviewUrl("asset-2");
    expect(u).toBe("https://signed/2.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1); // 没多调
  });

  it("TTL 后(>=10min)再次调用 → 自动 invalidate 并重换", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce({ url: "https://signed/old.jpg" })
      .mockResolvedValueOnce({ url: "https://signed/new.jpg" });
    const { resolveAssetPreviewUrl } = await import("./asset-preview-url");
    const t0 = Date.now();
    vi.setSystemTime(t0);
    await resolveAssetPreviewUrl("asset-3");
    // 10 分钟 + 1ms 后 —— 缓存过期。
    vi.setSystemTime(t0 + 10 * 60 * 1000 + 1);
    const u = await resolveAssetPreviewUrl("asset-3");
    expect(u).toBe("https://signed/new.jpg"); // 拿到了新 URL
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2); // 重换了一次
  });

  it("invalidate → 立即重换(下次调必新 fetch,不管 TTL)", async () => {
    mockGetDownloadUrl
      .mockResolvedValueOnce({ url: "https://signed/old.jpg" })
      .mockResolvedValueOnce({ url: "https://signed/replaced.jpg" });
    const { resolveAssetPreviewUrl, invalidateAssetPreviewUrl } =
      await import("./asset-preview-url");
    await resolveAssetPreviewUrl("asset-4");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
    invalidateAssetPreviewUrl("asset-4");
    // invalidate 后立刻调 → 必重换。
    const u = await resolveAssetPreviewUrl("asset-4");
    expect(u).toBe("https://signed/replaced.jpg");
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("dispatch 失败 → 缓存 null(短 TTL),invalidate 后可重试", async () => {
    mockGetDownloadUrl.mockRejectedValueOnce(new Error("网络断"));
    const { resolveAssetPreviewUrl, invalidateAssetPreviewUrl } =
      await import("./asset-preview-url");
    const u = await resolveAssetPreviewUrl("asset-5");
    expect(u).toBeNull(); // 失败缓存 null,不无限重试
    // 30s 内的失败不会反复触发 dispatch(避免瞬时 5xx 打爆后端)。
    mockGetDownloadUrl.mockResolvedValueOnce({ url: "https://signed/recover.jpg" });
    const u2 = await resolveAssetPreviewUrl("asset-5");
    expect(u2).toBeNull(); // 失败 TTL 内仍返 null
    // invalidate + 再调 → 拿到好 URL。
    invalidateAssetPreviewUrl("asset-5");
    const u3 = await resolveAssetPreviewUrl("asset-5");
    expect(u3).toBe("https://signed/recover.jpg");
  });
});
