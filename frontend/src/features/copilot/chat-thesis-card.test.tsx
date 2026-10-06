import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-730] 对话内可选论点骨架卡:planning.thesis 工具 dispatch 后返回 { taskId }。
// 卡据 taskId 轮询 getTask → awaiting_confirmation 后 listTaskResults 拿候选 nodes 渲论点树 →
// 「采纳并用于写稿」confirmTask(→ thesis_tree append → 稿面面板 router.refresh 读回)。
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

describe("ChatThesisCard(可选论点骨架,T-730)", () => {
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

  it("点「采纳并用于写稿」→ confirmTask + router.refresh(不自动写库,人点才落 thesis_tree)", async () => {
    render(
      <ChatThesisCard taskId="task-thesis-1" error={null} pollIntervalMs={0} />,
    );
    const adopt = await screen.findByText("采纳并用于写稿");
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

  it("任务 cancelled/failed → 诚实提示当前托管 MiniMax 可重试，不伪造独立设置入口", async () => {
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
      document.querySelector('[data-slot="chat-thesis-error"]')?.textContent,
    ).toContain("MiniMax");
    expect(
      document.querySelector('[data-slot="chat-thesis-settings-link"]'),
    ).toBeNull();
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

it("T-1066 观察到期保留原任务，继续查询可读取慢完成结果", async () => {
  vi.useFakeTimers();
  try {
    getTask.mockResolvedValue({ status: "running" });
    const { act } = await import("@testing-library/react");
    render(<ChatThesisCard taskId="task-slow-original" error={null} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(360_000); });
    expect(document.querySelector('[data-slot="chat-thesis-error"]')).toBeNull();
    expect(screen.getByRole("button", { name: "继续查询原任务" })).toBeTruthy();
    getTask.mockResolvedValue({ status: "awaiting_confirmation" });
    fireEvent.click(screen.getByRole("button", { name: "继续查询原任务" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(document.querySelector('[data-slot="chat-thesis-review"]')).toBeTruthy();
    expect(getTask.mock.calls.every(call => call[0].params.taskId === "task-slow-original")).toBe(true);
  } finally { vi.useRealTimers(); }
});

it("T-1066 在途读取不叠加，卸载后迟到结果不再读取候选", async () => {
  vi.useFakeTimers();
  try {
    const { act } = await import("@testing-library/react");
    let resolve!: (value: unknown) => void;
    getTask.mockReturnValue(new Promise(r => { resolve = r; }));
    const { unmount } = render(<ChatThesisCard taskId="task-inflight" error={null} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    expect(getTask).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { resolve({ status: "awaiting_confirmation" }); await vi.advanceTimersByTimeAsync(4_000); });
    expect(listTaskResults).not.toHaveBeenCalled();
    expect(getTask).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
