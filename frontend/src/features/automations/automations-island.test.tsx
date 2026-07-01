import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Automations island wiring test (T-007 D6). Proves the read/管 UI over the D1 contract
// ops: list rows render (name / source / cron / 上次·下次 / 状态映射) + 启用开关 →
// setScheduledJobEnabled + router.refresh; 新建表单组装 → createScheduledJob; 运行详情
// 抽屉 → listJobRunsByJob then the selected run's listTaskSteps; 「立即运行」 renders
// disabled (待 D5). Deterministic — the mock client resolves immediately; NO Date.now /
// Math.random / fetch.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  setScheduledJobEnabled: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createScheduledJob: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  listJobRunsByJob: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  listTaskSteps: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    setScheduledJobEnabled: (i: unknown) => mockClient.setScheduledJobEnabled(i),
    createScheduledJob: (i: unknown) => mockClient.createScheduledJob(i),
    listJobRunsByJob: (i: unknown) => mockClient.listJobRunsByJob(i),
    listTaskSteps: (i: unknown) => mockClient.listTaskSteps(i),
  },
}));

import {
  AutomationsIsland,
  JobRow,
  CreateJobDialog,
  RunDetailDialog,
} from "./automations-island";
import type {
  ScheduledJobResource,
  JobRunResource,
} from "@creatoros/backend/modules/scheduling";

function makeJob(over: Partial<ScheduledJobResource> = {}): ScheduledJobResource {
  return {
    id: "job-1",
    userId: "user-a",
    name: "每天抓我的主页指标",
    prompt: "",
    sourceKind: "self.metrics",
    target: {},
    schedule: "0 9 * * *",
    toolGrants: [],
    recipe: null,
    enabled: true,
    lastRunAt: "2026-06-30T09:00:00.000Z",
    nextRunAt: "2026-07-01T09:00:00.000Z",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
    ...over,
  };
}

function makeRun(over: Partial<JobRunResource> = {}): JobRunResource {
  return {
    id: "run-1",
    userId: "user-a",
    jobId: "job-1",
    aiTaskId: "task-1",
    status: "succeeded",
    itemsNew: 3,
    itemsUpdated: 2,
    error: null,
    startedAt: "2026-06-30T09:00:00.000Z",
    finishedAt: "2026-06-30T09:01:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("AutomationsIsland — 列表渲染", () => {
  it("空态:无作业时渲染引导空态 + 新建入口", () => {
    render(<AutomationsIsland jobs={[]} />);
    expect(screen.getByText("还没有调度作业")).toBeInTheDocument();
    // 两个「新建作业」按钮(顶部 + 空态)
    expect(screen.getAllByText("新建作业").length).toBeGreaterThanOrEqual(1);
  });

  it("有作业:渲染 name / source 中文 / cron / 上次·下次", () => {
    render(
      <AutomationsIsland
        jobs={[makeJob(), makeJob({ id: "job-2", sourceKind: "comments", name: "抓评论" })]}
      />,
    );
    expect(screen.getByText("共 2 个作业")).toBeInTheDocument();
    expect(screen.getByText("每天抓我的主页指标")).toBeInTheDocument();
    expect(screen.getByText("抓评论")).toBeInTheDocument();
    // source_kind 中文映射
    expect(screen.getAllByText("自己作品").length).toBeGreaterThan(0);
    expect(screen.getAllByText("评论").length).toBeGreaterThan(0);
    // cron 原文
    expect(screen.getAllByText("0 9 * * *").length).toBeGreaterThan(0);
  });

  it("「立即运行」渲染但 disabled(待 D5)", () => {
    render(<AutomationsIsland jobs={[makeJob()]} />);
    const runNow = screen
      .getByText("立即运行")
      .closest("button") as HTMLButtonElement;
    expect(runNow).toBeDisabled();
  });
});

