import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  MultimodalConfigError,
  MultimodalGenerationError,
  createFakeAdapter,
  createFakeAsyncVideoAdapter,
  type MultimodalProviderRegistry,
} from "@creatoros/ai-worker";

// asset.generate runner 单测(SPEC 2026-07-01 §3 / M2)。这里用 M1 的 **真** 多模态工厂
// (generateImage/generateVideo)+ M1 的 **fake provider**(同步 image / fake 异步 video)注入,
// 真跑装配:resolve→生成→落存储(fake assets 端口)→建 asset→候选;以及轮询超时→cancelTask。
// 不 mock 工厂本身 —— 只把 registry 换成 fake adapter,故 [gate-F1]/[gate-F2] 的异步链路
// (submit→轮询→拿 bytes)被真代码路径覆盖。
//
// 不 mock @creatoros/ai-worker —— runner 内 `await import(...)` 取的是 **真** generateImage/
// generateVideo(真工厂逻辑),只把 registry 换成 fake adapter(由 deps 注入)。故工厂分派 +
// video 异步轮询(submit→poll→retrieve)都是真代码路径,fake 只替换 provider 这一层。

import { runAssetGenerate } from "./asset-generate-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

// 一个可断言的 ai 假实现 + assets 假端口 + resolveMultimodalSpec 假解析。
function makeDeps(opts: {
  registry: MultimodalProviderRegistry;
  provider?: string;
  kind?: "image" | "video";
  channelManaged?: boolean;
  resolveThrows?: boolean;
  createdAssetId?: string;
  runtimeByTask?: Map<string, Record<string, unknown>>;
}) {
  const runtimeByTask = opts.runtimeByTask ?? new Map<string, Record<string, unknown>>();
  const markRunning = vi.fn(async () => undefined);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        assetId?: string | null;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  // [DATA-H07] runner 失败清理 seam(asset 已建、候选未记成 → best-effort 丢弃 pending 资产)。
  const discardGeneratedAsset = vi.fn(async () => undefined);
  const createGeneratedAsset = vi.fn(
    async (
      _c: RequestContext,
      input: {
        assetType: "image" | "video";
        name: string;
        description?: string;
        bytes: Uint8Array;
        mimeType: string;
        pending?: boolean;
      },
    ) => ({
      id: opts.createdAssetId ?? "asset-gen-1",
      name: input.name,
      assetType: input.assetType,
    }),
  );
  const resolveMultimodalSpec = vi.fn(
    async (
      _c: RequestContext,
      capability: "image.generate" | "video.generate",
    ) => {
      if (opts.resolveThrows) {
        throw new MultimodalConfigError(
          `capability "${capability}" 未配置生图/生视频模型`,
        );
      }
      return {
        provider: opts.provider ?? "fake",
        baseUrl: null,
        model: capability === "image.generate" ? "image-01" : "video-01",
        token: "k",
        kind: (capability === "image.generate" ? "image" : "video") as
          | "image"
          | "video",
        ...(opts.channelManaged
          ? { displayModelKey: "channel-managed" as const }
          : {}),
      };
    },
  );
  // [T-376] 失败原因步骤流 seam:runner 失败时 recordStep(kind:"error") 写真实原因。
  const recordStep = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ) => undefined,
  );
  const getTaskRuntimeData = vi.fn(async (_ctx: RequestContext, taskId: string) =>
    runtimeByTask.get(taskId) ?? {},
  );
  const putMultimodalProviderCheckpoint = vi.fn(
    async (
      _ctx: RequestContext,
      taskId: string,
      checkpoint: Record<string, unknown>,
    ) => {
      runtimeByTask.set(taskId, {
        ...(runtimeByTask.get(taskId) ?? {}),
        multimodalProviderCheckpoint: { ...checkpoint },
      });
    },
  );
  return {
    deps: {
      ai: {
        markRunning,
        recordCandidate,
        cancelTask,
        discardGeneratedAsset,
        recordStep,
        getTaskRuntimeData,
        putMultimodalProviderCheckpoint,
      } as never,
      resolveMultimodalSpec,
      registry: opts.registry,
      assets: { createGeneratedAsset },
    },
    markRunning,
    recordCandidate,
    cancelTask,
    discardGeneratedAsset,
    createGeneratedAsset,
    resolveMultimodalSpec,
    recordStep,
    getTaskRuntimeData,
    putMultimodalProviderCheckpoint,
    runtimeByTask,
  };
}

