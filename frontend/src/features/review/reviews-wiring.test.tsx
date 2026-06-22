/**
 * Interaction tests for the Review Workspace greenfield authoring surface
 * (module 13 Step 5). Each wired control fires its mapped Reviews contract op
 * over the typed client (mocked here), and mutations then router.refresh():
 *   - 开始复盘 (start)    → reviews.create  { reviewType: "project", contentOutputId: null } (+ refresh)
 *   - 添加洞察 (add)      → reviews.insights.create { insightType, title, description } (+ refresh)
 *   - 完成复盘 (complete) → reviews.complete (+ refresh)
 *   - Review-history row select → reviews.get (read-only drill, NO refresh)
 *
 * Decorative controls (查看全部, Top-published cards, 添加发布, 生成复盘报告) issue NO
 * network call.
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island is
 * rendered with a fixed wiring descriptor so the op params are known.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";

const PROJECT_ID = "project-podcast-launch";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createReview: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "review-new", status: "in_progress" }),
  ),
  createReviewInsight: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "insight-new", priority: 0 }),
  ),
  completeReview: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "review-new", status: "completed" }),
  ),
  getReview: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({
      id: "review-hist-1",
      status: "completed",
      reviewType: "project",
      periodStart: "2026-06-10T00:00:00.000Z",
      periodEnd: "2026-06-15T00:00:00.000Z",
      completedAt: "2026-06-16T00:00:00.000Z",
    }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createReview: (i: unknown) => mockClient.createReview(i),
    createReviewInsight: (i: unknown) => mockClient.createReviewInsight(i),
    completeReview: (i: unknown) => mockClient.completeReview(i),
    getReview: (i: unknown) => mockClient.getReview(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});

const WIRING = { projectId: PROJECT_ID } as const;

async function renderIsland(wiring?: { projectId: string }) {
  const { AnalyticsReviewInteractiveRegion } = await import(
    "./analytics-review-interactive-region"
  );
  return render(
    <AnalyticsReviewInteractiveRegion
      viewModel={buildAnalyticsReviewViewModel(PROJECT_ID)}
      reviewsWiring={wiring}
    />,
  );
}

describe("Reviews authoring wiring (module 13 Step 5)", () => {
  it("开始复盘 calls reviews.create then refresh", async () => {
    const { container } = await renderIsland(WIRING);
    const button = container.querySelector<HTMLButtonElement>(
      '[data-slot="start-review-button"]',
    );
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    await waitFor(() =>
      expect(mockClient.createReview).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: PROJECT_ID },
        body: { reviewType: "project", contentOutputId: null },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("添加洞察 calls reviews.insights.create with the form values then refresh", async () => {
    const { container } = await renderIsland(WIRING);
    // start a review first so the insight has a target reviewId.
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="start-review-button"]',
      )!,
    );
    await waitFor(() => expect(mockClient.createReview).toHaveBeenCalled());

    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[data-slot="insight-type-select"]',
    );
    const titleInput = container.querySelector<HTMLInputElement>(
      '[data-slot="insight-title-input"]',
    );
    fireEvent.change(typeSelect!, { target: { value: "action" } });
    fireEvent.change(titleInput!, { target: { value: "优化开头三秒" } });
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createReviewInsight).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createReviewInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { reviewId: "review-new" },
        body: expect.objectContaining({
          insightType: "action",
          title: "优化开头三秒",
        }),
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("完成复盘 calls reviews.complete then refresh", async () => {
    const { container } = await renderIsland(WIRING);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="start-review-button"]',
      )!,
    );
    await waitFor(() => expect(mockClient.createReview).toHaveBeenCalled());
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="complete-review-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.completeReview).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.completeReview).toHaveBeenCalledWith(
      expect.objectContaining({ params: { reviewId: "review-new" } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("selecting a review-history row calls reviews.get (no refresh) and renders the detail", async () => {
    const { container } = await renderIsland(WIRING);
    const row = container.querySelector<HTMLLIElement>(
      '[data-slot="review-history-item"]',
    );
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    await waitFor(() => expect(mockClient.getReview).toHaveBeenCalledTimes(1));
    expect(mockClient.getReview).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { reviewId: row!.getAttribute("data-history-id") },
      }),
    );
    // read-only drill — no router.refresh().
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="review-detail-panel"]'),
      ).not.toBeNull(),
    );
  });

  it("decorative controls (添加发布 / 生成复盘报告 / 查看全部 / top-published) issue NO network call", async () => {
    const { container } = await renderIsland(WIRING);
    container
      .querySelector<HTMLButtonElement>('[data-slot="attach-publication-button"]')
      ?.click();
    container
      .querySelector<HTMLButtonElement>('[data-slot="generate-report-button"]')
      ?.click();
    container
      .querySelector<HTMLButtonElement>('[data-slot="top-published-view-all"]')
      ?.click();
    container
      .querySelector<HTMLLIElement>('[data-slot="top-published-card"]')
      ?.click();
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.createReviewInsight).not.toHaveBeenCalled();
    expect(mockClient.completeReview).not.toHaveBeenCalled();
    expect(mockClient.getReview).not.toHaveBeenCalled();
  });

  it("without wiring the authoring controls are inert (no client call)", async () => {
    const { container } = await renderIsland(undefined);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="start-review-button"]',
      )!,
    );
    fireEvent.click(
      container.querySelector<HTMLLIElement>(
        '[data-slot="review-history-item"]',
      )!,
    );
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.getReview).not.toHaveBeenCalled();
  });
});
