/**
 * Interaction tests for the Review Workspace authoring surface(module 13 Step 5
 * → [T-329] 交互重做)。「开始复盘→添加洞察→完成复盘」三段式已改**直接可用**:
 *   - 添加洞察 (add)      → 无进行中 review 时隐式先 reviews.create 再
 *                           reviews.insights.create(链式;+ refresh)
 *   - 再次添加            → 复用已创建的 review(不再二次 create)
 *   - 完成复盘 (complete) → reviews.complete(收尾门:有进行中 review 且 ≥1 洞察
 *                           才可用,否则禁用 + 说明)
 *   - Review-history row select → reviews.get (read-only drill, NO refresh;
 *                           读失败内联可见)
 *   - 无 wiring(无登录会话)→ 控件禁用 + 明示原因,绝不静默 no-op
 *
 * [T-116b] 装饰按钮(查看全部 / 添加发布 / 生成复盘报告)已删除;残留的 top-published
 * card(纯展示)issue NO network call。
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island is
 * rendered with a fixed wiring descriptor so the op params are known.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type { AnalyticsViewModel } from "@/types/view-models";

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
  mockClient.createReview.mockResolvedValue({
    id: "review-new",
    status: "in_progress",
  });
  mockClient.createReviewInsight.mockResolvedValue({
    id: "insight-new",
    priority: 0,
  });
  mockClient.getReview.mockResolvedValue({
    id: "review-hist-1",
    status: "completed",
    reviewType: "project",
    periodStart: "2026-06-10T00:00:00.000Z",
    periodEnd: "2026-06-15T00:00:00.000Z",
    completedAt: "2026-06-16T00:00:00.000Z",
  });
  mockRouter.refresh.mockClear();
});

const WIRING = { projectId: PROJECT_ID } as const;

async function renderIsland(
  wiring?: { projectId: string },
  vmOverride?: Partial<AnalyticsViewModel>,
) {
  const { AnalyticsReviewInteractiveRegion } = await import(
    "./analytics-review-interactive-region"
  );
  return render(
    <AnalyticsReviewInteractiveRegion
      viewModel={{
        ...buildAnalyticsReviewViewModel(PROJECT_ID),
        ...vmOverride,
      }}
      reviewsWiring={wiring}
    />,
  );
}

/** 填洞察标题(添加洞察的最小前置)。 */
function fillTitle(container: HTMLElement, value = "优化开头三秒") {
  const titleInput = container.querySelector<HTMLInputElement>(
    '[data-slot="insight-title-input"]',
  );
  fireEvent.change(titleInput!, { target: { value } });
}

