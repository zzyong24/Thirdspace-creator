/**
 * [T-247] 已回流校准(待采纳)可操作列表:
 *  - pending 建议渲染(维度 label + 权重 + rationale);
 *  - 采纳 → calibration.suggestions.adopt → 重拉后行消失 + refresh;
 *  - 驳回 → calibration.suggestions.dismiss;
 *  - 0 条 → 整卡不渲(不摆空卡)。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  listRuleSuggestions: vi.fn(),
  adoptRuleSuggestion: vi.fn(),
  dismissRuleSuggestion: vi.fn(),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    listRuleSuggestions: (i: unknown) => mockClient.listRuleSuggestions(i),
    adoptRuleSuggestion: (i: unknown) => mockClient.adoptRuleSuggestion(i),
    dismissRuleSuggestion: (i: unknown) => mockClient.dismissRuleSuggestion(i),
  },
}));

import { CalibrationSuggestionsCard } from "./calibration-suggestions-card";

const SUGGESTION = {
  id: "sugg-1",
  status: "pending" as const,
  proposedDimension: {
    key: "retention_hook",
    label: "留存钩子",
    weight: 0.15,
    description: "",
  },
  rationale: "复盘发现前 3 秒流失占大头",
  createdAt: "2026-07-10T00:00:00.000Z",
};

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.listRuleSuggestions.mockReset();
  mockClient.adoptRuleSuggestion
    .mockReset()
    .mockResolvedValue({ id: "rv-2", versionNumber: 2 });
  mockClient.dismissRuleSuggestion
    .mockReset()
    .mockResolvedValue({ ...SUGGESTION, status: "dismissed" });
});

afterEach(() => cleanup());

describe("CalibrationSuggestionsCard (T-247 校准回流采纳门)", () => {
  it("pending 建议渲染;采纳 → adopt op → 重拉后行消失 + refresh", async () => {
    mockClient.listRuleSuggestions
      .mockResolvedValueOnce([SUGGESTION])
      .mockResolvedValueOnce([]); // 采纳后的重拉 → 空。
    const { container } = render(<CalibrationSuggestionsCard />);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="calibration-suggestion-row"]'),
      ).not.toBeNull(),
    );
    const row = container.querySelector(
      '[data-slot="calibration-suggestion-row"]',
    ) as HTMLElement;
    expect(row.textContent).toContain("留存钩子");
    expect(row.textContent).toContain("复盘发现前 3 秒流失占大头");

    fireEvent.click(
      row.querySelector('[data-slot="calibration-suggestion-adopt"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(mockClient.adoptRuleSuggestion).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.adoptRuleSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ params: { suggestionId: "sugg-1" } }),
    );
    // pending-only 读侧重拉 → 行(整卡)消失。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="calibration-suggestion-row"]'),
      ).toBeNull(),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("驳回 → dismiss op(不动 rubric)", async () => {
    mockClient.listRuleSuggestions
      .mockResolvedValueOnce([SUGGESTION])
      .mockResolvedValueOnce([]);
    const { container } = render(<CalibrationSuggestionsCard />);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="calibration-suggestion-dismiss"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(
      container.querySelector(
        '[data-slot="calibration-suggestion-dismiss"]',
      ) as HTMLElement,
    );
    await waitFor(() =>
      expect(mockClient.dismissRuleSuggestion).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.adoptRuleSuggestion).not.toHaveBeenCalled();
  });

  it("0 条 pending → 整卡不渲(不摆空卡)", async () => {
    mockClient.listRuleSuggestions.mockResolvedValue([]);
    const { container } = render(<CalibrationSuggestionsCard />);
    await waitFor(() =>
      expect(mockClient.listRuleSuggestions).toHaveBeenCalledTimes(1),
    );
    expect(
      container.querySelector('[data-slot="calibration-suggestions-card"]'),
    ).toBeNull();
  });
});
