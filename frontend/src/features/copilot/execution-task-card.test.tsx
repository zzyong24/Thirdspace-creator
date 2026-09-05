import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-255a] 执行结果确认卡单测:待确认渲产物清单;采纳走 execution.tasks.confirm;
// 丢弃走 discard;重试带修改意见重建任务(retryFeedback/retryOf 进 params);失败诚实渲错。

const getExecutionTask = vi.fn();
const confirmExecutionTask = vi.fn();
const discardExecutionTask = vi.fn();
const createExecutionTask = vi.fn();
const listTaskSteps = vi.fn();
const commandExecutionTasks = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getExecutionTask: (...a: unknown[]) => getExecutionTask(...a),
    commandExecutionTasks: (...a: unknown[]) => commandExecutionTasks(...a),
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
      meta: {},
    },
    adoptedAssetIds: [],
    errorMessage: null,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  getExecutionTask.mockResolvedValue(makeTask());
  listTaskSteps.mockResolvedValue([]);
});

describe("ExecutionTaskCard", () => {
  it("运行中任务原地进入待确认，无需切换页面", async () => {
    vi.useFakeTimers();
    const onTaskUpdate = vi.fn();
    getExecutionTask
      .mockResolvedValueOnce(makeTask({ status: "running", manifest: null }))
      .mockResolvedValueOnce(makeTask());

    render(
      <ExecutionTaskCard taskId="task-1" onTaskUpdate={onTaskUpdate} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(getExecutionTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("采纳进素材库")).toBeInTheDocument();
    expect(onTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "task-1", status: "awaiting_confirmation" }),
    );
    vi.useRealTimers();
  });

  it("外层切换到新任务后同步跟踪新 taskId", async () => {
    const { rerender } = render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(getExecutionTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "task-1" } }),
      ),
    );

    rerender(<ExecutionTaskCard taskId="task-2" />);

    await waitFor(() =>
      expect(getExecutionTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "task-2" } }),
      ),
    );
  });

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
    const preview = document.querySelector('[data-slot="execution-task-video-preview"]');
    expect(preview).toHaveAttribute(
      "src",
      "/api/v1/local/execution-preview/task-1/clip.mp4",
    );
    expect(screen.getByText(/先预览，再决定是否采纳/)).toBeInTheDocument();
  });

  it("采纳 → confirmExecutionTask → 已采纳态", async () => {
    const onTaskUpdate = vi.fn();
    confirmExecutionTask.mockResolvedValue(
      makeTask({ status: "succeeded", adoptedAssetIds: ["a1", "a2"] }),
    );
    render(
      <ExecutionTaskCard
        taskId="task-1"
        onTaskUpdate={onTaskUpdate}
      />,
    );
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
      screen.getByText(/已把 2 个成果收进素材库/),
    ).toBeInTheDocument();
    expect(onTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-1",
        status: "succeeded",
        adoptedAssetIds: ["a1", "a2"],
      }),
    );
  });

  it("成片配置视觉模型后展示抽帧审核结论和具体问题", async () => {
    getExecutionTask.mockResolvedValue(
      makeTask({
        execType: "video.render",
        manifest: {
          ...makeTask().manifest,
          meta: {
            visualReview: {
              status: "reviewed",
              verdict: "warn",
              summary: "主画面压住人物，界面文字偏小。",
              issues: [
                { code: "face_occlusion", severity: "error", message: "人物只露半张脸。" },
              ],
            },
          },
        },
      }),
    );
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText("视觉审核发现可优化项")).toBeInTheDocument(),
    );
    expect(screen.getByText("主画面压住人物，界面文字偏小。")).toBeInTheDocument();
    expect(screen.getByText("人物只露半张脸。")).toBeInTheDocument();
  });

  it("丢弃 → discardExecutionTask → 已丢弃态", async () => {
    discardExecutionTask.mockResolvedValue(makeTask({ status: "cancelled" }));
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() => expect(screen.getByText("丢弃")).toBeInTheDocument());
    await userEvent.click(screen.getByText("丢弃"));
    await waitFor(() =>
      expect(screen.getByText(/任务已取消/)).toBeInTheDocument(),
    );
  });

  it("重试:带修改意见重建任务(retryFeedback + retryOf 进 params)", async () => {
    const onTaskIdChange = vi.fn();
    createExecutionTask.mockResolvedValue(
      makeTask({ id: "task-2", status: "queued", manifest: null }),
    );
    render(
      <ExecutionTaskCard
        taskId="task-1"
        projectId="project-1"
        onTaskIdChange={onTaskIdChange}
      />,
    );
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
    expect(body.body).toMatchObject({ projectId: "project-1" });
    expect(onTaskIdChange).toHaveBeenCalledWith("task-2");
  });

  it("失败态渲人话提示(不泄露原始 errorMessage)", async () => {
    getExecutionTask.mockResolvedValue(
      makeTask({ status: "failed", manifest: null, errorMessage: "执行超时(>600s),已中止" }),
    );
    render(<ExecutionTaskCard taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText(/这一步没跑成/)).toBeInTheDocument(),
    );
    // 原始技术错误(errorMessage)绝不甩用户脸上。
    expect(screen.queryByText(/执行超时/)).not.toBeInTheDocument();
  });
});

