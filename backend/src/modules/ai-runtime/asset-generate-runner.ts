import { createHash } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  MultimodalConfigError,
  MultimodalGenerationError,
  type GenerateVideoOptions,
  type MultimodalProviderRegistry,
} from "@creatoros/ai-worker";
// [T-376] 失败分类人话(「未配置」vs「配置了但调用失败」),写进步骤流末条供前端诚实展示。
import {
  describeMultimodalFailure,
  type MultimodalSpec,
} from "./multimodal/resolve";
import {
  formatErrorDiagnostic,
  safeModelFailureMessage,
} from "./error-diagnostics";

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
      description?: string;
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
  retryOfTaskId?: string | null;
  inputData: Record<string, unknown>;
}

interface ProviderCheckpoint {
  schemaVersion: 1;
  capability: "image.generate" | "video.generate";
  inputFingerprint: string;
  state:
    | "submitting"
    | "submitted"
    | "submit_unknown"
    | "response_received"
    | "rejected";
  jobId?: string;
}

function generationFingerprint(input: {
  capability: string;
  prompt: string;
  aspectRatio?: string;
  durationSec?: number;
  resolution?: string;
  spec: ResolvedMultimodalSpec;
}): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        capability: input.capability,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio ?? null,
        durationSec: input.durationSec ?? null,
        resolution: input.resolution ?? null,
        provider: input.spec.provider,
        baseUrl: input.spec.baseUrl,
        model: input.spec.model,
        serviceId: input.spec.serviceId ?? null,
      }),
    )
    .digest("hex")}`;
}

/**
 * SEMANTIC_BOUNDARY_ALLOW: 这里只剥离工具注入的版本/正文包裹并做长度上限，不判断画面语义；
 * 视觉选择和描述正文仍完全来自编导模型已产出的 prompt。
 */
function generatedAssetDescription(prompt: string): string {
  const marker = "【视觉方案】";
  const visual = prompt.includes(marker)
    ? prompt.split(marker).slice(1).join(marker).trim()
    : prompt.trim();
  const beforeVisual = prompt.includes(marker) ? prompt.split(marker)[0] ?? "" : "";
  const field = (name: string, nextNames: readonly string[]) => {
    const start = beforeVisual.indexOf(`${name}:`);
    if (start < 0) return "";
    const valueStart = start + name.length + 1;
    const next = nextNames
      .map((candidate) => beforeVisual.indexOf(`\n${candidate}:`, valueStart))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    return beforeVisual
      .slice(valueStart, next ?? beforeVisual.length)
      .trim();
  };
  const boundText = field("段落原文", ["画面职责"]);
  const visualPurpose = field("画面职责", []);
  return [
    boundText ? `服务原文:${boundText}` : "",
    visualPurpose ? `画面职责:${visualPurpose}` : "",
    visual ? `视觉方案:${visual}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_000);
}

