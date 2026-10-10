import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-248 批B —— 自动化任务「编辑弹窗」+「模板死分支删除」交互测试。
//  1. 行内「编辑」入口 → 打开编辑弹窗(复用 CreateJobDialog 的 edit 模式)→ 预填
//     {name, prompt, target, cadence(compileCronToCadence 反解)} → 「保存修改」→
//     scheduledJobs.update(jobId + 只传可改字段)→ router.refresh。
//  2. 反解失败(手写复杂 cron)诚实降级:提示「原频率无法反解」+ 重选前禁保存。
//  3. 系统作业(sourceKind 不在下拉集合,如 benchmark)→ target 隐藏、提交不带 target。
//  4. 模板卡不再有 disabled 分支(D8a 已翻真,死分支删除)。
// Deterministic:mock client 即时 resolve;无 Date.now / Math.random / fetch;
// 全程不用原生 window.confirm(提交按钮即确认交互)。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  setScheduledJobEnabled: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  createScheduledJob: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  updateScheduledJob: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  listJobRunsByJob: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  listTaskSteps: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  runScheduledJobNow: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ jobRunId: "run-new", aiTaskId: "task-new", deduped: false }),
  ),
  loginDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ loggedIn: true }),
  ),
  throttleStatusDouyin: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ channels: [] }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    setScheduledJobEnabled: (i: unknown) => mockClient.setScheduledJobEnabled(i),
    createScheduledJob: (i: unknown) => mockClient.createScheduledJob(i),
    updateScheduledJob: (i: unknown) => mockClient.updateScheduledJob(i),
    listJobRunsByJob: (i: unknown) => mockClient.listJobRunsByJob(i),
    listTaskSteps: (i: unknown) => mockClient.listTaskSteps(i),
    runScheduledJobNow: (i: unknown) => mockClient.runScheduledJobNow(i),
    loginDouyin: (i: unknown) => mockClient.loginDouyin(i),
    throttleStatusDouyin: (i: unknown) => mockClient.throttleStatusDouyin(i),
  },
}));

import { AutomationsIsland, TemplateCards, CreateJobDialog } from "./automations-island";
import type { ScheduledJobResource } from "@creatoros/backend/modules/scheduling";

