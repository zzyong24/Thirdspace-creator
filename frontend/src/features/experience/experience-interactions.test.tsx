/**
 * 经验裁决队列 岛交互契约(T-062a → T-118c 退役后收窄)。
 *
 * [T-118c] `ValidatedLibrary`(已验证库 UI)退役 —— 已验证经验改由知识库读层
 * 投影为只读经验行,不再在此裁决/回流(裁决是复盘的活)。本文件只保留
 * `AdjudicationQueue` 的交互断言(该组件 T-118a 已迁进复盘页复用):
 *  - 采纳 / 不采 → `learnings.evaluate`(validated / discarded);
 *  - inline 编辑 → 只开表单不落库;保存 → `learnings.patch`(title+insight)
 *    → router.refresh;
 *  - 空队列 → 诚实空态文案。
 *
 * 全部 mutation 走 island → client.* → router.refresh();测试 mock client 与
 * router,岛内无 Date.now/Math.random/fetch。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import type { LearningVm } from "./experience-data";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  evaluateLearning: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "learning-eval", input }),
  ),
  patchLearning: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "learning-patched", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    evaluateLearning: (input: unknown) => mockClient.evaluateLearning(input),
    patchLearning: (input: unknown) => mockClient.patchLearning(input),
  },
}));

const candidate: LearningVm = {
  id: "learning-1",
  title: "开头 3 秒必须有钩子",
  insight: "前 3 秒没有冲突/悬念，完播率掉一半。",
  learningType: "hook",
  validationStatus: "candidate",
  confidenceScore: 72,
  reuseCount: 0,
  reviewId: "review-1",
  createdAt: "2026-07-02T10:00:00.000Z",
  updatedAt: "2026-07-02T10:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.evaluateLearning.mockClear();
  mockClient.patchLearning.mockClear();
});

async function renderQueue(candidates: ReadonlyArray<LearningVm> = [candidate]) {
  const { AdjudicationQueue } = await import("./experience-interactive-region");
  return render(<AdjudicationQueue candidates={candidates} />);
}

describe("裁决队列(AdjudicationQueue)", () => {
  it("采纳 → evaluateLearning validated + refresh", async () => {
    const { container } = await renderQueue();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-learning-id="learning-1"] [data-slot="learning-adopt"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.evaluateLearning).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.evaluateLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { learningId: "learning-1" },
        body: { validationStatus: "validated" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("不采 → evaluateLearning discarded", async () => {
    const { container } = await renderQueue();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-learning-id="learning-1"] [data-slot="learning-discard"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.evaluateLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { learningId: "learning-1" },
          body: { validationStatus: "discarded" },
        }),
      ),
    );
  });

  it("编辑:点按钮只开表单不落库;保存 → patchLearning(title+insight)→ refresh", async () => {
    const { container } = await renderQueue();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-edit"]',
      )!,
    );
    // 只开表单。
    expect(mockClient.patchLearning).not.toHaveBeenCalled();
    const form = container.querySelector('[data-slot="learning-edit-form"]');
    expect(form).not.toBeNull();
    // 受控输入预填原值。
    const titleInput = container.querySelector<HTMLInputElement>(
      '[data-slot="learning-edit-title"]',
    )!;
    expect(titleInput.value).toBe("开头 3 秒必须有钩子");
    fireEvent.change(titleInput, {
      target: { value: "开头 3 秒必须放结论" },
    });
    fireEvent.change(
      container.querySelector<HTMLTextAreaElement>(
        '[data-slot="learning-edit-insight"]',
      )!,
      { target: { value: "完播率高的都在前 3 秒放结论。" } },
    );
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-edit-save"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.patchLearning).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.patchLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { learningId: "learning-1" },
        body: {
          title: "开头 3 秒必须放结论",
          insight: "完播率高的都在前 3 秒放结论。",
        },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    // 保存不是裁决:evaluate 不被触发。
    expect(mockClient.evaluateLearning).not.toHaveBeenCalled();
  });

  it("空队列 → 诚实空态文案", async () => {
    const { container } = await renderQueue([]);
    expect(
      container.querySelector('[data-slot="learning-queue-empty"]')!
        .textContent,
    ).toContain("还没有待确认的经验");
  });
});
