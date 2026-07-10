import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";

// T-078 封面缩略图渲染测试:mock 共享签名 URL 缓存(不走真 dispatch)。
const resolveAssetPreviewUrl = vi.fn<(id: string) => Promise<string | null>>();
const invalidateAssetPreviewUrl = vi.fn<(assetId: string) => void>();
vi.mock("@/components/resources/asset-preview-url", () => ({
  resolveAssetPreviewUrl: (id: string) => resolveAssetPreviewUrl(id),
  invalidateAssetPreviewUrl: (assetId: string) => invalidateAssetPreviewUrl(assetId),
}));

import { CoverThumb } from "./cover-thumb";

const fallback = <div data-testid="cover-fallback">占位</div>;

beforeEach(() => {
  resolveAssetPreviewUrl.mockReset();
  invalidateAssetPreviewUrl.mockReset();
});

describe("CoverThumb", () => {
  it("有 coverAssetId 且 URL 换取成功 → 渲真封面 <img>(签名 URL)", async () => {
    resolveAssetPreviewUrl.mockResolvedValue("https://signed/cover.jpg");
    render(
      <CoverThumb
        assetId="asset-1"
        alt="真标题"
        className="h-9 w-16"
        fallback={fallback}
      />,
    );
    const img = await screen.findByRole("img", { name: "真标题" });
    expect(img).toHaveAttribute("src", "https://signed/cover.jpg");
    expect(img).toHaveAttribute("data-asset-id", "asset-1");
    expect(screen.queryByTestId("cover-fallback")).toBeNull();
    expect(resolveAssetPreviewUrl).toHaveBeenCalledWith("asset-1");
  });

  it("无 coverAssetId → 渲 fallback,不换 URL(现状占位不回退)", () => {
    render(
      <CoverThumb assetId={null} alt="x" className="h-9" fallback={fallback} />,
    );
    expect(screen.getByTestId("cover-fallback")).toBeInTheDocument();
    expect(resolveAssetPreviewUrl).not.toHaveBeenCalled();
  });

  it("URL 换取失败(null)→ 诚实降级 fallback", async () => {
    resolveAssetPreviewUrl.mockResolvedValue(null);
    render(
      <CoverThumb
        assetId="asset-2"
        alt="x"
        className="h-9"
        fallback={fallback}
      />,
    );
    await waitFor(() =>
      expect(resolveAssetPreviewUrl).toHaveBeenCalledWith("asset-2"),
    );
    expect(screen.getByTestId("cover-fallback")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("图片加载失败(onError)→ 回落 fallback", async () => {
    resolveAssetPreviewUrl.mockResolvedValue("https://signed/broken.jpg");
    render(
      <CoverThumb
        assetId="asset-3"
        alt="x"
        className="h-9"
        fallback={fallback}
      />,
    );
    const img = await screen.findByRole("img");
    img.dispatchEvent(new Event("error"));
    await waitFor(() =>
      expect(screen.getByTestId("cover-fallback")).toBeInTheDocument(),
    );
  });

  // [Bug-6 T-019] 图加载失败 → 清缓存 + bump 重拉(给一次重试机会)。
  // 否则坏 URL 在 module-scope 缓存里永远卡死,路由回来再渲 → 同一坏 URL → 永 fallback。
  // 注:onError 的 fireEvent 用 .error()(不是 .dispatchEvent)才能触发 React handler,
  // 而 microtask bump + retry 重渲染与 test 的 waitFor 异步管道要一并发。
  it("[Bug-6 T-019] onError → invalidateAssetPreviewUrl 被调", async () => {
    resolveAssetPreviewUrl.mockResolvedValue("https://signed/broken.jpg");
    render(
      <CoverThumb
        assetId="asset-4"
        alt="x"
        className="h-9"
        fallback={fallback}
      />,
    );
    const img = await screen.findByRole("img");
    fireEvent.error(img);
    await waitFor(() =>
      expect(invalidateAssetPreviewUrl).toHaveBeenCalledWith("asset-4"),
    );
  });
});