function parseProviderCheckpoint(
  value: unknown,
  fingerprint: string,
): ProviderCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== 1 ||
    (row.capability !== "image.generate" &&
      row.capability !== "video.generate") ||
    row.inputFingerprint !== fingerprint ||
    (row.state !== "submitting" &&
      row.state !== "submitted" &&
      row.state !== "submit_unknown" &&
      row.state !== "response_received" &&
      row.state !== "rejected")
  ) {
    return null;
  }
  if (
    row.jobId !== undefined &&
    (typeof row.jobId !== "string" || row.jobId.length < 1 || row.jobId.length > 512)
  ) {
    return null;
  }
  return row as unknown as ProviderCheckpoint;
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
  let resolvedSpec: ResolvedMultimodalSpec | null = null;
  let inputFingerprint: string | null = null;
  const kind: "image" | "video" =
    task.inputData.kind === "video" ? "video" : "image";
  const capability =
    kind === "image" ? "image.generate" : "video.generate";
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while生成(可能数十秒~分钟)

    const prompt =
      typeof task.inputData.prompt === "string" ? task.inputData.prompt : "";
    if (!prompt.trim()) {
      throw new Error("asset-generate-runner: inputData.prompt is required");
    }
    const aspectRatio =
      typeof task.inputData.aspectRatio === "string"
        ? task.inputData.aspectRatio
        : undefined;
    const durationSec =
      kind === "video" &&
      typeof task.inputData.durationSec === "number" &&
      Number.isInteger(task.inputData.durationSec)
        ? task.inputData.durationSec
        : kind === "video"
          ? 6
          : undefined;
    const resolution =
      kind === "video" && task.inputData.resolution === "2K" ? "2K" : "768P";

    // 1) 解析用户配的多模态 model(未配 → MultimodalConfigError,下方 catch → cancelTask)。
    const spec = await deps.resolveMultimodalSpec(ctx, capability);
    resolvedSpec = spec;
    inputFingerprint = generationFingerprint({
      capability,
      prompt,
      aspectRatio,
      durationSec,
      resolution,
      spec,
    });

    let resumeJobId: string | undefined;
    if (typeof deps.ai.getTaskRuntimeData === "function") {
      const checkpointTaskId = task.retryOfTaskId ?? task.id;
      const runtimeData = await deps.ai.getTaskRuntimeData(ctx, checkpointTaskId);
      const checkpoint = parseProviderCheckpoint(
        runtimeData.multimodalProviderCheckpoint,
        inputFingerprint,
      );
      if (
        checkpoint?.capability === capability &&
        (checkpoint.state === "submitting" ||
          checkpoint.state === "submit_unknown")
      ) {
        throw new MultimodalGenerationError(
          `${kind === "video" ? "视频" : "图片"}生成请求的提交结果未知，禁止自动重复提交`,
          { reason: "network", stage: "submit", retryable: false },
        );
      }
      if (
        kind === "image" &&
        checkpoint?.capability === capability &&
        checkpoint.state === "response_received"
      ) {
        throw new MultimodalGenerationError(
          "图片已由模型生成，但本地保存未完成，禁止自动重复生成",
          { reason: "unknown", stage: "local_persist", retryable: false },
        );
      }
      if (
        kind === "video" &&
        checkpoint?.capability === capability &&
        checkpoint.state === "submitted" &&
        checkpoint.jobId
      ) {
        resumeJobId = checkpoint.jobId;
      }
    }

    // 2) 生成字节。上层统一 `{ assetBytes }`([gate-F1]);异步 video 的轮询/超时封在适配器内
    //    —— generateVideo 内部 submit→poll→retrieve,超时抛 MultimodalGenerationError,坍缩到
    //    下方 catch。工厂按 spec.provider 分派;从 ai-worker 动态引入(与其它 runner 同款)。
    const { generateImage, generateVideo } = await import("@creatoros/ai-worker");
    const idempotencyKey = inputFingerprint;
    if (
      !resumeJobId &&
      typeof deps.ai.putMultimodalProviderCheckpoint === "function"
    ) {
      // T-735：先落“即将提交”再触碰计费接口。进程若在 POST 与 provider job id
      // 回写之间退出，重试会看到 submitting 并停止，不能把同一意图再计费一次。
      await deps.ai.putMultimodalProviderCheckpoint(ctx, task.id, {
        schemaVersion: 1,
        capability,
        inputFingerprint,
        state: "submitting",
      });
    }
    const videoOptions: GenerateVideoOptions = {
      prompt,
      aspectRatio,
      ...(kind === "video" ? { durationSec, resolution } : {}),
      idempotencyKey,
      ...(resumeJobId ? { resumeJobId } : {}),
      onJobSubmitted: async (jobId) => {
        if (typeof deps.ai.putMultimodalProviderCheckpoint !== "function") return;
        await deps.ai.putMultimodalProviderCheckpoint(ctx, task.id, {
          schemaVersion: 1,
          capability: "video.generate",
          inputFingerprint,
          state: "submitted",
          jobId,
        });
      },
    };
    const { assetBytes } =
      kind === "image"
        ? await generateImage(
            spec,
            { prompt, aspectRatio, idempotencyKey },
            deps.registry,
          )
        : await generateVideo(spec, videoOptions, deps.registry);
    if (!assetBytes || assetBytes.byteLength === 0) {
      throw new Error("asset-generate-runner: provider returned no bytes");
    }
    if (
      kind === "image" &&
      typeof deps.ai.putMultimodalProviderCheckpoint === "function"
    ) {
      // 同步生图没有可恢复的 provider job id。先记录响应已收到，再落本地资产；
      // 后续本地失败只能人工恢复，绝不自动再发一次计费 POST。
      await deps.ai.putMultimodalProviderCheckpoint(ctx, task.id, {
        schemaVersion: 1,
        capability,
        inputFingerprint,
        state: "response_received",
      });
    }

    // 3) 落对象存储 + 建 asset。[DATA-H07] 资产生为 **pending 候选态**(采纳前不进素材库
    //    list;预览经 assets.get/签名 URL 仍可看)。采纳门翻 active + 绑项目;拒绝/失败清理。
    const name = deriveName(prompt, kind);
    const asset = await deps.assets.createGeneratedAsset(ctx, {
      assetType: kind,
      name,
      description: generatedAssetDescription(prompt),
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
        ...(kind === "video" ? { durationSec, resolution } : {}),
      },
    });
  } catch (err) {
    const failure =
      err && typeof err === "object"
        ? (err as { reason?: unknown; stage?: unknown })
        : null;
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : undefined;
    const submitResultUnknown =
      resolvedSpec &&
      inputFingerprint &&
      failure?.stage === "submit" &&
      (failure.reason === "network" ||
        failure.reason === "response_contract" ||
        (failure.reason === "upstream" &&
          typeof status === "number" &&
          status >= 500));
    const submitKnownRejected =
      resolvedSpec &&
      inputFingerprint &&
      (err instanceof MultimodalConfigError ||
        (failure?.stage === "submit" &&
          typeof status === "number" &&
          status >= 400 &&
          status < 500 &&
          status !== 408));
    if (
      resolvedSpec &&
      inputFingerprint &&
      (submitResultUnknown || submitKnownRejected) &&
      typeof deps.ai.putMultimodalProviderCheckpoint === "function"
    ) {
      try {
        await deps.ai.putMultimodalProviderCheckpoint(ctx, task.id, {
          schemaVersion: 1,
          capability,
          inputFingerprint,
          state: submitResultUnknown ? "submit_unknown" : "rejected",
        });
      } catch {
        /* 原提交未知错误优先；checkpoint 失败由同一诊断链暴露。 */
      }
    }
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
    // [T-376] 失败原因分类后写进步骤流末条(kind:"error",stepNo 高位保证排最后)——
    // 前端失败卡读 listTaskSteps 末条原样展示,不再把一切失败吞成「还没配置生图模型」。
    // best-effort:记录失败绝不盖掉 cancelTask 收终态。
    try {
      const label = task.inputData.kind === "video" ? "生视频" : "生图";
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 99,
        kind: "error",
        text:
          resolvedSpec?.displayModelKey === "channel-managed"
            ? safeModelFailureMessage(err, resolvedSpec)
            : describeMultimodalFailure(err, label),
        toolCalls: [],
      });
    } catch {
      /* 记原因失败不阻断终态收口 */
    }
    // Best-effort cancel; swallow so a background failure never crashes the server.
    // 「轮询超时 / 未配 key / 生成失败 / 内容审核」全部坍缩到这里 → 诚实终态(cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    console.error(
      `[asset-generate-runner] generate failed task=${task.id} ${formatErrorDiagnostic(
        err,
        { omitMessage: resolvedSpec?.displayModelKey === "channel-managed" },
      )}`,
    );
  }
}

// 素材名:取 prompt 前若干字 + 类型后缀(录制页素材库列表可读;非唯一,asset id 才是主键)。
function deriveName(prompt: string, kind: "image" | "video"): string {
  const visualMarker = "【视觉方案】";
  const semanticPrompt = prompt.includes(visualMarker)
    ? prompt.split(visualMarker).slice(1).join(visualMarker)
    : prompt;
  const head = semanticPrompt.trim().slice(0, 24).replace(/\s+/g, " ");
  const suffix = kind === "image" ? "生成图" : "生成视频";
  return head ? `${head} · ${suffix}` : `AI ${suffix}`;
}
