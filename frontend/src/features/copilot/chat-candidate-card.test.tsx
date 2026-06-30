import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 对话内 generative UI 单测(SPEC §3.4)—— AI 工具结果(候选)渲卡 + 逐条采纳走 confirm 门
// (candidates.create);AI 不直接写实体(铁律②)。

const createCandidate = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: { createCandidate: (...a: unknown[]) => createCandidate(...a) },
}));

import { ChatCandidateCard } from "./chat-candidate-card";

afterEach(() => cleanup());
beforeEach(() => {
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-1" });
  routerRefresh.mockReset();
});

const CANDIDATES = [
  {
    title: "反直觉开头对你有效",
    angle: "用数据打破直觉",
    contentRole: "traffic",
    predictedScore: 82,
    reason: "评论反复问",
  },
  {
    title: "第二条",
    angle: "",
    contentRole: "unknown-role",
    predictedScore: null,
    reason: "",
  },
];

describe("ChatCandidateCard", () => {
  it("空候选 → 不渲染", () => {
    const { container } = render(<ChatCandidateCard candidates={[]} />);
    expect(
      container.querySelector('[data-slot="chat-candidate-card"]'),
    ).toBeNull();
  });

  it("渲染每条候选(标题/切入/理由/潜力)", () => {
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    expect(screen.getByText("反直觉开头对你有效")).not.toBeNull();
    expect(screen.getByText("切入：用数据打破直觉")).not.toBeNull();
    expect(screen.getByText("评论反复问")).not.toBeNull();
    expect(screen.getByText("潜力 82")).not.toBeNull();
    expect(screen.getByText("第二条")).not.toBeNull();
  });

  it("采纳一条 → candidates.create(source=idea + 归一化的 contentRole),并 router.refresh", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    const adoptButtons = screen.getAllByText("采纳");
    await user.click(adoptButtons[0]);
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            title: "反直觉开头对你有效",
            angle: "用数据打破直觉",
            source: "idea",
            contentRole: "traffic",
          },
        }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
    // 采纳后该条显示已入池。
    await waitFor(() => {
      expect(screen.getByText("✓ 已入候选池")).not.toBeNull();
    });
  });

  it("未知 contentRole 不透给 create(让 backend 用缺省)", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    const adoptButtons = screen.getAllByText("采纳");
    await user.click(adoptButtons[1]); // 第二条 contentRole=unknown-role
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalled();
    });
    const body = createCandidate.mock.calls[0][0].body;
    expect(body.title).toBe("第二条");
    expect(body).not.toHaveProperty("contentRole");
    expect(body.source).toBe("idea");
  });

  it("create 失败 → 显示采纳失败(诚实,不假成功)", async () => {
    createCandidate.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={[CANDIDATES[0]]} />);
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(screen.getByText("采纳失败，重试")).not.toBeNull();
    });
  });
});