describe("Reviews authoring wiring ([T-329] 直接可用)", () => {
  it("三段式已拆:不再渲染「开始复盘」按钮,洞察表单常显", async () => {
    const { container } = await renderIsland(WIRING);
    expect(
      container.querySelector('[data-slot="start-review-button"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="add-insight-form"]'),
    ).not.toBeNull();
  });

  it("添加洞察(无进行中 review)→ 隐式先 reviews.create 再 insights.create,+ refresh", async () => {
    const { container } = await renderIsland(WIRING);
    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[data-slot="insight-type-select"]',
    );
    fireEvent.change(typeSelect!, { target: { value: "action" } });
    fillTitle(container);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createReviewInsight).toHaveBeenCalledTimes(1),
    );
    // 链式:先隐式 create(本项目、project 型),再 insight 挂到新 review 上。
    expect(mockClient.createReview).toHaveBeenCalledTimes(1);
    expect(mockClient.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: PROJECT_ID },
        body: { reviewType: "project", contentOutputId: null },
      }),
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
    // 成功内联反馈可见(T-209 模式)。
    const feedback = container.querySelector(
      '[data-slot="review-authoring-feedback"]',
    );
    expect(feedback?.getAttribute("data-tone")).toBe("success");
  });

  it("第二次添加洞察 → 复用已创建的 review(不二次 create)", async () => {
    const { container } = await renderIsland(WIRING);
    fillTitle(container, "第一条");
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createReviewInsight).toHaveBeenCalledTimes(1),
    );
    fillTitle(container, "第二条");
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createReviewInsight).toHaveBeenCalledTimes(2),
    );
    expect(mockClient.createReview).toHaveBeenCalledTimes(1);
  });

  it("隐式 create 失败 → 错误内联可见,不吞进添加流程(洞察未发)", async () => {
    mockClient.createReview.mockRejectedValueOnce(new Error("boom"));
    const { container } = await renderIsland(WIRING);
    fillTitle(container);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() => {
      const feedback = container.querySelector(
        '[data-slot="review-authoring-feedback"]',
      );
      expect(feedback?.getAttribute("data-tone")).toBe("error");
    });
    expect(mockClient.createReviewInsight).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("insights.create 失败 → 错误内联可见(失败可见,不静默)", async () => {
    mockClient.createReviewInsight.mockRejectedValueOnce(new Error("boom"));
    const { container } = await renderIsland(WIRING);
    fillTitle(container);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() => {
      const feedback = container.querySelector(
        '[data-slot="review-authoring-feedback"]',
      );
      expect(feedback?.getAttribute("data-tone")).toBe("error");
    });
  });

  it("完成复盘门:无进行中 review 禁用 + 说明;添加 ≥1 洞察后可用 → reviews.complete + refresh", async () => {
    const { container } = await renderIsland(WIRING);
    const completeBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="complete-review-button"]',
    )!;
    // 初始禁用 + 说明可见。
    expect(completeBtn.disabled).toBe(true);
    expect(
      container.querySelector('[data-slot="complete-review-hint"]')
        ?.textContent ?? "",
    ).toContain("自动创建");
    // 加一条洞察 → 门开。
    fillTitle(container);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() => expect(completeBtn.disabled).toBe(false));
    fireEvent.click(completeBtn);
    await waitFor(() =>
      expect(mockClient.completeReview).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.completeReview).toHaveBeenCalledWith(
      expect.objectContaining({ params: { reviewId: "review-new" } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("接管服务端进行中的复盘(reviews.list status=in_progress)→ 添加洞察不另起新复盘,可直接完成", async () => {
    const { container } = await renderIsland(WIRING, {
      reviewHistory: [
        {
          id: "review-open",
          title: "项目复盘 · 2026-07-01 ~ 2026-07-07",
          completedAt: "2026-07-01",
          tone: "neutral",
          status: "in_progress",
        },
      ],
    });
    fillTitle(container);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.createReviewInsight).toHaveBeenCalledTimes(1),
    );
    // 不隐式另起新 review,洞察直接挂到接管的进行中复盘。
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.createReviewInsight).toHaveBeenCalledWith(
      expect.objectContaining({ params: { reviewId: "review-open" } }),
    );
    // 接管的进行中复盘(洞察在服务端)→ 完成按钮可用。
    const completeBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="complete-review-button"]',
    )!;
    expect(completeBtn.disabled).toBe(false);
  });

  it("洞察标题为空 → 错误反馈,不发任何 op", async () => {
    const { container } = await renderIsland(WIRING);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="add-insight-button"]',
      )!,
    );
    await waitFor(() => {
      const feedback = container.querySelector(
        '[data-slot="review-authoring-feedback"]',
      );
      expect(feedback?.textContent ?? "").toContain("标题不能为空");
    });
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.createReviewInsight).not.toHaveBeenCalled();
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

  it("reviews.get 读失败 → 错误内联可见(不再静默 rejection)", async () => {
    mockClient.getReview.mockRejectedValueOnce(new Error("boom"));
    const { container } = await renderIsland(WIRING);
    fireEvent.click(
      container.querySelector<HTMLLIElement>(
        '[data-slot="review-history-item"]',
      )!,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="review-detail-error"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="review-detail-panel"]'),
    ).toBeNull();
  });

  // [T-116b] 纯装饰按钮「添加发布 / 生成复盘报告 / 查看全部」已删除;断言它们不再渲染,
  // 且残留的 top-published card(纯展示)点击不触发任何 Reviews op。
  it("removes 添加发布 / 生成复盘报告 / 查看全部; top-published card issues NO network call", async () => {
    const { container } = await renderIsland(WIRING);
    expect(
      container.querySelector('[data-slot="attach-publication-button"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="generate-report-button"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="top-published-view-all"]'),
    ).toBeNull();
    container
      .querySelector<HTMLLIElement>('[data-slot="top-published-card"]')
      ?.click();
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.createReviewInsight).not.toHaveBeenCalled();
    expect(mockClient.completeReview).not.toHaveBeenCalled();
    expect(mockClient.getReview).not.toHaveBeenCalled();
  });

  // [T-329] 无 wiring(无登录会话)→ 禁用 + 明示原因,绝不静默 no-op。
  it("without wiring the authoring controls are DISABLED with a visible reason (no client call)", async () => {
    const { container } = await renderIsland(undefined);
    const addBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="add-insight-button"]',
    )!;
    const completeBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="complete-review-button"]',
    )!;
    expect(addBtn.disabled).toBe(true);
    expect(completeBtn.disabled).toBe(true);
    // 原因明示(不是点了没反应的假按钮)。
    const reason = container.querySelector(
      '[data-slot="review-authoring-no-wiring"]',
    );
    expect(reason).not.toBeNull();
    expect(reason!.textContent ?? "").toContain("登录状态还没准备好");
    fireEvent.click(addBtn);
    fireEvent.click(completeBtn);
    fireEvent.click(
      container.querySelector<HTMLLIElement>(
        '[data-slot="review-history-item"]',
      )!,
    );
    expect(mockClient.createReview).not.toHaveBeenCalled();
    expect(mockClient.createReviewInsight).not.toHaveBeenCalled();
    expect(mockClient.completeReview).not.toHaveBeenCalled();
    expect(mockClient.getReview).not.toHaveBeenCalled();
  });
});