describe("formatSize", () => {
  it("B/KB/MB 分档", () => {
    expect(formatSize(12)).toBe("12 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("自主业务建议确认卡", () => {
  const note = "完整知识内容。".repeat(2000) + "正文末尾也必须可审阅";
  const proposals = [
    {schemaVersion:1,kind:"knowledge.create",proposalId:"knowledge-1",source:{taskId:"task-1",toolCallId:"call-1",evidenceRefs:["https://example.com/source","evidence:page-1"]},target:{knowledgeId:"knowledge-1",expectedVersion:null},content:{title:"知识标题",note,sourceNote:"来源说明全文\n第二行来源说明"}},
    {schemaVersion:1,kind:"asset.tags",proposalId:"tags-1",source:{taskId:"task-1",toolCallId:"call-2",evidenceRefs:["asset:asset-a"]},targets:[{assetId:"asset-a",expectedVersion:"version-a"},{assetId:"asset-b",expectedVersion:"version-b"}],tag:"旅行记录"},
  ];
  const manifest = {taskType:"agentic.research",artifacts:[],summary:"生成了业务建议",proposals};
  it("展示完整知识和真实素材ID，无文件仍通过原接口采纳", async () => {
    getExecutionTask.mockResolvedValue(makeTask({manifest}));
    confirmExecutionTask.mockResolvedValue(makeTask({status:"succeeded",manifest}));
    render(<ExecutionTaskCard taskId="task-1" />);
    expect(await screen.findByText("知识建议 · 知识标题")).toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getByText(/第二行来源说明/)).toBeInTheDocument();
    expect(screen.getByText("https://example.com/source")).toBeInTheDocument();
    expect(screen.getByText("evidence:page-1")).toBeInTheDocument();
    expect(screen.getByText("素材标签建议 · 旅行记录")).toBeInTheDocument();
    expect(screen.getByText("asset-a")).toBeInTheDocument();
    expect(screen.getByText("asset-b")).toBeInTheDocument();
    expect(screen.getByText(/尚未生效/)).toBeInTheDocument();
    expect(screen.queryByText(/没有产出文件/)).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"采纳建议"})).toBeEnabled();
    await userEvent.click(screen.getByRole("button",{name:"采纳建议"}));
    expect(confirmExecutionTask).toHaveBeenCalledWith({params:{taskId:"task-1"},query:undefined,body:undefined});
    expect(await screen.findByText("✓ 已采纳 2 条建议。")).toBeInTheDocument();
    expect(screen.queryByText(/0 个成果/)).not.toBeInTheDocument();
  });
  it("版本冲突保留建议供审阅并显示真实采纳错误", async () => {
    getExecutionTask.mockResolvedValue(makeTask({manifest}));
    confirmExecutionTask.mockRejectedValue(new Error("素材或标签已变化，请重新生成建议"));
    render(<ExecutionTaskCard taskId="task-1" />);
    await userEvent.click(await screen.findByRole("button",{name:"采纳建议"}));
    expect(await screen.findByText("素材或标签已变化，请重新生成建议")).toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryByText(/已采纳 2 条建议/)).not.toBeInTheDocument();
  });
});


