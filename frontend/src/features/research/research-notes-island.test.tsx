/**
 * F2d — ResearchNotesIsland contract test. The 添加笔记 control + submit calls
 * client.createKnowledgeRevision with the target note's knowledgeId; per-row 编辑
 * also revises. Mutations flow island → client.* → router.refresh().
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createKnowledgeRevision: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "rev-new", input }),
  ),
  archiveKnowledge: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "item-archived", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledgeRevision: (input: unknown) =>
      mockClient.createKnowledgeRevision(input),
    archiveKnowledge: (input: unknown) =>
      mockClient.archiveKnowledge(input),
  },
}));

const notes = [
  { id: "note-1", content: "第一条", knowledgeId: "knowledge-local-memory-trend" },
  { id: "note-2", content: "第二条", knowledgeId: "knowledge-arc-dia-research" },
];

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.createKnowledgeRevision.mockClear();
  mockClient.archiveKnowledge.mockClear();
});

async function renderIsland() {
  const { ResearchNotesIsland } = await import("./research-notes-island");
  return render(<ResearchNotesIsland notes={notes} />);
}

describe("ResearchNotesIsland (F2a)", () => {
  it("keeps the research-notes-list + research-note-row data-slots", async () => {
    const { container } = await renderIsland();
    expect(
      container.querySelector('[data-slot="research-notes-list"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-slot="research-note-row"]'),
    ).toHaveLength(2);
  });

  it("添加笔记 + submit calls createKnowledgeRevision with the first note's knowledgeId", async () => {
    const { container } = await renderIsland();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="research-notes-add-button"]',
      )!,
    );
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-slot="research-notes-add-content"]',
    );
    fireEvent.change(textarea!, { target: { value: "新增的研究笔记" } });
    fireEvent.submit(
      container.querySelector<HTMLFormElement>(
        '[data-slot="research-notes-add-form"]',
      )!,
    );

    await waitFor(() =>
      expect(mockClient.createKnowledgeRevision).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createKnowledgeRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "knowledge-local-memory-trend" },
        body: { content: "新增的研究笔记" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("编辑 a row + 保存 calls createKnowledgeRevision with that row's knowledgeId", async () => {
    const { container } = await renderIsland();
    const editButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="research-note-edit"]',
    );
    fireEvent.click(editButtons[1]!);
    const content = container.querySelector<HTMLTextAreaElement>(
      '[data-slot="research-note-edit-content"]',
    );
    fireEvent.change(content!, { target: { value: "改后的内容" } });
    fireEvent.submit(
      container.querySelector<HTMLFormElement>(
        '[data-slot="research-note-edit-form"]',
      )!,
    );

    await waitFor(() =>
      expect(mockClient.createKnowledgeRevision).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createKnowledgeRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "knowledge-arc-dia-research" },
        body: { content: "改后的内容" },
      }),
    );
  });

  it("删除 a row calls archiveKnowledge with that row's knowledgeId (GAP-RES-1)", async () => {
    const { container } = await renderIsland();
    const deleteButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-slot="research-note-delete"]',
    );
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[1]!);
    await waitFor(() =>
      expect(mockClient.archiveKnowledge).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.archiveKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "knowledge-arc-dia-research" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});
