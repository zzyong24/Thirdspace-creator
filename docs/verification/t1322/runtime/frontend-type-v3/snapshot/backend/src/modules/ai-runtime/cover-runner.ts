import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type {
  ModelSpec,
  MultimodalProviderRegistry,
  CoverBriefOutput,
} from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
// [T-376] 失败分类人话(「未配置」vs「配置了但调用失败」),写进步骤流末条供前端诚实展示。
import {
  describeMultimodalFailure,
  type MultimodalSpec,
} from "./multimodal/resolve";
import {
  formatErrorDiagnostic,
  redactedRawErrorMessage,
  safeModelFailureMessage,
} from "./error-diagnostics";
import { retryExplicitRejectedSubmit } from "./multimodal/retry-submit";
import { readFrozenCoverContext } from "./frozen-cover-context";

// 封面 runner (cover.generate node) —— [T-271] 制作封面链 0→1。
//
// 病根(docs/research/2026-07-12-creative-chain-grounding-audit.md「制作封面链」段):此前无专用封面
// 链——「生成封面」只是对话发**自由文本** → material.generate → asset-generate-runner **原样透传**
// 生图(generateImage(spec,{prompt})),是全链唯一零接地零诚实门的 AI 生成入口(封面上压的文案/数字
// 可随便编)。cover_brief 只是声明的 artifact 类型,零实现。
//
// 修法(本 runner):封面**先产结构化方案**(cover.brief 模板,硬注入立项 brief 核心信息/内容形式 +
// 口播稿主张)→ 封面文案上 T-224 同款诚实门(annotateUngroundedClaims 可溯后处理,数字/命名事实只能
// 从 brief/script/素材提取,标⚠️)→ 生图 prompt **由结构化方案确定性组装**(composeCoverImagePrompt,
// 非对话模型自由文本)→ 走既有 generateImage(image.generate 模型用户可配,铁律:绝不写死 MiniMax)→
// 落对象存储 + 建 asset → 记 generated_asset 候选(**复用既有 asset 采纳门**,铁律②确认门,人采纳才绑项目)。
//
// 与 asset-generate-runner 的关系:那条是「裸 prompt 透传生图」的通用素材生成(保留,非封面用);本
// runner 是封面专用的**接地版**——多了「结构化方案 + 文案诚实门 + 结构化组装 prompt」三层,生图部分
// 复用同一 generateImage/多模态 registry(不重造生图能力)。

/** 建 asset 的窄端口(host 绑到 assetsService.createGeneratedAsset)—— runner 不直连存储。 */
export interface CoverGenerateAssetsPort {
  createGeneratedAsset(
    ctx: RequestContext,
    input: {
      assetType: "image";
      name: string;
      bytes: Uint8Array;
      mimeType: string;
      // [DATA-H07] true → 封面资产生为 pending 候选态(采纳前不进素材库;与 asset.generate
      // 同一采纳门/同一清理路)。host 端口把 input 原样透传给 assetsService.createGeneratedAsset。
      pending?: boolean;
    },
  ): Promise<{ id: string; name: string; assetType: string }>;
}

export interface CoverGenerateDeps extends ContextDeps {
  ai: AiService;
  /** 封面**文案方案**的文本模型(复用 copy.generate capability;结构化节点 modelFor)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** 封面**图**的多模态模型(image.generate;用户可配,铁律绝不写死 MiniMax)。未配 → 抛
   *  MultimodalConfigError,本 runner catch → cancelTask(录制/稿面卡渲「去设置配生图模型」)。 */
  resolveMultimodalSpec: (
    ctx: RequestContext,
    capability: "image.generate" | "image.edit",
  ) => Promise<MultimodalSpec>;
  /** 多模态 provider 适配器注册表(host 注册真 minimax,单测注册 fake)。 */
  registry: MultimodalProviderRegistry;
  // 命名避开 ContextDeps.assets(那是素材库 AssetsReader);这是「建生成 asset」的写端口。
  generatedAssets: CoverGenerateAssetsPort;
  /**
   * [T-380] 以图生图风格参考的读端口(host 绑 assetsService.getAssetBytes,user-scoped)。
   * task.inputData.referenceAssetId 存在时读该素材字节喂生图 adapter(image-to-image)。
   * 可选:未装配 / 读不到 → 诚实降级为纯文生图并在步骤流注记(不假装用了参考图)。
   */
  referenceAssets?: {
    getAssetBytes(
      ctx: RequestContext,
      assetId: string,
    ): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  };
  /** 测试注入；生产默认短退避。 */
  sleep?: (ms: number) => Promise<void>;
}

export interface CoverGenerateTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

