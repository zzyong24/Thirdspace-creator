import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openChat = vi.fn();
vi.mock("@/features/draft-workbench/draft-chat-request", () => ({
  useDraftChatRequest: () => ({
    request: null,
    openChat,
    registerFlush: vi.fn(),
    flushSave: vi.fn(),
  }),
}));

import { ReviewAnalyzeIsland, REVIEW_ANALYZE_PREFILL } from "./review-analyze-island";

afterEach(() => {
  cleanup();
  openChat.mockClear();
});

describe("ReviewAnalyzeIsland", () => {
  it('明确平台与窗口附给既有复盘请求，不悄悄改用全组',()=>{
    render(<ReviewAnalyzeIsland projectId="p1" analysisScope="公众号，2026-09-28—2026-10-04；publicationId: wx1"/>);
    fireEvent.click(screen.getByRole('button',{name:'帮我复盘'}));
    expect(openChat.mock.calls[0][0].prefill).toContain('publicationId: wx1');
    expect(openChat.mock.calls[0][0].prefill).toContain('不合并不同平台的比例');
    expect(openChat.mock.calls[0][0].selection.id).toBe('p1');
  });
  it("[T-623] prepares review.analyze in the existing rail without opening a second Copilot", () => {
    const { container } = render(
      <ReviewAnalyzeIsland
        projectId="project-1"
        projectTitle="我的项目"
      />,
    );
    const button = screen.getByRole("button", { name: "帮我复盘" });
    expect(button).toBeInTheDocument();
    expect(container.querySelector('a[href*="copilot=open"]')).toBeNull();

    expect(REVIEW_ANALYZE_PREFILL).toContain("没有表现数据时只诊断内容，不作效果归因");
    expect(REVIEW_ANALYZE_PREFILL).toContain("没有足够依据可以没有经验候选");
    fireEvent.click(button);
    expect(openChat).toHaveBeenCalledWith({
      functionKey: "review.analyze",
      prefill: REVIEW_ANALYZE_PREFILL,
      autoSend: true,
      selection: {
        kind: "project",
        id: "project-1",
        title: "我的项目",
      },
    });
  });
});
