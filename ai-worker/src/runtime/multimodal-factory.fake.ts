// Fake 多模态适配器(测试用,零成本)—— 注入已知 bytes,不走网络。给单测验 provider 工厂
// 装配 + 上层 `{ assetBytes }` 契约。含一个 **fake 异步 provider**(先返 taskId、N 次轮询后返
// bytes),坐实 [gate-F1] 注释里的证伪、并作为 [gate-F2](M2 video 轮询状态机)的前置装配。

import type {
  GeneratedAsset,
  GenerateImageOptions,
  GenerateVideoOptions,
  MultimodalProviderAdapter,
  MultimodalSpec,
} from "./multimodal-factory";

/** 最简 fake:image/video 都同步返注入的已知 bytes。验工厂分派 + 契约投影。 */
export function createFakeAdapter(
  bytesByKind: { image?: Uint8Array; video?: Uint8Array } = {},
): MultimodalProviderAdapter {
  return {
    generateImage: async (
      _spec: MultimodalSpec,
      _opts: GenerateImageOptions,
    ): Promise<GeneratedAsset> => ({
      assetBytes: bytesByKind.image ?? new Uint8Array([1, 2, 3]),
    }),
    generateVideo: async (
      _spec: MultimodalSpec,
      _opts: GenerateVideoOptions,
    ): Promise<GeneratedAsset> => ({
      assetBytes: bytesByKind.video ?? new Uint8Array([9, 9, 9]),
    }),
  };
}

/** 一个只出图、不出视频的 fake provider —— 验「provider 不支持某能力时工厂报明确错误」。 */
export function createImageOnlyFakeAdapter(
  bytes = new Uint8Array([7, 7]),
): MultimodalProviderAdapter {
  return {
    generateImage: async () => ({ assetBytes: bytes }),
    // 无 generateVideo —— 工厂调 generateVideo 时应抛 MultimodalConfigError。
  };
}

/**
 * Fake **异步** provider —— 模拟真实厂商 video 的「提交 → 轮询 taskId → 下载」:
 * 前 (attemptsUntilReady-1) 次轮询返 "pending",最后一次才返 bytes。**轮询状态机全封在适配器
 * 内部**,`generateVideo` 对上层仍只返 `{ assetBytes }`(taskId/轮询次数不外泄)——这正是
 * [gate-F1] 要证伪的「异步也能塞进适配器内、上层不改」。exposes `pollCount` 供断言真轮询过。
 */
export function createFakeAsyncVideoAdapter(options: {
  bytes?: Uint8Array;
  attemptsUntilReady?: number;
}): MultimodalProviderAdapter & { readonly pollCount: () => number } {
  const bytes = options.bytes ?? new Uint8Array([42, 42, 42]);
  const attemptsUntilReady = options.attemptsUntilReady ?? 3;
  let polls = 0;
  let taskId: string | null = null;

  return {
    pollCount: () => polls,
    generateVideo: async (): Promise<GeneratedAsset> => {
      // 1) 提交 → 内部持有 taskId(不外泄)
      taskId = `fake-task-${Math.random().toString(36).slice(2, 8)}`;
      // 2) 轮询直到 ready —— 内部循环,上层不感知
      while (true) {
        polls += 1;
        const ready = polls >= attemptsUntilReady;
        if (ready) break;
        // 真适配器此处会 await sleep(interval);fake 即时继续(零成本)。
      }
      // 3) "下载" → 返字节。taskId 已消化,上层只见 { assetBytes }。
      void taskId;
      return { assetBytes: bytes };
    },
  };
}