import {clampCoverPlan,coverFacets,composeCoverImagePrompt,COVER_VISUAL_REQUIREMENTS_MAX} from "@creatoros/ai-worker/cover";
export {clampCoverPlan,coverFacets,composeCoverImagePrompt,COVER_HEADLINE_MAX,COVER_SUBHEADLINE_MAX,COVER_KEYPOINT_MAX,COVER_KEYPOINTS_MAX,COVER_VISUAL_REQUIREMENTS_MAX,COVER_VISUAL_CONCEPT_MAX,COVER_COMPOSITION_MAX,COVER_PALETTE_MAX,COVER_IMAGE_PROMPT_MAX} from "@creatoros/ai-worker/cover";
export type {ClampedCoverPlan} from "@creatoros/ai-worker/cover";
function clip(v:string|undefined,max:number){const s=(v??"").trim();return s.length>max?s.slice(0,max):s;}

// 封面 asset 名(素材库列表可读;非唯一,asset id 才是主键）。
function deriveCoverName(headline: string): string {
  const head = headline.trim().replace(/\s+/g, " ").slice(0, 16);
  return head ? `${head} · 封面` : "AI 封面";
}

/**
 * 跑一条 cover.generate 任务:结构化封面方案(文案接地)→ 文案诚实门 → 结构化组装生图 prompt →
 * 生图(image.generate 可配)→ 落 asset → 记 generated_asset 候选(复用既有采纳门)。任一步失败
 * (未配文本/生图模型、生成失败、内容审核、轮询超时)→ cancelTask(诚实终态,绝不卡 running）。
 */
