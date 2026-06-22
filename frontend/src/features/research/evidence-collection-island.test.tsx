/**
 * F2d — EvidenceCollectionIsland contract test. 关联证据 calls
 * client.createKnowledgeRelation with { targetKnowledgeId, relationType:'supports' };
 * the 取消关联 (unlink) button is disabled (no contract op — known gap).
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createKnowledgeRelation: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "rel-new", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledgeRelation: (input: unknown) =>
      mockClient.createKnowledgeRelation(input),
  },
}));

const items = [
  {
    id: "ev-1",
    title: "证据一",
    type: "知识条目",
    knowledgeId: "knowledge-arc-dia-research",
    targetKnowledgeId: "knowledge-local-memory-trend",
  },
];

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.createKnowledgeRelation.mockClear();
});

async function renderIsland() {
  const { EvidenceCollectionIsland } = await import("./evidence-collection-island");
  return render(<EvidenceCollectionIsland items={items} />);
}

describe("EvidenceCollectionIsland (F2b)", () => {
  it("keeps the evidence-list + evidence-row data-slots", async () => {
    const { container } = await renderIsland();
    expect(container.querySelector('[data-slot="evidence-list"]')).not.toBeNull();
    expect(
      container.querySelectorAll('[data-slot="evidence-row"]'),
    ).toHaveLength(1);
  });

  it("关联证据 calls createKnowledgeRelation with targetKnowledgeId + relationType 'supports'", async () => {
    const { container } = await renderIsland();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="evidence-link-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createKnowledgeRelation).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createKnowledgeRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "knowledge-arc-dia-research" },
        body: {
          targetKnowledgeId: "knowledge-local-memory-trend",
          relationType: "supports",
        },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("the 取消关联 (unlink) button is disabled (no contract op)", async () => {
    const { container } = await renderIsland();
    const unlink = container.querySelector<HTMLButtonElement>(
      '[data-slot="evidence-unlink-button"]',
    );
    expect(unlink).not.toBeNull();
    expect(unlink!.disabled).toBe(true);
    expect(unlink!.getAttribute("title")).toBe("暂不支持取消关联");
  });
});
