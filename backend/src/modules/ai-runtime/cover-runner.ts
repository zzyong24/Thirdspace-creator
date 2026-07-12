import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type {
  ModelSpec,
  MultimodalSpec,
  MultimodalProviderRegistry,
  CoverBriefOutput,
} from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

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
    capability: "image.generate",
  ) => Promise<MultimodalSpec>;
  /** 多模态 provider 适配器注册表(host 注册真 minimax,单测注册 fake)。 */
  registry: MultimodalProviderRegistry;
  // 命名避开 ContextDeps.assets(那是素材库 AssetsReader);这是「建生成 asset」的写端口。
  generatedAssets: CoverGenerateAssetsPort;
}

export interface CoverGenerateTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// 封面文案长度上限(封面文字压太多会糊;方案层裁一次,防模型超长）。
export const COVER_HEADLINE_MAX = 20; // 主标题(模板要 ≤14,留余量后端硬裁 20)
export const COVER_SUBHEADLINE_MAX = 28; // 副标题(模板 ≤20)
export const COVER_KEYPOINT_MAX = 14; // 单条信息点(模板 ≤10)
export const COVER_KEYPOINTS_MAX = 3; // 信息点条数

/** 已裁剪的封面方案(runner 内部形态;导出供单测)。 */
export interface ClampedCoverPlan {
  headline: string;
  subheadline: string;
  keyPoints: string[];
  visualConcept: string;
  composition: string;
  palette: string;
}

