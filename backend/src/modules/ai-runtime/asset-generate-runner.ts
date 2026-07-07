import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type {
  MultimodalSpec,
  MultimodalProviderRegistry,
} from "@creatoros/ai-worker";

// asset.generate runner (L5 录制 · SPEC 2026-07-01 §3 + §8 M2) —— AI 生成素材 → 落对象存储 →
// 建 asset → 记候选(非直接物化)。仿 research-runner 的生命周期(markRunning → 跑节点 →
// recordCandidate;任一失败 → cancelTask + 诚实错误)。跑在 M1 多模态工厂上(用户可配 provider,
// 铁律:绝不写死 MiniMax)。
//
// ── [gate-F2] video 异步轮询在 task 层的态 ────────────────────────────────────────
// video 的「提交 → 轮询 task_id → 下载」封在 M1 minimax 适配器内(generateVideo 上层仍只返
// `{ assetBytes }`)。但 asset.generate task 从 markRunning 到产出可能数十秒~分钟。CreatorOS
// 侧的处置:
//   - dispatch 是后台 `void runAssetGenerate(...)`(persistence-client),HTTP 立即返回,不阻塞;
//     UI 轮询 getTask/listResults 看态(queued→running→awaiting_confirmation | cancelled)。
//   - 适配器 maxPollAttempts 超时 → 抛 MultimodalGenerationError;本 runner catch → cancelTask
//     (running→cancelled,UI 渲染为失败态)。即「长耗时/轮询超时」在 task 层坍缩为一个诚实终态,
//     绝不把 task 卡在 running 里空转。
//   - 单测用 M1 的 fake 异步 provider(先 taskId、N 次轮询后返 bytes)验:submit→轮询→拿 bytes→
//     落存储→建 asset→候选;以及一个「永不 ready」的 fake 验轮询超时 → cancelTask。
//
// ── [gate-F6] 采纳门:generated_asset(create-then-bind)───────────────────────────
// 现有唯一的 asset 采纳门是 material_link_list(material.match),它绑定**已存在于素材库**的
// asset(assetId 已在库)。asset.generate 的 asset 是从 AI 字节**新生**的 —— 故:
//   1) 本 runner 在生成期就建好 asset(字节落存储 + asset 行),不管采纳与否字节都已持久化
//      (与 research-runner 产出具体候选同构;asset 生下来是 active 但**未绑任何项目**)。
//   2) recordCandidate resultType="generated_asset",携带真 assetId + 预览元信息。
//   3) 采纳门(ai.service confirmTask 的 generated_asset 分支)把该 asset 经**现有 用料链端口**
//      (AiMaterialLinksPort,与 material_link_list 同一个 link 调用)绑定到当前项目
//      (entityType:"asset", stage:"production")。即复用了现有 asset 绑定门的**端口/动作**,
//      新增的只是「先建后绑」这条 create-then-bind 语义所必需的薄 resultType。

/** 生成一份素材需要的最小规格投影(与 ai-worker MultimodalSpec 结构对齐;host 用
 *  resolveMultimodalSpec 解析后传入)。 */
export type ResolvedMultimodalSpec = MultimodalSpec;

/** 建 asset 的窄端口(host 绑到 assetsService.createGeneratedAsset)—— runner 不直连 assets
 *  repo/存储(前后端分离:走公开服务)。返回新建 asset 的 id + 展示元信息(供候选卡预览)。 */
export interface AssetGenerateAssetsPort {
  createGeneratedAsset(
    ctx: RequestContext,
    input: {
      assetType: "image" | "video";
      name: string;
      bytes: Uint8Array;
      mimeType: string;
    },
  ): Promise<{ id: string; name: string; assetType: string }>;
}

export interface AssetGenerateDeps {
  ai: AiService;
  /** 按 capability(image.generate/video.generate)解析用户配的多模态 model。未配 → 抛
   *  MultimodalConfigError(本 runner catch → cancelTask + 录制页「未配置生图/生视频模型」)。 */
  resolveMultimodalSpec: (
    ctx: RequestContext,
    capability: "image.generate" | "video.generate",
  ) => Promise<ResolvedMultimodalSpec>;
  /** 多模态 provider 适配器注册表(keyed by provider;host 注册真 minimax,单测注册 fake)。 */
  registry: MultimodalProviderRegistry;
  assets: AssetGenerateAssetsPort;
}

