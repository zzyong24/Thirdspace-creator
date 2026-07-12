import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-255a] 执行结果确认卡单测:待确认渲产物清单;采纳走 execution.tasks.confirm;
// 丢弃走 discard;重试带修改意见重建任务(retryFeedback/retryOf 进 params);失败诚实渲错。

const getExecutionTask = vi.fn();
const confirmExecutionTask = vi.fn();
const discardExecutionTask = vi.fn();
const createExecutionTask = vi.fn();
const listTaskSteps = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getExecutionTask: (...a: unknown[]) => getExecutionTask(...a),
    confirmExecutionTask: (...a: unknown[]) => confirmExecutionTask(...a),
    discardExecutionTask: (...a: unknown[]) => discardExecutionTask(...a),
    createExecutionTask: (...a: unknown[]) => createExecutionTask(...a),
    listTaskSteps: (...a: unknown[]) => listTaskSteps(...a),
  },
}));

import { ExecutionTaskCard, formatSize } from "./execution-task-card";

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    status: "awaiting_confirmation",
    execType: "echo.manifest",
    spec: {
      taskType: "echo.manifest",
      goal: "框架自检",
      inputs: [],
      params: {},
      constraints: { timeoutSec: 600, network: "deny", maxOutputMB: 512 },
    },
    manifest: {
      taskType: "echo.manifest",
      artifacts: [
        {
          path: "manifest.json",
          fileName: "manifest.json",
          size: 2048,
          mimeType: "application/json",
        },
        {
          path: "clip.mp4",
          fileName: "clip.mp4",
          size: 3 * 1024 * 1024,
          mimeType: "video/mp4",
        },
      ],
      summary: "已回显 0 项输入清单",
    },
    adoptedAssetIds: [],
    errorMessage: null,
    ...over,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  getExecutionTask.mockResolvedValue(makeTask());
  listTaskSteps.mockResolvedValue([]);
});

describe("ExecutionTaskCard", () => {
  it("待确认:渲产物清单(文件名/大小/类型)+ 三动作", async () => {
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText("manifest.json")).toBeInTheDocument(),
    );
    expect(screen.getByText("框架自检")).toBeInTheDocument();
    expect(screen.getByText("JSON · 2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("视频 · 3.0 MB")).toBeInTheDocument();
    expect(screen.getByText("采纳进素材库")).toBeInTheDocument();
    expect(screen.getByText("重试")).toBeInTheDocument();
    expect(screen.getByText("丢弃")).toBeInTheDocument();
  });

  it("采纳 → confirmExecutionTask → 已采纳态", async () => {
    confirmExecutionTask.mockResolvedValue(
      makeTask({ status: "succeeded", adoptedAssetIds: ["a1", "a2"] }),
    );
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText("采纳进素材库")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("采纳进素材库"));
    await waitFor(() =>
      expect(confirmExecutionTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "task-1" } }),
      ),
    );
    expect(
      screen.getByText(/已采纳 2 个产物进素材库/),
    ).toBeInTheDocument();
  });

  it("丢弃 → discardExecutionTask → 已丢弃态", async () => {
    discardExecutionTask.mockResolvedValue(makeTask({ status: "cancelled" }));
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() => expect(screen.getByText("丢弃")).toBeInTheDocument());
    await userEvent.click(screen.getByText("丢弃"));
    await waitFor(() =>
      expect(screen.getByText(/任务已丢弃/)).toBeInTheDocument(),
    );
  });

  it("重试:带修改意见重建任务(retryFeedback + retryOf 进 params)", async () => {
    createExecutionTask.mockResolvedValue(
      makeTask({ id: "task-2", status: "queued", manifest: null }),
    );
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() => expect(screen.getByText("重试")).toBeInTheDocument());
    await userEvent.click(screen.getByText("重试"));
    await userEvent.type(
      screen.getByPlaceholderText(/修改意见/),
      "字幕太小",
    );
    await userEvent.click(screen.getByText("按意见重跑"));
    await waitFor(() => expect(createExecutionTask).toHaveBeenCalled());
    const body = createExecutionTask.mock.calls[0]![0] as {
      body: { spec: { params: Record<string, unknown> } };
    };
    expect(body.body.spec.params.retryFeedback).toBe("字幕太小");
    expect(body.body.spec.params.retryOf).toBe("task-1");
  });

  it("失败态诚实渲 errorMessage", async () => {
    getExecutionTask.mockResolvedValue(
      makeTask({ status: "failed", manifest: null, errorMessage: "执行超时(>600s),已中止" }),
    );
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText(/执行失败:执行超时/)).toBeInTheDocument(),
    );
  });
});

describe("formatSize", () => {
  it("B/KB/MB 分档", () => {
    expect(formatSize(12)).toBe("12 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