describe("runAssetGenerate — image(同步)装配", () => {
  it("resolve(image.generate)→生成→落存储(建 asset)→generated_asset 候选,带真 assetId", async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    const registry = { fake: createFakeAdapter({ image: bytes }) };
    const { deps, markRunning, recordCandidate, createGeneratedAsset, resolveMultimodalSpec } =
      makeDeps({ registry, createdAssetId: "asset-img-42" });

    await runAssetGenerate(
      ctx,
      {
        id: "t1",
        projectId: "p1",
        inputData: { prompt: "扁平隐喻图", kind: "image", aspectRatio: "9:16" },
      },
      deps,
    );

    expect(markRunning).toHaveBeenCalledTimes(1);
    expect(resolveMultimodalSpec).toHaveBeenCalledWith(ctx, "image.generate");
    // 真工厂真把 fake 的 bytes 交给 assets 端口落存储。
    expect(createGeneratedAsset).toHaveBeenCalledTimes(1);
    const assetArg = createGeneratedAsset.mock.calls[0]![1];
    expect(assetArg.assetType).toBe("image");
    expect(assetArg.mimeType).toBe("image/png");
    expect(Array.from(assetArg.bytes)).toEqual([10, 20, 30]);
    // [DATA-H07] 资产生为 pending 候选态(采纳前不进素材库,人采纳才翻 active,铁律②)。
    expect(assetArg.pending).toBe(true);
    // 候选:generated_asset + 真 assetId(既在 assetId 列,也在 resultData)。
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const cand = recordCandidate.mock.calls[0]![2];
    expect(cand.resultType).toBe("generated_asset");
    expect(cand.assetId).toBe("asset-img-42");
    expect((cand.resultData as { assetId: string }).assetId).toBe("asset-img-42");
    expect((cand.resultData as { aspectRatio?: string }).aspectRatio).toBe("9:16");
  });

  it("相同提示词的两次独立生成使用不同幂等号，不会误复用上一张图", async () => {
    const keys: string[] = [];
    const registry = {
      fake: {
        generateImage: async (
          _spec: unknown,
          options: { idempotencyKey?: string },
        ) => {
          keys.push(options.idempotencyKey ?? "");
          return { assetBytes: new Uint8Array([1, 2, 3]) };
        },
      },
    } as unknown as MultimodalProviderRegistry;
    const made = makeDeps({ registry });

    await runAssetGenerate(
      ctx,
      { id: "image-run-a", projectId: "p1", inputData: { prompt: "同一提示词" } },
      made.deps,
    );
    await runAssetGenerate(
      ctx,
      { id: "image-run-b", projectId: "p1", inputData: { prompt: "同一提示词" } },
      made.deps,
    );

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it.each(["image", "video"] as const)(
    "官方渠道 %s 提交连续 502 时沿用同一幂等号退避恢复",
    async (kind) => {
      const keys: string[] = [];
      let attempts = 0;
      const generate = async (
        _spec: unknown,
        options: { idempotencyKey?: string },
      ) => {
        keys.push(options.idempotencyKey ?? "");
        attempts += 1;
        if (attempts < 3) {
          throw new MultimodalGenerationError("official gateway 502", {
            reason: "upstream",
            stage: "submit",
            status: 502,
            retryable: true,
          });
        }
        return { assetBytes: new Uint8Array([4, 5, 6]) };
      };
      const registry = {
        fake:
          kind === "image"
            ? { generateImage: generate }
            : { generateVideo: generate },
      } as unknown as MultimodalProviderRegistry;
      const made = makeDeps({ registry, kind, channelManaged: true });
      const sleep = vi.fn(async (_ms: number) => undefined);
      (made.deps as Record<string, unknown>).sleep = sleep;

      await runAssetGenerate(
        ctx,
        {
          id: `managed-${kind}-502`,
          projectId: "p1",
          inputData: { prompt: "生成一份素材", kind },
        },
        made.deps,
      );

      expect(attempts).toBe(3);
      expect(new Set(keys).size).toBe(1);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 3_000]);
      expect(made.recordCandidate).toHaveBeenCalledOnce();
      expect(made.cancelTask).not.toHaveBeenCalled();
    },
  );

  it("[T-735] 生图响应已收到但本地落盘失败时，重试不再发第二次计费请求", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    const firstGenerateImage = vi.fn(async () => ({
      assetBytes: new Uint8Array([4, 5, 6]),
    }));
    const first = makeDeps({
      registry: {
        fake: {
          generateImage: firstGenerateImage,
        } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "image",
      runtimeByTask,
    });
    first.createGeneratedAsset.mockRejectedValueOnce(
      new Error("local object storage unavailable"),
    );

    await runAssetGenerate(
      ctx,
      {
        id: "t-image-received",
        projectId: "p1",
        inputData: { prompt: "同一张付费图片", kind: "image" },
      },
      first.deps,
    );

    expect(firstGenerateImage).toHaveBeenCalledOnce();
    expect(runtimeByTask.get("t-image-received")).toMatchObject({
      multimodalProviderCheckpoint: { state: "response_received" },
    });

    const retryGenerateImage = vi.fn(async () => ({
      assetBytes: new Uint8Array([7, 8, 9]),
    }));
    const retry = makeDeps({
      registry: {
        fake: {
          generateImage: retryGenerateImage,
        } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "image",
      runtimeByTask,
    });
    await runAssetGenerate(
      ctx,
      {
        id: "t-image-received-retry",
        retryOfTaskId: "t-image-received",
        projectId: "p1",
        inputData: { prompt: "同一张付费图片", kind: "image" },
      },
      retry.deps,
    );

    expect(retryGenerateImage).not.toHaveBeenCalled();
    expect(retry.cancelTask).toHaveBeenCalledOnce();
  });
});

