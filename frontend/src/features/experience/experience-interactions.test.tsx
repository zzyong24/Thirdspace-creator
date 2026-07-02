/**
 * Module 14 Step 5 — Experience island wiring contract.
 *
 * Asserts the roadmap §4 `/experience` wiring:
 *  - each 快速记录 quick-record button → client.createLearning({ title, insight:"" });
 *  - the 应用经验 apply control → client.createLearningApplication({ params:{learningId},
 *    body:{ projectId, applicationNote:"" } });
 *  - 验证 / 废弃 → client.evaluateLearning with the correct validationStatus;
 *  - tab switching issues NO network call (client-side filter only) and narrows the
 *    rendered records.
 * Every mutation flows island → client.* → router.refresh(). Determinism: the test
 * mocks the client + router; no Date.now/Math.random/fetch in the islands.
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createLearning: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "learning-new", input }),
  ),
  createLearningApplication: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "app-new", input }),
  ),
  evaluateLearning: vi.fn((input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "learning-eval", input }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createLearning: (input: unknown) => mockClient.createLearning(input),
    createLearningApplication: (input: unknown) =>
      mockClient.createLearningApplication(input),
    evaluateLearning: (input: unknown) => mockClient.evaluateLearning(input),
  },
}));

const tabs = [
  { id: "all", label: "全部" },
  { id: "script", label: "脚本结构" },
  { id: "review", label: "复盘沉淀" },
];

const records = [
  {
    id: "rec-1",
    title: "反差开场公式",
    category: "脚本结构",
    updatedAt: "2026-05-30",
    reuseCount: 18,
    learningId: "learning-1",
    validationStatus: "candidate" as const,
    tabId: "script",
  },
  {
    id: "rec-2",
    title: "失败案例 · 长铺垫",
    category: "复盘沉淀",
    updatedAt: "2026-05-08",
    reuseCount: 6,
    learningId: "learning-2",
    validationStatus: "candidate" as const,
    tabId: "review",
  },
];

const quickActions = [
  { id: "qa-new", label: "新建经验", hint: "把这次的复盘沉淀下来" },
];

const applyTargets = [{ id: "project-1", title: "项目一" }];

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.createLearning.mockClear();
  mockClient.createLearningApplication.mockClear();
  mockClient.evaluateLearning.mockClear();
});

async function renderRegion() {
  const { ExperienceInteractiveRegion } = await import(
    "./experience-interactive-region"
  );
  return render(
    <ExperienceInteractiveRegion
      tabs={tabs}
      records={records}
      applyTargets={applyTargets}
    />,
  );
}

async function renderQuickActions() {
  const { QuickRecordActionsIsland } = await import(
    "./experience-interactive-region"
  );
  return render(<QuickRecordActionsIsland actions={quickActions} />);
}

describe("Experience island wiring (Module 14)", () => {
  it("preserves the wired data-slots", async () => {
    const { container } = await renderRegion();
    expect(
      container.querySelector('[data-slot="recent-records-table"]'),
    ).not.toBeNull();
    const { container: qa } = await renderQuickActions();
    expect(
      qa.querySelector('[data-slot="quick-record-actions"]'),
    ).not.toBeNull();
  });

  // [T-049 B17] 快速记录改富录入:点按钮只开表单(绝不直接落库空记录);
  // 标题+洞察必填,保存才 createLearning(带 learningType)。
  it("quick-record button opens the form; submit → createLearning with typed fields", async () => {
    const { container } = await renderQuickActions();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="quick-record-action"]',
      )!,
    );
    // 只开表单,不落库。
    expect(mockClient.createLearning).not.toHaveBeenCalled();
    const form = container.querySelector('[data-slot="quick-record-form"]');
    expect(form).not.toBeNull();
    // 空必填时提交按钮禁用。
    const submit = container.querySelector<HTMLButtonElement>(
      '[data-slot="quick-record-submit"]',
    )!;
    expect(submit.disabled).toBe(true);
    fireEvent.change(
      container.querySelector<HTMLInputElement>(
        '[data-slot="quick-record-title"]',
      )!,
      { target: { value: "开头 3 秒必须有钩子" } },
    );
    fireEvent.change(
      container.querySelector<HTMLTextAreaElement>(
        '[data-slot="quick-record-insight"]',
      )!,
      { target: { value: "前 3 秒没有冲突/悬念,完播率掉一半。" } },
    );
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mockClient.createLearning).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: "开头 3 秒必须有钩子",
          insight: "前 3 秒没有冲突/悬念,完播率掉一半。",
          learningType: "strategy",
        },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("apply control → createLearningApplication with learningId + selected project", async () => {
    const { container } = await renderRegion();
    // [T-049 B17] 应用前必须显式选目标项目(旧行为恒灌 applyTargets[0]=演示项目)。
    const select = container.querySelector<HTMLSelectElement>(
      '[data-record-id="rec-1"] [data-slot="record-apply-target"]',
    );
    fireEvent.change(select!, { target: { value: "project-1" } });
    const applyButton = container.querySelector<HTMLButtonElement>(
      '[data-record-id="rec-1"] [data-slot="record-apply"]',
    );
    fireEvent.click(applyButton!);
    await waitFor(() =>
      expect(mockClient.createLearningApplication).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createLearningApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { learningId: "learning-1" },
        body: { projectId: "project-1", applicationNote: "" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("验证 → evaluateLearning with validationStatus validated", async () => {
    const { container } = await renderRegion();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-record-id="rec-1"] [data-slot="record-validate"]',
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
  });

  it("废弃 → evaluateLearning with validationStatus discarded", async () => {
    const { container } = await renderRegion();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-record-id="rec-2"] [data-slot="record-discard"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.evaluateLearning).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.evaluateLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { learningId: "learning-2" },
        body: { validationStatus: "discarded" },
      }),
    );
  });

  it("tab switch filters client-side with NO network call", async () => {
    const { container } = await renderRegion();
    expect(
      container.querySelectorAll('[data-slot="recent-record-row"]'),
    ).toHaveLength(2);
    const reviewTab = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="experience-tab"]'),
    ).find((node) => node.getAttribute("data-tab-id") === "review");
    fireEvent.click(reviewTab!);
    const rows = container.querySelectorAll('[data-slot="recent-record-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-record-id")).toBe("rec-2");
    expect(mockClient.createLearning).not.toHaveBeenCalled();
    expect(mockClient.createLearningApplication).not.toHaveBeenCalled();
    expect(mockClient.evaluateLearning).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
