import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  MultimodalConfigError,
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
  resolveThrows?: boolean;
  createdAssetId?: string;
}) {
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
      };
    },
  );
  return {
    deps: {
      ai: {
        markRunning,
        recordCandidate,
        cancelTask,
        discardGeneratedAsset,
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
        inputData: { prompt: "一段 B-roll", kind: "video" },
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
    // 候选 generated_asset。
    const cand = recordCandidate.mock.calls[0]![2];
    expect(cand.resultType).toBe("generated_asset");
    expect(cand.assetId).toBe("asset-vid-9");
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
    const { deps, recordCandidate, cancelTask } = makeDeps({
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
