import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-265] 对话内论点树卡:planning.thesis 工具 dispatch 论点树生成后返回 { taskId }。
// 卡据 taskId 轮询 getTask → awaiting_confirmation 后 listTaskResults 拿候选 nodes 渲论点树 →
// 「采纳进论点骨架」confirmTask(→ thesis_tree append → 稿面面板 router.refresh 读回)。
//   - dispatch 失败态(error 非 null / 无 taskId)→ 卡渲诚实错误,不轮询。
//   - 轮询到 awaiting_confirmation → 渲核心论点 + 支撑/证据/反驳 + 采纳按钮。
//   - 点采纳 → confirmTask + router.refresh(不自动写库,铁律②人点才落)。

const routerRefresh = vi.fn();
const getTask = vi.fn();
const listTaskResults = vi.fn();
const confirmTask = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    getTask: (...a: unknown[]) => getTask(...a),
    listTaskResults: (...a: unknown[]) => listTaskResults(...a),
    confirmTask: (...a: unknown[]) => confirmTask(...a),
  },
}));

import { ChatThesisCard } from "./chat-thesis-card";

const CANDIDATE_NODES = [
  { column: "core", title: "核心论点X", summary: "核心说明" },
  { column: "support", title: "支撑A", summary: "支撑说明" },
  { column: "evidence", title: "证据B", summary: "证据说明" },
  { column: "counter", title: "反驳C", summary: "反驳说明" },
];

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  getTask.mockResolvedValue({ status: "awaiting_confirmation" });
  // planning-runner recordCandidate 的 resultData 形状:{ body, summary, nodes, contentData:{nodes} }。
  listTaskResults.mockResolvedValue([
    {
      resultData: {
        body: "# 论点树",
        summary: "AI 论点树草稿",
        nodes: CANDIDATE_NODES,
        contentData: { nodes: CANDIDATE_NODES },
      },
    },
  ]);
  confirmTask.mockResolvedValue({ id: "task-thesis-1", status: "succeeded" });
});

describe("ChatThesisCard(对话内论点树卡,T-265)", () => {
  it("dispatch 失败(error 非 null)→ 诚实错误态,不轮询", () => {
    render(
      <ChatThesisCard
        taskId={null}
        error="论点树要挂进具体项目的稿面「论点骨架」面板 —— 请在项目稿面右栏立论点。"
        pollIntervalMs={0}
      />,
    );
    expect(
      document.querySelector('[data-slot="chat-thesis-error"]')?.textContent,
    ).toContain("论点骨架");
    expect(getTask).not.toHaveBeenCalled();
  });

  it("轮询 awaiting_confirmation → 渲核心论点 + 支撑/证据/反驳候选", async () => {
    render(
      <ChatThesisCard taskId="task-thesis-1" error={null} pollIntervalMs={0} />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-thesis-review"]'),
      ).toBeTruthy();
    });
    const review = document.querySelector('[data-slot="chat-thesis-review"]')!;
    expect(review.textContent).toContain("核心论点X");
    expect(review.textContent).toContain("支撑A");
    expect(review.textContent).toContain("证据B");
    expect(review.textContent).toContain("反驳C");
    // 四列都渲出(core/support/evidence/counter)。
    expect(
      document.querySelectorAll('[data-slot="chat-thesis-column"]').length,
    ).toBe(4);
    // 采纳按钮在场(尚未点)。
    expect(
      document.querySelector('[data-slot="chat-thesis-adopt"]'),
    ).toBeTruthy();
    expect(confirmTask).not.toHaveBeenCalled();
  });

  it("点「采纳进论点骨架」→ confirmTask + router.refresh(不自动写库,人点才落 thesis_tree)", async () => {
    render(
      <ChatThesisCard taskId="task-thesis-1" error={null} pollIntervalMs={0} />,
    );
    const adopt = await screen.findByText("采纳进论点骨架");
    fireEvent.click(adopt);
    await waitFor(() => {
      expect(confirmTask).toHaveBeenCalledWith({
        params: { taskId: "task-thesis-1" },
        query: undefined,
        body: undefined,
      });
    });
    expect(routerRefresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-thesis-done"]'),
      ).toBeTruthy();
    });
  });

  it("任务 cancelled/failed(如未配模型)→ 诚实错误态 +「去设置」", async () => {
    getTask.mockResolvedValue({ status: "failed" });
    render(
      <ChatThesisCard taskId="task-thesis-1" error={null} pollIntervalMs={0} />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-thesis-error"]'),
      ).toBeTruthy();
    });
    expect(
      document.querySelector('[data-slot="chat-thesis-settings-link"]'),
    ).toBeTruthy();
    // 没走到采纳。
    expect(confirmTask).not.toHaveBeenCalled();
  });

  it("awaiting_confirmation 但候选无可解析节点 → 诚实错误态(不渲空树)", async () => {
    listTaskResults.mockResolvedValue([{ resultData: { nodes: [] } }]);
    render(
      <ChatThesisCard taskId="task-thesis-1" error={null} pollIntervalMs={0} />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-thesis-error"]'),
      ).toBeTruthy();
    });
  });
});
