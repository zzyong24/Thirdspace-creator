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
  runScheduledJobNow: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ jobRunId: "run-new", aiTaskId: "task-new", deduped: false }),
  ),
  loginDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
  // T-038c:限流可观测只读 op。默认返空 channels(无 cooldown → 不显限流,既有测试不受扰)。
  throttleStatusDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ channels: [] }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    setScheduledJobEnabled: (i: unknown) => mockClient.setScheduledJobEnabled(i),
    createScheduledJob: (i: unknown) => mockClient.createScheduledJob(i),
    listJobRunsByJob: (i: unknown) => mockClient.listJobRunsByJob(i),
    listTaskSteps: (i: unknown) => mockClient.listTaskSteps(i),
    runScheduledJobNow: (i: unknown) => mockClient.runScheduledJobNow(i),
    loginDouyin: (i: unknown) => mockClient.loginDouyin(i),
    throttleStatusDouyin: (i: unknown) => mockClient.throttleStatusDouyin(i),
  },
}));

import {
  AutomationsIsland,
  JobRow,
  CreateJobDialog,
  RunDetailDialog,
  TemplateCards,
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
    expect(screen.getByText("还没有采集任务")).toBeInTheDocument();
    // 「新建任务」按钮(顶部 + 空态)
    expect(screen.getAllByText("新建任务").length).toBeGreaterThanOrEqual(1);
  });

  // [T-332 S4·§6.3] 自动化页按号过滤的**明示**:当前号 badge + 行内归属号 badge。
  it("当前号 badge:传 currentAccount → 顶条显「仅当前号 @handle」,行上标归属号", () => {
    render(
      <AutomationsIsland
        jobs={[makeJob({ accountId: "acct-a" })]}
        currentAccount={{ id: "acct-a", handle: "@主号" }}
      />,
    );
    const head = screen.getByTestId("automations-current-account");
    expect(head.textContent).toContain("仅当前号 @主号");
    const rowBadge = screen.getByTestId("automation-account-badge");
    expect(rowBadge.textContent).toContain("@主号");
    expect(rowBadge).toHaveAttribute("data-account-id", "acct-a");
  });

  it("未选号:currentAccount=null → 顶条显选号引导,空态给绑号/选号文案", () => {
    render(<AutomationsIsland jobs={[]} currentAccount={null} />);
    expect(screen.getByTestId("automations-no-account")).toBeInTheDocument();
    expect(
      screen.getByText(/先在左下角切换器绑定\/选择一个抖音号/),
    ).toBeInTheDocument();
  });

  it("行归属号 ≠ 当前号(数据异常)→ 诚实标「其他账号」暴露问题,不伪装", () => {
    render(
      <AutomationsIsland
        jobs={[makeJob({ accountId: "acct-b" })]}
        currentAccount={{ id: "acct-a", handle: "@主号" }}
      />,
    );
    expect(
      screen.getByTestId("automation-account-badge").textContent,
    ).toContain("其他账号");
  });

  it("有作业:渲染 name / source 中文 / 友好频率(非裸 cron)/ 上次·下次", () => {
    render(
      <AutomationsIsland
        jobs={[makeJob(), makeJob({ id: "job-2", sourceKind: "comments", name: "抓评论" })]}
      />,
    );
    expect(screen.getByText("共 2 个任务")).toBeInTheDocument();
    expect(screen.getByText("每天抓我的主页指标")).toBeInTheDocument();
    expect(screen.getByText("抓评论")).toBeInTheDocument();
    // source_kind 中文映射
    expect(screen.getAllByText("自己作品").length).toBeGreaterThan(0);
    expect(screen.getAllByText("评论").length).toBeGreaterThan(0);
    // 列表页把 `0 9 * * *` 反解成友好中文「每天 09:00」—— 不露裸 cron
    expect(screen.getAllByText("每天 09:00").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 9 * * *")).not.toBeInTheDocument();
  });

  it("D5:「立即运行」enabled(作业启用时)", () => {
    render(<AutomationsIsland jobs={[makeJob({ enabled: true })]} />);
    const runNow = screen
      .getByText("立即运行")
      .closest("button") as HTMLButtonElement;
    expect(runNow).not.toBeDisabled();
  });

  it("D5:立即运行点击 → runScheduledJobNow(jobId) + router.refresh", async () => {
    render(<AutomationsIsland jobs={[makeJob({ id: "job-9", enabled: true })]} />);
    fireEvent.click(
      screen.getByText("立即运行").closest("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(mockClient.runScheduledJobNow).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.runScheduledJobNow.mock.calls[0]![0] as {
      params: { jobId: string };
    };
    expect(arg.params.jobId).toBe("job-9");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
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
                latestRun={null}
                channelThrottle={null}
                onEdit={vi.fn()}
                onToggle={onToggle}
                onOpenDetail={vi.fn()}
                onRunNow={vi.fn()}
                onLogin={vi.fn()}
                pendingToggle={false}
                pendingRunNow={false}
                loginPhase="idle"
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

// ── T-152 实时采集进度显示 ─────────────────────────────────────────────────────
function renderJobRow(over: Parameters<typeof JobRow>[0]) {
  return render(
    <table>
      <tbody>
        <tr>
          <td>
            <JobRow {...over} />
          </td>
        </tr>
      </tbody>
    </table>,
  );
}

const jobRowBase = {
  job: makeJob({ enabled: true }),
  channelThrottle: null,
  onEdit: vi.fn(),
  onToggle: vi.fn(),
  onOpenDetail: vi.fn(),
  onRunNow: vi.fn(),
  onLogin: vi.fn(),
  pendingToggle: false,
  pendingRunNow: false,
  loginPhase: "idle" as const,
};

describe("T-152 — JobRow 实时采集进度显示", () => {
  it("running run 带 progress(total 已知)→ 显阶段文案 + 定长进度条 + 累计条数", () => {
    renderJobRow({
      ...jobRowBase,
      latestRun: makeRun({
        status: "running",
        finishedAt: null,
        // additive 进度字段(jsonb):封面回填 3/5
        progress: {
          stage: "cover_backfill",
          processed: 3,
          total: 5,
          message: "回填封面 3/5",
          updatedAt: "2026-06-30T09:00:30.000Z",
        },
      } as Partial<JobRunResource>),
    });
    const bar = screen.getByTestId("automation-run-progress");
    expect(bar).toHaveAttribute("data-stage", "cover_backfill");
    // 阶段中文标签 + 采集器 message(含累计条数)
    expect(bar.textContent).toContain("回填封面");
    expect(bar.textContent).toContain("3/5");
  });

  it("running run 带 progress(total 未知,total=null)→ 显不定长脉冲条 + 阶段文案(不假造百分比)", () => {
    renderJobRow({
      ...jobRowBase,
      latestRun: makeRun({
        status: "running",
        finishedAt: null,
        progress: {
          stage: "fetch",
          processed: 12,
          total: null,
          message: "已落库 12 条作品指标",
          updatedAt: "2026-06-30T09:00:10.000Z",
        },
      } as Partial<JobRunResource>),
    });
    const bar = screen.getByTestId("automation-run-progress");
    expect(bar).toHaveAttribute("data-stage", "fetch");
    expect(bar.textContent).toContain("抓取作品");
    expect(bar.textContent).toContain("12"); // 累计条数
  });

  it("running run 但无 progress(刚触发 / 旧 run null)→ 诚实显「采集进行中…」不假造进度", () => {
    renderJobRow({
      ...jobRowBase,
      latestRun: makeRun({
        status: "running",
        finishedAt: null,
        progress: null,
      } as Partial<JobRunResource>),
    });
    expect(screen.queryByTestId("automation-run-progress")).toBeNull();
    expect(screen.getByText("采集进行中…")).toBeInTheDocument();
  });

  it("终态 run(succeeded)→ 不显进度条(让位给结果文案)", () => {
    renderJobRow({
      ...jobRowBase,
      latestRun: makeRun({ status: "succeeded", itemsNew: 5 }),
    });
    expect(screen.queryByTestId("automation-run-progress")).toBeNull();
    expect(screen.queryByText("采集进行中…")).toBeNull();
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

describe("CreateJobDialog — 新建表单组装(友好频率 + 自然语言 prompt)", () => {
  it("填名 + 填 target + 写 prompt → onCreate 带装配好的 target + 编译后的 cron + prompt", async () => {
    const onCreate = vi.fn((_i: unknown): Promise<void> => Promise.resolve());
    render(
      <CreateJobDialog open onOpenChange={vi.fn()} onCreate={onCreate} />,
    );
    // 填名
    fireEvent.change(
      screen.getByPlaceholderText("例:每天抓我的主页指标"),
      { target: { value: "抓某作品评论" } },
    );
    // 自然语言 prompt(承接 scheduled_job.prompt)
    fireEvent.change(
      screen.getByPlaceholderText(/每天抓我主页的新作品/),
      { target: { value: "每天抓我主页的新作品指标" } },
    );
    // target(默认源 self.metrics → externalSourceId 输入)
    fireEvent.change(
      screen.getByPlaceholderText(/externalSourceId/),
      { target: { value: "ext-99" } },
    );
    fireEvent.click(screen.getByText("创建任务"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const arg = onCreate.mock.calls[0]![0] as unknown as {
      name: string;
      sourceKind: string;
      schedule: string;
      prompt: string;
      target: Record<string, unknown>;
    };
    expect(arg.name).toBe("抓某作品评论");
    expect(arg.sourceKind).toBe("self.metrics");
    // 默认频率(每天 09:00)编译成 cron —— UI 从不出现裸 cron,提交时才编译。
    expect(arg.schedule).toBe("0 9 * * *");
    expect(arg.prompt).toBe("每天抓我主页的新作品指标");
    expect(arg.target).toEqual({ externalSourceId: "ext-99" });
  });

  it("弹窗不出现裸 cron 输入框,而是友好频率控件", () => {
    render(<CreateJobDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />);
    // 旧的裸 cron 文本框(data-slot=automation-field-schedule + cron placeholder)已移除
    expect(
      document.querySelector('[data-slot="automation-field-schedule"]'),
    ).toBeNull();
    expect(screen.queryByPlaceholderText(/0 9 \* \* \*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cron/i)).not.toBeInTheDocument();
    // 改为友好频率编辑器 + 三段模式
    expect(
      document.querySelector('[data-slot="automation-cadence-editor"]'),
    ).not.toBeNull();
    expect(screen.getByText("周期")).toBeInTheDocument();
    expect(screen.getByText("按间隔")).toBeInTheDocument();
    expect(screen.getByText("单次")).toBeInTheDocument();
  });

  it("切到「按间隔 · 每 6 小时」→ onCreate 收到 `0 */6 * * *`", async () => {
    const onCreate = vi.fn((_i: unknown): Promise<void> => Promise.resolve());
    render(<CreateJobDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText("例:每天抓我的主页指标"), {
      target: { value: "间隔作业" },
    });
    // 切到「按间隔」模式
    fireEvent.click(screen.getByText("按间隔"));
    // 改间隔步长为 6（默认 3）
    const everyInput = document.querySelector(
      '[data-slot="automation-cadence-interval-every"]',
    ) as HTMLInputElement;
    fireEvent.change(everyInput, { target: { value: "6" } });
    fireEvent.click(screen.getByText("创建任务"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const arg = onCreate.mock.calls[0]![0] as unknown as { schedule: string };
    expect(arg.schedule).toBe("0 */6 * * *");
  });

  it("prefill(模板卡)预填 name/prompt/sourceKind/频率", async () => {
    const onCreate = vi.fn((_i: unknown): Promise<void> => Promise.resolve());
    render(
      <CreateJobDialog
        open
        onOpenChange={vi.fn()}
        onCreate={onCreate}
        prefill={{
          name: "每天抓我作品的最新评论",
          prompt: "每天抓我所有作品的最新评论",
          sourceKind: "comments",
          cadence: {
            mode: "period",
            unit: "daily",
            weekday: 1,
            hour: 9,
            minute: 0,
          },
        }}
      />,
    );
    // 预填带入 name + prompt
    expect(
      (screen.getByPlaceholderText("例:每天抓我的主页指标") as HTMLInputElement)
        .value,
    ).toBe("每天抓我作品的最新评论");
    expect(
      (screen.getByPlaceholderText(/每天抓我主页的新作品/) as HTMLTextAreaElement)
        .value,
    ).toBe("每天抓我所有作品的最新评论");
    // 直接提交 → sourceKind=comments,cron=每天 09:00
    fireEvent.click(screen.getByText("创建任务"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const arg = onCreate.mock.calls[0]![0] as unknown as {
      sourceKind: string;
      schedule: string;
      prompt: string;
    };
    expect(arg.sourceKind).toBe("comments");
    expect(arg.schedule).toBe("0 9 * * *");
    expect(arg.prompt).toBe("每天抓我所有作品的最新评论");
  });

  it("名称为空时创建按钮 disabled", () => {
    render(<CreateJobDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />);
    const submit = screen
      .getByText("创建任务")
      .closest("button") as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });
});

describe("TemplateCards — 从模板入手", () => {
  it("渲染模板卡;点非灰置模板 → onPick 带该模板", () => {
    const onPick = vi.fn();
    render(<TemplateCards onPick={onPick} />);
    expect(screen.getByText("从模板入手")).toBeInTheDocument();
    expect(screen.getByText("每天抓我的新作品指标")).toBeInTheDocument();
    expect(screen.getByText("每天抓我作品的最新评论")).toBeInTheDocument();
    // 点「每天抓我作品的最新评论」模板卡
    fireEvent.click(
      screen
        .getByText("每天抓我作品的最新评论")
        .closest("button") as HTMLButtonElement,
    );
    expect(onPick).toHaveBeenCalledTimes(1);
    const tpl = onPick.mock.calls[0]![0] as { sourceKind: string; id: string };
    expect(tpl.id).toBe("daily-comments");
    expect(tpl.sourceKind).toBe("comments");
  });

  // [T-367] 模板卡查重:已存在 sourceKind 的卡显「已存在」态,点它不再走 create(根治
  // 「点模板卡想开启 bootstrap 建的禁用 job,结果建出第二条」的重复)。
  it("[T-367] 已存在 kind 的卡显「已有此任务」态;点它调 onEnableExisting(不调 onPick)", () => {
    const onPick = vi.fn();
    const onEnableExisting = vi.fn();
    const existingJob = makeJob({
      id: "job-bm",
      sourceKind: "benchmark",
      enabled: false,
    });
    render(
      <TemplateCards
        onPick={onPick}
        jobs={[existingJob]}
        onEnableExisting={onEnableExisting}
      />,
    );
    const card = document.querySelector(
      '[data-template-id="daily-benchmark"]',
    ) as HTMLButtonElement;
    // 「已存在」态:disabled 既有 job → 文案引导去启用,不再是「用此模板新建」。
    expect(card).toHaveAttribute("data-existing", "true");
    expect(card.textContent).toContain("已有此任务 → 去启用/编辑");
    expect(card.textContent).not.toContain("用此模板新建");
    fireEvent.click(card);
    expect(onPick).not.toHaveBeenCalled();
    expect(onEnableExisting).toHaveBeenCalledTimes(1);
    expect(onEnableExisting.mock.calls[0]![0]).toBe(existingJob);
    // 不存在的 kind 保持「用此模板新建」现状。
    const commentsCard = document.querySelector(
      '[data-template-id="daily-comments"]',
    ) as HTMLButtonElement;
    expect(commentsCard).not.toHaveAttribute("data-existing");
    expect(commentsCard.textContent).toContain("用此模板新建");
  });

  it("[T-367] 已存在且已启用的 kind → 文案「去查看/编辑」", () => {
    render(
      <TemplateCards
        onPick={vi.fn()}
        jobs={[makeJob({ sourceKind: "self.metrics", enabled: true })]}
        onEnableExisting={vi.fn()}
      />,
    );
    const card = document.querySelector(
      '[data-template-id="daily-self-metrics"]',
    ) as HTMLButtonElement;
    expect(card.textContent).toContain("已有此任务 → 去查看/编辑");
  });

  it("明细模板(T-030-D8a)已翻真:可点,pick 带 self.detail", () => {
    const onPick = vi.fn();
    render(<TemplateCards onPick={onPick} />);
    const detailCard = document.querySelector(
      '[data-template-id="daily-detail"]',
    ) as HTMLButtonElement;
    expect(detailCard).not.toBeDisabled();
    fireEvent.click(detailCard);
    expect(onPick).toHaveBeenCalledTimes(1);
    const tpl = onPick.mock.calls[0]![0] as { sourceKind: string; id: string };
    expect(tpl.id).toBe("daily-detail");
    expect(tpl.sourceKind).toBe("self.detail");
  });
});

describe("AutomationsIsland — 新建接线", () => {
  it("island.create → createScheduledJob(body 带编译 cron + prompt) + router.refresh", async () => {
    render(<AutomationsIsland jobs={[]} />);
    // 打开新建弹窗(顶部按钮)
    fireEvent.click(screen.getAllByText("新建任务")[0]!);
    fireEvent.change(
      screen.getByPlaceholderText("例:每天抓我的主页指标"),
      { target: { value: "新作业" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/每天抓我主页的新作品/),
      { target: { value: "每天抓我主页的新作品" } },
    );
    fireEvent.click(screen.getByText("创建任务"));
    await waitFor(() =>
      expect(mockClient.createScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createScheduledJob.mock.calls[0]![0] as unknown as {
      body: {
        name: string;
        sourceKind: string;
        schedule: string;
        prompt: string;
      };
    };
    expect(arg.body.name).toBe("新作业");
    expect(arg.body.sourceKind).toBe("self.metrics");
    // schedule 是编译出的 cron(默认每天 09:00),prompt 承接自然语言
    expect(arg.body.schedule).toBe("0 9 * * *");
    expect(arg.body.prompt).toBe("每天抓我主页的新作品");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  // [T-367] island 接线:已存在(disabled)kind 的模板卡 → 直接启用既有 job,不调 create。
  it("[T-367] 点已存在 kind 模板卡 → setScheduledJobEnabled(既有 job, true),不调 createScheduledJob", async () => {
    render(
      <AutomationsIsland
        jobs={[
          makeJob({ id: "job-bm", sourceKind: "benchmark", enabled: false, name: "对标采集" }),
        ]}
      />,
    );
    fireEvent.click(
      screen
        .getByText("每天抓对标号的爆款作品")
        .closest("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(mockClient.setScheduledJobEnabled).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.setScheduledJobEnabled.mock.calls[0]![0] as {
      params: { jobId: string };
      body: { enabled: boolean };
    };
    expect(arg.params.jobId).toBe("job-bm");
    expect(arg.body.enabled).toBe(true);
    // 不走 create(根治重复建第二条)。
    expect(mockClient.createScheduledJob).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("[T-367] 已存在且已启用的 kind 模板卡:点击既不 create 也不重复 setEnabled", async () => {
    render(
      <AutomationsIsland
        jobs={[makeJob({ id: "job-m", sourceKind: "self.metrics", enabled: true })]}
      />,
    );
    fireEvent.click(
      screen
        .getByText("每天抓我的新作品指标")
        .closest("button") as HTMLButtonElement,
    );
    // 给微任务队列一拍:无 create、无 setEnabled(只定位既有行)。
    await Promise.resolve();
    expect(mockClient.createScheduledJob).not.toHaveBeenCalled();
    expect(mockClient.setScheduledJobEnabled).not.toHaveBeenCalled();
  });

  it("点模板卡「每天抓我作品的最新评论」→ 弹窗预填并可直接创建(sourceKind=comments)", async () => {
    render(<AutomationsIsland jobs={[]} />);
    // 点模板卡(TemplateCards 在列表页顶部)
    fireEvent.click(
      screen
        .getByText("每天抓我作品的最新评论")
        .closest("button") as HTMLButtonElement,
    );
    // 弹窗预填了 name/prompt
    await waitFor(() =>
      expect(
        (
          screen.getByPlaceholderText(
            "例:每天抓我的主页指标",
          ) as HTMLInputElement
        ).value,
      ).toBe("每天抓我作品的最新评论"),
    );
    fireEvent.click(screen.getByText("创建任务"));
    await waitFor(() =>
      expect(mockClient.createScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createScheduledJob.mock.calls[0]![0] as unknown as {
      body: { sourceKind: string; schedule: string; prompt: string };
    };
    expect(arg.body.sourceKind).toBe("comments");
    expect(arg.body.schedule).toBe("0 9 * * *");
    expect(arg.body.prompt.length).toBeGreaterThan(0);
  });
});

describe("D4 — needs_reconnect 行:红标 + 登录抖音恢复", () => {
  it("最近 run 是 needs_reconnect → 行显「需重连抖音」+「登录抖音」(非「立即运行」)", async () => {
    // island 挂载批量拉 latestRuns(每 job limit 1)→ 返回 needs_reconnect。
    mockClient.listJobRunsByJob.mockResolvedValue([
      makeRun({ status: "needs_reconnect", aiTaskId: null, error: "抖音登录态未连接或已过期,请去「设置 → 账户」扫码登录" }),
    ]);
    render(<AutomationsIsland jobs={[makeJob({ id: "job-nr", enabled: true })]} />);
    await waitFor(() =>
      expect(screen.getByText(/需重连抖音/)).toBeInTheDocument(),
    );
    // 该行换成「登录抖音」,没有「立即运行」
    expect(screen.getByTestId("automation-login-douyin")).toBeInTheDocument();
    expect(screen.queryByTestId("automation-run-now")).not.toBeInTheDocument();
  });

  it("点「登录抖音」→ loginDouyin;成功后 runScheduledJobNow 恢复 + refresh", async () => {
    mockClient.listJobRunsByJob.mockResolvedValue([
      makeRun({ status: "needs_reconnect", aiTaskId: null }),
    ]);
    mockClient.loginDouyin.mockResolvedValueOnce({ loggedIn: true });
    render(<AutomationsIsland jobs={[makeJob({ id: "job-nr", enabled: true })]} />);
    const btn = await screen.findByTestId("automation-login-douyin");
    fireEvent.click(btn);
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    // 登录成功 → 触发一次 runNow 恢复该 job
    await waitFor(() =>
      expect(mockClient.runScheduledJobNow).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.runScheduledJobNow.mock.calls[0]![0] as {
      params: { jobId: string };
    };
    expect(arg.params.jobId).toBe("job-nr");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("登录未成功(loggedIn=false)→ 不触发 runNow(不假装恢复)", async () => {
    mockClient.listJobRunsByJob.mockResolvedValue([
      makeRun({ status: "needs_reconnect", aiTaskId: null }),
    ]);
    mockClient.loginDouyin.mockResolvedValueOnce({ loggedIn: false });
    render(<AutomationsIsland jobs={[makeJob({ id: "job-nr", enabled: true })]} />);
    const btn = await screen.findByTestId("automation-login-douyin");
    fireEvent.click(btn);
    await waitFor(() => expect(mockClient.loginDouyin).toHaveBeenCalledTimes(1));
    // 给微任务队列一拍,确认没有 runNow(诚实:未登录不恢复)
    await Promise.resolve();
    expect(mockClient.runScheduledJobNow).not.toHaveBeenCalled();
  });
});

// T-038c 采集限流可观测:cooldown 时自动化诚实显限流保护横幅(不装死)。
describe("T-038c — 采集限流可观测(cooldown 显限流保护横幅)", () => {
  it("JobRow:channelThrottle cooldownActive → 显「⏳ 限流保护中,下次约 N 分钟(已退避 K 次)」", () => {
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <JobRow
                job={makeJob({ enabled: true })}
                latestRun={null}
                channelThrottle={{
                  cooldownActive: true,
                  cooldownEtaMs: 5 * 60_000, // 5 分钟
                  consecutiveThrottles: 3,
                  lastRequestAt: 1_700_000_000_000,
                }}
                onEdit={vi.fn()}
                onToggle={vi.fn()}
                onOpenDetail={vi.fn()}
                onRunNow={vi.fn()}
                onLogin={vi.fn()}
                pendingToggle={false}
                pendingRunNow={false}
                loginPhase="idle"
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const badge = screen.getByTestId("automation-throttle-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("限流保护中");
    expect(badge.textContent).toContain("约 5 分钟");
    expect(badge.textContent).toContain("已连续退避 3 次");
  });

  it("JobRow:非 cooldown(channelThrottle=null 或 inactive)→ 不显限流横幅", () => {
    const { rerender } = render(
      <table>
        <tbody>
          <tr>
            <td>
              <JobRow
                job={makeJob({ enabled: true })}
                latestRun={null}
                channelThrottle={null}
                onEdit={vi.fn()}
                onToggle={vi.fn()}
                onOpenDetail={vi.fn()}
                onRunNow={vi.fn()}
                onLogin={vi.fn()}
                pendingToggle={false}
                pendingRunNow={false}
                loginPhase="idle"
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(
      screen.queryByTestId("automation-throttle-badge"),
    ).not.toBeInTheDocument();
    // inactive 快照(cooldownActive=false)同样不显。
    rerender(
      <table>
        <tbody>
          <tr>
            <td>
              <JobRow
                job={makeJob({ enabled: true })}
                latestRun={null}
                channelThrottle={{
                  cooldownActive: false,
                  cooldownEtaMs: 0,
                  consecutiveThrottles: 0,
                  lastRequestAt: null,
                }}
                onEdit={vi.fn()}
                onToggle={vi.fn()}
                onOpenDetail={vi.fn()}
                onRunNow={vi.fn()}
                onLogin={vi.fn()}
                pendingToggle={false}
                pendingRunNow={false}
                loginPhase="idle"
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(
      screen.queryByTestId("automation-throttle-badge"),
    ).not.toBeInTheDocument();
  });

  it("island:throttleStatus 返 creator-center cooldown → self.metrics/comments 行都显限流", async () => {
    mockClient.throttleStatusDouyin.mockResolvedValueOnce({
      channels: [
        {
          channel: "creator-center",
          cooldownActive: true,
          cooldownEtaMs: 2 * 60_000,
          consecutiveThrottles: 1,
          lastRequestAt: 1_700_000_000_000,
        },
        {
          channel: "iesdouyin",
          cooldownActive: false,
          cooldownEtaMs: 0,
          consecutiveThrottles: 0,
          lastRequestAt: null,
        },
      ],
    });
    render(
      <AutomationsIsland
        jobs={[
          makeJob({ id: "job-metrics", sourceKind: "self.metrics", name: "抓指标" }),
          makeJob({ id: "job-comments", sourceKind: "comments", name: "抓评论" }),
        ]}
      />,
    );
    // creator-center cooldown → self.metrics + comments 都显限流横幅:
    // comments 抓取真实走创作者中心 interactive/comment,不是 iesdouyin 公开分享页。
    await waitFor(() =>
      expect(screen.getAllByTestId("automation-throttle-badge")).toHaveLength(2),
    );
    expect(screen.getAllByText(/限流保护中,下次约 2 分钟后重试/)).toHaveLength(2);
  });

  it("island:只有 iesdouyin cooldown 时 comments 行不误显限流", async () => {
    mockClient.throttleStatusDouyin.mockResolvedValueOnce({
      channels: [
        {
          channel: "creator-center",
          cooldownActive: false,
          cooldownEtaMs: 0,
          consecutiveThrottles: 0,
          lastRequestAt: null,
        },
        {
          channel: "iesdouyin",
          cooldownActive: true,
          cooldownEtaMs: 3 * 60_000,
          consecutiveThrottles: 2,
          lastRequestAt: 1_700_000_000_000,
        },
      ],
    });
    render(
      <AutomationsIsland
        jobs={[
          makeJob({ id: "job-comments", sourceKind: "comments", name: "抓评论" }),
        ]}
      />,
    );
    await waitFor(() =>
      expect(mockClient.throttleStatusDouyin).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId("automation-throttle-badge")).not.toBeInTheDocument();
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
    // run 行渲染(状态中文 + 结果文案:succeeded 有新数据 → ✅ 新增 N 条)
    await waitFor(() =>
      expect(screen.getByText("完成")).toBeInTheDocument(),
    );
    expect(screen.getByText(/✅ 新增 3 条 · 更新 2 条/)).toBeInTheDocument();

    // 点 run → 读 steps
    fireEvent.click(screen.getByText("完成"));
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

  it("needs_reconnect 状态映射为「需重连抖音」", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({ status: "needs_reconnect", aiTaskId: null, error: "抖音登录态未连接或已过期,请去「设置 → 账户」扫码登录" }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("需重连抖音")).toBeInTheDocument(),
    );
  });
});

// T-032b ③:采集反馈 UX 做真 —— 结果文案按 status + itemsNew 分档(测 4)。
describe("T-032b — 采集反馈结果文案分档", () => {
  it("succeeded 且 itemsNew=0 → 「✅ 已完成 · 无新数据」(不显得像失败)", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({ status: "succeeded", itemsNew: 0, itemsUpdated: 0 }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/已完成 · 无新数据/)).toBeInTheDocument(),
    );
    // 诚实:状态徽标是「完成」,不是失败/需重连
    expect(screen.getByText("完成")).toBeInTheDocument();
    expect(screen.queryByText("失败")).not.toBeInTheDocument();
    expect(screen.queryByText("需重连抖音")).not.toBeInTheDocument();
  });

  it("succeeded 且 itemsNew>0 → 「✅ 新增 N 条」", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({ status: "succeeded", itemsNew: 5, itemsUpdated: 0 }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/✅ 新增 5 条/)).toBeInTheDocument(),
    );
    // 无更新时不缀「· 更新 0 条」
    expect(screen.queryByText(/更新 0 条/)).not.toBeInTheDocument();
  });

  it("needs_reconnect → 行显「⚠️ 需重连抖音 —— 去扫码登录」+ error 用琥珀(非红失败色)", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({
        status: "needs_reconnect",
        aiTaskId: null,
        error: "抖音登录态未连接或已过期,请去「设置 → 账户」扫码登录(或点本行「登录抖音」)后再采集。",
      }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/需重连抖音 —— 去扫码登录/)).toBeInTheDocument(),
    );
    // 选中该 run → error 文案用琥珀底(data-slot=automation-run-error),不是红失败色
    fireEvent.click(screen.getByText("需重连抖音"));
    await waitFor(() => {
      const errEl = document.querySelector(
        '[data-slot="automation-run-error"]',
      ) as HTMLElement;
      expect(errEl).not.toBeNull();
      expect(errEl.className).toContain("amber");
      expect(errEl.textContent).toContain("设置 → 账户");
    });
  });

  it("failed → 行显「❌ 失败:{error}」(显真因)", async () => {
    mockClient.listJobRunsByJob.mockResolvedValueOnce([
      makeRun({
        status: "failed",
        itemsNew: 0,
        itemsUpdated: 0,
        error: "采集抖音评论失败:网络或页面加载超时,请检查网络后重试。",
      }),
    ]);
    render(<RunDetailDialog job={makeJob()} open onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/❌ 失败:采集抖音评论失败/)).toBeInTheDocument(),
    );
  });
});

// D4 needs_reconnect 行的「登录抖音」按钮已在上面「D4」describe 覆盖(latestRun=needs_reconnect
// → 换按钮),这里的结果文案测与之互补。