describe("runAssetGenerate — video(异步:submit→轮询→拿 bytes)装配 [gate-F2]", () => {
  it("fake 异步 provider(3 次轮询后 ready)→拿 bytes→落存储→建 asset→候选;真轮询过", async () => {
    const bytes = new Uint8Array([7, 7, 7, 7]);
    const asyncAdapter = createFakeAsyncVideoAdapter({
      bytes,
      attemptsUntilReady: 3,
    });
    const registry = { fake: asyncAdapter };
    const { deps, recordCandidate, createGeneratedAsset, resolveMultimodalSpec } =
      makeDeps({ registry, kind: "video", createdAssetId: "asset-vid-9" });

    await runAssetGenerate(
      ctx,
      {
        id: "t2",
        projectId: "p1",
        inputData: {
          prompt:
            "【当前确认稿绑定】\n段落原文:工具变了，模糊流程没有变\n【视觉方案】\n同一个纸箱任务在两台机器间传递，单一平滑运镜",
          kind: "video",
        },
      },
      deps,
    );

    expect(resolveMultimodalSpec).toHaveBeenCalledWith(ctx, "video.generate");
    // 适配器内部真轮询过(pollCount ≥ attemptsUntilReady)—— 异步链路被真代码覆盖。
    expect(asyncAdapter.pollCount()).toBeGreaterThanOrEqual(3);
    // 轮询拿到的 bytes 真落存储(video/mp4)。
    expect(createGeneratedAsset).toHaveBeenCalledTimes(1);
    const assetArg = createGeneratedAsset.mock.calls[0]![1];
    expect(assetArg.assetType).toBe("video");
    expect(assetArg.mimeType).toBe("video/mp4");
    expect(Array.from(assetArg.bytes)).toEqual([7, 7, 7, 7]);
    expect(assetArg.description).toBe("同一个纸箱任务在两台机器间传递，单一平滑运镜");
    // 候选 generated_asset。
    const cand = recordCandidate.mock.calls[0]![2];
    expect(cand.resultType).toBe("generated_asset");
    expect(cand.assetId).toBe("asset-vid-9");
    expect(cand.resultData).toMatchObject({ durationSec: 6, resolution: "768P" });
  });

  it("[T-735] provider job 已提交后本地失败，重试沿原 job 恢复而不二次提交", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    let submitCount = 0;
    const firstAdapter = {
      generateVideo: async (
        _spec: unknown,
        options: {
          onJobSubmitted?: (jobId: string) => Promise<void>;
        },
      ) => {
        submitCount += 1;
        await options.onJobSubmitted?.("provider-job-paid-once");
        throw new MultimodalGenerationError("download interrupted", {
          reason: "download",
          stage: "download",
          retryable: true,
        });
      },
    } as unknown as MultimodalProviderRegistry[string];
    const first = makeDeps({
      registry: { fake: firstAdapter },
      kind: "video",
      runtimeByTask,
    });

    await runAssetGenerate(
      ctx,
      {
        id: "t-paid-source",
        projectId: "p1",
        inputData: { prompt: "同一条付费视频", kind: "video" },
      },
      first.deps,
    );

    expect(submitCount).toBe(1);
    expect(runtimeByTask.get("t-paid-source")).toMatchObject({
      multimodalProviderCheckpoint: {
        state: "submitted",
        jobId: "provider-job-paid-once",
      },
    });

    const resumed = vi.fn(
      async (
        _spec: unknown,
        options: { resumeJobId?: string; onJobSubmitted?: unknown },
      ) => {
        expect(options.resumeJobId).toBe("provider-job-paid-once");
        expect(options.onJobSubmitted).toBeTypeOf("function");
        return { assetBytes: new Uint8Array([8, 8, 8]) };
      },
    );
    const retry = makeDeps({
      registry: {
        fake: { generateVideo: resumed } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "video",
      runtimeByTask,
      createdAssetId: "asset-recovered",
    });
    await runAssetGenerate(
      ctx,
      {
        id: "t-paid-retry",
        retryOfTaskId: "t-paid-source",
        projectId: "p1",
        inputData: { prompt: "同一条付费视频", kind: "video" },
      },
      retry.deps,
    );

    expect(submitCount).toBe(1);
    expect(resumed).toHaveBeenCalledOnce();
    expect(retry.recordCandidate).toHaveBeenCalledOnce();
  });

  it("[T-735] 提交响应丢失标记 unknown，重试不会盲目再发一次计费请求", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    const generateVideo = vi.fn(async () => {
      throw new MultimodalGenerationError("submit response lost", {
        reason: "network",
        stage: "submit",
        retryable: false,
      });
    });
    const first = makeDeps({
      registry: {
        fake: { generateVideo } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "video",
      runtimeByTask,
    });
    await runAssetGenerate(
      ctx,
      {
        id: "t-submit-unknown",
        projectId: "p1",
        inputData: { prompt: "不能重复计费", kind: "video" },
      },
      first.deps,
    );
    expect(generateVideo).toHaveBeenCalledOnce();
    expect(runtimeByTask.get("t-submit-unknown")).toMatchObject({
      multimodalProviderCheckpoint: { state: "submit_unknown" },
    });

    const retry = makeDeps({
      registry: {
        fake: { generateVideo } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "video",
      runtimeByTask,
    });
    await runAssetGenerate(
      ctx,
      {
        id: "t-submit-unknown-retry",
        retryOfTaskId: "t-submit-unknown",
        projectId: "p1",
        inputData: { prompt: "不能重复计费", kind: "video" },
      },
      retry.deps,
    );
    expect(generateVideo).toHaveBeenCalledOnce();
    expect(retry.cancelTask).toHaveBeenCalledOnce();
  });

  it("[T-735] 计费调用前先持久化 submitting，任务号检查点写失败也禁止重试二次提交", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    let submitCount = 0;
    const first = makeDeps({
      registry: {},
      kind: "video",
      runtimeByTask,
    });
    first.putMultimodalProviderCheckpoint.mockImplementation(
      async (
        _ctx: RequestContext,
        taskId: string,
        checkpoint: Record<string, unknown>,
      ) => {
        if (checkpoint.state === "submitted") {
          throw new Error("checkpoint storage unavailable after provider accepted job");
        }
        runtimeByTask.set(taskId, {
          ...(runtimeByTask.get(taskId) ?? {}),
          multimodalProviderCheckpoint: { ...checkpoint },
        });
      },
    );
    const generateVideo = vi.fn(
      async (
        _spec: unknown,
        options: { onJobSubmitted?: (jobId: string) => Promise<void> },
      ) => {
        expect(runtimeByTask.get("t-submit-checkpoint")).toMatchObject({
          multimodalProviderCheckpoint: { state: "submitting" },
        });
        submitCount += 1;
        await options.onJobSubmitted?.("provider-job-checkpoint-lost");
        return { assetBytes: new Uint8Array([1, 2, 3]) };
      },
    );
    first.deps.registry = {
      fake: {
        generateVideo,
      } as unknown as MultimodalProviderRegistry[string],
    };

    await runAssetGenerate(
      ctx,
      {
        id: "t-submit-checkpoint",
        projectId: "p1",
        inputData: { prompt: "只允许提交一次", kind: "video" },
      },
      first.deps,
    );

    expect(submitCount).toBe(1);
    expect(runtimeByTask.get("t-submit-checkpoint")).toMatchObject({
      multimodalProviderCheckpoint: { state: "submitting" },
    });

    const retryGenerateVideo = vi.fn(async () => ({
      assetBytes: new Uint8Array([9, 9, 9]),
    }));
    const retry = makeDeps({
      registry: {
        fake: {
          generateVideo: retryGenerateVideo,
        } as unknown as MultimodalProviderRegistry[string],
      },
      kind: "video",
      runtimeByTask,
    });
    await runAssetGenerate(
      ctx,
      {
        id: "t-submit-checkpoint-retry",
        retryOfTaskId: "t-submit-checkpoint",
        projectId: "p1",
        inputData: { prompt: "只允许提交一次", kind: "video" },
      },
      retry.deps,
    );

    expect(retryGenerateVideo).not.toHaveBeenCalled();
    expect(retry.cancelTask).toHaveBeenCalledOnce();
  });
});

