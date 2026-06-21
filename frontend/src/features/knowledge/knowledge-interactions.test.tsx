/**
 * Interaction + state tests for the Knowledge & Memory page.
 *
 * Covers:
 *  - wired-local: the search input + the type chips narrow the recent list,
 *    and a row is selectable (these stay client-side filters over the now-real
 *    list — F1a, no extra network),
 *  - F1e write affordances: 新建知识 → client.createKnowledge with the typed body;
 *    selecting a row + 保存修订 → client.createKnowledgeRevision with
 *    { params:{ knowledgeId }, body:{ content } },
 *  - the LOADING / ERROR / EMPTY state rendering driven by the ViewModel
 *    envelope (via `buildPageScenario`).
 *
 * `KnowledgePage` is now an async Server Component (F1a); resolve it through the
 * `viewModel?` seam so these tests stay sync + fixture-driven (no network).
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildKnowledgeViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createKnowledge: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "k-new", input }),
  ),
  createKnowledgeRevision: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "rev-new", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => mockClient.createKnowledge(input),
    createKnowledgeRevision: (input: unknown) =>
      mockClient.createKnowledgeRevision(input),
  },
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.createKnowledge.mockClear();
  mockClient.createKnowledgeRevision.mockClear();
});

// Resolve the async page through the override seam, then render its element.
async function renderKnowledge(viewModel = buildKnowledgeViewModel()) {
  const { KnowledgePage } = await import("./knowledge-page");
  const element = await KnowledgePage({ viewModel });
  return render(element);
}

function countRows(container: HTMLElement): number {
  return container.querySelectorAll('[data-slot="recent-knowledge-row"]').length;
}

describe("KnowledgePage interactions (wired-local filters)", () => {
  it("filters the recent list by the search input", async () => {
    const { container } = await renderKnowledge();
    const before = countRows(container);
    expect(before).toBeGreaterThan(1);
    const search = container.querySelector<HTMLInputElement>(
      '[data-slot="knowledge-search-input"]',
    );
    expect(search).not.toBeNull();
    fireEvent.change(search!, { target: { value: "不存在的查询zzz" } });
    expect(countRows(container)).toBe(0);
    expect(
      container.querySelector('[data-slot="recent-knowledge-empty"]'),
    ).not.toBeNull();
    fireEvent.change(search!, { target: { value: "" } });
    expect(countRows(container)).toBe(before);
    // Filtering is purely client-side — no network.
    expect(mockClient.createKnowledge).not.toHaveBeenCalled();
  });

  it("filters the list by a type chip", async () => {
    const { container } = await renderKnowledge();
    const before = countRows(container);
    const noteChip = container.querySelector<HTMLButtonElement>(
      '[data-slot="knowledge-filter-chip"][data-filter-id="笔记"]',
    );
    expect(noteChip).not.toBeNull();
    fireEvent.click(noteChip!);
    expect(noteChip!.getAttribute("data-pressed")).toBe("true");
    const filtered = countRows(container);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThanOrEqual(before);
    expect(
      Array.from(
        container.querySelectorAll('[data-slot="recent-knowledge-row"]'),
      ).every((row) => (row.textContent ?? "").includes("笔记")),
    ).toBe(true);
  });

  it("selects a recent-knowledge row on click", async () => {
    const { container } = await renderKnowledge();
    const row = container.querySelector<HTMLTableRowElement>(
      '[data-slot="recent-knowledge-row"]',
    );
    expect(row).not.toBeNull();
    expect(row!.getAttribute("data-selected")).toBe("false");
    fireEvent.click(row!);
    expect(row!.getAttribute("data-selected")).toBe("true");
  });
});

describe("KnowledgePage writes (F1e)", () => {
  it("新建知识 → opens the form, submit calls client.createKnowledge with the typed body", async () => {
    const { container } = await renderKnowledge();
    const createButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="knowledge-create-button"]',
    );
    expect(createButton).not.toBeNull();
    fireEvent.click(createButton!);

    const title = container.querySelector<HTMLInputElement>(
      '[data-slot="knowledge-create-title"]',
    );
    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[data-slot="knowledge-create-type"]',
    );
    expect(title).not.toBeNull();
    expect(typeSelect).not.toBeNull();
    fireEvent.change(title!, { target: { value: "新条目" } });
    fireEvent.change(typeSelect!, { target: { value: "reference" } });

    const form = container.querySelector<HTMLFormElement>(
      '[data-slot="knowledge-create-form"]',
    );
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(mockClient.createKnowledge).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "新条目",
          knowledgeType: "reference",
        }),
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("selecting a row + 保存修订 calls client.createKnowledgeRevision with the knowledgeId", async () => {
    const { container } = await renderKnowledge();
    const row = container.querySelector<HTMLTableRowElement>(
      '[data-slot="recent-knowledge-row"]',
    );
    const knowledgeId = row!.getAttribute("data-knowledge-id");
    fireEvent.click(row!);

    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-slot="knowledge-revision-content"]',
    );
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: "新的修订" } });

    const form = container.querySelector<HTMLFormElement>(
      '[data-slot="knowledge-add-revision"]',
    );
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(mockClient.createKnowledgeRevision).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createKnowledgeRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId },
        body: { content: "新的修订" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});

describe("KnowledgePage states", () => {
  it("renders the LOADING state", async () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "loading");
    const { container } = await renderKnowledge(vm);
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="knowledge-grid"]')).toBeNull();
  });

  it("renders the ERROR state", async () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "error");
    const { container } = await renderKnowledge(vm);
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-error"]'),
    ).not.toBeNull();
  });

  it("renders the EMPTY state", async () => {
    const vm = buildPageScenario(() => buildKnowledgeViewModel(), "empty");
    const { container } = await renderKnowledge(vm);
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
