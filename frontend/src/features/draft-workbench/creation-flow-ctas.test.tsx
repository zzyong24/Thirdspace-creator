import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreationFlowCtas } from "./creation-flow-ctas";

// T-127:稿面创作流引导 CTA。锁「搜素材/立论点」两钮 → openChat 用对的 functionKey(半自动一键触发)。
const openChat = vi.fn();
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat }),
}));

describe("CreationFlowCtas(T-127 创作流引导 CTA)", () => {
  beforeEach(() => openChat.mockClear());

  it("渲两钮:搜素材(联网)+ 立论点", () => {
    render(<CreationFlowCtas />);
    expect(screen.getByRole("button", { name: /搜素材/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /立论点/ })).toBeInTheDocument();
  });

  it("点「搜素材」→ openChat functionKey=research.gather_material + autoSend", () => {
    render(<CreationFlowCtas />);
    fireEvent.click(screen.getByRole("button", { name: /搜素材/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "research.gather_material",
      autoSend: true,
    });
  });

  it("点「立论点」→ openChat functionKey=planning.thesis + autoSend", () => {
    render(<CreationFlowCtas />);
    fireEvent.click(screen.getByRole("button", { name: /立论点/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "planning.thesis",
      autoSend: true,
    });
  });
});