describe("runAssetGenerate — 失败诚实处置(cancelTask,不假成功)", () => {
  it("轮询超时(fake 异步 provider 永不 ready)→ MultimodalGenerationError → cancelTask", async () => {
    // maxPollAttempts 由适配器控制:这里让 fake 需要 999 次才 ready,但我们注入一个
    // **有上限**的异步适配器 —— 用真 minimax 语义的「超时抛错」由本 fake 直接抛来模拟
    // (fake 异步 provider 无外部 maxPollAttempts,故用一个立即抛超时错的适配器验 task 层处置)。
    const timingOutAdapter = {
      generateVideo: async () => {
        // 模拟 M1 minimax 适配器 pollVideoTask 超出 maxPollAttempts 的终态:抛错。
        const { MultimodalGenerationError } = await import("@creatoros/ai-worker");
        throw new MultimodalGenerationError(
          "MiniMax video task 轮询超时(task_id=fake,60 次未完成)",
        );
      },
    };
    const registry = { fake: timingOutAdapter } as MultimodalProviderRegistry;
    const { deps, recordCandidate, cancelTask, createGeneratedAsset } = makeDeps({
      registry,
      kind: "video",
    });

    await runAssetGenerate(
      ctx,
      { id: "t3", projectId: "p1", inputData: { prompt: "x", kind: "video" } },
      deps,
    );

    // 轮询超时坍缩为 task 层终态:不落候选、不建 asset(生成阶段就失败)、cancelTask 一次。
    expect(createGeneratedAsset).not.toHaveBeenCalled();
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("未配 image.generate model(MultimodalConfigError)→ cancelTask,不落候选", async () => {
    const registry = { fake: createFakeAdapter() };
    const { deps, recordCandidate, cancelTask, recordStep } = makeDeps({
      registry,
      resolveThrows: true,
    });

    await runAssetGenerate(
      ctx,
      { id: "t4", projectId: "p1", inputData: { prompt: "x", kind: "image" } },
      deps,
    );

    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
    // [T-376] 未配置 → 步骤流末条(kind:"error")说「未配置」,不含「已配置,但调用失败」。
    expect(recordStep).toHaveBeenCalledTimes(1);
    const step = recordStep.mock.calls[0]![2];
    expect(step.kind).toBe("error");
    expect(step.text).toContain("未配置");
    expect(step.text).not.toContain("已配置,但调用失败");
  });

  it("[T-376] 配置了但 provider 调用失败(如 key 无效)→ 步骤流记「已配置,但调用失败:<真实原因>」,不冤枉「未配置」", async () => {
    // fake provider 直接抛真实调用错误(模拟 401 invalid api key)。
    const failing = {
      generateImage: async () => {
        throw new Error("minimax API 401: invalid api key");
      },
    } as unknown as MultimodalProviderRegistry[string];
    const registry = { fake: failing } as MultimodalProviderRegistry;
    const { deps, recordCandidate, cancelTask, recordStep } = makeDeps({ registry });

    await runAssetGenerate(
      ctx,
      { id: "t4b", projectId: "p1", inputData: { prompt: "x", kind: "image" } },
      deps,
    );

    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
    expect(recordStep).toHaveBeenCalledTimes(1);
    const step = recordStep.mock.calls[0]![2];
    expect(step.kind).toBe("error");
    expect(step.text).toContain("生图模型已配置,但调用失败");
    expect(step.text).toContain("invalid api key");
    expect(step.text).not.toContain("未配置");
  });

  it("provider 不支持该能力(fake 只出图,却要 video)→ cancelTask", async () => {
    // createFakeAdapter 同时实现 image/video;要验「不支持」用一个只出图的 registry。
    const imageOnly = { generateImage: async () => ({ assetBytes: new Uint8Array([1]) }) };
    const registry = { fake: imageOnly } as MultimodalProviderRegistry;
    const { deps, recordCandidate, cancelTask } = makeDeps({
      registry,
      kind: "video",
    });

    await runAssetGenerate(
      ctx,
      { id: "t5", projectId: "p1", inputData: { prompt: "x", kind: "video" } },
      deps,
    );

    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("缺 prompt → cancelTask(不生成、不落候选)", async () => {
    const registry = { fake: createFakeAdapter() };
    const { deps, recordCandidate, cancelTask, resolveMultimodalSpec } = makeDeps({
      registry,
    });

    await runAssetGenerate(
      ctx,
      { id: "t6", projectId: "p1", inputData: { kind: "image" } },
      deps,
    );

    expect(resolveMultimodalSpec).not.toHaveBeenCalled();
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("[DATA-H07] asset 已建、recordCandidate 失败 → 丢弃该 pending 资产(不留隐身孤儿)+ cancelTask", async () => {
    const registry = { fake: createFakeAdapter({ image: new Uint8Array([1, 2]) }) };
    const {
      deps,
      recordCandidate,
      cancelTask,
      discardGeneratedAsset,
      createGeneratedAsset,
    } = makeDeps({ registry, createdAssetId: "asset-orphan-1" });
    recordCandidate.mockImplementationOnce(async () => {
      throw new Error("record down");
    });

    await runAssetGenerate(
      ctx,
      { id: "t7", projectId: "p1", inputData: { prompt: "x", kind: "image" } },
      deps,
    );

    expect(createGeneratedAsset).toHaveBeenCalledTimes(1);
    // 失败窗口清理:刚建的 pending 资产被 best-effort 丢弃,任务坍缩为 cancelled。
    expect(discardGeneratedAsset).toHaveBeenCalledTimes(1);
    expect(discardGeneratedAsset).toHaveBeenCalledWith(ctx, "asset-orphan-1");
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("[DATA-H07] 生成阶段就失败(asset 未建)→ 不调丢弃(没有可清理的资产)", async () => {
    const registry = { fake: createFakeAdapter() };
    const { deps, discardGeneratedAsset, cancelTask } = makeDeps({
      registry,
      resolveThrows: true,
    });

    await runAssetGenerate(
      ctx,
      { id: "t8", projectId: "p1", inputData: { prompt: "x", kind: "image" } },
      deps,
    );

    expect(discardGeneratedAsset).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
