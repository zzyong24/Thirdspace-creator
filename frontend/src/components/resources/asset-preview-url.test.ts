import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
afterEach(() => {
  vi.useRealTimers();
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