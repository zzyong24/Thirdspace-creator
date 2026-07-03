import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-077b] 对话填策划候选卡:brief.fill 工具产 { suggestion, current } → 字段对照表
// (现值(空显「未填」)→ 建议值)→ 人点「写入选题卡」→ patchProject(briefDetail 以现状
// 为底 merge 建议)。铁律②:渲染即候选,不点不落库;失败显式报错可重试。

const patchProject = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchProject: (...a: unknown[]) => patchProject(...a),
  },
}));

import { ChatBriefCard } from "./chat-brief-card";

const SUGGESTION = {
  targetAudience: "AI 新手",
  contentGoal: "涨粉",
};

// 现状:已有目标观众 + 已选平台/画幅(merge 时不能被抹掉)。
const CURRENT = {
  targetAudience: "一线开发者",
  orientation: "portrait" as const,
  targetPlatforms: ["douyin"],
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  patchProject.mockResolvedValue({ id: "proj-1" });
});

describe("ChatBriefCard", () => {
  it("渲染字段对照:字段名 + 现值(有值原样/空显「未填」)+ 建议值(渲染不落库)", () => {
    render(
      <ChatBriefCard
        suggestion={SUGGESTION}
        current={CURRENT}
        projectId="proj-1"
      />,
    );
    // 字段名(只渲有建议值的字段)。
    expect(screen.getByText("目标观众")).toBeTruthy();
    expect(screen.getByText("内容目标")).toBeTruthy();
    expect(screen.queryByText("核心信息")).toBeNull(); // 没建议 → 不进对照表
    // 现值:targetAudience 有现值原样显;contentGoal 空 → 「未填」。
    expect(screen.getByText("一线开发者")).toBeTruthy();
    expect(screen.getByText("未填")).toBeTruthy();
    // 建议值。
    expect(screen.getByText("AI 新手")).toBeTruthy();
    expect(screen.getByText("涨粉")).toBeTruthy();
    expect(screen.getByText("写入选题卡")).toBeTruthy();
    // 铁律②:只渲染绝不自动写库。
    expect(patchProject).not.toHaveBeenCalled();
  });

  it("点「写入选题卡」→ patchProject(briefDetail 以现状为底 merge 建议,不丢 orientation/平台)→ 显「已写入 · 去稿面看」", async () => {
    const user = userEvent.setup();
    render(
      <ChatBriefCard
        suggestion={SUGGESTION}
        current={CURRENT}
        projectId="proj-1"
      />,
    );

    await user.click(screen.getByText("写入选题卡"));

    await waitFor(() => {
      expect(patchProject).toHaveBeenCalledTimes(1);
    });
    // 合并:现状(orientation/targetPlatforms/旧观众)为底,建议字段覆盖 —— 契约 patch
    // 是 brief_detail 整体替换,必须带全现状。
    expect(patchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { projectId: "proj-1" },
        body: {
          briefDetail: {
            targetAudience: "AI 新手", // 建议覆盖现值
            contentGoal: "涨粉", // 建议补空
            orientation: "portrait", // 现状保留
            targetPlatforms: ["douyin"], // 现状保留
          },
        },
      }),
    );
    expect(await screen.findByText(/已写入选题卡/)).toBeTruthy();
    const link = screen.getByText("去稿面看") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/projects/proj-1/script");
    expect(routerRefresh).toHaveBeenCalled();
    // 写过后按钮退场(不给二次落库入口)。
    expect(screen.queryByText("写入选题卡")).toBeNull();
  });

  it("current=null(刚立项没现状)→ 现值全「未填」;写入时以空底 merge(targetPlatforms 兜 [])", async () => {
    const user = userEvent.setup();
    render(
      <ChatBriefCard suggestion={SUGGESTION} current={null} projectId="proj-1" />,
    );
    expect(screen.getAllByText("未填")).toHaveLength(2);

    await user.click(screen.getByText("写入选题卡"));

    await waitFor(() => expect(patchProject).toHaveBeenCalledTimes(1));
    expect(patchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          briefDetail: {
            targetAudience: "AI 新手",
            contentGoal: "涨粉",
            targetPlatforms: [],
          },
        },
      }),
    );
  });

  it("patchProject 失败 → 显式错误文本 + 「重试」(不静默);重试成功转入已写状态", async () => {
    patchProject.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(
      <ChatBriefCard
        suggestion={SUGGESTION}
        current={CURRENT}
        projectId="proj-1"
      />,
    );

    await user.click(screen.getByText("写入选题卡"));

    expect(await screen.findByText(/写入失败:network down/)).toBeTruthy();
    expect(screen.getByText("重试")).toBeTruthy();

    await user.click(screen.getByText("重试"));
    expect(await screen.findByText(/已写入选题卡/)).toBeTruthy();
    expect(patchProject).toHaveBeenCalledTimes(2);
  });

  it("空建议(null / 全空字段)→ 诚实空态(不摆假对照表)", () => {
    render(<ChatBriefCard suggestion={null} current={null} projectId="proj-1" />);
    expect(screen.getByText(/没听出可填的选题卡字段/)).toBeTruthy();

    cleanup();
    render(
      <ChatBriefCard
        suggestion={{ targetAudience: "  " }}
        current={null}
        projectId="proj-1"
      />,
    );
    expect(screen.getByText(/没听出可填的选题卡字段/)).toBeTruthy();
  });

  it("无 projectId(全局对话没绑项目)→ 诚实说明,不摆写不进去的按钮", () => {
    render(
      <ChatBriefCard suggestion={SUGGESTION} current={null} projectId={null} />,
    );
    expect(screen.getByText(/没有找到要写入的项目/)).toBeTruthy();
    expect(screen.queryByText("写入选题卡")).toBeNull();
  });
});
