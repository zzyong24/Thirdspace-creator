/**
 * KnowledgeTagManager 交互测试(T-248 批B 标签管理小面板)。mock contract client
 * 与 next/navigation,覆盖:
 *  - 打开面板 → taxonomy.tags.list 现读全量标签;
 *  - 重命名:行内编辑 → 保存 → taxonomy.tags.patch(带 tagId + 新名)+ refresh;
 *  - 删除:必经 Dialog 确认门 → 确认才调 taxonomy.tags.delete;取消不调;
 *  - 挂载视图:选标签 → taxonomy.entityTags.listEntitiesForTag;移除挂载必经
 *    确认门 → 确认才调 taxonomy.entityTags.remove(entityType/entityId/tagId 三元);
 *    取消不调;
 *  - 读失败 → 面板内诚实错误行,不 fixture 兜底。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const listTags = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve([]),
);
const patchTag = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "tag-1", name: "改名后", usageCount: 3 }),
);
const deleteTag = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "tag-1", name: "复盘", usageCount: 0 }),
);
const listEntitiesForTag = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve([]),
);
const removeAssignment = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({
    id: "et-1",
    tagId: "tag-1",
    entityType: "knowledge",
    entityId: "k-1",
  }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    listTags: (input: unknown) => listTags(input as never),
    patchTag: (input: unknown) => patchTag(input as never),
    deleteTag: (input: unknown) => deleteTag(input as never),
    listEntitiesForTag: (input: unknown) => listEntitiesForTag(input as never),
    removeAssignment: (input: unknown) => removeAssignment(input as never),
  },
}));

import { KnowledgeTagManager } from "./knowledge-tag-manager";

const TAGS = [
  { id: "tag-1", name: "复盘", usageCount: 3 },
  { id: "tag-2", name: "选题", usageCount: 1 },
];

const MOUNTS = [
  { id: "et-1", tagId: "tag-1", entityType: "knowledge", entityId: "k-1" },
  { id: "et-2", tagId: "tag-1", entityType: "asset", entityId: "a-9" },
];

beforeEach(() => {
  mockRouter.refresh.mockClear();
  listTags.mockReset();
  listTags.mockResolvedValue(TAGS);
  patchTag.mockReset();
  patchTag.mockResolvedValue({ id: "tag-1", name: "改名后", usageCount: 3 });
  deleteTag.mockReset();
  deleteTag.mockResolvedValue({ id: "tag-1", name: "复盘", usageCount: 0 });
  listEntitiesForTag.mockReset();
  listEntitiesForTag.mockResolvedValue(MOUNTS);
  removeAssignment.mockReset();
  removeAssignment.mockResolvedValue(MOUNTS[0]);
});

afterEach(() => {
  cleanup();
});

/** 打开面板并等待标签列表加载完成。 */
async function openPanel() {
  const view = render(<KnowledgeTagManager />);
  fireEvent.click(view.getByRole("button", { name: "管理标签" }));
  await waitFor(() => {
    expect(listTags).toHaveBeenCalledTimes(1);
    expect(view.getByText("复盘")).toBeTruthy();
  });
  return view;
}

describe("KnowledgeTagManager", () => {
  it("打开面板 → taxonomy.tags.list 现读全量标签并列出", async () => {
    const view = await openPanel();
    expect(listTags).toHaveBeenCalledWith({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    expect(view.getByText("复盘")).toBeTruthy();
    expect(view.getByText("选题")).toBeTruthy();
  });

  it("标签读失败 → 诚实错误行,不 fixture 兜底", async () => {
    listTags.mockRejectedValue(new Error("boom"));
    const view = render(<KnowledgeTagManager />);
    fireEvent.click(view.getByRole("button", { name: "管理标签" }));
    await waitFor(() => {
      expect(
        view.container.ownerDocument.querySelector(
          '[data-slot="tag-manager-load-error"]',
        ),
      ).toBeTruthy();
    });
    expect(view.queryByText("复盘")).toBeNull();
  });

  it("重命名:行内编辑 → 保存 → taxonomy.tags.patch + refresh + 本地更新", async () => {
    const view = await openPanel();
    fireEvent.click(view.getAllByRole("button", { name: "重命名" })[0]!);
    const input = view.getByRole("textbox", { name: "重命名 复盘" });
    fireEvent.change(input, { target: { value: "深度复盘" } });
    fireEvent.click(view.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(patchTag).toHaveBeenCalledWith({
        params: { tagId: "tag-1" },
        query: undefined,
        body: { name: "深度复盘" },
      });
    });
    await waitFor(() => {
      expect(view.getByText("深度复盘")).toBeTruthy();
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
  });

  it("删除:需过 Dialog 确认门 → 确认才调 taxonomy.tags.delete", async () => {
    const view = await openPanel();
    fireEvent.click(view.getAllByRole("button", { name: "删除" })[0]!);
    // 点「删除」只翻确认门,不直接打 op。
    expect(deleteTag).not.toHaveBeenCalled();
    expect(view.getByText("删除标签?")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(deleteTag).toHaveBeenCalledWith({
        params: { tagId: "tag-1" },
        query: undefined,
        body: undefined,
      });
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
    // 本地列表同步移除。
    expect(view.queryByText("复盘")).toBeNull();
  });

  it("删除确认门:取消 → 不调 taxonomy.tags.delete,标签仍在", async () => {
    const view = await openPanel();
    fireEvent.click(view.getAllByRole("button", { name: "删除" })[0]!);
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    expect(deleteTag).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(view.getByText("复盘")).toBeTruthy();
  });

  it("挂载视图:选标签 → listEntitiesForTag;移除挂载需确认 → removeAssignment", async () => {
    const view = await openPanel();
    fireEvent.click(view.getAllByRole("button", { name: "挂载" })[0]!);
    await waitFor(() => {
      expect(listEntitiesForTag).toHaveBeenCalledWith({
        params: { tagId: "tag-1" },
        query: { page: 1, pageSize: 200 },
        body: undefined,
      });
      expect(view.getByText("k-1")).toBeTruthy();
    });
    fireEvent.click(view.getAllByRole("button", { name: "移除标签" })[0]!);
    // 确认门先出,op 未打。
    expect(removeAssignment).not.toHaveBeenCalled();
    expect(view.getByText("移除这条挂载?")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "确认移除" }));
    await waitFor(() => {
      expect(removeAssignment).toHaveBeenCalledWith({
        params: undefined,
        query: undefined,
        body: { entityType: "knowledge", entityId: "k-1", tagId: "tag-1" },
      });
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
    // 本地挂载列表同步移除该行。
    expect(view.queryByText("k-1")).toBeNull();
  });

  it("移除挂载确认门:取消 → 不调 removeAssignment,挂载行仍在", async () => {
    const view = await openPanel();
    fireEvent.click(view.getAllByRole("button", { name: "挂载" })[0]!);
    await waitFor(() => {
      expect(view.getByText("k-1")).toBeTruthy();
    });
    fireEvent.click(view.getAllByRole("button", { name: "移除标签" })[0]!);
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    expect(removeAssignment).not.toHaveBeenCalled();
    expect(view.getByText("k-1")).toBeTruthy();
  });
});