export async function runCoverGenerate(
  ctx: RequestContext,
  task: CoverGenerateTask,
  deps: CoverGenerateDeps,
): Promise<void> {
  // [DATA-H07] 「asset 已建、候选未记成」失败窗口的清理锚(与 asset-generate-runner 同款)。
  let createdAssetId: string | null = null;
  let channelManaged = false;
  try {
    await deps.ai.markRunning(ctx, task.id);

    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const userVisualRequirements =
      typeof task.inputData.visualRequirements === "string"
        ? clip(task.inputData.visualRequirements, COVER_VISUAL_REQUIREMENTS_MAX)
        : "";
    const frozenCover = readFrozenCoverContext(task.inputData);
    if (["cover", "publish_cover"].includes(String(task.inputData.kind)) && task.inputData.outputId && !frozenCover) {
      throw new Error("COVER_CONTEXT_SNAPSHOT_REQUIRED");
    }
    const context = frozenCover ?? await assembleCreativeContext(ctx, { projectId: task.projectId, topic }, deps);
    // T-816：dispatch 时冻结的 currentVersion 快照优先于随后装配出的旧 Brief/派生脚本。
    // runner 仍会使用材料做事实诚实门，但“这条内容在说什么”先信当前确认稿正文。
    const frozenScriptSnapshot =
      task.inputData.scriptSnapshot &&
      typeof task.inputData.scriptSnapshot === "object" &&
      !Array.isArray(task.inputData.scriptSnapshot)
        ? (task.inputData.scriptSnapshot as Record<string, unknown>)
        : null;
    const frozenScriptText =
      frozenScriptSnapshot &&
      typeof frozenScriptSnapshot.fullText === "string" &&
      frozenScriptSnapshot.fullText.trim()
        ? frozenScriptSnapshot.fullText
        : "";
    const effectiveContext = frozenScriptText
      ? { ...context, reviewScript: frozenScriptText }
      : context;

    // 1) 结构化封面方案(文案接地）—— 复用 copy.generate 文本模型 + cover.brief 模板(硬锚 brief+script）。
    const spec = await deps.resolveModelSpec(ctx, "copy.generate");
    channelManaged ||= !("engine" in spec) && spec.displayModelKey === "channel-managed";
    const {
      modelFor,
      runStructuredNode,
      getTemplate,
      buildGroundingHaystack,
      annotateUngroundedClaims,
      generateImage,
    } = await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<CoverBriefOutput>({
      model: modelFor(spec),
      // 运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(吃 skill_config_overrides)。
      template: getTemplate("cover.brief"),
      facets: coverFacets(effectiveContext, { userVisualRequirements }),
    });
    const plan = clampCoverPlan(object);

    // 2) 封面文案诚实门(T-224 同款可溯后处理)—— headline/subheadline/keyPoints 里的具体 claim
    //    (数字/命名事实/成绩)必须命中已注入的立项 brief/口播稿/素材/知识库;不可溯 → 非破坏式追加
    //    「⚠️含未溯源数据」标注(不删,提示用户核实出处)。治「封面上压编造数字博眼球」。
    const haystack = buildGroundingHaystack(
      effectiveContext.projectBriefHard,
      effectiveContext.reviewScript,
      effectiveContext.positioningBrief,
      effectiveContext.userMaterialHardBrief,
      effectiveContext.userMaterialRefBrief,
      effectiveContext.knowledgeBrief,
      effectiveContext.topic.title,
      effectiveContext.topic.angle,
    );
    const ungrounded: string[] = [];
    const headlineAnn = annotateUngroundedClaims(plan.headline, haystack);
    ungrounded.push(...headlineAnn.ungrounded);
    const subAnn = annotateUngroundedClaims(plan.subheadline, haystack);
    ungrounded.push(...subAnn.ungrounded);
    const keyPointsAnnotated = plan.keyPoints.map((kp) => {
      const a = annotateUngroundedClaims(kp, haystack);
      ungrounded.push(...a.ungrounded);
      return a.text;
    });

    // 3) 生图 prompt 由结构化方案确定性组装(非自由文本)。用 RAW plan 拼画面(标注只进展示层)。
    const orientation = effectiveContext.orientationHint; // 横屏/竖屏/""
    const imagePrompt = composeCoverImagePrompt(plan, {
      orientation,
      userVisualRequirements,
    });
    const aspectRatio =
      orientation === "竖屏" ? "9:16" : orientation === "横屏" ? "16:9" : undefined;

    // 3.5) [T-380] 以图生图风格参考:inputData.referenceAssetId 存在 → host 端口读该素材
    //      字节(user-scoped)喂 adapter 的 image-to-image。读不到/端口未装配 → **诚实降级**
    //      为纯文生图并注记步骤(绝不假装用了参考图);读到 → 注记「已带参考图」。
    const referenceAssetId =
      typeof task.inputData.referenceAssetId === "string" &&
      task.inputData.referenceAssetId.trim()
        ? task.inputData.referenceAssetId.trim()
        : null;
    let referenceImage: { bytes: Uint8Array; mimeType: string } | undefined;
    if (referenceAssetId) {
      let refNote: string;
      if (!deps.referenceAssets) {
        refNote = "参考图能力未接入,本次按纯文生图生成(未使用参考图)";
      } else {
        try {
          const ref = await deps.referenceAssets.getAssetBytes(
            ctx,
            referenceAssetId,
          );
          if (ref && ref.bytes.byteLength > 0) {
            referenceImage = { bytes: ref.bytes, mimeType: ref.mimeType };
            refNote = "已读取参考封面,将以它为风格参考生图(以图生图)";
          } else {
            refNote = `参考素材读取不到(id=${referenceAssetId}),本次按纯文生图生成(未使用参考图)`;
          }
        } catch {
          refNote = `参考素材读取失败(id=${referenceAssetId}),本次按纯文生图生成(未使用参考图)`;
        }
      }
      try {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: 0,
          kind: "step",
          text: refNote,
          toolCalls: [],
        });
      } catch {
        /* 注记失败不阻断生成 */
      }
    }

    // 4) 纯文生图走 image.generate；真实读到参考图时走独立 image.edit，避免把文生图模型 ID
    //    错送到 /images/edits。两项能力分别由已验签渠道图或本地配置裁决，互不猜测。
    const imageCapability = referenceImage ? "image.edit" : "image.generate";
    const imgSpec = await deps.resolveMultimodalSpec(ctx, imageCapability);
    channelManaged ||= imgSpec.displayModelKey === "channel-managed";
    const idempotencyKey = `sha256:${createHash("sha256")
      .update(JSON.stringify({ taskId: task.id, imagePrompt, aspectRatio, model: imgSpec.model }))
      .digest("hex")}`;
    const generateOptions = {
      prompt: imagePrompt,
      ...(aspectRatio ? { aspectRatio } : {}),
      // [T-380] 有参考图才带(adapter 走 images/edits / subject_reference);无则纯文生图零回归。
      ...(referenceImage ? { referenceImage } : {}),
      idempotencyKey,
    };
    let retryNoticeRecorded = false;
    const generated = await retryExplicitRejectedSubmit({
      operation: () => generateImage(imgSpec, generateOptions, deps.registry),
      sleep: deps.sleep,
      // 官方受管网关识别同一 Idempotency-Key；提交断连时可安全沿用原任务有限恢复。
      // 用户自配中转站不开放，避免未知幂等实现导致重复计费。
      allowIdempotentUnknownSubmitRetry:
        imgSpec.displayModelKey === "channel-managed",
      onRetry: async () => {
        if (retryNoticeRecorded) return;
        retryNoticeRecorded = true;
        try {
          await deps.ai.recordStep(ctx, task.id, {
            stepNo: 4,
            kind: "step",
            text: "生图服务暂时繁忙，正在自动恢复；封面方案已保留，不会重新策划。",
            toolCalls: [],
          });
        } catch {
          /* 恢复提示失败不阻断安全重试 */
        }
      },
    });
    const { assetBytes } = generated;
    if (!assetBytes || assetBytes.byteLength === 0) {
      throw new Error("cover-runner: provider returned no bytes");
    }

    // 5) 落对象存储 + 建 asset。[DATA-H07] 生为 **pending 候选态**(采纳门翻 active,拒绝/
    //    失败清理 —— 与 asset.generate 同一 generated_asset 采纳门)。
    const name = deriveCoverName(plan.headline);
    const asset = await deps.generatedAssets.createGeneratedAsset(ctx, {
      assetType: "image",
      name,
      bytes: assetBytes,
      mimeType: "image/png",
      pending: true,
    });
    createdAssetId = asset.id;

    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:文案 + 图两产物一步出)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已生成封面方案 + 封面图（封面文案${
        ungrounded.length > 0 ? `含 ${ungrounded.length} 处未溯源提示，请核实` : "全部可溯"
      }）`,
      toolCalls: [],
    });

    // 6) 记候选(generated_asset,复用既有 asset 采纳门:人点「采纳」才把封面图绑进项目用料链，铁律②）。
    //    resultData 携带**接地后的封面方案**(展示层带⚠️标注)+ 组装的生图 prompt + 未溯源清单(观测）。
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: asset.id,
      resultData: {
        assetId: asset.id,
        assetType: "image",
        name: asset.name,
        prompt: imagePrompt,
        ...(userVisualRequirements
          ? { visualRequirements: userVisualRequirements }
          : {}),
        // [T-271] 结构化封面方案(封面文案已过诚实门,ungrounded 已在字段内以⚠️标注)。
        coverPlan: {
          headline: headlineAnn.text,
          subheadline: subAnn.text,
          keyPoints: keyPointsAnnotated,
          visualConcept: plan.visualConcept,
          composition: plan.composition,
          palette: plan.palette,
        },
        ungroundedClaims: Array.from(new Set(ungrounded)),
        // [T-523] 最终候选明确记录参考图是否真的进入 generateImage 入参；不能只凭用户
        // 请求或 dispatch 时选中了 asset 就宣称“已使用”。
        referenceImage: referenceAssetId
          ? {
              requestedAssetId: referenceAssetId,
              status: referenceImage ? "used" : "not_used",
              used: Boolean(referenceImage),
            }
          : {
              requestedAssetId: null,
              status: "not_requested",
              used: false,
            },
      },
    });
  } catch (err) {
    // [DATA-H07] asset 已建但候选没记成 → best-effort 丢弃 pending 资产(不留隐身孤儿;
    // 清理失败只记日志,不盖原始错误)。
    if (createdAssetId) {
      try {
        await deps.ai.discardGeneratedAsset(ctx, createdAssetId);
      } catch (cleanupErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[cover-runner] cleanup of pending asset ${createdAssetId} failed:`,
          cleanupErr,
        );
      }
    }
    // [T-376] 失败原因分类后写进步骤流末条(kind:"error")—— 前端失败卡读末条原样展示,
    // 区分「未配置生图模型」vs「配置了但调用失败:<真实原因>」vs「文本模型凭据问题」。
    const publicFailure = redactedRawErrorMessage(
      channelManaged
        ? safeModelFailureMessage(err, {
            displayModelKey: "channel-managed",
          })
        : describeMultimodalFailure(err, "生图"),
    );
    // 受管渠道不能把上游供应商/模型细节反向泄漏给终端用户；这类错误的
    // publicFailure 本身就是渠道安全的直接错误。用户自配模型则保留脱敏后的原文。
    const rawFailure = channelManaged
      ? publicFailure
      : redactedRawErrorMessage(err);
    const recordedFailure = `${publicFailure}\n原始错误（已脱敏）：${rawFailure}`;
    try {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 99,
        kind: "error",
        text: recordedFailure,
        toolCalls: [],
      });
    } catch {
      /* 记原因失败不阻断终态收口 */
    }
    // Best-effort cancel; swallow so a background failure never crashes the server.
    // 「未配文本/生图模型 / 生成失败 / 内容审核 / 轮询超时」全部坍缩到这里 → 诚实终态(cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id, rawFailure);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[cover-runner] generate failed task=${task.id} ${formatErrorDiagnostic(
        err,
        { omitMessage: channelManaged },
      )}`,
    );
  }
}
