import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const confirmProductionEditingPlan = vi.fn();
const createExecutionTask = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/contract-client", () => ({
  client: {
    confirmProductionEditingPlan: (...args: unknown[]) =>
      confirmProductionEditingPlan(...args),
    createExecutionTask: (...args: unknown[]) => createExecutionTask(...args),
  },
}));

import { ChatVideoEditCard, type ChatVideoEditCandidate } from "./chat-video-edit-card";

function candidate(over: Partial<ChatVideoEditCandidate> = {}): ChatVideoEditCandidate {
  return {
    projectId: "project-1",
    outputId: "output-1",
    expectedRevision: 4,
    sourceRenderTaskId: "render-old",
    instruction: "第二段换成录屏",
    summary: ["第 2 场改用指定素材"],
    decisions: { scenes: [] },
    renderProps: {
      meta: { title: "测试片", brandLabel: "CreatorOS" },
      talkingHead: { file: "talking.mp4", durationSec: 12 },
      captions: [],
      scenes: [{ id: "s1", label: "正文", title: "第二段", startSec: 0, endSec: 12, role: "body", cards: [] }],
      broll: [{ at: 0, file: "screen.mp4", label: "录屏", big: false }],
    },
    error: null,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  confirmProductionEditingPlan
    .mockResolvedValueOnce({ recordingConfig: { videoEditingPlan: { revision: 5 } } })
    .mockResolvedValueOnce({ recordingConfig: { videoEditingPlan: { revision: 6 } } });
  createExecutionTask.mockResolvedValue({ id: "render-new" });
});

describe("ChatVideoEditCard", () => {
  it("用户确认后才 CAS 保存方案、创建重渲染，再把新任务号关联回方案", async () => {
    render(<ChatVideoEditCard candidate={candidate()} />);
    expect(createExecutionTask).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "确认调整并重渲染" }));

    await waitFor(() => expect(createExecutionTask).toHaveBeenCalledTimes(1));
    expect(confirmProductionEditingPlan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        params: { outputId: "output-1" },
        body: expect.objectContaining({ expectedRevision: 4 }),
      }),
    );
    const executionInput = createExecutionTask.mock.calls[0]![0] as {
      body: {
        projectId: string;
        spec: {
          inputs: Array<{ assetId: string }>;
          constraints: { timeoutSec: number | null };
        };
      };
    };
    expect(executionInput.body.projectId).toBe("project-1");
    expect(executionInput.body.spec.inputs.map((item) => item.assetId).sort()).toEqual([
      "screen.mp4",
      "talking.mp4",
    ]);
    expect(executionInput.body.spec.constraints.timeoutSec).toBeNull();
    expect(confirmProductionEditingPlan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          expectedRevision: 5,
          plan: expect.objectContaining({ sourceRenderTaskId: "render-new" }),
        }),
      }),
    );
    expect(await screen.findByText(/已按意见创建重渲染任务 render-new/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("错误候选只展示原因，不出现可点击假按钮", () => {
    render(<ChatVideoEditCard candidate={candidate({ error: "当前项目还没有已确认的分镜方案" })} />);
    expect(screen.getByText("当前项目还没有已确认的分镜方案")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认调整并重渲染" })).not.toBeInTheDocument();
  });
});