it("预演成功显示未写入与完整计划摘要，不称作已采纳文件",async()=>{
  getExecutionTask.mockResolvedValue(makeTask({status:"succeeded",manifest:{taskType:"agentic.research",artifacts:[],summary:"计划先检索，再建议一条知识。",meta:{dryRun:true,plan:{}}}}));
  render(<ExecutionTaskCard taskId="task-1"/>);
  expect(await screen.findByText("✓ 预演完成，未写入知识或素材标签。")).toBeInTheDocument();
  expect(screen.getByText("计划先检索，再建议一条知识。")).toBeInTheDocument();
  expect(screen.queryByText(/0 个成果/)).not.toBeInTheDocument();
  expect(screen.queryByText(/已采纳/)).not.toBeInTheDocument();
  expect(confirmExecutionTask).not.toHaveBeenCalled();
});


describe("T-915 原执行恢复", () => {
  it.each(["paused", "waiting_user"])("%s 继续原执行，不创建新任务", async runtimeStatus => {
    const task = makeTask({status:"running", executionTaskId:"execution-1", runtimeStatus});
    getExecutionTask.mockResolvedValue(task);
    commandExecutionTasks.mockResolvedValue({tasks:[]});
    const onTaskIdChange = vi.fn();
    render(<ExecutionTaskCard taskId="task-1" onTaskIdChange={onTaskIdChange}/>);
    await userEvent.click(await screen.findByRole("button", {name:"继续任务"}));
    expect(commandExecutionTasks).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({taskIds:["execution-1"],command:"resume",idempotencyKey:expect.any(String)})}));
    expect(createExecutionTask).not.toHaveBeenCalled();
    expect(onTaskIdChange).not.toHaveBeenCalled();
  });
  it.each([false,true])("恢复回执丢失=%s 时仍回读并重新轮询", async lostReceipt => {
    vi.useFakeTimers();
    const task=makeTask({status:"running",executionTaskId:"execution-1",runtimeStatus:"paused"});
    getExecutionTask.mockResolvedValue(task);
    if(lostReceipt) commandExecutionTasks.mockRejectedValueOnce(new Error("响应中断"));
    else commandExecutionTasks.mockResolvedValue({tasks:[]});
    render(<ExecutionTaskCard taskId="task-1"/>);
    await act(async()=>{await Promise.resolve();});
    getExecutionTask.mockResolvedValue(makeTask({status:"running",executionTaskId:"execution-1",runtimeStatus:"running"}));
    await act(async()=>{screen.getByRole("button",{name:"继续任务"}).click();});
    getExecutionTask.mockResolvedValue(makeTask({executionTaskId:"execution-1",runtimeStatus:"succeeded"}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
    expect(screen.getByRole("button",{name:"采纳进素材库"})).toBeInTheDocument();
    expect(createExecutionTask).not.toHaveBeenCalled();
  });
  it("结果未知时不显示重跑或运行中，可结束原任务", async () => {
    getExecutionTask.mockResolvedValue(makeTask({status:"running",executionTaskId:"execution-1",runtimeStatus:"unknown_result"}));
    commandExecutionTasks.mockResolvedValue({tasks:[]});
    const {container}=render(<ExecutionTaskCard taskId="task-1"/>);
    await userEvent.click(await screen.findByRole("button",{name:"结束任务"}));
    expect(screen.queryByRole("button",{name:"重试"})).toBeNull();
    expect(container.querySelector('[data-slot="execution-task-running"]')).toBeNull();
    expect(commandExecutionTasks).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({command:"cancel",taskIds:["execution-1"]})}));
    expect(createExecutionTask).not.toHaveBeenCalled();
  });
  it("映射任务失败通过持久命令重试，不复制参数", async () => {
    getExecutionTask.mockResolvedValue(makeTask({status:"failed",executionTaskId:"execution-1",runtimeStatus:"failed"}));
    commandExecutionTasks.mockResolvedValue({tasks:[]});
    render(<ExecutionTaskCard taskId="task-1"/>);
    await userEvent.click(await screen.findByRole("button",{name:"重试"}));
    expect(commandExecutionTasks).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({command:"retry",taskIds:["execution-1"]})}));
    expect(createExecutionTask).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/修改意见/)).toBeNull();
  });
});
