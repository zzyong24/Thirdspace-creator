import { describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@creatoros/contract";

import {
  parseClassification,
  runAssetClassify,
  type AssetClassifyDeps,
} from "./asset-classify-runner";
import { MultimodalConfigError } from "./multimodal/resolve";

// [T-055h SPEC §6.2 第二层] asset.classify runner —— 未配置诚实跳过 / 图片全链归类 /
// 失败 markFailed;端口全注入,确定性单测。

const ctx = { userId: "u1", requestId: "r1" } as unknown as RequestContext;

// 返回类型交给 TS 推断具体形状(而非 Record<string, Mock>)—— backend 的
// noUncheckedIndexedAccess 下,Record 的属性访问会得 `Mock | undefined`,令 calls.getAssetBytes
// 等被判可空;推断出的具体对象类型则每个 spy 都是确定的。
function makeDeps(over: Partial<AssetClassifyDeps> = {}) {
  const calls = {
    markRunning: vi.fn(async () => undefined),
    recordStep: vi.fn(async () => undefined),
    markSucceeded: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    getAssetBytes: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    })),
    mergeAiAnnotation: vi.fn(async () => undefined),
    assignTags: vi.fn(async () => undefined),
    describeImage: vi.fn(
      async () => '{"tags":["封面","产品"],"description":"宠物洗护产品的封面图"}',
    ),
    resolveVisionSpec: vi.fn(async () => ({
      provider: "siliconflow",
      baseUrl: null,
      model: "Qwen/Qwen2.5-VL-72B-Instruct",
      token: "sk-test",
      kind: "vision" as const,
    })),
  };
  const deps: AssetClassifyDeps = {
    ai: {
      markRunning: calls.markRunning,
      recordStep: calls.recordStep,
      markSucceeded: calls.markSucceeded,
      markFailed: calls.markFailed,
    },
    resolveVisionSpec: calls.resolveVisionSpec,
    assets: {
      getAssetBytes: calls.getAssetBytes,
      mergeAiAnnotation: calls.mergeAiAnnotation,
    },
    assignTags: calls.assignTags,
    describeImage: calls.describeImage,
    ...over,
  };
  return { deps, calls };
}

describe("parseClassification", () => {
  it("剥围栏+收窄字段;不合形 → null", () => {
    expect(
      parseClassification('```json\n{"tags":["封面"],"description":"x"}\n```'),
    ).toEqual({ tags: ["封面"], description: "x" });
    expect(parseClassification("看不懂")).toBeNull();
  });
});

describe("runAssetClassify", () => {
  it("图片全链:VLM → 标签落 taxonomy + 描述进 mediaMetadata + markSucceeded", async () => {
    const { deps, calls } = makeDeps();
    await runAssetClassify(ctx, { id: "t1", inputData: { assetId: "a1" } }, deps);

    expect(calls.markRunning).toHaveBeenCalledWith(ctx, "t1");
    expect(calls.assignTags).toHaveBeenCalledWith(ctx, "a1", ["封面", "产品"]);
    expect(calls.mergeAiAnnotation).toHaveBeenCalledWith(ctx, "a1", {
      aiDescription: "宠物洗护产品的封面图",
    });
    expect(calls.markSucceeded).toHaveBeenCalledWith(ctx, "t1");
    expect(calls.markFailed).not.toHaveBeenCalled();
  });

  it("未配置视觉模型 → 诚实跳过(recordStep skipped + markSucceeded,不假装)", async () => {
    const { deps, calls } = makeDeps({
      resolveVisionSpec: vi.fn(async () => {
        throw new MultimodalConfigError("未配置");
      }),
    });
    await runAssetClassify(ctx, { id: "t2", inputData: { assetId: "a1" } }, deps);

    expect(calls.recordStep).toHaveBeenCalledWith(
      ctx,
      "t2",
      expect.objectContaining({ kind: "skipped" }),
    );
    expect(calls.markSucceeded).toHaveBeenCalled();
    expect(calls.assignTags).not.toHaveBeenCalled();
  });

  it("非图片素材 → 跳过(视频首帧是后续增强)", async () => {
    const { deps, calls } = makeDeps();
    calls.getAssetBytes.mockResolvedValue({
      bytes: new Uint8Array([1]),
      mimeType: "video/mp4",
    });
    await runAssetClassify(ctx, { id: "t3", inputData: { assetId: "a1" } }, deps);
    expect(calls.assignTags).not.toHaveBeenCalled();
    expect(calls.markSucceeded).toHaveBeenCalled();
  });

  it("VLM 输出不合形 → markFailed(诚实失败,不塞垃圾标签)", async () => {
    const { deps, calls } = makeDeps();
    calls.describeImage.mockResolvedValue("我看不懂这张图");
    await runAssetClassify(ctx, { id: "t4", inputData: { assetId: "a1" } }, deps);
    expect(calls.markFailed).toHaveBeenCalled();
    expect(calls.assignTags).not.toHaveBeenCalled();
  });
});
