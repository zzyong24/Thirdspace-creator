import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-117] topic.enrich 富选题卡对话内单测 —— 渲染完整卡 + 采纳落库。
// [T-266] 采纳两条路:有 candidateId → candidates.patch 就地补全;无 candidateId → candidates.create
// 新建 + patch 回填富卡(不再死胡同禁用)。铁律②:AI 只产候选,人点「采纳」才落库。

const patchCandidate = vi.fn();
const createCandidate = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchCandidate: (...a: unknown[]) => patchCandidate(...a),
    createCandidate: (...a: unknown[]) => createCandidate(...a),
  },
}));

import { ChatEnrichCard, type ChatEnrichCardData } from "./chat-enrich-card";

afterEach(() => cleanup());
beforeEach(() => {
  patchCandidate.mockReset();
  patchCandidate.mockResolvedValue({ id: "cand-1" });
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-new-9" });
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

  it("[T-266] 无 candidateId → 采纳=createCandidate 新建 + patch 回填富卡(不再死胡同禁用),并 refresh", async () => {
    const user = userEvent.setup();
    render(<ChatEnrichCard card={CARD} candidateId={null} />);
    // 不再有「先去候选池选中」的死胡同文案;按钮明示「采纳(新建候选)」。
    expect(screen.queryByText(/先在候选池选中一条选题/)).toBeNull();
    const btn = screen.getByText("采纳(新建候选)");
    await user.click(btn);
    // ① createCandidate 新建(title 取一句话选题,source=idea)。
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: "三款AI里只有一款适合90%普通人",
            source: "idea",
          }),
        }),
      );
    });
    // ② 再把富卡字段 patch 到新建的候选(createCandidate 契约不收 card,故两步)。
    await waitFor(() => {
      expect(patchCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { candidateId: "cand-new-9" },
          body: {
            card: expect.objectContaining({
              targetAudience: "非技术从业者",
              contentStructure: ["结论钩子", "选型矩阵", "录屏对比"],
            }),
          },
        }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
    expect(screen.getByText("✓ 已新建进候选池")).not.toBeNull();
  });

  it("[T-266] 有 candidateId 时不走 createCandidate(仍就地 patch)", async () => {
    const user = userEvent.setup();
    render(<ChatEnrichCard card={CARD} candidateId="cand-42" />);
    await user.click(screen.getByText("采纳"));
    await waitFor(() => expect(patchCandidate).toHaveBeenCalledTimes(1));
    expect(createCandidate).not.toHaveBeenCalled();
  });
});
