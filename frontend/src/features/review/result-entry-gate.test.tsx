/**
 * [T-247] 「录入实绩」确认门:AI calibration_score 候选预填 → 人确认 →
 * calibration.results.create(actualMetrics = { 维度key: 分 })→ refresh。
 * 无候选 → 手动录入降级;非法分(空/越界)禁提交。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  listAITasks: vi.fn(),
  listTaskResults: vi.fn(),
  createResult: vi.fn(),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    listAITasks: (i: unknown) => mockClient.listAITasks(i),
    listTaskResults: (i: unknown) => mockClient.listTaskResults(i),
    createResult: (i: unknown) => mockClient.createResult(i),
  },
}));

import { ResultEntryGate } from "./result-entry-gate";

const DIMENSIONS = [
  { key: "hook", predicted: 4 },
  { key: "structure", predicted: 3 },
];

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.listAITasks.mockReset().mockResolvedValue([]);
  mockClient.listTaskResults.mockReset().mockResolvedValue([]);
  mockClient.createResult.mockReset().mockResolvedValue({ id: "res-1" });
});

afterEach(() => cleanup());

function open(container: HTMLElement) {
  const toggle = container.querySelector(
    '[data-slot="result-entry-toggle"]',
  ) as HTMLButtonElement;
  expect(toggle).not.toBeNull();
  fireEvent.click(toggle);
}

function inputFor(container: HTMLElement, key: string): HTMLInputElement {
  const row = container.querySelector(
    `[data-slot="result-entry-row"][data-dimension-key="${key}"]`,
  );
  expect(row).not.toBeNull();
  return row!.querySelector('[data-slot="result-entry-input"]') as HTMLInputElement;
}

describe("ResultEntryGate (T-247 校准采纳门)", () => {
  it("AI 候选命中 → 预填各维度分;确认 → createResult(actualMetrics)+ refresh", async () => {
    mockClient.listAITasks.mockResolvedValue([
      { id: "task-1", status: "awaiting_confirmation" },
    ]);
    mockClient.listTaskResults.mockResolvedValue([
      {
        resultType: "calibration_score",
        resultData: {
          predictionId: "pred-1",
          dimensions: [
            { key: "hook", score: 3, reason: "完播偏低" },
            { key: "structure", score: 4, reason: "结构稳" },
          ],
        },
      },
    ]);
    const { container } = render(
      <ResultEntryGate predictionId="pred-1" dimensions={DIMENSIONS} />,
    );
    open(container);
    // 预填生效(hint + 值)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="result-entry-prefill-hint"]'),
      ).not.toBeNull(),
    );
    expect(inputFor(container, "hook").value).toBe("3");
    expect(inputFor(container, "structure").value).toBe("4");
    // 人改 hook 分 → 确认。
    fireEvent.change(inputFor(container, "hook"), { target: { value: "2" } });
    fireEvent.click(
      container.querySelector('[data-slot="result-entry-submit"]') as HTMLElement,
    );
    await waitFor(() => expect(mockClient.createResult).toHaveBeenCalledTimes(1));
    expect(mockClient.createResult).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { predictionId: "pred-1" },
        body: { actualMetrics: { hook: 2, structure: 4 } },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("无 AI 候选 → 手动录入降级;未填全/越界禁提交", async () => {
    const { container } = render(
      <ResultEntryGate predictionId="pred-1" dimensions={DIMENSIONS} />,
    );
    open(container);
    await waitFor(() => expect(mockClient.listAITasks).toHaveBeenCalled());
    const submit = container.querySelector(
      '[data-slot="result-entry-submit"]',
    ) as HTMLButtonElement;
    // 空框 → 禁提交。
    await waitFor(() => expect(submit.disabled).toBe(true));
    // 填一个越界分 → 仍禁。
    fireEvent.change(inputFor(container, "hook"), { target: { value: "9" } });
    fireEvent.change(inputFor(container, "structure"), { target: { value: "3" } });
    expect(
      (container.querySelector('[data-slot="result-entry-submit"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // 修正 → 可提交。
    fireEvent.change(inputFor(container, "hook"), { target: { value: "5" } });
    expect(
      (container.querySelector('[data-slot="result-entry-submit"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("无维度评分约定(旧预测)→ 整门不渲(诚实边界)", () => {
    const { container } = render(
      <ResultEntryGate predictionId="pred-old" dimensions={[]} />,
    );
    expect(
      container.querySelector('[data-slot="result-entry-toggle"]'),
    ).toBeNull();
  });
});