function clip(v: string | undefined, max: number): string {
  const s = (v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 把模型吐的封面方案裁到封面可用长度(纯函数,导出供单测)。字段缺省安全(Partial:模型漏字段
 *  也不崩,与 schema `.default("")` 同哲学)。 */
export function clampCoverPlan(obj: Partial<CoverBriefOutput>): ClampedCoverPlan {
  return {
    headline: clip(obj.headline, COVER_HEADLINE_MAX),
    subheadline: clip(obj.subheadline, COVER_SUBHEADLINE_MAX),
    keyPoints: (obj.keyPoints ?? [])
      .map((kp) => clip(kp, COVER_KEYPOINT_MAX))
      .filter((kp) => kp.length > 0)
      .slice(0, COVER_KEYPOINTS_MAX),
    visualConcept: (obj.visualConcept ?? "").trim(),
    composition: (obj.composition ?? "").trim(),
    palette: (obj.palette ?? "").trim(),
  };
}

// 把 CreativeContext 映射成 cover.brief 模板的 facets(占位化上下文块）。硬注入立项 brief 核心信息/
// 内容形式(projectBriefHard)+ 口播稿主张(scriptClaim,复用 context.reviewScript)+ 素材可溯来源。
const SCRIPT_CLAIM_MAX = 800; // 口播稿注入截断(封面只需主张,不需全稿)
export function coverFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用封面逻辑设计）",
    // [T-271] 立项硬锚(核心信息=封面必须承载的钦定主张 + 内容形式定调;账号态为空则整段省略）。
    projectBriefHard: context.projectBriefHard
      ? `\n${context.projectBriefHard}`
      : "",
    // [T-271] 口播稿主张(封面要与正片说同一件事;复用 review 的 output_script 读法)。
    scriptClaim: context.reviewScript
      ? `\n【本条口播稿主张（封面必须与之一致，不得自创矛盾主张）】\n${clip(
          context.reviewScript,
          SCRIPT_CLAIM_MAX,
        )}`
      : "",
    // [T-271] 用户第一手素材=封面数字/成绩的可溯来源(硬约束段)。
    userMaterialHard: context.userMaterialHardBrief
      ? `\n${context.userMaterialHardBrief}`
      : "",
    userMaterialRef: context.userMaterialRefBrief
      ? `\n【参考素材（AI 搜集，参考级）】\n${context.userMaterialRefBrief}`
      : "",
    knowledge: context.knowledgeBrief
      ? `\n【知识库（封面文案可作出处依据）】\n${context.knowledgeBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
  };
}

/**
 * 由结构化封面方案**确定性组装**生图 prompt(非对话模型自由文本 —— T-271 修法核心②)。纯函数,
 * 导出供单测。用 RAW 方案文案(未标注)拼画面;可溯标注只进展示层,不进画面(v1 非破坏,与 planning.
 * thesis 的 annotate-not-strip 同哲学)。orientation 控画幅(横/竖屏)。
 */
export function composeCoverImagePrompt(
  plan: ClampedCoverPlan,
  opts: { orientation?: string } = {},
): string {
  const parts: string[] = ["为一条短视频/图文内容设计**封面图**："];
  if (plan.visualConcept) parts.push(`主视觉：${plan.visualConcept}`);
  if (plan.composition) parts.push(`构图：${plan.composition}`);
  const overlay = [
    plan.headline ? `主标题「${plan.headline}」` : "",
    plan.subheadline ? `副标题「${plan.subheadline}」` : "",
    plan.keyPoints.length ? `信息点：${plan.keyPoints.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("；");
  if (overlay) {
    parts.push(
      `画面上叠加醒目中文文案 —— ${overlay}（文字清晰、排版精美、无错别字、突出可读）`,
    );
  }
  if (plan.palette) parts.push(`色调风格：${plan.palette}`);
  parts.push(
    opts.orientation === "竖屏"
      ? "竖版短视频封面（9:16）"
      : opts.orientation === "横屏"
        ? "横版封面（16:9）"
        : "短视频封面",
  );
  parts.push("高清、主体突出、专业的封面视觉");
  return parts.join("\n");
}

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
  try {
    await deps.ai.markRunning(ctx, task.id);

    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );

    // 1) 结构化封面方案(文案接地）—— 复用 copy.generate 文本模型 + cover.brief 模板(硬锚 brief+script）。
    const spec = await deps.resolveModelSpec(ctx, "copy.generate");
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
      facets: coverFacets(context),
    });
    const plan = clampCoverPlan(object);

    // 2) 封面文案诚实门(T-224 同款可溯后处理)—— headline/subheadline/keyPoints 里的具体 claim
    //    (数字/命名事实/成绩)必须命中已注入的立项 brief/口播稿/素材/知识库;不可溯 → 非破坏式追加
    //    「⚠️含未溯源数据」标注(不删,提示用户核实出处)。治「封面上压编造数字博眼球」。
    const haystack = buildGroundingHaystack(
      context.projectBriefHard,
      context.reviewScript,
      context.positioningBrief,
      context.userMaterialHardBrief,
      context.userMaterialRefBrief,
      context.knowledgeBrief,
      context.topic.title,
      context.topic.angle,
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
    const orientation = context.orientationHint; // 横屏/竖屏/""
    const imagePrompt = composeCoverImagePrompt(plan, { orientation });
    const aspectRatio =
      orientation === "竖屏" ? "9:16" : orientation === "横屏" ? "16:9" : undefined;

    // 4) 生图(image.generate 用户可配;上层统一 { assetBytes };未配/超时/审核 → 抛 → 下方 catch）。
    const imgSpec = await deps.resolveMultimodalSpec(ctx, "image.generate");
    const { assetBytes } = await generateImage(
      imgSpec,
      { prompt: imagePrompt, ...(aspectRatio ? { aspectRatio } : {}) },
      deps.registry,
    );
    if (!assetBytes || assetBytes.byteLength === 0) {
      throw new Error("cover-runner: provider returned no bytes");
    }

    // 5) 落对象存储 + 建 asset(候选态:active 但未绑项目;字节此刻已持久化）。
    const name = deriveCoverName(plan.headline);
    const asset = await deps.generatedAssets.createGeneratedAsset(ctx, {
      assetType: "image",
      name,
      bytes: assetBytes,
      mimeType: "image/png",
    });

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
      },
    });
  } catch (err) {
    // Best-effort cancel; swallow so a background failure never crashes the server.
    // 「未配文本/生图模型 / 生成失败 / 内容审核 / 轮询超时」全部坍缩到这里 → 诚实终态(cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[cover-runner] generate failed for task ${task.id}:`, err);
  }
}
