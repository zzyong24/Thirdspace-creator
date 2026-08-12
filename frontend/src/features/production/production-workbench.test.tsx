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
  copiedText: "",
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
  patchOutput: vi.fn(async () => ({ id: "out-1" })),
  getOutputProduction: vi.fn(
    async (): Promise<{
      id: string;
      status: string;
      recordingConfig?: unknown;
    }> => ({
      id: "prod-1",
      status: state.prodStatus,
    }),
  ),
  putOutputProduction: vi.fn(
    async (input: { body: { status?: string } }) => {
      state.prodStatus = input.body.status ?? state.prodStatus;
      return { id: "prod-1", status: state.prodStatus };
    },
  ),
  confirmProductionEditingPlan: vi.fn(async (input: { body: { expectedRevision: number } }) => ({
    id: "prod-1",
    status: state.prodStatus,
    recordingConfig: {
      videoEditingPlan: { revision: input.body.expectedRevision + 1 },
    },
  })),
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
  createExecutionTask: vi.fn(async (_input?: unknown) => ({
    id: "exec-1",
    execType: "video.render",
    status: "queued",
    spec: {
      taskType: "video.render",
      goal: "渲染成片",
      inputs: [],
      params: {},
      constraints: {},
    },
    manifest: null as unknown,
    adoptedAssetIds: [],
    errorMessage: null,
  })),
  getExecutionTask: vi.fn(async (_input?: unknown) => ({
    id: "exec-1",
    execType: "video.render",
    status: "queued" as string,
    spec: { taskType: "video.render", goal: "g", inputs: [], params: {}, constraints: {} },
    manifest: null as unknown,
    adoptedAssetIds: [] as string[],
    // string | null,允许失败态用例覆盖真实错误文案(默认 null)。
    errorMessage: null as string | null,
  })),
  confirmExecutionTask: vi.fn(async (_input?: unknown) => ({
    id: "exec-1",
    execType: "video.render",
    status: "succeeded",
    spec: {
      taskType: "video.render",
      goal: "渲染成片",
      inputs: [],
      params: {},
      constraints: {},
    },
    manifest: null,
    adoptedAssetIds: ["asset-final-1"],
    errorMessage: null,
  })),
  discardExecutionTask: vi.fn(async (_input?: unknown) => ({
    id: "exec-1",
    execType: "video.render",
    status: "cancelled",
    spec: {
      taskType: "video.render",
      goal: "渲染成片",
      inputs: [],
      params: {},
      constraints: {},
    },
    manifest: null,
    adoptedAssetIds: [],
    errorMessage: null,
  })),
  listExecutionTasks: vi.fn(async (_input?: unknown): Promise<unknown[]> => []),
  // [T-366a/b] 上传成品二选一 + 素材包导出的读写点。
  listMaterialLinks: vi.fn(async (): Promise<unknown[]> => []),
  listAssetUsage: vi.fn(async (): Promise<unknown[]> => []),
  getDownloadUrl: vi.fn(async () => ({
    url: "http://localhost/blob/final.mp4?token=test",
  })),
  getAsset: vi.fn(async (input?: unknown) => {
    void input;
    return { fileSize: null as number | null };
  }),
  listPublications: vi.fn(async (): Promise<unknown[]> => []),
  // [T-387c] B-roll 自动聚合读脚本/论点树 artifact(缺省空 → 无自动项,老用例零影响)。
  listArtifacts: vi.fn(async (): Promise<unknown[]> => []),
  getArtifact: vi.fn(async () => ({ currentVersionId: null as string | null })),
  listArtifactVersions: vi.fn(async (): Promise<unknown[]> => []),
  exportProductionMaterials: vi.fn(async () => ({
    assetId: "asset-zip-1",
    downloadUrl: "http://localhost/blob/zip?token=t",
    fileName: "素材包-上下文工程-20260717.zip",
    fileCount: 6,
    totalBytes: 1234,
    hasDecisions: true,
  })),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.prodStatus = "drafting";
  state.lastUploadAssetType = "";
  state.copiedText = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        state.copiedText = text;
      }),
    },
  });
  // [FE-H01 测试] clearAllMocks 只清调用记录、不复位实现:本文件部分用例用 mockResolvedValue
  // 持久覆盖轮询类 mock,这里显式复位默认实现,防跨用例泄漏。
  mockClient.getTask.mockResolvedValue({ id: "ai-task-1", status: "running" });
  mockClient.listAITasks.mockResolvedValue([]);
  mockClient.listTaskResults.mockResolvedValue([]);
  mockClient.listTaskSteps.mockResolvedValue([]);
  mockClient.listExecutionTasks.mockResolvedValue([]);
  mockClient.listMaterialLinks.mockResolvedValue([]);
  mockClient.listAssetUsage.mockResolvedValue([]);
  mockClient.getAsset.mockResolvedValue({ fileSize: null });
  mockClient.listPublications.mockResolvedValue([]);
  mockClient.getOutputProduction.mockImplementation(async () => ({
    id: "prod-1",
    status: state.prodStatus,
  }));
  mockClient.confirmProductionEditingPlan.mockImplementation(
    async (input: { body: { expectedRevision: number } }) => ({
      id: "prod-1",
      status: state.prodStatus,
      recordingConfig: {
        videoEditingPlan: { revision: input.body.expectedRevision + 1 },
      },
    }),
  );
  mockClient.createExecutionTask.mockResolvedValue({
    id: "exec-1",
    execType: "video.render",
    status: "queued",
    spec: {
      taskType: "video.render",
      goal: "渲染成片",
      inputs: [],
      params: {},
      constraints: {},
    },
    manifest: null,
    adoptedAssetIds: [],
    errorMessage: null,
  });
  // [T-387c] 自动聚合读 artifact 的三连:默认空(无脚本/论点树)。
  mockClient.listArtifacts.mockResolvedValue([]);
  mockClient.getArtifact.mockResolvedValue({ currentVersionId: null });
  mockClient.listArtifactVersions.mockResolvedValue([]);
  mockClient.createMaterialLink.mockResolvedValue({ id: "mlink-1" });
  mockClient.exportProductionMaterials.mockResolvedValue({
    assetId: "asset-zip-1",
    downloadUrl: "http://localhost/blob/zip?token=t",
    fileName: "素材包-上下文工程-20260717.zip",
    fileCount: 6,
    totalBytes: 1234,
    hasDecisions: true,
  });
  mockClient.getExecutionTask.mockResolvedValue({
    id: "exec-1",
    execType: "video.render",
    status: "queued",
    spec: { taskType: "video.render", goal: "g", inputs: [], params: {}, constraints: {} },
    manifest: null,
    adoptedAssetIds: [],
    errorMessage: null,
  });
  mockClient.confirmExecutionTask.mockResolvedValue({
    id: "exec-1",
    execType: "video.render",
    status: "succeeded",
    spec: {
      taskType: "video.render",
      goal: "渲染成片",
      inputs: [],
      params: {},
      constraints: {},
    },
    manifest: null,
    adoptedAssetIds: ["asset-final-1"],
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

  it("[T-475/T-479] 只读提词框与复制均使用纯口播，Ctrl+A 不会选中整页", async () => {
    const structured = [
      "1. 开场（0–3s）",
      "口播：真正决定效果的是内容。",
      "画面：正面镜头，中近景。",
      "字幕：内容比参数重要。",
      "",
      "2. 展开（3–12s）",
      "口播: 先把问题讲清楚，再给方法。",
      "画面: 切换屏幕录制。",
    ].join("\n");
    const { container } = render(
      <ProductionWorkbench {...makeProps({ scriptText: structured })} />,
    );
    const preview = container.querySelector(
      '[data-slot="voiceover-preview"]',
    ) as HTMLTextAreaElement;
    expect(preview).toBeTruthy();
    expect(preview.readOnly).toBe(true);
    expect(preview.value).toBe(
      "真正决定效果的是内容。\n\n先把问题讲清楚，再给方法。",
    );
    expect(preview.value).not.toContain("画面");
    expect(preview.value).not.toContain("字幕");
    expect(preview.value).not.toContain("0–3s");

    fireEvent.click(
      container.querySelector('[data-slot="copy-voiceover"]') as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(state.copiedText).toBe(
        "真正决定效果的是内容。\n\n先把问题讲清楚，再给方法。",
      ),
    );
    expect(container.textContent).toContain("已复制纯口播稿");
    expect(state.copiedText).not.toContain("画面");
    expect(state.copiedText).not.toContain("字幕");
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
    fireEvent.click(
      container.querySelector('[data-slot="orientation-portrait"]')!,
    );

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
          attemptId: expect.any(String),
          inputData: {
            projectId: "p-1",
            srtText: GOOD_SRT,
            script: SCRIPT,
            orientation: "portrait",
            // [T-387c] 备料③自动聚合的人剔除集(未剔任何项 → 空数组)。
            excludedAssetIds: [],
          },
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
    mockClient.listMaterialLinks.mockResolvedValue([
      {
        id: "link-broll-1",
        entityType: "asset",
        entityId: "asset-broll-1",
        role: "broll",
      },
    ]);
    mockClient.getAsset.mockImplementation(async (input: unknown) => {
      const assetId = (input as { params?: { assetId?: string } }).params?.assetId;
      return assetId === "asset-broll-1"
        ? { assetType: "video", name: "演示画面", fileSize: null }
        : { fileSize: null };
    });

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() =>
      expect(container.textContent).toContain("分场预览"),
    );
    // 刷新恢复的候选没有视频引用 → 先重新上传粗剪视频。
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);

    const confirm = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "确认决策,进入渲染",
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);

    await waitFor(() =>
      expect(mockClient.createExecutionTask).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.confirmProductionEditingPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          plan: expect.objectContaining({
            inventory: expect.arrayContaining([
              expect.objectContaining({ assetId: "asset-broll-1" }),
            ]),
          }),
        }),
      }),
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

    // 成片任务已创建后仍可按已确认分镜再生成一个版本；旧分场不重复写入。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="rerender-current-storyboard"]'),
      ).toBeTruthy(),
    );
    fireEvent.click(
      container.querySelector('[data-slot="rerender-current-storyboard"]')!,
    );
    await waitFor(() =>
      expect(mockClient.createExecutionTask).toHaveBeenCalledTimes(2),
    );
    expect(mockClient.createProductionSegment).toHaveBeenCalledTimes(1);

    // 也可从头重新跑分镜；创建新任务成功后才切走旧确认卡。
    fireEvent.click(
      container.querySelector('[data-slot="restart-storyboard"]')!,
    );
    await waitFor(() => expect(mockClient.createAITask).toHaveBeenCalledTimes(1));
    expect(mockClient.discardExecutionTask).not.toHaveBeenCalled();
  });

  it("补充选材只创建局部素材调整任务，并携带当前稳定分镜", async () => {
    const stableDecisions = {
      scenes: [{ title: "开场", startSec: 0, endSec: 12, summary: "开场介绍" }],
      cards: [{ sceneIdx: 0, kind: "quote", content: "大家好", at: 0 }],
      visualSlots: [],
      broll: [],
      subtitles: [{ index: 1, startSec: 0, endSec: 6, zh: "大家好", en: "Hello" }],
      srtLines: [{ index: 1, startSec: 0, endSec: 6, text: "大家好" }],
      directorReview: {
        status: "ready",
        summary: "当前方案可渲染",
        issues: [],
        source: "ai",
      },
    };
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "ai-adjust-base", status: "awaiting_confirmation" },
    ]);
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultType: "video_decisions",
        resultData: {
          decisions: stableDecisions,
          inventory: [
            {
              assetId: "asset-project-extra",
              label: "项目补充录屏.mov",
              kind: "video",
              description: "",
              source: "manual",
            },
          ],
        },
      },
    ]);
    mockClient.listMaterialLinks.mockResolvedValue([
      {
        id: "link-project-extra",
        entityType: "asset",
        entityId: "asset-project-extra",
        role: "broll",
      },
    ]);
    mockClient.getAsset.mockImplementation(async (input: unknown) => {
      const assetId = (input as { params?: { assetId?: string } }).params?.assetId;
      return assetId === "asset-project-extra"
        ? {
            assetType: "video",
            name: "项目补充录屏.mov",
            fileSize: null,
          }
        : { fileSize: null };
    });

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() => expect(container.textContent).toContain("分场预览"));
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);

    fireEvent.change(
      container.querySelector(
        '[aria-label="将 项目补充录屏.mov 放入场景"]',
      )!,
      { target: { value: "0" } },
    );
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "应用补充选材",
      )!,
    );

    await waitFor(() => expect(mockClient.createAITask).toHaveBeenCalledTimes(1));
    const request = (mockClient.createAITask.mock.calls as unknown as Array<[
      {
        body: {
          attemptId?: string;
          inputData: Record<string, unknown>;
        };
      },
    ]>)[0]![0] as {
      body: {
        attemptId?: string;
        inputData: Record<string, unknown>;
      };
    };
    expect(request.body.attemptId).toMatch(/^materials-/);
    expect(request.body.inputData).toMatchObject({
      adjustmentMode: "materials",
      baseDecisions: stableDecisions,
      manualMaterialAssignments: [
        expect.objectContaining({
          assetId: "asset-project-extra",
          sceneIdx: 0,
        }),
      ],
    });
  });

  it("点击确认后不等任务 ID 就立即展示保存/建任务进度，任务创建后原地接上执行卡", async () => {
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "ai-loading", status: "awaiting_confirmation" },
    ]);
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultType: "video_decisions",
        resultData: {
          decisions: {
            scenes: [
              { title: "开场", startSec: 0, endSec: 12, summary: "开场介绍" },
            ],
            cards: [],
            broll: [],
            subtitles: [
              { index: 1, startSec: 0, endSec: 6, zh: "大家好", en: "Hello" },
            ],
            srtLines: [
              { index: 1, startSec: 0, endSec: 6, text: "大家好" },
            ],
          },
          inventory: [],
        },
      },
    ]);
    const save = deferred<
      Awaited<ReturnType<typeof mockClient.confirmProductionEditingPlan>>
    >();
    const create = deferred<
      Awaited<ReturnType<typeof mockClient.createExecutionTask>>
    >();
    mockClient.confirmProductionEditingPlan.mockImplementationOnce(
      async () => save.promise,
    );
    mockClient.createExecutionTask.mockImplementationOnce(
      async () => create.promise,
    );

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() => expect(container.textContent).toContain("分场预览"));
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);

    const confirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "确认决策,进入渲染",
    );
    fireEvent.click(confirm!);

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="render-launch-loading"]')
          ?.textContent,
      ).toContain("正在保存分镜方案"),
    );
    expect(mockClient.createExecutionTask).not.toHaveBeenCalled();

    save.resolve({
      id: "prod-1",
      status: state.prodStatus,
      recordingConfig: { videoEditingPlan: { revision: 1 } },
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="render-launch-loading"]')
          ?.textContent,
      ).toContain("正在创建渲染任务"),
    );

    create.resolve({
      id: "exec-loading",
      execType: "video.render",
      status: "queued",
      spec: {
        taskType: "video.render",
        goal: "渲染成片",
        inputs: [],
        params: {},
        constraints: {},
      },
      manifest: null,
      adoptedAssetIds: [],
      errorMessage: null,
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-card"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="confirmed-render-progress"]')
        ?.textContent,
    ).toContain("渲染任务进行中");
  });

  it("刷新恢复在跑渲染后，执行卡和已确认分镜共用同一运行状态", async () => {
    const recoveredDecisions = {
      scenes: [{ title: "开场", startSec: 0, endSec: 12, summary: "开场介绍" }],
      cards: [],
      broll: [
        { sceneIdx: 0, assetId: "asset-saved", at: 0, durationSec: 3 },
      ],
      subtitles: [{ index: 1, startSec: 0, endSec: 6, zh: "大家好", en: "Hello" }],
      srtLines: [{ index: 1, startSec: 0, endSec: 6, text: "大家好" }],
    };
    mockClient.getOutputProduction.mockResolvedValue({
      id: "prod-1",
      status: "rendering",
      recordingConfig: {
        videoEditingPlan: {
          revision: 3,
          decisions: recoveredDecisions,
          inventory: [
            {
              assetId: "asset-saved",
              label: "恢复后的项目录屏",
              kind: "video",
              description: "",
            },
          ],
          renderProps: { delivery: { width: 1920, height: 1080, fps: 30 } },
          sourceRenderTaskId: "exec-running",
        },
      },
    });
    mockClient.listExecutionTasks.mockResolvedValue([
      {
        id: "exec-running",
        execType: "video.render",
        status: "running",
        adoptedAssetIds: [],
        errorMessage: null,
      },
    ]);
    mockClient.getExecutionTask.mockResolvedValue({
      id: "exec-running",
      execType: "video.render",
      status: "running",
      spec: {
        taskType: "video.render",
        goal: "渲染成片",
        inputs: [],
        params: {},
        constraints: {},
      },
      manifest: null,
      adoptedAssetIds: [],
      errorMessage: null,
    });

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="confirmed-render-progress"]')
          ?.textContent,
      ).toContain("渲染任务进行中"),
    );
    expect(
      container.querySelector('[data-slot="execution-task-card"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="confirmed-decisions-notice"]'),
    ).not.toBeNull();
    const recoveredSelect = container.querySelector(
      '[data-testid="broll-0"] select',
    ) as HTMLSelectElement;
    expect(recoveredSelect.options[0]?.textContent).toContain(
      "恢复后的项目录屏",
    );
    expect(recoveredSelect.options[0]?.textContent).toContain("素材已不可用");
    expect(recoveredSelect.value).toBe("asset-saved");
    expect(
      container.querySelector('[aria-label="移除 B-roll:恢复后的项目录屏"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "请先移除或重新选择 1 条已不可用素材",
    );

    fireEvent.click(
      container.querySelector(
        '[aria-label="移除 B-roll:恢复后的项目录屏"]',
      )!,
    );
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "确认决策,进入渲染",
      )!,
    );
    await waitFor(() =>
      expect(mockClient.confirmProductionEditingPlan).toHaveBeenCalled(),
    );
    expect(mockClient.confirmProductionEditingPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          plan: expect.objectContaining({
            decisions: expect.objectContaining({ broll: [] }),
            inventory: [],
          }),
        }),
      }),
    );
  });

  it("项目最新执行任务覆盖方案里保存的旧 sourceRenderTaskId", async () => {
    mockClient.getOutputProduction.mockResolvedValue({
      id: "prod-1",
      status: "rendering",
      recordingConfig: {
        videoEditingPlan: {
          revision: 4,
          decisions: { scenes: [], cards: [], broll: [], subtitles: [], srtLines: [] },
          inventory: [],
          renderProps: { delivery: { width: 1920, height: 1080, fps: 30 } },
          sourceRenderTaskId: "exec-old-failed",
        },
      },
    });
    mockClient.listExecutionTasks.mockResolvedValue([
      {
        id: "exec-latest-running",
        execType: "video.render",
        status: "running",
        adoptedAssetIds: [],
        errorMessage: null,
      },
      {
        id: "exec-old-failed",
        execType: "video.render",
        status: "failed",
        adoptedAssetIds: [],
        errorMessage: "Chromium DevTools 启动超时",
      },
    ]);
    mockClient.getExecutionTask.mockImplementation(async (input?: unknown) => {
      const taskId = (input as { params: { taskId: string } }).params.taskId;
      return {
        id: taskId,
        execType: "video.render",
        status: taskId === "exec-latest-running" ? "running" : "failed",
        spec: { taskType: "video.render", goal: "渲染成片", inputs: [], params: {}, constraints: {} },
        manifest: null,
        adoptedAssetIds: [],
        errorMessage: taskId === "exec-old-failed" ? "Chromium DevTools 启动超时" : null,
      };
    });

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    await waitFor(() =>
      expect(mockClient.getExecutionTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "exec-latest-running" } }),
      ),
    );
    expect(
      container.querySelector('[data-slot="execution-task-card"]')?.getAttribute("data-status"),
    ).toBe("running");
    expect(container.textContent).not.toContain("随包的 Chromium 浏览器缺失");
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
    // ExecutionTaskCard 显人话失败提示 + 重试(失败可恢复)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-error"]')
          ?.textContent ?? "",
      ).toContain("这一步没跑成"),
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
    expect(container.textContent).toContain("分镜统筹中");
  });

  it("[T-308] 有历史成片时,当前 running 四决策仍优先恢复(旧 succeeded render 不得遮住新任务)", async () => {
    // 项目已有一次成功成片,用户改稿后重新发起四决策并离页。回来应接当前任务,
    // 不能因先扫到历史 succeeded render 就提前 return、让页面重新出现「生成」按钮。
    mockClient.listExecutionTasks.mockResolvedValueOnce([
      {
        id: "exec-old-done",
        execType: "video.render",
        status: "succeeded",
        adoptedAssetIds: ["asset-old-final"],
        errorMessage: null,
      },
    ]);
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "dec-current-run", status: "running" },
    ]);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    await waitFor(() =>
      expect(mockClient.getTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "dec-current-run" } }),
      ),
    );
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    expect(container.textContent).toContain("分镜统筹中");
    expect(
      container.querySelector('[data-slot="dispatch-decisions"]'),
    ).toBeNull();
  });

  it("[T-548] 失败任务卡内重试后跟踪新 taskId，成片幂等关联项目、完成 export 并恢复内联预览", async () => {
    let retryAdopted = false;
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
            cards: [],
            broll: [],
            subtitles: [],
            srtLines: [],
          },
          inventory: [],
        },
      },
    ]);
    mockClient.createExecutionTask
      .mockResolvedValueOnce({
        id: "exec-old-failed",
        execType: "video.render",
        status: "queued",
        spec: {
          taskType: "video.render",
          goal: "渲染成片",
          inputs: [],
          params: {},
          constraints: {},
        },
        manifest: null,
        adoptedAssetIds: [],
        errorMessage: null,
      })
      .mockResolvedValueOnce({
        id: "exec-retry-success",
        execType: "video.render",
        status: "queued",
        spec: {
          taskType: "video.render",
          goal: "渲染成片",
          inputs: [],
          params: {},
          constraints: {},
        },
        manifest: null,
        adoptedAssetIds: [],
        errorMessage: null,
      });
    mockClient.getExecutionTask.mockImplementation(
      async (rawInput?: unknown) =>
        (rawInput as { params: { taskId: string } }).params.taskId ===
        "exec-retry-success"
          ? retryAdopted
            ? {
              id: "exec-retry-success",
              execType: "video.render",
              status: "succeeded",
              spec: {
                taskType: "video.render",
                goal: "渲染成片",
                inputs: [],
                params: {},
                constraints: {},
              },
              manifest: null,
              adoptedAssetIds: ["asset-final-retry"],
              errorMessage: null,
            }
            : {
                id: "exec-retry-success",
                execType: "video.render",
                status: "awaiting_confirmation",
                spec: {
                  taskType: "video.render",
                  goal: "渲染成片",
                  inputs: [],
                  params: {},
                  constraints: {},
                },
                manifest: {
                  taskType: "video.render",
                  artifacts: [
                    {
                      path: "out/final.mp4",
                      fileName: "final.mp4",
                      size: 11_900_000,
                      mimeType: "video/mp4",
                    },
                  ],
                  summary: "渲染完成，等待采纳",
                },
                adoptedAssetIds: [],
                errorMessage: null,
              }
          : {
              id: "exec-old-failed",
              execType: "video.render",
              status: "failed",
              spec: {
                taskType: "video.render",
                goal: "渲染成片",
                inputs: [],
                params: {},
                constraints: {},
              },
              manifest: null,
              adoptedAssetIds: [],
              errorMessage: "ffmpeg not found on PATH",
            },
    );
    mockClient.confirmExecutionTask.mockImplementation(
      async (rawInput?: unknown) => {
        expect(
          (rawInput as { params: { taskId: string } }).params.taskId,
        ).toBe("exec-retry-success");
        retryAdopted = true;
        return {
          id: "exec-retry-success",
          execType: "video.render",
          status: "succeeded",
          spec: {
            taskType: "video.render",
            goal: "渲染成片",
            inputs: [],
            params: {},
            constraints: {},
          },
          manifest: null,
          adoptedAssetIds: ["asset-final-retry"],
          errorMessage: null,
        };
      },
    );

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() =>
      expect(container.textContent).toContain("分场预览"),
    );
    await uploadVideo(container);
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "确认决策,进入渲染",
      )!,
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-error"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(
      container.querySelector('[data-slot="execution-task-retry"]')!,
    );
    fireEvent.click(
      container.querySelector('[data-slot="execution-task-retry-submit"]')!,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="execution-task-adopt"]'),
      ).not.toBeNull(),
    );
    // 渲染产物只是候选；用户尚未采纳时不得提前写项目 usage / export。
    expect(
      (
        mockClient.createMaterialLink.mock.calls as unknown as Array<
          [{ body?: { entityId?: string } }]
        >
      ).some(
        (call) =>
          call[0]?.body?.entityId === "asset-final-retry",
      ),
    ).toBe(false);
    expect(mockClient.completeExport).not.toHaveBeenCalled();
    fireEvent.click(
      container.querySelector('[data-slot="execution-task-adopt"]')!,
    );

    await waitFor(() =>
      expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            projectId: "p-1",
            contentOutputId: "out-1",
            entityType: "asset",
            entityId: "asset-final-retry",
            role: "final",
            stage: "production",
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(mockClient.completeExport).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { exportId: "exp-1" },
          body: { resultAssetId: "asset-final-retry" },
        }),
      ),
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="production-final-video"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="render-env-hint"]'),
    ).toBeNull();
  });

  it("[T-548] 重启后按 retryOf 找回旧版脱离 project 的成功重试，并补项目主成片与 usage", async () => {
    const oldFailed = {
      id: "exec-project-old",
      execType: "video.render",
      status: "failed",
      spec: { params: {} },
      adoptedAssetIds: [],
      errorMessage: "ffmpeg not found on PATH",
    };
    const orphanSucceeded = {
      id: "exec-orphan-retry",
      execType: "video.render",
      status: "succeeded",
      spec: {
        taskType: "video.render",
        goal: "渲染成片",
        inputs: [],
        params: { retryOf: "exec-project-old" },
        constraints: {},
      },
      manifest: null,
      adoptedAssetIds: ["asset-existing-final"],
      errorMessage: null,
    };
    mockClient.listExecutionTasks.mockImplementation(
      async (rawInput?: unknown) =>
        (rawInput as { query: { projectId?: string } }).query.projectId
          ? [oldFailed]
          : [orphanSucceeded, oldFailed],
    );
    mockClient.getExecutionTask.mockResolvedValue(orphanSucceeded);
    mockClient.listAssetUsage.mockResolvedValue([
      {
        projectId: "p-1",
        contentOutputId: "out-1",
        entityType: "asset",
        entityId: "asset-existing-final",
        role: "final",
        stage: "production",
      },
    ]);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);

    await waitFor(() =>
      expect(mockClient.listAssetUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { assetId: "asset-existing-final" },
        }),
      ),
    );
    expect(mockClient.createMaterialLink).not.toHaveBeenCalled();
    // 历史页面态没有旧 exportId，使用既有 outputs.patch 修复项目主成片。
    await waitFor(() =>
      expect(mockClient.patchOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { outputId: "out-1" },
          body: { primaryAssetId: "asset-existing-final" },
        }),
      ),
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="production-final-video"]'),
      ).not.toBeNull(),
    );
  });

  // ── [T-366a] 制作方式二选一(上传成品直登成片) ────────────────────────────────

  it("[T-366a] 默认「在应用内制作」= 现状流零破坏;切换按钮在,成品上传区不在", () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    expect(
      container.querySelector('[data-slot="method-creatoros"]')?.getAttribute("data-active"),
    ).toBe("true");
    expect(dispatchButton(container)).toBeTruthy(); // 现状四决策链 UI 原样
    expect(
      container.querySelector('[data-slot="production-final-upload"]'),
    ).toBeNull();
  });

  it("[T-366a] 上传成品:跳过四决策/渲染,export 建档+complete(resultAssetId=成品),状态机补记中间态到 ready", async () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    fireEvent.click(container.querySelector('[data-slot="method-upload"]')!);
    expect(
      container.querySelector('[data-slot="production-orientation"]'),
    ).toBeNull();
    const file = new File(["final-bytes"], "成片.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput(container, "上传成品视频"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(mockClient.completeExport).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { exportId: "exp-1" },
          body: { resultAssetId: "asset-video-1" },
        }),
      ),
    );
    // 上传链复用(assetType=video)+ 用料链 role=final(与粗剪 clip 隔离)。
    expect(mockClient.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ assetType: "video" }),
      }),
    );
    expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ role: "final", stage: "production" }),
      }),
    );
    // export 建档挂在真 productionId 上。
    expect(mockClient.createProductionExport).toHaveBeenCalledWith(
      expect.objectContaining({ params: { productionId: "prod-1" } }),
    );
    // 状态机「补记中间态」:相邻步进 recording→editing→rendering→ready(不开非相邻跳)。
    await waitFor(() => {
      const statuses = mockClient.putOutputProduction.mock.calls.map(
        (c) => (c[0] as { body: { status?: string } }).body.status,
      );
      expect(statuses).toEqual(["recording", "editing", "rendering", "ready"]);
    });
    // 跳过四决策与渲染:两类任务都绝不发起。
    expect(mockClient.createAITask).not.toHaveBeenCalled();
    expect(mockClient.createExecutionTask).not.toHaveBeenCalled();
    // §5.1⑤ 飞轮不脱钩:成功文案明示盲预测/发布物料/登记发布照常。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="final-notice"]')?.textContent,
      ).toContain("盲预测 / 发布物料 / 登记发布照常可用"),
    );
  });

  it("[T-366a] 坏文件诚实拒收:非 mp4/mov 格式拒;探针读不出时长拒 —— 都不进上传链", async () => {
    const { container } = render(
      <ProductionWorkbench
        {...makeProps({ readVideoDuration: async () => null })}
      />,
    );
    fireEvent.click(container.querySelector('[data-slot="method-upload"]')!);

    // ① 格式收窄:.avi 直接拒。
    fireEvent.change(fileInput(container, "上传成品视频"), {
      target: { files: [new File(["x"], "成片.avi", { type: "video/avi" })] },
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="final-error"]')?.textContent,
      ).toContain("只收 mp4 / mov"),
    );
    // ② 探针失败(时长读不出)→ 拒收不直登 ready。
    fireEvent.change(fileInput(container, "上传成品视频"), {
      target: { files: [new File(["x"], "坏.mp4", { type: "video/mp4" })] },
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="final-error"]')?.textContent,
      ).toContain("已拒收"),
    );
    expect(mockClient.createUpload).not.toHaveBeenCalled();
    expect(mockClient.completeExport).not.toHaveBeenCalled();
  });

  it("[T-366a §5.1③] 成片已被 publication 登记 → 禁覆盖(提示解除登记,不静默换片)", async () => {
    state.prodStatus = "ready";
    mockClient.listPublications.mockResolvedValue([{ id: "pub-1" }]);
    const { container } = render(
      <ProductionWorkbench {...makeProps({ initialStatus: "ready" })} />,
    );
    fireEvent.click(container.querySelector('[data-slot="method-upload"]')!);
    // 探测到已登记 → 锁提示 + 选择器禁用。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="final-pub-locked"]')?.textContent,
      ).toContain("不能覆盖已登记的事实"),
    );
    expect(
      (container.querySelector(
        '[data-slot="production-final-picker"]',
      ) as HTMLButtonElement).disabled,
    ).toBe(true);
    // 绕过按钮直接触发 change(防御纵深):handler 同样拒,绝不进上传链。
    fireEvent.change(fileInput(container, "上传成品视频"), {
      target: {
        files: [new File(["x"], "新成片.mp4", { type: "video/mp4" })],
      },
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="final-error"]')?.textContent,
      ).toContain("不能覆盖已登记的事实"),
    );
    expect(mockClient.createUpload).not.toHaveBeenCalled();
  });

  it("[T-366a VP-03] 可退回:切到上传成品再切回,应用内制作链 UI 原样恢复", async () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    fireEvent.click(container.querySelector('[data-slot="method-upload"]')!);
    expect(
      container.querySelector('[data-slot="production-decisions"]'),
    ).toBeNull();
    fireEvent.click(container.querySelector('[data-slot="method-creatoros"]')!);
    expect(
      container.querySelector('[data-slot="production-decisions"]'),
    ).toBeTruthy();
    expect(dispatchButton(container)).toBeTruthy();
  });

  // ── [T-366b] 素材包导出 ─────────────────────────────────────────────────────

  it("[T-366b] 导出素材包:诚实门文案在;点击调 op(真 productionId)并给下载结果;无四决策附空态注记", async () => {
    mockClient.exportProductionMaterials.mockResolvedValue({
      assetId: "asset-zip-1",
      downloadUrl: "http://localhost/blob/zip?token=t",
      fileName: "素材包-上下文工程-20260717.zip",
      fileCount: 6,
      totalBytes: 1234,
      hasDecisions: false,
    });
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    // 诚实门:UI 明示非剪映工程。
    expect(
      container.querySelector('[data-slot="production-material-export"]')
        ?.textContent,
    ).toContain("不是可一键导入的剪映工程");

    fireEvent.click(container.querySelector('[data-slot="export-materials"]')!);
    await waitFor(() =>
      expect(mockClient.exportProductionMaterials).toHaveBeenCalledWith(
        expect.objectContaining({ params: { productionId: "prod-1" } }),
      ),
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="export-done"]')?.textContent,
      ).toContain("素材包-上下文工程-20260717.zip"),
    );
    // §5.1② 空态诚实透传:未跑四决策 → 明示说明是素材清单。
    expect(
      container.querySelector('[data-slot="export-done"]')?.textContent,
    ).toContain("未跑四决策");
  });

  it("[T-366b] 预计大小:素材 fileSize 求和显示;读不到不编数", async () => {
    mockClient.listMaterialLinks.mockResolvedValue([
      { entityType: "asset", entityId: "a1", role: "broll", stage: "production", createdAt: "2026-07-17T00:00:00.000Z" },
    ]);
    mockClient.getAsset.mockResolvedValue({ fileSize: 10 * 1024 * 1024 });
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="export-estimate"]')?.textContent,
      ).toContain("10.0 MB"),
    );
  });

  it("[T-366b] 打包失败诚实报错(不给假下载)", async () => {
    mockClient.exportProductionMaterials.mockRejectedValue(
      new Error("素材总量超出 zip 4GB 上限,无法一次打包 —— 请分批(如先剔除部分 B-roll)导出"),
    );
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    fireEvent.click(container.querySelector('[data-slot="export-materials"]')!);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="export-error"]')?.textContent,
      ).toContain("4GB 上限"),
    );
    expect(container.querySelector('[data-slot="export-done"]')).toBeNull();
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