describe("JobRow — 启用开关", () => {
  it("toggle 开关调 onToggle 回调", () => {
    const onToggle = vi.fn();
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <JobRow
                job={makeJob({ enabled: true })}
                onToggle={onToggle}
                onOpenDetail={vi.fn()}
                pendingToggle={false}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const sw = screen.getByRole("switch", { name: /启用开关/ });
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe("AutomationsIsland — 启用开关接线", () => {
  it("toggle → setScheduledJobEnabled(jobId, enabled) + router.refresh", async () => {
    render(<AutomationsIsland jobs={[makeJob({ enabled: true })]} />);
    const sw = screen.getByRole("switch", { name: /启用开关/ });
    fireEvent.click(sw);
    await waitFor(() => {
      expect(mockClient.setScheduledJobEnabled).toHaveBeenCalledTimes(1);
    });
    const arg = mockClient.setScheduledJobEnabled.mock.calls[0]![0] as {
      params: { jobId: string };
      body: { enabled: boolean };
    };
    expect(arg.params.jobId).toBe("job-1");
    expect(arg.body.enabled).toBe(false);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});

describe("CreateJobDialog — 新建表单组装", () => {
  it("填名 + 选评论源 + 填 awemeId → onCreate 带装配好的 target", async () => {
    const onCreate = vi.fn((_i: unknown): Promise<void> => Promise.resolve());
    render(
      <CreateJobDialog open onOpenChange={vi.fn()} onCreate={onCreate} />,
    );
    // 填名
    fireEvent.change(
      screen.getByPlaceholderText("例:每天抓我的主页指标"),
      { target: { value: "抓某作品评论" } },
    );
    // target(默认源 self.metrics → externalSourceId 输入)
    fireEvent.change(
      screen.getByPlaceholderText(/externalSourceId/),
      { target: { value: "ext-99" } },
    );
    fireEvent.click(screen.getByText("创建作业"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const arg = onCreate.mock.calls[0]![0] as unknown as {
      name: string;
      sourceKind: string;
      schedule: string;
      target: Record<string, unknown>;
    };
    expect(arg.name).toBe("抓某作品评论");
    expect(arg.sourceKind).toBe("self.metrics");
    expect(arg.schedule).toBe("0 9 * * *");
    expect(arg.target).toEqual({ externalSourceId: "ext-99" });
  });

  it("名称为空时创建按钮 disabled", () => {
    render(<CreateJobDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />);
    const submit = screen
      .getByText("创建作业")
      .closest("button") as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });
});

describe("AutomationsIsland — 新建接线", () => {
  it("island.create → createScheduledJob(body) + router.refresh", async () => {
    render(<AutomationsIsland jobs={[]} />);
    // 打开新建弹窗(顶部按钮)
    fireEvent.click(screen.getAllByText("新建作业")[0]!);
    fireEvent.change(
      screen.getByPlaceholderText("例:每天抓我的主页指标"),
      { target: { value: "新作业" } },
    );
    fireEvent.click(screen.getByText("创建作业"));
    await waitFor(() =>
      expect(mockClient.createScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createScheduledJob.mock.calls[0]![0] as unknown as {
      body: { name: string; sourceKind: string; schedule: string };
    };
    expect(arg.body.name).toBe("新作业");
    expect(arg.body.sourceKind).toBe("self.metrics");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});

describe("RunDetailDialog — 运行详情读 runs + steps", () => {
  it("打开 → listJobRunsByJob;选 run → listTaskSteps 渲染步骤", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([makeRun()]);
    mockClient.listTaskSteps.mockResolvedValueOnce([
      { stepNo: 1, kind: "note", text: "拉取主页作品列表" },
      { stepNo: 2, kind: "tool_call", text: "落 metric_snapshots" },
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);

    await waitFor(() =>
      expect(mockClient.listJobRunsByJob).toHaveBeenCalledTimes(1),
    );
    // run 行渲染(状态中文 + 新增/更新计数)
    await waitFor(() =>
      expect(screen.getByText("正常")).toBeInTheDocument(),
    );
    expect(screen.getByText(/新增 3 · 更新 2/)).toBeInTheDocument();

    // 点 run → 读 steps
    fireEvent.click(screen.getByText("正常"));
    await waitFor(() =>
      expect(mockClient.listTaskSteps).toHaveBeenCalledTimes(1),
    );
    const stepsArg = mockClient.listTaskSteps.mock.calls[0]![0] as unknown as {
      params: { taskId: string };
    };
    expect(stepsArg.params.taskId).toBe("task-1");
    await waitFor(() =>
      expect(screen.getByText("拉取主页作品列表")).toBeInTheDocument(),
    );
  });

  it("无 run 时诚实空态", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(mockClient.listJobRunsByJob).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByText(/还没有运行记录/)).toBeInTheDocument(),
    );
  });

  it("needs_reconnect 状态映射为「需重连 Chrome」", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({ status: "needs_reconnect", aiTaskId: null, error: "需重连 Chrome:登录态过期" }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("需重连 Chrome")).toBeInTheDocument(),
    );
  });
});
