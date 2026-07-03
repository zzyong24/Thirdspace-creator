/**
 * 经验裁决台 岛交互契约(T-062a · SPEC §2.1/§2.3)。
 *
 * 断言:
 *  - 采纳 / 不采 → `learnings.evaluate`(validated / discarded);
 *  - inline 编辑 → 只开表单不落库;保存 → `learnings.patch`(title+insight)
 *    → router.refresh;
 *  - 回流校准 → 展开内联表单(绝不弹窗);留空提交 → body 省略字段(服务端
 *    默认);填 label/weight → body 带真值;成功 → 「已回流」徽章;失败 →
 *    内联错误提示(诚实,不静默);
 *  - discarded「翻案」→ evaluate 回 candidate;
 *  - 应用到项目 → 显式选目标后 `learnings.applications.create`。
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
  suggestCalibrationRule: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "calibsug-new", input }),
  ),
  createLearningApplication: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "app-new", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    evaluateLearning: (input: unknown) => mockClient.evaluateLearning(input),
    patchLearning: (input: unknown) => mockClient.patchLearning(input),
    suggestCalibrationRule: (input: unknown) =>
      mockClient.suggestCalibrationRule(input),
    createLearningApplication: (input: unknown) =>
      mockClient.createLearningApplication(input),
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

const validated: LearningVm = {
  id: "learning-2",
  title: "反差开场公式",
  insight: "先立常识再打破，留存 +18%。",
  learningType: "structure",
  validationStatus: "validated",
  confidenceScore: 88,
  reuseCount: 3,
  reviewId: null,
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-28T10:00:00.000Z",
};

const discarded: LearningVm = {
  id: "learning-3",
  title: "长铺垫也能留人",
  insight: "实测掉完播，不成立。",
  learningType: "failure",
  validationStatus: "discarded",
  confidenceScore: 20,
  reuseCount: 0,
  reviewId: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T10:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.evaluateLearning.mockClear();
  mockClient.patchLearning.mockClear();
  mockClient.suggestCalibrationRule.mockClear();
  mockClient.createLearningApplication.mockClear();
  mockClient.suggestCalibrationRule.mockImplementation(
    (input: unknown): Promise<unknown> =>
      Promise.resolve({ id: "calibsug-new", input }),
  );
});

async function renderQueue(candidates: ReadonlyArray<LearningVm> = [candidate]) {
  const { AdjudicationQueue } = await import("./experience-interactive-region");
  return render(<AdjudicationQueue candidates={candidates} />);
}

async function renderLibrary(
  overrides: Partial<{
    reflowedLearningIds: ReadonlyArray<string>;
    applyTargets: ReadonlyArray<{ id: string; title: string }>;
  }> = {},
) {
  const { ValidatedLibrary } = await import("./experience-interactive-region");
  return render(
    <ValidatedLibrary
      validated={[validated]}
      discarded={[discarded]}
      reflowedLearningIds={overrides.reflowedLearningIds ?? []}
      applyTargets={overrides.applyTargets ?? []}
    />,
  );
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
    ).toContain("暂无待裁决经验——复盘后 AI 会把发现排进来");
  });
});

describe("已验证库(ValidatedLibrary)", () => {
  it("回流校准:点按钮展开内联表单(不落库);留空提交 → body 省略字段 → 成功徽章", async () => {
    const { container } = await renderLibrary();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-learning-id="learning-2"] [data-slot="learning-reflow"]',
      )!,
    );
    expect(mockClient.suggestCalibrationRule).not.toHaveBeenCalled();
    const form = container.querySelector('[data-slot="learning-reflow-form"]');
    expect(form).not.toBeNull();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-reflow-submit"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.suggestCalibrationRule).toHaveBeenCalledTimes(1),
    );
    // 留空 ⇒ 字段省略,服务端按 learningType 默认。
    expect(mockClient.suggestCalibrationRule).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { learningId: "learning-2" },
        body: {},
      }),
    );
    // 成功后卡上显「已回流 · 待校准中心采纳」徽章(client state)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="learning-reflow-badge"]'),
      ).not.toBeNull(),
    );
  });

  it("回流表单:填 dimensionLabel/weight → body 带真值", async () => {
    const { container } = await renderLibrary();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-reflow"]',
      )!,
    );
    fireEvent.change(
      container.querySelector<HTMLInputElement>(
        '[data-slot="learning-reflow-label"]',
      )!,
      { target: { value: "结构完整度" } },
    );
    fireEvent.change(
      container.querySelector<HTMLInputElement>(
        '[data-slot="learning-reflow-weight"]',
      )!,
      { target: { value: "0.2" } },
    );
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-reflow-submit"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.suggestCalibrationRule).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { learningId: "learning-2" },
          body: { dimensionLabel: "结构完整度", weight: 0.2 },
        }),
      ),
    );
  });

  it("回流失败 → 内联错误提示,不显成功徽章", async () => {
    mockClient.suggestCalibrationRule.mockImplementation(() =>
      Promise.reject(new Error("ConflictError: no rubric")),
    );
    const { container } = await renderLibrary();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-reflow"]',
      )!,
    );
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="learning-reflow-submit"]',
      )!,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="learning-reflow-error"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="learning-reflow-badge"]'),
    ).toBeNull();
  });

  it("服务端已回流集合 → 直接显徽章、无回流按钮", async () => {
    const { container } = await renderLibrary({
      reflowedLearningIds: ["learning-2"],
    });
    expect(
      container.querySelector('[data-slot="learning-reflow-badge"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="learning-reflow"]'),
    ).toBeNull();
  });

  it("discarded「翻案」→ evaluateLearning candidate(回裁决队列)", async () => {
    const { container } = await renderLibrary();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-learning-id="learning-3"] [data-slot="learning-reopen"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.evaluateLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { learningId: "learning-3" },
          body: { validationStatus: "candidate" },
        }),
      ),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("应用到项目:显式选目标后 → createLearningApplication", async () => {
    const { container } = await renderLibrary({
      applyTargets: [{ id: "project-1", title: "项目一" }],
    });
    const select = container.querySelector<HTMLSelectElement>(
      '[data-learning-id="learning-2"] [data-slot="learning-apply-target"]',
    )!;
    // 未选项目时按钮禁用(禁止默认灌第一个项目,T-049 B17 沿革)。
    const applyButton = container.querySelector<HTMLButtonElement>(
      '[data-learning-id="learning-2"] [data-slot="learning-apply"]',
    )!;
    expect(applyButton.disabled).toBe(true);
    fireEvent.change(select, { target: { value: "project-1" } });
    fireEvent.click(applyButton);
    await waitFor(() =>
      expect(mockClient.createLearningApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { learningId: "learning-2" },
          body: { projectId: "project-1", applicationNote: "" },
        }),
      ),
    );
  });
});
