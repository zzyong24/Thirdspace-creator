import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-062a] 对话内手录经验候选卡:learning.capture 工具产候选 → 人点「存为经验」→
// createLearning(candidate 进裁决队列)。铁律②:渲染即候选,不点不落库;失败显式报错。

const createLearning = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createLearning: (...a: unknown[]) => createLearning(...a),
  },
}));

import { ChatLearningCard } from "./chat-learning-card";

const SUGGESTION = {
  title: "完播率高的都在前 3 秒放结论",
  insight: "观众耐心极短,开头给答案再展开论证,留存明显更好。",
  learningType: "structure" as const,
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  createLearning.mockResolvedValue({ id: "learn-1" });
});

describe("ChatLearningCard", () => {
  it("渲染候选:learningType 中文徽章 + title + insight + 「存为经验」按钮(渲染不落库)", () => {
    render(<ChatLearningCard suggestion={SUGGESTION} />);
    expect(screen.getByText("结构")).toBeTruthy(); // structure → 中文徽章
    expect(screen.getByText(SUGGESTION.title)).toBeTruthy();
    expect(screen.getByText(SUGGESTION.insight)).toBeTruthy();
    expect(screen.getByText("存为经验")).toBeTruthy();
    // 铁律②:只渲染绝不自动写库。
    expect(createLearning).not.toHaveBeenCalled();
  });

  it("点「存为经验」→ createLearning(title+insight+learningType)→ 显「已存入裁决队列」+ /experience 链接", async () => {
    const user = userEvent.setup();
    render(<ChatLearningCard suggestion={SUGGESTION} />);

    await user.click(screen.getByText("存为经验"));

    await waitFor(() => {
      expect(createLearning).toHaveBeenCalledTimes(1);
    });
    expect(createLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: SUGGESTION.title,
          insight: SUGGESTION.insight,
          learningType: "structure",
        },
      }),
    );
    expect(await screen.findByText(/已存入裁决队列/)).toBeTruthy();
    // [T-118c] 经验模块退役,链接改指向 /knowledge(去掉旧 ?tab=experience)。
    const link = screen.getByText(/去知识库查看/) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/knowledge");
    expect(routerRefresh).toHaveBeenCalled();
    // 存过后按钮退场(不给二次落库入口)。
    expect(screen.queryByText("存为经验")).toBeNull();
  });

  it("createLearning 失败 → 显式错误文本 + 「重试」(不静默)", async () => {
    createLearning.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ChatLearningCard suggestion={SUGGESTION} />);

    await user.click(screen.getByText("存为经验"));

    expect(await screen.findByText(/保存失败:network down/)).toBeTruthy();
    expect(screen.getByText("重试")).toBeTruthy();

    // 重试成功 → 转入已存状态。
    await user.click(screen.getByText("重试"));
    expect(await screen.findByText(/已存入裁决队列/)).toBeTruthy();
    expect(createLearning).toHaveBeenCalledTimes(2);
  });

  it("空候选(null / 空标题)→ 诚实空态(不摆假卡)", () => {
    render(<ChatLearningCard suggestion={null} />);
    expect(screen.getByText(/没提炼出可存的经验/)).toBeTruthy();

    cleanup();
    render(
      <ChatLearningCard
        suggestion={{ title: "  ", insight: "", learningType: "hook" }}
      />,
    );
    expect(screen.getByText(/没提炼出可存的经验/)).toBeTruthy();
  });
});
