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
// ── [gate-F6 / DATA-H07] 采纳门:generated_asset(create-then-bind,候选态 pending)──
// 现有唯一的 asset 采纳门是 material_link_list(material.match),它绑定**已存在于素材库**的
// asset(assetId 已在库)。asset.generate 的 asset 是从 AI 字节**新生**的 —— 故:
//   1) 本 runner 在生成期建 asset(字节落存储 + asset 行),但 [DATA-H07] 资产生为
//      **pending 候选态**(T-219 同款机制:素材库 list 按 active 过滤,采纳前不进库、不冒充
//      已入库素材 —— 铁律②「AI 只产候选、人确认后落库」)。
//   2) recordCandidate resultType="generated_asset",携带真 assetId + 预览元信息。
//   3) 采纳门(ai.service confirmTask 的 generated_asset 分支)先把该 asset pending → active
//      (repo.commitGeneratedAsset,幂等),再经**现有 用料链端口**(AiMaterialLinksPort,与
//      material_link_list 同一个 link 调用)绑定到当前项目(entityType:"asset",
//      stage:"production")。
//   4) [DATA-H07] 拒绝(cancelTask)→ ai.service 把仍 pending 的资产软删进回收站;本 runner
//      「asset 已建、recordCandidate 失败」的失败窗口 → catch 里 ai.discardGeneratedAsset
//      best-effort 清理 —— 两条路都不留永久隐身孤儿。

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
      // [DATA-H07] true → 资产生为 pending 候选态(采纳前不进素材库;T-219 机制)。host 端口
      // 把 input 原样透传给 assetsService.createGeneratedAsset(它已支持该字段)。
      pending?: boolean;
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
  // [DATA-H07] 「asset 已建、候选未记成」失败窗口的清理锚:catch 里据此 best-effort 丢弃。
  let createdAssetId: string | null = null;
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

    // 3) 落对象存储 + 建 asset。[DATA-H07] 资产生为 **pending 候选态**(采纳前不进素材库
    //    list;预览经 assets.get/签名 URL 仍可看)。采纳门翻 active + 绑项目;拒绝/失败清理。
    const name = deriveName(prompt, kind);
    const asset = await deps.assets.createGeneratedAsset(ctx, {
      assetType: kind,
      name,
      bytes: assetBytes,
      mimeType: MIME_BY_KIND[kind],
      pending: true,
    });
    createdAssetId = asset.id;

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
    // [DATA-H07] asset 已建但候选没记成(recordCandidate 失败)→ 该 pending 资产没有任何
    // 候选卡指向它,永远无法被采纳/拒绝 → 在这里 best-effort 丢弃(软删进回收站),不留
    // 隐身孤儿。丢弃自身失败只记日志(绝不让清理失败盖掉原始错误)。
    if (createdAssetId) {
      try {
        await deps.ai.discardGeneratedAsset(ctx, createdAssetId);
      } catch (cleanupErr) {
        console.error(
          `[asset-generate-runner] cleanup of pending asset ${createdAssetId} failed:`,
          cleanupErr,
        );
      }
    }
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
