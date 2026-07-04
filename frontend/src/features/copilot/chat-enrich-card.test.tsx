import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-117] topic.enrich 富选题卡对话内单测 —— 渲染完整卡 + 采纳走 candidates.patch(card 嵌套)。
// 铁律②:AI 只产候选,人点「采纳」才 patch;无 candidateId 诚实禁用不假装。

const patchCandidate = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: { patchCandidate: (...a: unknown[]) => patchCandidate(...a) },
}));

import { ChatEnrichCard, type ChatEnrichCardData } from "./chat-enrich-card";

afterEach(() => cleanup());
beforeEach(() => {
  patchCandidate.mockReset();
  patchCandidate.mockResolvedValue({ id: "cand-1" });
  routerRefresh.mockReset();
});

const CARD: ChatEnrichCardData = {
  oneLiner: "三款AI里只有一款适合90%普通人",
  targetAudience: "非技术从业者",
  audiencePain: "订阅费堆了几百块用不出价值",
  coreConflict: "选型无维度",
  hook: "先看选型表再决定装不装",
  contentStructure: ["结论钩子", "选型矩阵", "录屏对比"],
  format: "3分钟横屏",
  materialBasis: "真实踩坑录屏",
  riskNote: "同质化严重",
  proposal: "立项;先发完整版再拆切片",
  audiencePainScore: 82,
  materialScore: 70,
  productionDifficulty: "mid",
};

describe("ChatEnrichCard", () => {
  it("card 为 null → 不渲染", () => {
    const { container } = render(
      <ChatEnrichCard card={null} candidateId="cand-1" />,
    );
    expect(
      container.querySelector('[data-slot="chat-enrich-card"]'),
    ).toBeNull();
  });

  it("渲染完整选题卡(一句话/观众/痛点/结构/评分)", () => {
    render(<ChatEnrichCard card={CARD} candidateId="cand-1" />);
    expect(screen.getByText("三款AI里只有一款适合90%普通人")).not.toBeNull();
    expect(screen.getByText("非技术从业者")).not.toBeNull();
    expect(screen.getByText("订阅费堆了几百块用不出价值")).not.toBeNull();
    expect(screen.getByText("1. 结论钩子")).not.toBeNull();
    expect(screen.getByText("受众痛感 82")).not.toBeNull();
    expect(screen.getByText("制作难度 中")).not.toBeNull();
  });

  it("采纳 → candidates.patch(card 嵌套) 到被补全的候选,并 router.refresh", async () => {
    const user = userEvent.setup();
    render(<ChatEnrichCard card={CARD} candidateId="cand-42" />);
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(patchCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { candidateId: "cand-42" },
          body: {
            card: expect.objectContaining({
              oneLiner: "三款AI里只有一款适合90%普通人",
              targetAudience: "非技术从业者",
              contentStructure: ["结论钩子", "选型矩阵", "录屏对比"],
              audiencePainScore: 82,
              productionDifficulty: "mid",
            }),
          },
        }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
    expect(screen.getByText("✓ 已补全进候选池")).not.toBeNull();
  });

  it("无 candidateId → 诚实禁用(无采纳按钮,提示先选一条选题)", () => {
    render(<ChatEnrichCard card={CARD} candidateId={null} />);
    expect(screen.queryByText("采纳")).toBeNull();
    expect(
      screen.getByText(/先在候选池选中一条选题/),
    ).not.toBeNull();
  });
});