function makeJob(over: Partial<ScheduledJobResource> = {}): ScheduledJobResource {
  return {
    id: "job-1",
    userId: "user-a",
    name: "每天抓我的主页指标",
    prompt: "每天抓我主页的新作品和最新指标",
    sourceKind: "self.metrics",
    target: { externalSourceId: "ext-1" },
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

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

it.each(['self.metrics','self.traffic','comments','self.detail'] as const)('独立%s编辑保留类型和目标标记，取消不提交',async sourceKind=>{
 const onCreate=vi.fn(async(_input:unknown)=>{}),onOpenChange=vi.fn();
 const target={externalSourceId:'ext-1',__skipHeavyBackfill:sourceKind==='self.metrics',...(sourceKind==='self.detail'?{__backfillOnly:true,__skipMetricRefresh:true}:{})};
 const job=makeJob({sourceKind,target,schedule:'0 */2 * * *'});
 const first=render(<CreateJobDialog open mode="edit" job={job} onCreate={onCreate} onOpenChange={onOpenChange}/>);
 expect(screen.queryByRole('switch',{name:'同步评论'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('取消'));expect(onCreate).not.toHaveBeenCalled();expect(onOpenChange).toHaveBeenCalledWith(false);first.unmount();
 render(<CreateJobDialog open mode="edit" job={job} onCreate={onCreate} onOpenChange={onOpenChange}/>);
 fireEvent.click(screen.getByText('保存修改'));await waitFor(()=>expect(onCreate).toHaveBeenCalled());
 expect(onCreate.mock.calls[0]?.[0]).toMatchObject({sourceKind,schedule:'0 */2 * * *',target});
});

it('四类采集分别显示优先说明与启用开关，只切换指定作业',async()=>{
 const jobs=(['self.metrics','self.traffic','comments','self.detail'] as const).map((sourceKind,i)=>makeJob({id:`split-${i}`,name:`独立任务${i}`,sourceKind,target:sourceKind==='self.detail'?{__backfillOnly:true}:{},schedule:'0 */2 * * *'}));
 render(<AutomationsIsland jobs={jobs}/>);
 for(const label of ['作品优先','流量其次','评论后台','封面与内容后台'])expect(screen.getByText(label)).toBeInTheDocument();
 expect(screen.getAllByTestId('automation-edit')).toHaveLength(4);
 fireEvent.click(screen.getByRole('switch',{name:'独立任务2 启用开关'}));await waitFor(()=>expect(mockClient.setScheduledJobEnabled).toHaveBeenCalledTimes(1));
 expect(mockClient.setScheduledJobEnabled.mock.calls[0]?.[0]).toMatchObject({params:{jobId:'split-2'},body:{enabled:false}});
});

it.each(['self.traffic','self.detail'] as const)('普通新建不能用%s预填绕过系统创建边界',sourceKind=>{
 const onCreate=vi.fn(async(_input:unknown)=>{});
 render(<CreateJobDialog open prefill={{name:'系统采集',sourceKind}} onCreate={onCreate} onOpenChange={vi.fn()}/>);
 expect(screen.getByText('创建任务')).toBeDisabled();fireEvent.click(screen.getByText('创建任务'));expect(onCreate).not.toHaveBeenCalled();
});

describe("T-248 — 任务编辑弹窗", () => {
  it("旧复杂cron仍需重选频率，不因采集类型绕过校验", async()=>{
    render(<AutomationsIsland jobs={[makeJob({schedule:"0 0,6,12,18 * * *",target:{operationsSync:{version:1,capabilities:{metrics:true,comments:false,traffic:true,content:true}}}})]}/>);
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(()=>expect(screen.getByText("保存修改")).toBeDisabled());
    expect(mockClient.updateScheduledJob).not.toHaveBeenCalled();
  });
  it("独立作品同步可编辑频率，并保留原目标标记", async () => {
    render(<AutomationsIsland jobs={[makeJob({schedule:'0 */2 * * *',target:{externalSourceId:"ext-1",__skipHeavyBackfill:true}})]}/>);
    fireEvent.click(screen.getByTestId("automation-edit"));
    expect(screen.queryByRole("switch",{name:"同步评论"})).not.toBeInTheDocument();
    fireEvent.change(document.querySelector('[data-slot="automation-cadence-interval-every"]')!,{target:{value:'6'}});
    fireEvent.click(screen.getByText("保存修改"));
    await waitFor(()=>expect(mockClient.updateScheduledJob).toHaveBeenCalled());
    expect(mockClient.updateScheduledJob.mock.calls[0]![0]).toMatchObject({body:{schedule:"0 */6 * * *",target:{externalSourceId:"ext-1",__skipHeavyBackfill:true}}});
  });

  it("内容雷达可编辑频率，保存不修改系统目标", async () => {
    render(<AutomationsIsland jobs={[makeJob({sourceKind:"intelligence.sync",schedule:"0 */2 * * *",target:{accountId:"acct-a"}})]} />);
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(()=>expect(screen.getByText("编辑采集任务")).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/externalSourceId/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("保存修改"));
    await waitFor(()=>expect(mockClient.updateScheduledJob).toHaveBeenCalled());
    const arg = mockClient.updateScheduledJob.mock.calls[0]![0] as {body:Record<string,unknown>};
    expect(arg.body.schedule).toBe("0 */2 * * *");
    expect(arg.body).not.toHaveProperty("target");
  });
  it("行内有「编辑」入口;点击 → 打开编辑弹窗并预填 name/prompt/target/友好频率", async () => {
    render(<AutomationsIsland jobs={[makeJob()]} />);
    const editBtn = screen.getByTestId("automation-edit");
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // 弹窗打开:编辑态标题 + 保存按钮
    await waitFor(() =>
      expect(screen.getByText("编辑采集任务")).toBeInTheDocument(),
    );
    // 预填 name / prompt
    expect(
      (screen.getByPlaceholderText("例:每天抓我的主页指标") as HTMLInputElement)
        .value,
    ).toBe("每天抓我的主页指标");
    expect(
      (screen.getByPlaceholderText(/每天抓我主页的新作品/) as HTMLTextAreaElement)
        .value,
    ).toBe("每天抓我主页的新作品和最新指标");
    // 预填 target(self.metrics → externalSourceId)
    expect(
      (screen.getByPlaceholderText(/externalSourceId/) as HTMLInputElement).value,
    ).toBe("ext-1");
    // 频率反解:cron `0 9 * * *` → 「每天 09:00」预览(不露 cron、无降级提示)
    const dialog = document.querySelector(
      '[data-slot="automation-create-dialog"][data-mode="edit"]',
    ) as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(
      dialog.querySelector('[data-slot="automation-cadence-summary"]')?.textContent,
    ).toBe("每天 09:00");
    expect(
      screen.queryByTestId("automation-cadence-unresolved"),
    ).not.toBeInTheDocument();
    // sourceKind 只读展示(契约 update 不支持改源),不给下拉假入口
    expect(
      dialog.querySelector('[data-slot="automation-field-source-readonly"]')
        ?.textContent,
    ).toContain("作品数据");
    expect(
      dialog.querySelector('[data-slot="automation-field-source"]'),
    ).toBeNull();
  });

  it("修改 name/target 后「保存修改」→ updateScheduledJob(jobId + body 可改字段) + refresh", async () => {
    render(<AutomationsIsland jobs={[makeJob({ id: "job-7" })]} />);
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(() =>
      expect(screen.getByText("编辑采集任务")).toBeInTheDocument(),
    );
    // 改名 + 改 target
    fireEvent.change(screen.getByPlaceholderText("例:每天抓我的主页指标"), {
      target: { value: "改名后的任务" },
    });
    fireEvent.change(screen.getByPlaceholderText(/externalSourceId/), {
      target: { value: "ext-2" },
    });
    fireEvent.click(screen.getByText("保存修改"));

    await waitFor(() =>
      expect(mockClient.updateScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.updateScheduledJob.mock.calls[0]![0] as {
      params: { jobId: string };
      body: Record<string, unknown>;
    };
    expect(arg.params.jobId).toBe("job-7");
    expect(arg.body.name).toBe("改名后的任务");
    expect(arg.body.prompt).toBe("每天抓我主页的新作品和最新指标");
    // 频率未动 → 反解再编译回等价 cron;sourceKind 契约不可改 → 不传
    expect(arg.body.schedule).toBe("0 9 * * *");
    expect(arg.body.target).toEqual({ externalSourceId: "ext-2" });
    expect("sourceKind" in arg.body).toBe(false);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    // 保存后弹窗关闭
    await waitFor(() =>
      expect(screen.queryByText("编辑采集任务")).not.toBeInTheDocument(),
    );
  });

  it("反解失败(手写复杂 cron)→ 诚实降级提示 + 重选频率前禁保存;重选后可保存新 cron", async () => {
    render(
      <AutomationsIsland
        jobs={[makeJob({ id: "job-odd", schedule: "0 9 * * 1,3" })]}
      />,
    );
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(() =>
      expect(screen.getByText("编辑采集任务")).toBeInTheDocument(),
    );
    // 既有人话明确要求重新选择；未选择前保存禁用
    const notice = screen.getByTestId("automation-cadence-unresolved");
    expect(notice.textContent).toBe("当前执行计划无法在这里编辑，请重新选择执行时间后保存。");
    const saveBtn = screen
      .getByText("保存修改")
      .closest("button") as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();

    // 用户重选频率(切「按间隔」,缺省每 3 小时)→ 提示消失、可保存
    fireEvent.click(screen.getByText("按间隔"));
    expect(
      screen.queryByTestId("automation-cadence-unresolved"),
    ).not.toBeInTheDocument();
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(mockClient.updateScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.updateScheduledJob.mock.calls[0]![0] as {
      body: { schedule: string };
    };
    expect(arg.body.schedule).toBe("0 */3 * * *");
  });

  it("系统作业(sourceKind=benchmark,不在下拉集合)→ target 字段隐藏,提交不带 target", async () => {
    render(
      <AutomationsIsland
        jobs={[
          makeJob({
            id: "job-sys",
            sourceKind: "benchmark",
            name: "对标爆款采集",
            target: { some: "opaque" },
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(() =>
      expect(screen.getByText("编辑采集任务")).toBeInTheDocument(),
    );
    // 源只读显示兜底中文名;target 输入不渲染(诚实不碰读不懂的形状)
    const dialog = document.querySelector(
      '[data-slot="automation-create-dialog"][data-mode="edit"]',
    ) as HTMLElement;
    expect(
      dialog.querySelector('[data-slot="automation-field-source-readonly"]')
        ?.textContent,
    ).toContain("对标爆款");
    expect(
      dialog.querySelector('[data-slot="automation-field-target"]'),
    ).toBeNull();

    fireEvent.click(screen.getByText("保存修改"));
    await waitFor(() =>
      expect(mockClient.updateScheduledJob).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.updateScheduledJob.mock.calls[0]![0] as {
      params: { jobId: string };
      body: Record<string, unknown>;
    };
    expect(arg.params.jobId).toBe("job-sys");
    expect("target" in arg.body).toBe(false);
  });

  it("编辑全程不调用原生 window.confirm(保存按钮即确认交互)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<AutomationsIsland jobs={[makeJob()]} />);
    fireEvent.click(screen.getByTestId("automation-edit"));
    await waitFor(() =>
      expect(screen.getByText("编辑采集任务")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("保存修改"));
    await waitFor(() =>
      expect(mockClient.updateScheduledJob).toHaveBeenCalledTimes(1),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("T-248 — 模板死分支删除(D8a 已翻真)", () => {
  it("模板卡不再有 disabled 分支:全部可点、无 data-disabled、无「规划中」徽标", () => {
    const onPick = vi.fn();
    render(<TemplateCards onPick={onPick} />);
    const cards = Array.from(
      document.querySelectorAll('[data-slot="automation-template-card"]'),
    ) as HTMLButtonElement[];
    expect(cards.length).toBe(3);
    for (const card of cards) {
      expect(card.disabled).toBe(false);
      expect(card.hasAttribute("data-disabled")).toBe(false);
      expect(card.className).not.toContain("cursor-not-allowed");
    }
    expect(screen.queryByText(/规划中 · D8a 后开放/)).not.toBeInTheDocument();
    // 每张卡都是可用的紧凑「新建」入口
    expect(screen.getAllByText("新建")).toHaveLength(cards.length);
    // 点仍在产品范围内的评论同步模板卡 → onPick 正常回调。
    fireEvent.click(
      document.querySelector(
        '[data-template-id="daily-self-metrics"]',
      ) as HTMLButtonElement,
    );
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

it('新开另一表单清除旧错误，每次明确重试清旧错误并保当前输入',async()=>{
 const onCreate=vi.fn().mockRejectedValueOnce(new Error('第一次保存失败')).mockResolvedValueOnce(undefined);
 const props={open:true,onOpenChange:vi.fn(),onCreate,mode:'edit' as const,job:makeJob()};
 const view=render(<CreateJobDialog {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('第一次保存失败'));
 view.rerender(<CreateJobDialog {...props} open={false}/>);
 view.rerender(<CreateJobDialog {...props} job={makeJob({id:'job-2',name:'另一个目标'})}/>);
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await waitFor(()=>expect(onCreate).toHaveBeenCalledTimes(2));
 expect(onCreate.mock.calls[1]![0].name).toBe('另一个目标');
});

it.each(['resolve','reject'] as const)('外部关闭后换目标重开，旧请求%s不关新表单或回写错误',async outcome=>{
 let resolve!:()=>void,reject!:(error:Error)=>void;
 const pending=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
 const onCreate=vi.fn(()=>pending),onOpenChange=vi.fn();
 const props={open:true,onOpenChange,onCreate,mode:'edit' as const,job:makeJob()};
 const view=render(<CreateJobDialog {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'保存修改'}));
 await waitFor(()=>expect(onCreate).toHaveBeenCalledOnce());
 view.rerender(<CreateJobDialog {...props} open={false}/>);
 view.rerender(<CreateJobDialog {...props} job={makeJob({id:'new-target',name:'新的目标'})}/>);
 if(outcome==='resolve')resolve();else reject(new Error('旧目标迟到失败'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存修改'})).toBeEnabled());
 expect(onOpenChange).not.toHaveBeenCalled();expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByDisplayValue('新的目标')).toBeInTheDocument();
});