// ── [T-387c] 备料③ B-roll 自动聚合(来源徽标 + 人可剔 → excludedAssetIds)────────

describe("ProductionWorkbench — T-387c B-roll 自动聚合", () => {
  it("[T-739] 空项目不采信旧脚本 assetRefs，也不读取历史 thesis_tree", async () => {
    mockClient.listArtifacts.mockResolvedValue([
      { id: "art-script", artifactType: "output_script" },
      { id: "art-thesis", artifactType: "thesis_tree" },
    ]);
    mockClient.getArtifact.mockImplementation((async (input: unknown) => {
      const id = (input as { params?: { artifactId?: string } }).params?.artifactId;
      return { currentVersionId: id === "art-thesis" ? "v-thesis" : "v-script" };
    }) as never);
    mockClient.listArtifactVersions.mockImplementation((async (input: unknown) => {
      const id = (input as { params?: { artifactId?: string } }).params?.artifactId;
      if (id === "art-thesis") {
        return [{
          id: "v-thesis",
          versionNumber: 1,
          contentData: { nodes: [{ materialRefs: [{ id: "thesis-only" }] }] },
        }];
      }
      return [{
        id: "v-script",
        versionNumber: 1,
        contentData: {
          sections: [{ visual: { description: "录屏", assetRefs: ["script-only"] } }],
        },
      }];
    }) as never);
    mockClient.listMaterialLinks.mockResolvedValue([]);
    mockClient.getAsset.mockImplementation((async (input: unknown) => {
      const id = (input as { params?: { assetId?: string } }).params?.assetId;
      return { assetType: "image", name: id, fileSize: null };
    }) as never);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() => expect(mockClient.listMaterialLinks).toHaveBeenCalled());

    expect(container.querySelector('[data-slot="broll-auto"]')).toBeNull();
    expect(container.textContent).not.toContain("script-only");
    expect(container.textContent).not.toContain("thesis-only");
    expect(mockClient.getAsset).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { assetId: "script-only" } }),
    );
    const artifactReads = mockClient.getArtifact.mock.calls as unknown as Array<
      [{ params: { artifactId: string } }]
    >;
    expect(artifactReads.map((call) => call[0].params.artifactId)).toEqual([
      "art-script",
    ]);
  });

  it("脚本点名素材 + 弹药资产自动列入(来源徽标);剔除后 dispatch 带 excludedAssetIds", async () => {
    // 脚本 artifact(output_script)当前版本带凝固 visual 点名 a-script。
    mockClient.listArtifacts.mockResolvedValue([
      { id: "art-s", artifactType: "output_script" },
    ]);
    mockClient.getArtifact.mockResolvedValue({ currentVersionId: "v1" });
    mockClient.listArtifactVersions.mockResolvedValue([
      {
        id: "v1",
        versionNumber: 1,
        contentData: {
          sections: [
            {
              heading: "1. 钩子",
              body: "口播：x",
              visual: { description: "d", assetRefs: ["a-script"], missing: [] },
            },
          ],
        },
      },
    ]);
    // 项目弹药链(非 broll/clip)→ ammo 来源。
    mockClient.listMaterialLinks.mockResolvedValue([
      { id: "l0", entityType: "asset", entityId: "a-script", role: "reference" },
      { id: "l1", entityType: "asset", entityId: "a-ammo", role: "reference" },
    ]);
    mockClient.getAsset.mockImplementation((async (input: unknown) => {
      const id = (input as { params?: { assetId?: string } })?.params?.assetId;
      if (id === "a-script")
        return { assetType: "video", name: "点名录屏", fileSize: null };
      if (id === "a-ammo")
        return { assetType: "image", name: "弹药示意图", fileSize: null };
      return { fileSize: null };
    }) as never);

    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="broll-auto-item"]'),
      ).toHaveLength(2);
    });
    const items = container.querySelectorAll('[data-slot="broll-auto-item"]');
    // 来源徽标:脚本画面 优先于 弹药(先到先得排序)。
    expect(items[0]!.getAttribute("data-source")).toBe("script");
    expect(items[0]!.textContent).toContain("脚本画面");
    expect(items[0]!.textContent).toContain("点名录屏");
    expect(items[1]!.getAttribute("data-source")).toBe("ammo");
    expect(items[1]!.textContent).toContain("弹药");

    // 剔除脚本点名项 → data-excluded 翻真。
    fireEvent.click(
      items[0]!.querySelector('[data-slot="broll-auto-toggle"]')!,
    );
    expect(
      container
        .querySelector('[data-slot="broll-auto-item"]')!
        .getAttribute("data-excluded"),
    ).toBe("true");

    // 备料齐 → dispatch 决策:inputData.excludedAssetIds 带被剔项。
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);
    fireEvent.click(dispatchButton(container));
    await waitFor(() =>
      expect(mockClient.createAITask).toHaveBeenCalledTimes(1),
    );
    // createAITask 的 mock 声明无参(calls 元素被推成空元组)→ 显式 cast 取第 0 个入参。
    const calls = mockClient.createAITask.mock.calls as unknown as Array<
      [{ body: { inputData: { excludedAssetIds: string[] } } }]
    >;
    expect(calls[0]![0].body.inputData.excludedAssetIds).toEqual(["a-script"]);
  });

  it("无脚本 visual / 无弹药 → 不渲自动列表(零回归)", async () => {
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    // 等 loadBroll effect 完成(listMaterialLinks 被调过)。
    await waitFor(() =>
      expect(mockClient.listMaterialLinks).toHaveBeenCalled(),
    );
    expect(container.querySelector('[data-slot="broll-auto"]')).toBeNull();
  });

  it("[T-309] 已有决策后上传 B-roll → 旧候选作废并允许重新决策，上传边严格落 project role=broll", async () => {
    mockClient.listAITasks.mockResolvedValueOnce([
      { id: "decision-old", status: "awaiting_confirmation" },
    ]);
    mockClient.listTaskResults.mockResolvedValueOnce([
      {
        resultType: "video_decisions",
        resultData: {
          decisions: {
            scenes: [{ title: "开场", startSec: 0, endSec: 12, summary: "" }],
            cards: [],
            broll: [],
            subtitles: [],
            srtLines: [],
          },
          inventory: [],
        },
      },
    ]);
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="video-decision-preview"]'),
      ).not.toBeNull(),
    );
    await uploadVideo(container);
    await uploadSrt(container, GOOD_SRT);

    const picker = container.querySelector(
      '[data-slot="broll-picker"] input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(picker, {
      target: {
        files: [
          new File(["image"], "发布成功截图.png", { type: "image/png" }),
        ],
      },
    });

    await waitFor(() =>
      expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            projectId: "p-1",
            role: "broll",
            stage: "production",
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mockClient.cancelTask).toHaveBeenCalledWith(
        expect.objectContaining({ params: { taskId: "decision-old" } }),
      ),
    );
    expect(
      container.querySelector('[data-slot="video-decision-preview"]'),
    ).toBeNull();
    expect(dispatchButton(container).disabled).toBe(false);
    expect(container.textContent).toContain("素材已更新");
  });

  it("[T-309] B-roll 上传后用料链登记失败必须可见，不得假报上传成功", async () => {
    mockClient.createMaterialLink.mockRejectedValueOnce(
      new Error("material link write failed"),
    );
    const { container } = render(<ProductionWorkbench {...makeProps()} />);
    const picker = container.querySelector(
      '[data-slot="broll-picker"] input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(picker, {
      target: {
        files: [new File(["image"], "截图.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(container.textContent).toContain("material link write failed"),
    );
  });
});
