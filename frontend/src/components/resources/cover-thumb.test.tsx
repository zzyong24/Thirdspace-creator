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

  // [T-187] 持续 onError(URL 一直炸,如 asset 字节真缺失 / 持续 404/5xx)→ 达重试
  // 上限后**停止**再拉,不无限重试打爆 dispatch。断言 resolve/invalidate 调用次数有上限。
  it("[T-187] 持续 onError → 达上限后停止再拉(dispatch 调用有界)", async () => {
    resolveAssetPreviewUrl.mockResolvedValue("https://signed/broken.jpg");
    render(
      <CoverThumb assetId="asset-5" alt="x" className="h-9" fallback={fallback} />,
    );

    // 首帧失败 → 触发唯一一次重拉(invalidate + 第二次 resolve)。
    const img1 = await screen.findByRole("img");
    fireEvent.error(img1);
    await waitFor(() =>
      expect(resolveAssetPreviewUrl).toHaveBeenCalledTimes(2),
    );

    // 重拉的 URL 仍炸 → 已达上限 → 停在 fallback,不再 invalidate/重拉。
    const img2 = await screen.findByRole("img");
    fireEvent.error(img2);
    await waitFor(() =>
      expect(screen.getByTestId("cover-fallback")).toBeInTheDocument(),
    );

    // 再等一拍确认没有第三次 resolve / 第二次 invalidate(上限 = 1 次重拉)。
    await new Promise((r) => setTimeout(r, 20));
    expect(resolveAssetPreviewUrl).toHaveBeenCalledTimes(2);
    expect(invalidateAssetPreviewUrl).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img")).toBeNull();
  });

  // [T-187] token 过期自愈:首帧 URL 炸(过期)→ 重拉拿新 token 成功显示;onLoad 后计数
  // 归零 → 后续再来一次独立 onError 仍享有完整重试额度(不被历史失败误伤成永久 broken)。
  it("[T-187] onError 一次后成功 → 显示且计数重置(token 过期自愈不被误伤)", async () => {
    resolveAssetPreviewUrl
      .mockResolvedValueOnce("https://signed/stale.jpg") // 首帧:过期 token,即将炸
      .mockResolvedValue("https://signed/fresh.jpg"); // 重拉:新 token,成功
    render(
      <CoverThumb assetId="asset-6" alt="x" className="h-9" fallback={fallback} />,
    );

    const img1 = await screen.findByRole("img");
    expect(img1).toHaveAttribute("src", "https://signed/stale.jpg");
    fireEvent.error(img1); // 过期 → 重拉

    const img2 = await screen.findByRole("img");
    await waitFor(() =>
      expect(img2).toHaveAttribute("src", "https://signed/fresh.jpg"),
    );
    fireEvent.load(img2); // 成功渲染 → 计数归零
    expect(invalidateAssetPreviewUrl).toHaveBeenCalledTimes(1);

    // 计数已重置:再来一次 onError 仍能重拉(证明额度完整,未被历史失败误伤)。
    resolveAssetPreviewUrl.mockResolvedValue("https://signed/fresh2.jpg");
    fireEvent.error(img2);
    await waitFor(() =>
      expect(invalidateAssetPreviewUrl).toHaveBeenCalledTimes(2),
    );
    const img3 = await screen.findByRole("img");
    await waitFor(() =>
      expect(img3).toHaveAttribute("src", "https://signed/fresh2.jpg"),
    );
  });
});
