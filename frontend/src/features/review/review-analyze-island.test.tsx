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

import { ReviewAnalyzeIsland } from "./review-analyze-island";

afterEach(() => {
  cleanup();
  openChat.mockClear();
});

describe("ReviewAnalyzeIsland", () => {
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

    fireEvent.click(button);
    expect(openChat).toHaveBeenCalledWith({
      functionKey: "review.analyze",
      prefill: "帮我复盘,提炼可复用的爆款要素沉淀成经验。",
      autoSend: false,
      selection: {
        kind: "project",
        id: "project-1",
        title: "我的项目",
      },
    });
  });
});
