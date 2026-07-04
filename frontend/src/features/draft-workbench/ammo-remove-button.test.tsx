/**
 * [T-109] 稿面弹药「移除」接线测试:
 *   - 点移除 icon → 弹系统 Dialog 二次确认(不立即删);
 *   - 确认文案诚实:「只解绑…不删除…本身」;
 *   - 点「移除关联」→ deleteMaterialLink({ params: { linkId } })(用 link id,非 entity id)
 *     → router.refresh;
 *   - 取消 → 不发任何删除 op。
 * 确定性:mock client 立即 resolve;无网络 / Date.now。
 */

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  deleteMaterialLink: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "link-1" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    deleteMaterialLink: (i: unknown) => mockClient.deleteMaterialLink(i),
  },
}));

import { AmmoRemoveButton } from "./ammo-remove-button";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("AmmoRemoveButton (T-109)", () => {
  it("点移除 → 弹确认框(不立即删),文案诚实标注只解绑不删实体", () => {
    render(
      <AmmoRemoveButton linkId="link-1" kind="knowledge" title="某条知识" />,
    );
    // 未确认前不发删除。
    expect(mockClient.deleteMaterialLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("ammo-remove-trigger"));
    // 确认框出现 + 诚实文案。
    const warning = screen.getByText(/只解绑/);
    expect(warning.textContent).toMatch(/不删除知识本身/);
    expect(mockClient.deleteMaterialLink).not.toHaveBeenCalled();
  });

  it("确认 → deleteMaterialLink 用 link id(非 entity id)+ router.refresh", async () => {
    render(
      <AmmoRemoveButton linkId="link-42" kind="asset" title="某素材" />,
    );
    fireEvent.click(screen.getByTestId("ammo-remove-trigger"));
    fireEvent.click(screen.getByTestId("ammo-remove-confirm"));
    await waitFor(() =>
      expect(mockClient.deleteMaterialLink).toHaveBeenCalledWith({
        params: { linkId: "link-42" },
        query: undefined,
        body: undefined,
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("取消 → 不发任何删除 op", () => {
    render(
      <AmmoRemoveButton linkId="link-1" kind="knowledge" title="某条知识" />,
    );
    fireEvent.click(screen.getByTestId("ammo-remove-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(mockClient.deleteMaterialLink).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("删除失败(404)→ 内联错误提示(禁原生 alert),不 refresh", async () => {
    mockClient.deleteMaterialLink.mockRejectedValueOnce(new Error("404 not found"));
    render(
      <AmmoRemoveButton linkId="link-1" kind="asset" title="某素材" />,
    );
    fireEvent.click(screen.getByTestId("ammo-remove-trigger"));
    fireEvent.click(screen.getByTestId("ammo-remove-confirm"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/已不存在/),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
