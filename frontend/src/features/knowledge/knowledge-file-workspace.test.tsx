import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, createKnowledgeFolder, moveKnowledge } = vi.hoisted(() => ({
  refresh: vi.fn(),
  createKnowledgeFolder: vi.fn(),
  moveKnowledge: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/contract-client", () => ({
  client: { createKnowledgeFolder, moveKnowledge },
}));

import { KnowledgeFileWorkspace } from "./knowledge-file-workspace";

const workspace = {
  folders: [
    {
      id: "folder-root",
      parentId: null,
      name: "课程",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
    {
      id: "folder-child",
      parentId: "folder-root",
      name: "第一章",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
  ],
  items: [
    {
      id: "knowledge-1",
      title: "讲义.pdf",
      folderId: null,
      assetId: "asset-1",
      knowledgeType: "reference",
      status: "active" as const,
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "knowledge-older",
      title: "旧讲义.pdf",
      folderId: null,
      assetId: "asset-older",
      knowledgeType: "reference",
      status: "active" as const,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe("KnowledgeFileWorkspace", () => {
  beforeEach(() => {
    refresh.mockReset();
    createKnowledgeFolder.mockReset().mockResolvedValue({});
    moveKnowledge.mockReset().mockResolvedValue({});
  });

  it("defaults to the folder workspace and exposes real virtual nodes", () => {
    render(<KnowledgeFileWorkspace workspace={workspace} />);
    expect(screen.getByRole("button", { name: /全部/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /最近/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未归档/ })).toBeInTheDocument();
    expect(screen.getByText("讲义.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第一章" })).toBeInTheDocument();
  });

  it("[T-547] 全部文件按导入时间倒序，最新写入排在前面", () => {
    const { container } = render(<KnowledgeFileWorkspace workspace={workspace} />);
    const titles = Array.from(
      container.querySelectorAll("li p:first-child"),
      (node) => node.textContent,
    );
    expect(titles).toEqual(["讲义.pdf", "旧讲义.pdf"]);
  });

  it("creates a child folder under the selected folder", async () => {
    render(<KnowledgeFileWorkspace workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "课程" }));
    fireEvent.change(screen.getByLabelText("新文件夹名称"), {
      target: { value: "第二章" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建文件夹" }));
    await waitFor(() =>
      expect(createKnowledgeFolder).toHaveBeenCalledWith({
        params: undefined,
        query: undefined,
        body: { name: "第二章", parentId: "folder-root" },
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("moves an item into a logical folder", async () => {
    render(<KnowledgeFileWorkspace workspace={workspace} />);
    fireEvent.change(screen.getByLabelText("移动 讲义.pdf"), {
      target: { value: "folder-child" },
    });
    await waitFor(() =>
      expect(moveKnowledge).toHaveBeenCalledWith({
        params: { knowledgeId: "knowledge-1" },
        query: undefined,
        body: { folderId: "folder-child" },
      }),
    );
  });
});
