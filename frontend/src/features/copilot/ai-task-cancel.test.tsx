import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-248B①] AI 任务「取消」按钮单测:
//   ① 终态任务(succeeded/failed/cancelled)不渲染入口 —— 没有可取消的东西,不摆假按钮。
//   ② 未终态 → 点「取消」弹 Dialog 确认门(全站禁原生 window.confirm)→ 确认 →
//     client.cancelTask({params:{taskId}}) → onCancelled 回调(调用侧刷新 feed)。
//   ③ 点「先不取消」→ 不调 op、不回调。
//   ④ op 失败 → 弹窗内诚实渲错,不假装已取消、不回调。

const cancelTask = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    cancelTask: (...a: unknown[]) => cancelTask(...a),
  },
}));

import { TaskCancelButton, isCancellableStatus } from "./ai-task-cancel";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  cancelTask.mockResolvedValue({ id: "task-1", status: "cancelled" });
});

describe("isCancellableStatus", () => {
  it("未终态可取消,终态不可取消", () => {
    expect(isCancellableStatus("queued")).toBe(true);
    expect(isCancellableStatus("running")).toBe(true);
    expect(isCancellableStatus("awaiting_confirmation")).toBe(true);
    expect(isCancellableStatus("succeeded")).toBe(false);
    expect(isCancellableStatus("failed")).toBe(false);
    expect(isCancellableStatus("cancelled")).toBe(false);
  });
});

describe("TaskCancelButton", () => {
  it("终态任务不渲染取消入口", () => {
    render(<TaskCancelButton taskId="task-1" status="succeeded" />);
    expect(screen.queryByText("取消")).not.toBeInTheDocument();
  });

  it("排队中任务:取消 → Dialog 确认 → cancelTask + onCancelled", async () => {
    const onCancelled = vi.fn();
    render(
      <TaskCancelButton
        taskId="task-1"
        status="queued"
        onCancelled={onCancelled}
      />,
    );
    await userEvent.click(screen.getByText("取消"));
    // Dialog 确认门出现(不是原生 confirm)
    expect(
      screen.getByText("取消这个 AI 任务?"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("确认取消"));
    await waitFor(() =>
      expect(cancelTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "task-1" } }),
      ),
    );
    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    // 成功后弹窗关闭
    await waitFor(() =>
      expect(screen.queryByText("确认取消")).not.toBeInTheDocument(),
    );
  });

  it("点「先不取消」→ 不调 op、不回调", async () => {
    const onCancelled = vi.fn();
    render(
      <TaskCancelButton
        taskId="task-1"
        status="running"
        onCancelled={onCancelled}
      />,
    );
    await userEvent.click(screen.getByText("取消"));
    await userEvent.click(screen.getByText("先不取消"));
    expect(cancelTask).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("确认取消")).not.toBeInTheDocument(),
    );
  });

  it("op 失败 → 弹窗内渲错误、不回调、弹窗不关", async () => {
    cancelTask.mockRejectedValueOnce(new Error("boom"));
    const onCancelled = vi.fn();
    render(
      <TaskCancelButton
        taskId="task-1"
        status="awaiting_confirmation"
        onCancelled={onCancelled}
      />,
    );
    await userEvent.click(screen.getByText("取消"));
    await userEvent.click(screen.getByText("确认取消"));
    await waitFor(() =>
      expect(
        screen.getByText("取消失败，任务可能已结束，请刷新后重试。"),
      ).toBeInTheDocument(),
    );
    expect(onCancelled).not.toHaveBeenCalled();
    // 弹窗仍开着(还能重试/关闭)
    expect(screen.getByText("确认取消")).toBeInTheDocument();
  });
});
