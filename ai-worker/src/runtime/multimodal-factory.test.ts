import { describe, it, expect } from "vitest";
import {
  generateImage,
  generateVideo,
  MultimodalConfigError,
  type MultimodalProviderRegistry,
  type MultimodalSpec,
} from "./multimodal-factory";
import {
  createFakeAdapter,
  createFakeAsyncVideoAdapter,
  createImageOnlyFakeAdapter,
} from "./multimodal-factory.fake";

const imageSpec: MultimodalSpec = {
  provider: "fake",
  baseUrl: null,
  model: "image-01",
  token: "tok",
  kind: "image",
};
const videoSpec: MultimodalSpec = { ...imageSpec, model: "video-01", kind: "video" };

describe("multimodal provider 工厂 —— 按 provider 分派 + 统一 { assetBytes } 契约", () => {
  it("generateImage 分派到适配器,返注入的已知 bytes(契约投影)", async () => {
    const registry: MultimodalProviderRegistry = {
      fake: createFakeAdapter({ image: new Uint8Array([1, 2, 3]) }),
    };
    const out = await generateImage(imageSpec, { prompt: "iceberg" }, registry);
    expect(Array.from(out.assetBytes)).toEqual([1, 2, 3]);
  });

  it("generateVideo(同步 fake)返 bytes,上层无 taskId 感知", async () => {
    const registry: MultimodalProviderRegistry = {
      fake: createFakeAdapter({ video: new Uint8Array([9, 9, 9]) }),
    };
    const out = await generateVideo(videoSpec, { prompt: "funnel" }, registry);
    expect(Array.from(out.assetBytes)).toEqual([9, 9, 9]);
    // 上层拿到的只有 assetBytes —— 无 taskId 字段([gate-F1] 契约)。
    expect(Object.keys(out)).toEqual(["assetBytes"]);
  });

  // [gate-F1] + [gate-F2 前置]:fake 异步 provider —— 先 taskId、N 次轮询后返 bytes。
  // 验「异步性封在适配器内、上层只见 { assetBytes }」的装配真成立。
  it("generateVideo(fake 异步:submit→poll×N→bytes)—— 轮询在适配器内消化,上层不改", async () => {
    const asyncAdapter = createFakeAsyncVideoAdapter({
      bytes: new Uint8Array([42, 42, 42]),
      attemptsUntilReady: 3,
    });
    const registry: MultimodalProviderRegistry = { fake: asyncAdapter };
    const out = await generateVideo(videoSpec, { prompt: "spinning cube" }, registry);
    expect(Array.from(out.assetBytes)).toEqual([42, 42, 42]);
    // 真轮询过 3 次(证明异步状态机跑了,不是直接返回)。
    expect(asyncAdapter.pollCount()).toBe(3);
    // 上层契约仍只有 assetBytes —— taskId/pollCount 不在返回体里。
    expect(Object.keys(out)).toEqual(["assetBytes"]);
  });

  it("provider 不支持该能力 → MultimodalConfigError(image-only 适配器调 video)", async () => {
    const registry: MultimodalProviderRegistry = {
      fake: createImageOnlyFakeAdapter(),
    };
    await expect(
      generateVideo(videoSpec, { prompt: "x" }, registry),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
    // 但它出图正常。
    const img = await generateImage(imageSpec, { prompt: "x" }, registry);
    expect(img.assetBytes.length).toBeGreaterThan(0);
  });

  it("未注册的 provider → MultimodalConfigError(可被上层接住 → cancelTask)", async () => {
    const registry: MultimodalProviderRegistry = {};
    await expect(
      generateImage({ ...imageSpec, provider: "unknown" }, { prompt: "x" }, registry),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
  });
});