export interface AssetGenerateTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// image → image/png, video → video/mp4(MiniMax 出的都是这两种容器;asset 建档用)。
const MIME_BY_KIND: Record<"image" | "video", string> = {
  image: "image/png",
  video: "video/mp4",
};

/**
 * Orchestrate one asset.generate task end to end. Owns its own lifecycle: on ANY failure
 * (未配 key / 生成失败 / 内容审核 / 轮询超时)it cancels the task (running→cancelled, a
 * terminal the UI renders as 失败) — a long-running video that never returns bytes坍缩为
 * cancelled,绝不永久卡 running。
 */
export async function runAssetGenerate(
  ctx: RequestContext,
  task: AssetGenerateTask,
  deps: AssetGenerateDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while生成(可能数十秒~分钟)

    const prompt =
      typeof task.inputData.prompt === "string" ? task.inputData.prompt : "";
    if (!prompt.trim()) {
      throw new Error("asset-generate-runner: inputData.prompt is required");
    }
    const kind: "image" | "video" =
      task.inputData.kind === "video" ? "video" : "image";
    const aspectRatio =
      typeof task.inputData.aspectRatio === "string"
        ? task.inputData.aspectRatio
        : undefined;

    // 1) 解析用户配的多模态 model(未配 → MultimodalConfigError,下方 catch → cancelTask)。
    const capability =
      kind === "image" ? "image.generate" : "video.generate";
    const spec = await deps.resolveMultimodalSpec(ctx, capability);

    // 2) 生成字节。上层统一 `{ assetBytes }`([gate-F1]);异步 video 的轮询/超时封在适配器内
    //    —— generateVideo 内部 submit→poll→retrieve,超时抛 MultimodalGenerationError,坍缩到
    //    下方 catch。工厂按 spec.provider 分派;从 ai-worker 动态引入(与其它 runner 同款)。
    const { generateImage, generateVideo } = await import("@creatoros/ai-worker");
    const { assetBytes } =
      kind === "image"
        ? await generateImage(spec, { prompt, aspectRatio }, deps.registry)
        : await generateVideo(spec, { prompt, aspectRatio }, deps.registry);
    if (!assetBytes || assetBytes.byteLength === 0) {
      throw new Error("asset-generate-runner: provider returned no bytes");
    }

    // 3) 落对象存储 + 建 asset(候选态:asset 生下来 active 但未绑项目)。字节此刻已持久化,
    //    不管采纳与否都在(用户可在素材库看到);采纳只做「绑定到项目/入用料链」。
    const name = deriveName(prompt, kind);
    const asset = await deps.assets.createGeneratedAsset(ctx, {
      assetType: kind,
      name,
      bytes: assetBytes,
      mimeType: MIME_BY_KIND[kind],
    });

    // 4) 记候选(非直接物化,铁律②)。resultType="generated_asset";assetId 走 recordCandidate
    //    的 assetId 列(provenance);resultData 带预览元信息供录制页候选卡渲染 + 采纳。
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: asset.id,
      resultData: {
        assetId: asset.id,
        assetType: kind,
        name: asset.name,
        prompt,
        ...(aspectRatio ? { aspectRatio } : {}),
      },
    });
  } catch (err) {
    // Best-effort cancel; swallow so a background failure never crashes the server.
    // 「轮询超时 / 未配 key / 生成失败 / 内容审核」全部坍缩到这里 → 诚实终态(cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    console.error(
      `[asset-generate-runner] generate failed for task ${task.id}:`,
      err,
    );
  }
}

// 素材名:取 prompt 前若干字 + 类型后缀(录制页素材库列表可读;非唯一,asset id 才是主键)。
function deriveName(prompt: string, kind: "image" | "video"): string {
  const head = prompt.trim().slice(0, 24).replace(/\s+/g, " ");
  const suffix = kind === "image" ? "生成图" : "生成视频";
  return head ? `${head} · ${suffix}` : `AI ${suffix}`;
}
