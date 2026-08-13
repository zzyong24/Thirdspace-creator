import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commitPendingAsset = vi.fn();
const createMaterialLink = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    commitPendingAsset: (...args: unknown[]) => commitPendingAsset(...args),
    createMaterialLink: (...args: unknown[]) => createMaterialLink(...args),
  },
}));

import { ChatWebReadCard } from "./chat-web-read-card";

const ASSET = {
  id: "asset-web-1",
  name: "正文·Harness",
  previewUrl: null,
  sourceUrl: "https://example.com/harness",
  title: "Harness 正文",
  excerpt: "这是正文开头，不是搜索摘要。",
  extractor: "readability",
};

afterEach(() => cleanup());
beforeEach(() => {
  commitPendingAsset.mockReset();
  commitPendingAsset.mockResolvedValue({ id: ASSET.id, status: "active" });
  createMaterialLink.mockReset();
  createMaterialLink.mockResolvedValue({ id: "link-1" });
  routerRefresh.mockReset();
});

describe("ChatWebReadCard — T-813 阅读后保存", () => {
  it("成功卡显示临时上下文与准确覆盖度", () => {
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 1200, total: 3200 }}
        hasMore
      />,
    );
    expect(screen.getByText(/当前对话临时上下文/)).toBeTruthy();
    expect(screen.getByText(/已读 1,200 \/ 共 3,200 字/)).toBeTruthy();
    expect(screen.getByText(/还有 2,000 字未读/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存到项目" })).toBeTruthy();
  });

  it("保存时按稳定 assetId 提交 expectedSourceUrl，再关联当前项目", async () => {
    const user = userEvent.setup();
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存到项目" }));
    await vi.waitFor(() => expect(createMaterialLink).toHaveBeenCalledTimes(1));
    expect(commitPendingAsset).toHaveBeenCalledWith({
      params: { assetId: ASSET.id },
      query: undefined,
      body: { expectedSourceUrl: ASSET.sourceUrl },
    });
    expect(createMaterialLink).toHaveBeenCalledWith({
      params: undefined,
      query: undefined,
      body: {
        projectId: "p-1",
        entityType: "asset",
        entityId: ASSET.id,
        role: "reference",
        stage: "script",
        addedByType: "ai",
      },
    });
    expect(screen.getByText("已保存到项目")).toBeTruthy();
  });

  it("素材确认成功但项目关联失败时显示分段错误并复用同一 asset 重试", async () => {
    const user = userEvent.setup();
    createMaterialLink
      .mockRejectedValueOnce(new Error("link down"))
      .mockResolvedValueOnce({ id: "link-1" });
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId="p-1"
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "保存到项目" }));
    expect(await screen.findByText(/素材已入库，项目关联失败/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await vi.waitFor(() => expect(createMaterialLink).toHaveBeenCalledTimes(2));
    expect(commitPendingAsset).toHaveBeenCalledTimes(2);
    expect(commitPendingAsset.mock.calls[1]?.[0].params.assetId).toBe(ASSET.id);
  });

  it("无项目时不显示保存按钮", () => {
    render(
      <ChatWebReadCard
        asset={ASSET}
        needLogin={null}
        error={null}
        projectId={null}
        window={{ offset: 0, length: 3200, total: 3200 }}
        hasMore={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "保存到项目" })).toBeNull();
    expect(screen.getByText(/@ 引用当前项目/)).toBeTruthy();
  });
});
