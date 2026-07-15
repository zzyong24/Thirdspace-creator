/**
 * [T-254c] 制作视频工作台交互测试(client 全 mock,确定性):
 *   - 备料区渲口播稿 + 上传入口;备料不齐决策按钮禁用;
 *   - 错 SRT 真挡(时长差/相似度低,给具体原因)+ 「我确认没传错」覆盖后放行;
 *   - 「AI 分场决策」dispatch:createAITask(video.decisions,inputData 带
 *     projectId/srtText/script);
 *   - 决策确认 → createExecutionTask(video.render):params.props 在,inputs
 *     全部 mountAs === assetId(闭环约定),含 talkingHead 与 B-roll 两个资产;
 *   - production 状态机相邻步进:确认渲染后 putOutputProduction 依次
 *     recording→editing→rendering,分场 segments 登记 + exportRecord 建档。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── client mock(stateful production 状态,可断言步进序列)──────────────────────

const state = vi.hoisted(() => ({
  prodStatus: "drafting",
  lastUploadAssetType: "",
}));

const mockClient = vi.hoisted(() => ({
  createUpload: vi.fn(async (input: { body: { assetType: string } }) => {
    state.lastUploadAssetType = input.body.assetType;
    return { uploadId: "u1", uploadUrl: "mock://skip-put" };
  }),
  completeUpload: vi.fn(async () => ({
    id: state.lastUploadAssetType === "video" ? "asset-video-1" : "asset-srt-1",
  })),
  createMaterialLink: vi.fn(async () => ({ id: "mlink-1" })),
  createOutput: vi.fn(async () => ({ id: "out-1" })),
  getOutputProduction: vi.fn(async () => ({
    id: "prod-1",
    status: state.prodStatus,
  })),
  putOutputProduction: vi.fn(
    async (input: { body: { status?: string } }) => {
      state.prodStatus = input.body.status ?? state.prodStatus;
      return { id: "prod-1", status: state.prodStatus };
    },
  ),
  createProductionSegment: vi.fn(async () => ({ id: "seg-1" })),
  createProductionExport: vi.fn(async () => ({ id: "exp-1" })),
  completeExport: vi.fn(async () => ({ id: "exp-1", status: "ready" })),
  createAITask: vi.fn(async () => ({ id: "ai-task-1", status: "queued" })),
  getTask: vi.fn(async () => ({ id: "ai-task-1", status: "running" })),
  listAITasks: vi.fn(async (): Promise<unknown[]> => []),
  listTaskResults: vi.fn(async (): Promise<unknown[]> => []),
  listTaskSteps: vi.fn(async (): Promise<unknown[]> => []),
  confirmTask: vi.fn(async () => ({ id: "ai-task-1", status: "succeeded" })),
  cancelTask: vi.fn(async () => ({ id: "ai-task-1", status: "cancelled" })),
  createExecutionTask: vi.fn(async () => ({
    id: "exec-1",
    execType: "video.render",
    status: "queued",
    adoptedAssetIds: [],
    errorMessage: null,
  })),
  getExecutionTask: vi.fn(async () => ({
    id: "exec-1",
    execType: "video.render",
    status: "queued" as string,
    spec: { taskType: "video.render", goal: "g", inputs: [], params: {}, constraints: {} },
    manifest: null,
    adoptedAssetIds: [] as string[],
    // string | null,允许失败态用例覆盖真实错误文案(默认 null)。
    errorMessage: null as string | null,
  })),
  listExecutionTasks: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/lib/contract-client", () => ({ client: mockClient }));

import { ProductionWorkbench } from "./production-workbench";

const SCRIPT = "大家好,今天讲上下文工程。模型只看得到你给它的窗口。";

const GOOD_SRT = [
  "1",
  "00:00:00,000 --> 00:00:06,000",
  "大家好 今天讲上下文工程",
  "",
  "2",
  "00:00:06,000 --> 00:00:12,000",
  "模型只看得到你给它的窗口",
].join("\n");

const WRONG_SRT = [
  "1",
  "00:00:00,000 --> 00:00:06,000",
  "这三款降噪耳机的佩戴体验差异很大",
  "",
  "2",
  "00:00:06,000 --> 00:00:12,000",
  "续航和音质我们逐个实测对比",
].join("\n");

function makeProps(overrides: Partial<Parameters<typeof ProductionWorkbench>[0]> = {}) {
  return {
    projectId: "p-1",
    projectTitle: "上下文工程",
    scriptText: SCRIPT,
    outputId: "out-1",
    initialStatus: "drafting",
    initialSegmentCount: 0,
    readVideoDuration: async () => 12,
    ...overrides,
  };
}

function fileInput(container: HTMLElement, label: string): HTMLInputElement {
  const el = container.querySelector(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`missing input: ${label}`);
  return el as HTMLInputElement;
}

async function uploadVideo(container: HTMLElement, name = "rough-cut.mp4") {
  const file = new File(["fake-bytes"], name, { type: "video/mp4" });
  fireEvent.change(fileInput(container, "上传粗剪人物视频"), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(container.textContent).toContain(`已上传:${name}`),
  );
}

async function uploadSrt(container: HTMLElement, content: string) {
  const file = new File([content], "captions.srt", { type: "text/plain" });
  fireEvent.change(fileInput(container, "上传 SRT 字幕"), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(container.textContent).toContain("已上传:captions.srt"),
  );
}

function dispatchButton(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector('[data-slot="dispatch-decisions"]');
  if (!el) throw new Error("missing dispatch button");
  return el as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.prodStatus = "drafting";
  state.lastUploadAssetType = "";
  // [FE-H01 测试] clearAllMocks 只清调用记录、不复位实现:本文件部分用例用 mockResolvedValue
  // 持久覆盖轮询类 mock,这里显式复位默认实现,防跨用例泄漏。
  mockClient.getTask.mockResolvedValue({ id: "ai-task-1", status: "running" });
  mockClient.listAITasks.mockResolvedValue([]);
  mockClient.listTaskResults.mockResolvedValue([]);
  mockClient.listTaskSteps.mockResolvedValue([]);
  mockClient.listExecutionTasks.mockResolvedValue([]);
  mockClient.getExecutionTask.mockResolvedValue({
    id: "exec-1",
    execType: "video.render",
    status: "queued",
    spec: { taskType: "video.render", goal: "g", inputs: [], params: {}, constraints: {} },
    manifest: null,
    adoptedAssetIds: [],
    errorMessage: null,
  });
});

afterEach(cleanup);

describe("ProductionWorkbench", () => {
  it("备料区渲口播稿 + 录制指引 + 上传入口;备料不齐时决策按钮禁用", async () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    expect(container.textContent).toContain("模型只看得到你给它的窗口");
    expect(container.textContent).toContain("导出粗剪视频 + SRT 字幕");
    expect(fileInput(container, "上传粗剪人物视频")).toBeTruthy();
    expect(fileInput(container, "上传 SRT 字幕")).toBeTruthy();
    expect(dispatchButton(container).disabled).toBe(true);
    // 恢复读 best-effort 跑过(不炸)。
    await waitFor(() => expect(mockClient.listExecutionTasks).toHaveBeenCalled());
  });

  it("没有口播稿 → 诚实空态,不渲提词稿", () => {
    const { container } = render(
      <ProductionWorkbench {...makeProps({ scriptText: null })} />,
    );
    expect(container.textContent).toContain("本项目还没有口播稿");
  });

  it("错 SRT 真挡:时长差 + 相似度低都给具体原因,按钮禁用;明确覆盖后放行", async () => {
    const { container } = render(
      <ProductionWorkbench
        {...makeProps({ readVideoDuration: async () => 300 })}
      />,
    );
    await uploadVideo(container);
    await uploadSrt(container, WRONG_SRT);

    // 两道校验都真挡,并给具体原因。
    const duration = container.querySelector('[data-check="duration"]');
    const script = container.querySelector('[data-check="script"]');
    expect(duration?.getAttribute("data-ok")).toBe("false");
    expect(duration?.textContent).toContain("时长不匹配");
    expect(duration?.textContent).toContain("相差");
    expect(script?.getAttribute("data-ok")).toBe("false");
    expect(script?.textContent).toContain("相似度仅");
    expect(dispatchButton(container).disabled).toBe(true);

    // 「我确认没传错」→ 放行。
    const override = container.querySelector(
      '[data-slot="srt-check-override"] input',
    ) as HTMLInputElement;
    fireEvent.click(override);
    await waitFor(() => expect(dispatchButton(container).disabled).toBe(false));
  });

  it("SRT 匹配(时长+内容)→ 不挡;「AI 分场决策」dispatch video.decisions 带全 inputData", async () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);

    expect(
      container.querySelector('[data-check="duration"]')?.getAttribute("data-ok"),
    ).toBe("true");
    expect(
      container.querySelector('[data-check="script"]')?.getAttribute("data-ok"),
    ).toBe("true");

    const btn = dispatchButton(container);
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(mockClient.createAITask).toHaveBeenCalledTimes(1));
    expect(mockClient.createAITask).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          taskType: "video.decisions",
          inputData: { projectId: "p-1", srtText: GOOD_SRT, script: SCRIPT },
        },
      }),
    );
    // 上传链走过两阶段 + 用料链(video clip / subtitle reference,stage=production)。
    expect(mockClient.createUpload).toHaveBeenCalledTimes(2);
    expect(mockClient.completeUpload).toHaveBeenCalledTimes(2);
    expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ stage: "production" }),
      }),
    );
  });

  it("决策确认 → video.render dispatch(mountAs=assetId 闭环)+ 状态机步进 + 分场/export 建档", async () => {
    // 恢复路径注入决策候选(等价于四决策任务跑完):预览卡直接渲出。
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "ai-9", status: "awaiting_confirmation" },
    ]);
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultType: "video_decisions",
        resultData: {
          decisions: {
            scenes: [
              { title: "开场", startSec: 0, endSec: 10, summary: "开场介绍" },
            ],
            cards: [
              { sceneIdx: 0, kind: "quote", content: "模型只看得到窗口", at: 2 },
            ],
            broll: [
              { sceneIdx: 0, assetId: "asset-broll-1", at: 4, durationSec: 3 },
            ],
            subtitles: [
              { index: 1, startSec: 0, endSec: 5, zh: "大家好", en: "Hello" },
            ],
            srtLines: [{ index: 1, startSec: 0, endSec: 5, text: "大家好" }],
          },
          inventory: [
            {
              assetId: "asset-broll-1",
              label: "演示画面",
              kind: "video",
              description: "",
            },
          ],
        },
      },
    ]);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() =>
      expect(container.textContent).toContain("分场预览"),
    );
    // 刷新恢复的候选没有视频引用 → 先重新上传粗剪视频。
    await uploadVideo(container);

    const confirm = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "确认决策,进入渲染",
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);

    await waitFor(() =>
      expect(mockClient.createExecutionTask).toHaveBeenCalledTimes(1),
    );
    const call = (
      mockClient.createExecutionTask.mock.calls as unknown as unknown[][]
    )[0]![0] as {
      body: {
        projectId: string;
        spec: {
          taskType: string;
          inputs: { assetId: string; mountAs: string }[];
          params: { props?: { talkingHead?: { file?: string } } };
        };
      };
    };
    expect(call.body.projectId).toBe("p-1");
    expect(call.body.spec.taskType).toBe("video.render");
    // props 组装对齐 contract 单一真值(talkingHead.file = 视频 assetId)。
    expect(call.body.spec.params.props?.talkingHead?.file).toBe("asset-video-1");
    // inputs:mountAs 必须 = assetId(闭环约定),含口播头 + B-roll 两个资产。
    const inputs = call.body.spec.inputs;
    expect(inputs.map((i) => i.assetId).sort()).toEqual([
      "asset-broll-1",
      "asset-video-1",
    ]);
    for (const input of inputs) expect(input.mountAs).toBe(input.assetId);

    // 决策任务收口。
    await waitFor(() =>
      expect(mockClient.confirmTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "ai-9" } }),
      ),
    );
    // 状态机相邻步进到 rendering(上传视频时已 →recording,确认后补 editing→rendering)。
    await waitFor(() => {
      const statuses = mockClient.putOutputProduction.mock.calls.map(
        (c) => (c[0] as { body: { status?: string } }).body.status,
      );
      expect(statuses).toContain("recording");
      expect(statuses).toContain("editing");
      expect(statuses).toContain("rendering");
    });
    // 分场登记(复活 segments op)+ exportRecord 建档(queued)。
    await waitFor(() =>
      expect(mockClient.createProductionSegment).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { productionId: "prod-1" },
          body: expect.objectContaining({
            title: "开场",
            position: 0,
            startMs: 0,
            endMs: 10000,
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mockClient.createProductionExport).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { productionId: "prod-1" },
          body: { format: "mp4", resolution: "1920x1080", aspectRatio: "16:9" },
        }),
      ),
    );
    // 渲染跟踪卡挂上。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-card"]'),
      ).toBeTruthy(),
    );
  });

  // ── [FE-H01] 「后台运行,可离开」承诺:进度不丢、不重复付费、失败可见可恢复 ──────────

  it("[FE-H01] 刷新恢复:渲染已 failed → 接回跟踪(失败可见:卡内显错误 + 环境引导 + 重试)", async () => {
    // 恢复读命中一个已失败的渲染任务(离开时失败)。
    mockClient.listExecutionTasks.mockResolvedValueOnce([
      {
        id: "exec-fail",
        execType: "video.render",
        status: "failed",
        adoptedAssetIds: [],
        errorMessage: "ffmpeg not found on PATH",
      },
    ]);
    mockClient.getExecutionTask.mockResolvedValue({
      id: "exec-fail",
      execType: "video.render",
      status: "failed",
      spec: { taskType: "video.render", goal: "渲染成片", inputs: [], params: {}, constraints: {} },
      manifest: null,
      adoptedAssetIds: [],
      errorMessage: "ffmpeg not found on PATH",
    });

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    // 渲染跟踪区被接回(失败不再无声无息)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="production-render"]'),
      ).toBeTruthy(),
    );
    // ExecutionTaskCard 显失败原因 + 重试(失败可恢复)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-error"]')
          ?.textContent ?? "",
      ).toContain("执行失败"),
    );
    // ffmpeg 环境错误被 humanize 成安装引导(workbench 的 render-env-hint)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="render-env-hint"]')?.textContent ??
          "",
      ).toContain("ffmpeg"),
    );
    // 状态机不因失败被推进到 ready(诚实停住)。
    const statuses = mockClient.putOutputProduction.mock.calls.map(
      (c) => (c[0] as { body: { status?: string } }).body.status,
    );
    expect(statuses).not.toContain("ready");
  });

  it("[FE-H01] 刷新恢复:决策任务仍在后台跑(running)→ 重挂轮询,决不重新发起(不重复付费)", async () => {
    // 离开时四决策还在跑;回到本页应接着轮询同一任务,而不是从零重发(付费/分场任务不能重复)。
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "dec-run", status: "running" },
    ]);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    // 轮询用恢复出的 taskId 重挂(getTask 收到 dec-run)。
    await waitFor(() =>
      expect(mockClient.getTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "dec-run" } }),
      ),
    );
    // 决不重新 createAITask(不重复触发付费决策)。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    // 进行中态可见(承诺「后台跑,可离开」)。
    expect(container.textContent).toContain("四决策进行中");
  });

  it("[FE-H01] 决策轮询持续不放弃:远超旧「~10 分钟(150 次)」上限仍在轮询(不静默退出)", async () => {
    vi.useFakeTimers();
    try {
      // 用恢复路径把一个 running 决策任务挂上轮询;getTask 默认恒 running → 永不遇终态。
      mockClient.listAITasks.mockResolvedValueOnce([
        { id: "dec-run", status: "running" },
      ]);
      render(<ProductionWorkbench {...makeProps()} />);
      // 冲洗挂载副作用(恢复读 + 首次轮询)。
      await vi.advanceTimersByTimeAsync(0);
      // 退避封顶 30s;推进远超旧 150 次上限的时间,证明轮询没有「轮满就退」。
      for (let i = 0; i < 200; i += 1) {
        await vi.advanceTimersByTimeAsync(30_000);
      }
      expect(mockClient.getTask.mock.calls.length).toBeGreaterThan(160);
    } finally {
      vi.useRealTimers();
    }
  });
});
