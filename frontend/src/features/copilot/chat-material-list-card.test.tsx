import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-055c] 对话内素材列表卡:context.materials 命中渲列表;有项目上下文时逐条
// 「加入弹药」= createMaterialLink(既有 material_links 实体,与稿面弹药抽屉同源)。

const createMaterialLink = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: { createMaterialLink: (...a: unknown[]) => createMaterialLink(...a) },
}));

import { ChatMaterialListCard } from "./chat-material-list-card";

const ITEMS = [
  { id: "asset-1", title: "AI 工作流录屏.mp4", kind: "video" },
  { id: "asset-2", title: "封面草图", kind: "image" },
];

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  createMaterialLink.mockResolvedValue({ id: "link-1" });
});

describe("ChatMaterialListCard", () => {
  it("加入弹药 → createMaterialLink(projectId ⇄ asset),按钮变「已进弹药」", async () => {
    const user = userEvent.setup();
    render(<ChatMaterialListCard items={ITEMS} projectId="proj-1" />);

    await user.click(screen.getAllByText("加入弹药")[0]!);

    await waitFor(() => {
      expect(createMaterialLink).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            projectId: "proj-1",
            entityType: "asset",
            entityId: "asset-1",
          }),
        }),
      );
    });
    expect(await screen.findByText("已进弹药")).toBeTruthy();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("无项目上下文 → 只读列表 + 显式提示(没有假按钮)", () => {
    render(<ChatMaterialListCard items={ITEMS} projectId={null} />);
    expect(screen.queryByText("加入弹药")).toBeNull();
    expect(screen.getByText(/未关联项目/)).toBeTruthy();
    expect(screen.getByText("AI 工作流录屏.mp4")).toBeTruthy();
  });

  it("空命中 → 诚实空态引导去制作台倒素材", () => {
    render(<ChatMaterialListCard items={[]} projectId="proj-1" />);
    expect(screen.getByText(/没搜到匹配的素材/)).toBeTruthy();
  });
});
