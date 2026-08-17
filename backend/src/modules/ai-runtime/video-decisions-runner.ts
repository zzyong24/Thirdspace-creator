import { createHash } from "node:crypto";
import { z } from "zod";
import {
  videoRenderDirection,
  videoSubtitleEmphasis,
  type RequestContext,
  type VideoRenderDirection,
  type VideoSubtitleEmphasis,
} from "@creatoros/contract";
import type {
  ModelSpec,
  VideoScenesOutput,
  VideoCardsOutput,
  VideoBrollOutput,
  VideoSubtitlesOutput,
  VideoDirectorReviewOutput,
  MaterialMatchOutput,
  VideoCardKind,
  VideoCardMotion,
  VideoCardVisualPlan,
} from "@creatoros/ai-worker";
import {
  videoScenesSchema,
  videoCardsSchema,
  normalizeVideoCardsOutput,
  videoBrollSchema,
  normalizeVideoBrollOutput,
  videoSubtitlesSchema,
  videoDirectorReviewSchema,
  materialMatchSchema,
} from "@creatoros/ai-worker";
import {
  parseSrt,
  srtStartSet,
  srtTotalDurationSec,
  nearestSrtStart,
  tokenizeForOverlap,
  type SrtLine,
} from "./srt";
import {
  chunkOrderedItems,
  runOrderedChunks,
  type ChunkProgressListener,
} from "./chunk-and-merge";
import { classifyLlmError } from "./llm/retry-policy";
import { redactedRawErrorMessage } from "./error-diagnostics";

// [T-254b/T-712] 制作视频「四决策 + 总导演审片」runner —— 执行层 video.render 管线的「脑」侧
// (SPEC 2026-07-11 §3.1 步骤 2-3):粗剪 SRT + 口播稿(+ 项目素材清单投影)→
//   ① 语义分场 video.scenes ② 信息卡 video.cards ③ video.broll 产画面需求
//   + material.match 从项目真实素材中选料 ④ 双语字幕 video.subtitles
// 五个 runStructuredNode 顺序编排(runVideoDecisions),产完整决策 JSON 记成
// `video_decisions` 候选(awaiting_confirmation)→ 前端「分场预览卡」用户过目可改,
// 确认才组装 props 交渲染(铁律②:决策不落库、不渲染,除非用户采纳)。
//
// 跨模型稳定三板斧(SPEC 明写,MiniMax 必须可跑):
//   1. **动态 zod refine**(buildXxxDecisionSchema,以 outputSchema 逃生口传给
//      runStructuredNode):场景边界/插点须离某 SRT 行 start ≤ SNAP_TOLERANCE_SEC、
//      B-roll assetId 必须在清单集合内、字幕行数/序号集不得变 —— 不合 → SDK 自动重试;
//   2. **后处理吸附**:重试过关后仍可能有小偏差,一律 nearestSrtStart 吸附到行 start;
//   3. **可溯剔除**(T-224 同源诚实门):信息卡 content 的数字/关键词必须在口播原文
//      出现,不满足**剔除**(绝不带编造数值进预览卡);B-roll assetId 清单外剔除。
//
// 模型全走 model-config 用户可配:capability = skill id(video.scenes 等),未配回退 default。

/** 决策吸附容差(秒):模型给的时间离最近 SRT 行 start 超过它 → schema refine 失败重试。 */
export const SNAP_TOLERANCE_SEC = 2.5;

export const VIDEO_DECISIONS_TASK_TYPE = "video.decisions";
/** 候选结果 resultType(recordCandidate;T-254c 预览卡从 result 行读它)。 */
export const VIDEO_DECISIONS_RESULT_TYPE = "video_decisions";

/**
 * 面向制作页的失败说明。内部日志保留原始异常，任务步骤只告诉用户发生了什么和下一步。
 * SEMANTIC_BOUNDARY_ALLOW: 这里只按协议/网络/鉴权错误类别选择安全提示，不参与任何内容创作判断。
 */
export function describeVideoDecisionFailure(
  err: unknown,
  where: string,
): string {
  const raw = err instanceof Error ? err.message : String(err);
  const classified = classifyLlmError(err);
  let reason = "生成结果暂时不完整";
  if (where.startsWith("备料")) {
    reason = raw.replace(/\([^)]*\)/g, "").replace(/[:：].*$/, "").trim();
  } else if (classified.reason.startsWith("auth_")) {
    reason = "模型连接已失效，请先到设置检查模型配置";
  } else if (classified.retryable) {
    reason = "生成服务暂时繁忙";
  } else if (/schema|结构|json|解析|无法识别|不完整/i.test(raw)) {
    reason = "生成结果格式暂时不完整";
  } else if (/未配置|缺少.*配置|找不到模型/i.test(raw)) {
    reason = "尚未配置可用模型，请先到设置完成配置";
  }
  return `${where}暂时失败：${reason}。请继续上次分场。\n原始错误（已脱敏）：${redactedRawErrorMessage(err)}`;
}

// ── 决策产物类型(预览卡/props 组装的输入形状)────────────────────────────────

export interface VideoScene {
  title: string;
  startSec: number;
  endSec: number;
  summary: string;
}

export interface VideoInfoCard {
  sceneIdx: number;
  kind: VideoCardKind;
  content: string;
  at: number;
  /** AI 选定的 SRT 语义锚点；存在时 at 由该行真实起秒确定。 */
  srtLineIndex?: number;
  /** [T-295] 动画意图(决策层可选产出;缺省组装器/template 按 kind 派生)。 */
  motion?: VideoCardMotion;
  /** [T-794] AI 选定的内容关系；代码只做溯源校验与渲染执行。 */
  visualPlan?: VideoCardVisualPlan;
}

export interface VideoBrollPick {
  sceneIdx: number;
  assetId: string;
  at: number;
  durationSec: number;
  /** AI 编导决定素材承担主画面还是辅助画面；渲染器据此执行。 */
  presentation?: "full_frame" | "large_stage" | "overlay";
  /** material.match 对素材内容的语义分类；渲染层据此守横竖版式边界。 */
  visualRole?: "screen_recording" | "still_image" | "live_footage";
  /** material.match 决定主素材窗是否保留左下角讲解人。 */
  speakerMode?: "hidden" | "pip_bottom_left";
  /** 素材的轻量镜头运动，由 material.match 统一决定。 */
  motion?: "static" | "push_in" | "pan_left" | "pan_right";
}

export interface BilingualSubtitleLine {
  index: number;
  startSec: number;
  endSec: number;
  zh: string;
  en: string;
  /** [T-858] AI 选定且经 Unicode/时间校验的真实重点词。 */
  emphasis?: VideoSubtitleEmphasis[];
}

/** [T-387c] B-roll 候选来源(自动聚合徽标):脚本画面点名 / 论点树挂载 / 项目弹药 / 手动上传。 */
export type BrollSource = "script" | "ammo" | "manual";

/** 素材清单投影(项目 material-links/assets 的 label+描述,B-roll 决策的唯一可选集)。
 *  [T-387c] additive source 字段:自动聚合来源徽标(缺省 = 旧投影/回退整库,UI 不渲徽标)。 */
export interface BrollAssetRef {
  assetId: string;
  /** 原始文件名是用户主动提供的语义线索；AI 与内容/场景一起判断，代码不做字符串猜测。 */
  label: string;
  kind: string;
  description: string;
  source?: BrollSource;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** 用户在预览卡中的明确选材。它是下一轮 AI 分镜的硬约束，而不是旧时间线上的 4 秒补丁。 */
export interface ManualMaterialAssignment {
  assetId: string;
  sceneIdx: number;
  sceneTitle: string;
  sceneSummary: string;
}

/** [T-387c] 聚合去重(纯函数,server 端 listBrollInventory 与制作页 UI 共用同一逻辑):
 *  按 assetId 去重,保留**先出现**的条目(调用方按来源优先级排序传入:script → thesis →
 *  manual/ammo)。 */
export function dedupeBrollRefs(
  items: ReadonlyArray<BrollAssetRef>,
): BrollAssetRef[] {
  const seen = new Set<string>();
  const out: BrollAssetRef[] = [];
  for (const it of items) {
    if (!it.assetId || seen.has(it.assetId)) continue;
    seen.add(it.assetId);
    out.push(it);
  }
  return out;
}

/**
 * 把 AI/旧分镜产出的 B-roll 收口为可执行时间线。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只执行素材 ID 全片唯一、主视觉时间不重叠与场景边界
 * 这些确定性协议；不根据文件名、内容或业务词判断“哪个素材更适合”，创作选择仍由
 * material.match / video.director 完成。相同起点的多个主视觉是互斥候选，保留上游
 * 已排序的第一项；前后相交则让上一项在下一项进场时结束。
 */
export function normalizeBrollTimeline(input: {
  scenes: readonly VideoScene[];
  broll: readonly VideoBrollPick[];
}): { broll: VideoBrollPick[]; repairs: string[] } {
  const repairs: string[] = [];
  const seenAssets = new Set<string>();
  const unique = input.broll
    .map((pick, order) => ({ pick: { ...pick }, order }))
    .filter(({ pick }) => {
      if (seenAssets.has(pick.assetId)) {
        repairs.push("重复素材已保留首次使用并从后续场景移除");
        return false;
      }
      seenAssets.add(pick.assetId);
      return true;
    })
    .sort((a, b) => a.pick.at - b.pick.at || a.order - b.order);

  const normalized: VideoBrollPick[] = [];
  const lastMainByScene = new Map<number, VideoBrollPick>();
  for (const item of unique) {
    const pick = item.pick;
    const scene = input.scenes[pick.sceneIdx];
    if (!scene) continue;
    const isMain = pick.presentation !== "overlay";
    const previousMain = lastMainByScene.get(pick.sceneIdx);
    if (previousMain && isMain) {
      if (Math.abs(previousMain.at - pick.at) < 0.1) {
        repairs.push("同一时刻的互斥主视觉已只保留一项");
        continue;
      }
      const previousEnd = previousMain.at + previousMain.durationSec;
      if (previousEnd > pick.at) {
        previousMain.durationSec = Math.max(0.1, pick.at - previousMain.at);
        repairs.push("相邻主视觉的重叠时间已自动衔接");
      }
    }
    normalized.push(pick);
    if (isMain) lastMainByScene.set(pick.sceneIdx, pick);
  }
  return { broll: normalized, repairs: [...new Set(repairs)] };
}

/** 四决策完整产物(预览卡渲染 + 确认后组装 props 的单一输入)。 */
export interface VideoDecisions {
  /** [T-858] 整片主视觉交接；旧候选或确定性降级可缺省。 */
  direction?: VideoRenderDirection;
  scenes: VideoScene[];
  cards: VideoInfoCard[];
  /** v2 起提供；旧候选没有该字段时按空数组兼容。 */
  visualSlots?: VideoBrollOutput["slots"];
  broll: VideoBrollPick[];
  subtitles: BilingualSubtitleLine[];
  /** 解析后的 SRT(时间真值,预览卡显示字幕样例/组 props 都要)。 */
  srtLines: SrtLine[];
  /** authored 分镜点名素材无法进入时间线时的诚实原因，禁止静默丢素材。 */
  unusedStoryboardAssets?: Array<{
    assetId: string;
    sectionIdx: number;
    reason: "excluded" | "missing_or_unauthorized" | "no_unique_scene_match";
  }>;
  /** 五个候选节点汇总后的总导演审片结论；旧候选缺省时保持可确认兼容。 */
  directorReview?: VideoDirectorReview;
}

/**
 * [T-858] 总导演 direction 的动态安全门。AI 决定主语/运动/舞台；代码只验证
 * 已存在的稳定 ref、真实对象时间窗、场景边界与“每拍都是唯一主视觉”的不重叠协议。
 */
export function buildVideoDirectionSchema(input: {
  scenes: readonly VideoScene[];
  cards: readonly VideoInfoCard[];
  broll: readonly VideoBrollPick[];
}) {
  type RefWindow = {
    kind: "talking_head" | "card" | "broll";
    sceneIdx: number;
    startSec: number;
    endSec: number;
    presentation?: VideoBrollPick["presentation"];
  };
  const refs = new Map<string, RefWindow>();
  input.scenes.forEach((scene, sceneIdx) => {
    refs.set(`talking_head:${sceneIdx}`, {
      kind: "talking_head",
      sceneIdx,
      startSec: scene.startSec,
      endSec: scene.endSec,
    });
    input.cards
      .filter((card) => card.sceneIdx === sceneIdx)
      .forEach((card, ordinal) => {
        refs.set(`card:${sceneIdx}:${ordinal}`, {
          kind: "card",
          sceneIdx,
          startSec: card.at,
          endSec: scene.endSec,
        });
      });
  });
  input.broll.forEach((pick) => {
    const scene = input.scenes[pick.sceneIdx];
    if (!scene) return;
    refs.set(`broll:${pick.assetId}`, {
      kind: "broll",
      sceneIdx: pick.sceneIdx,
      startSec: pick.at,
      endSec: Math.min(scene.endSec, pick.at + pick.durationSec),
      presentation: pick.presentation,
    });
  });

  return videoRenderDirection.superRefine((direction, ctx) => {
    const counts = new Map<string, number>();
    direction.beatGraph.forEach((beat, index) => {
      if (
        beat.subject.kind === "talking_head" &&
        beat.subject.ref !== "talking_head"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "subject", "ref"],
          message: "人物基底必须使用稳定 ref=talking_head",
        });
        return;
      }
      const refKey =
        beat.subject.kind === "talking_head"
          ? `talking_head:${beat.sceneIdx}`
          : beat.subject.ref;
      const target = refs.get(refKey);
      if (!target || target.kind !== beat.subject.kind) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "subject", "ref"],
          message: "direction beat 必须引用候选时间线提供的真实 ref",
        });
        return;
      }
      if (target.kind === "broll" && target.presentation === "overlay") {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "subject", "ref"],
          message: "明确辅助 overlay 不进入主视觉 beatGraph",
        });
        return;
      }
      if (target.kind !== "talking_head") {
        counts.set(refKey, (counts.get(refKey) ?? 0) + 1);
      }
      if (
        target.sceneIdx !== beat.sceneIdx ||
        beat.startSec < target.startSec - 1e-6 ||
        beat.endSec > target.endSec + 1e-6
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "startSec"],
          message: "direction beat 时间必须落在被引用对象与所属场景的真实有效窗内",
        });
      }
      const expectedStage = target.kind === "talking_head" ? "base" : "takeover";
      if (beat.stageMode !== expectedStage) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "stageMode"],
          message: `direction beat 舞台必须与真实对象层级一致:${expectedStage}`,
        });
      }
      if (
        beat.returnGeometry === "same_base" &&
        beat.stageMode === "base"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph", index, "returnGeometry"],
          message: "人物基底拍不需要重复声明回位",
        });
      }
    });
    refs.forEach((target, ref) => {
      if (
        target.kind === "talking_head" ||
        (target.kind === "broll" && target.presentation === "overlay")
      ) return;
      const count = counts.get(ref) ?? 0;
      if (count !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["beatGraph"],
          message: `direction 中 ${ref} 必须恰好一次，实际 ${count} 次`,
        });
      }
    });
  });
}

/**
 * 局部选材只能建立在本任务同一份 SRT 的完整候选上。这里仅校验结构、真实时间轴和
 * 枚举边界，不做任何创作判断；无效/陈旧候选直接拒绝，绝不偷偷退回整链重跑。
 */
function parseMaterialAdjustmentBase(
  raw: unknown,
  srtLines: readonly SrtLine[],
): VideoDecisions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("补充选材缺少当前分镜，未重新运行完整分镜");
  }
  const value = raw as Record<string, unknown>;
  const starts = srtStartSet(srtLines);
  const parsedScenes = buildScenesDecisionSchema(starts).safeParse({
    scenes: value.scenes,
  });
  if (!parsedScenes.success) {
    throw new Error("当前分镜结构无效，未重新运行完整分镜");
  }
  const scenes = parsedScenes.data.scenes;
  const parsedCards = buildCardsDecisionSchema(scenes.length, starts).safeParse({
    cards: value.cards,
  });
  if (!parsedCards.success) {
    throw new Error("当前信息卡结构无效，未重新运行完整分镜");
  }
  const parsedSlots = videoBrollSchema.safeParse({
    slots: Array.isArray(value.visualSlots) ? value.visualSlots : [],
    broll: [],
  });
  if (!parsedSlots.success) {
    throw new Error("当前画面需求结构无效，未重新运行完整分镜");
  }
  if (!Array.isArray(value.broll)) {
    throw new Error("当前素材时间线无效，未重新运行完整分镜");
  }
  const broll: VideoBrollPick[] = value.broll.flatMap((rawPick) => {
    if (!rawPick || typeof rawPick !== "object" || Array.isArray(rawPick)) return [];
    const pick = rawPick as Record<string, unknown>;
    if (
      typeof pick.sceneIdx !== "number" ||
      !Number.isInteger(pick.sceneIdx) ||
      typeof pick.assetId !== "string" ||
      typeof pick.at !== "number" ||
      !Number.isFinite(pick.at) ||
      typeof pick.durationSec !== "number" ||
      !Number.isFinite(pick.durationSec)
    ) {
      return [];
    }
    return [{
      sceneIdx: pick.sceneIdx,
      assetId: pick.assetId,
      at: pick.at,
      durationSec: pick.durationSec,
      ...(pick.presentation === "full_frame" ||
      pick.presentation === "large_stage" ||
      pick.presentation === "overlay"
        ? { presentation: pick.presentation }
        : {}),
      ...(pick.visualRole === "screen_recording" ||
      pick.visualRole === "still_image" ||
      pick.visualRole === "live_footage"
        ? { visualRole: pick.visualRole }
        : {}),
      ...(pick.motion === "static" ||
      pick.motion === "push_in" ||
      pick.motion === "pan_left" ||
      pick.motion === "pan_right"
        ? { motion: pick.motion }
        : {}),
    }];
  });
  if (broll.length !== value.broll.length) {
    throw new Error("当前素材时间线含无效条目，未重新运行完整分镜");
  }
  if (!Array.isArray(value.srtLines) || !Array.isArray(value.subtitles)) {
    throw new Error("当前字幕时间线无效，未重新运行完整分镜");
  }
  const baseSrt = value.srtLines as Array<Record<string, unknown>>;
  const subtitles = value.subtitles as Array<Record<string, unknown>>;
  const sameSrt =
    baseSrt.length === srtLines.length &&
    baseSrt.every((line, index) => {
      const source = srtLines[index];
      return Boolean(
        source &&
        line.index === source.index &&
        line.startSec === source.startSec &&
        line.endSec === source.endSec &&
        line.text === source.text,
      );
    });
  if (!sameSrt || subtitles.length !== srtLines.length) {
    throw new Error("当前分镜与本次 SRT 不一致，未重新运行完整分镜");
  }
  const parsedSubtitles: BilingualSubtitleLine[] = subtitles.flatMap(
    (line, index) => {
      const source = srtLines[index];
      if (
        !source ||
        line.index !== source.index ||
        line.startSec !== source.startSec ||
        line.endSec !== source.endSec ||
        typeof line.zh !== "string" ||
        typeof line.en !== "string"
      ) {
        return [];
      }
      return [{
        index: source.index,
        startSec: source.startSec,
        endSec: source.endSec,
        zh: line.zh,
        en: line.en,
        ...(() => {
          const emphasis = validSubtitleEmphasis({
            raw: line.emphasis,
            zh: line.zh,
            source,
          });
          return emphasis.length > 0 ? { emphasis } : {};
        })(),
      }];
    },
  );
  if (parsedSubtitles.length !== subtitles.length) {
    throw new Error("当前字幕内容无效，未重新运行完整分镜");
  }
  const parsedDirection = buildVideoDirectionSchema({
    scenes,
    cards: parsedCards.data.cards,
    broll,
  }).safeParse(value.direction);
  return {
    ...(parsedDirection.success ? { direction: parsedDirection.data } : {}),
    scenes,
    cards: parsedCards.data.cards,
    visualSlots: parsedSlots.data.slots,
    broll,
    subtitles: parsedSubtitles,
    srtLines: [...srtLines],
    directorReview: {
      status: "ready",
      summary: "当前稳定分镜已保留，仅更新补充素材与时间线。",
      issues: [],
      ...(parsedDirection.success ? { direction: parsedDirection.data } : {}),
      source: "auto_repaired",
    },
  };
}

export interface VideoDirectorIssue {
  sceneIdx: number;
  severity: "blocking" | "warning";
  code:
    | "visual_gap"
    | "material_conflict"
    | "timing_conflict"
    | "narrative_gap"
    | "subtitle_conflict";
  message: string;
}

export interface VideoDirectorReview {
  status: "ready" | "needs_attention";
  summary: string;
  issues: VideoDirectorIssue[];
  /** 合法时进入正式候选；无效/模型降级时诚实缺省。 */
  direction?: VideoRenderDirection;
  /** 仅供运行时追踪，前端不展示实现术语。 */
  source: "ai" | "auto_repaired" | "deterministic_fallback";
}

/** T-703：把 authored assetRefs 确定性落实为 B-roll；模型漏选也不能静默丢失。 */
export function enforceStoryboardBroll(input: {
  storyboard: readonly StoryboardSectionRef[];
  scenes: readonly VideoScene[];
  srtLines: readonly SrtLine[];
  inventory: readonly BrollAssetRef[];
  excludedAssetIds: ReadonlySet<string>;
  modelBroll: readonly VideoBrollPick[];
}): Pick<VideoDecisions, "broll" | "unusedStoryboardAssets"> {
  const broll = [...input.modelBroll];
  const unused: NonNullable<VideoDecisions["unusedStoryboardAssets"]> = [];
  const inventoryIds = new Set(input.inventory.map((item) => item.assetId));
  const usedAssetIds = new Set(broll.map((pick) => pick.assetId));
  const equalCounts = input.storyboard.length === input.scenes.length;
  for (const [sectionIdx, section] of input.storyboard.entries()) {
    // 只有分镜段与场景一一对应时才做确定性落位；数量不一致属于语义判断，交给
    // material.match，而不是在代码里用字符串相似度猜。
    const sceneIdx: number | null = equalCounts ? sectionIdx : null;
    const eligibleAssetIds: string[] = [];
    for (const assetId of section.assetRefs) {
      if (input.excludedAssetIds.has(assetId)) {
        unused.push({ assetId, sectionIdx, reason: "excluded" });
        continue;
      }
      if (!inventoryIds.has(assetId)) {
        unused.push({ assetId, sectionIdx, reason: "missing_or_unauthorized" });
        continue;
      }
      if (sceneIdx === null || !input.scenes[sceneIdx]) {
        unused.push({ assetId, sectionIdx, reason: "no_unique_scene_match" });
        continue;
      }
      if (!usedAssetIds.has(assetId)) eligibleAssetIds.push(assetId);
    }

    // assetRefs 是供 AI 选择的候选，不是要求同秒叠加的时间线。只有该场尚未有
    // AI 选材且 authored 分镜唯一点名一项时，代码才执行这个无歧义的旧数据兜底。
    if (
      sceneIdx === null ||
      broll.some((pick) => pick.sceneIdx === sceneIdx) ||
      eligibleAssetIds.length !== 1
    ) continue;
    const assetId = eligibleAssetIds[0]!;
    const scene = input.scenes[sceneIdx]!;
    const at = input.srtLines.find(
      (line) => line.startSec >= scene.startSec && line.startSec < scene.endSec,
    )?.startSec ?? scene.startSec;
    const available = Math.max(1, scene.endSec - at);
    const assetDuration =
      (input.inventory.find((item) => item.assetId === assetId)?.durationMs ?? 0) /
      1000;
    broll.push({
      sceneIdx,
      assetId,
      at,
      durationSec:
        assetDuration > 0
          ? Math.max(1, Math.min(assetDuration, available))
          : available,
      presentation: "large_stage",
    });
    usedAssetIds.add(assetId);
  }
  return {
    broll: normalizeBrollTimeline({ scenes: input.scenes, broll }).broll,
    unusedStoryboardAssets: unused,
  };
}

// ── 动态输出契约(zod refine,绑定本次输入;runStructuredNode outputSchema 逃生口)──

/** ① 分场:非空 + 每场 startSec 离某 SRT 行 start ≤ 容差(endSec 由后处理推导,不卡)。 */
export function buildScenesDecisionSchema(srtStarts: readonly number[]) {
  return videoScenesSchema.refine(
    (o) =>
      o.scenes.length > 0 &&
      o.scenes.every(
        (s) =>
          Math.abs(s.startSec - nearestSrtStart(s.startSec, srtStarts)) <=
          SNAP_TOLERANCE_SEC,
      ),
    { message: "场景边界必须落在 SRT 行 start 集合上(容差内)" },
  );
}

/** ② 信息卡:时间/场景 + Scene Graph 协议同时进动态 schema，坏动作先返给模型重试。 */
export function buildCardsDecisionSchema(
  sceneCount: number,
  srtStarts: readonly number[],
) {
  return videoCardsSchema.refine(
    (o) =>
      o.cards.every(
        (c) =>
          c.sceneIdx >= 0 &&
          c.sceneIdx < sceneCount &&
          Math.abs(c.at - nearestSrtStart(c.at, srtStarts)) <=
            SNAP_TOLERANCE_SEC &&
          (!c.visualPlan || isVideoCardVisualPlanStructurallyValid(c.visualPlan)),
      ),
    {
      message:
        "卡片 sceneIdx/at 必须合法；visualPlan 必须满足 role、引用与动作属性协议：enter 增 opacity、exit 减 opacity、grow/focus 增 scale、shrink/compress 减 scale、overflow 增 count、trace/reveal 增 progress；一个 action 只保留其允许属性，重复 role 不得绑 textRole",
    },
  );
}

/** ③ B-roll:assetId 必须在清单集合内(精确匹配禁近似的 schema 面);sceneIdx 越界即废。 */
export function buildBrollDecisionSchema(
  assetIds: readonly string[],
  sceneCount: number,
) {
  const idSet = new Set(assetIds);
  return videoBrollSchema.refine(
    (o) =>
      o.broll.every(
        (b) =>
          idSet.has(b.assetId) && b.sceneIdx >= 0 && b.sceneIdx < sceneCount,
      ),
    { message: "B-roll assetId 必须来自素材清单(禁编造),sceneIdx 必须在场景范围内" },
  );
}

/** 视频制作里的素材语义匹配必须由 material.match Skill 完成；动态 schema 只防编造与越界。 */
export function buildVideoMaterialMatchSchema(
  assetIds: readonly string[],
  sceneCount: number,
) {
  const idSet = new Set(assetIds);
  return materialMatchSchema.transform((output, ctx) => {
    const validMatches = output.matches.filter(
      (match) =>
        idSet.has(match.assetId) &&
        match.role !== "cover" &&
        match.visualRole !== "cover" &&
        typeof match.visualRole === "string" &&
        (match.presentation !== "full_frame" ||
          match.visualRole === "screen_recording") &&
        typeof match.sceneIdx === "number" &&
        match.sceneIdx >= 0 &&
        match.sceneIdx < sceneCount,
    );

    // SEMANTIC_BOUNDARY_ALLOW: 这里只按真实 ID、枚举、场景范围和版式安全边界
    // 逐条丢弃协议违约项，不判断素材是否适合场景。避免模型一条坏映射拖垮同批
    // 其他合法素材；若整批非空却没有任何合法项，仍让结构化节点重试而不是假成功。
    if (output.matches.length > 0 && validMatches.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "视频素材匹配必须使用清单内真实 assetId，并由 AI 返回 visualRole 与有效 sceneIdx；封面不能进入 B-roll，只有录屏可全屏",
      });
    }

    return { matches: validMatches };
  });
}

/** ④ 双语字幕:行数不变 + 序号集合与输入一致(时间轴由后处理强制回原值)。 */
export function buildSubtitlesDecisionSchema(srtLines: readonly SrtLine[]) {
  const wanted = new Set(srtLines.map((l) => l.index));
  return videoSubtitlesSchema.refine(
    (o) =>
      o.lines.length === srtLines.length &&
      o.lines.every((l) => wanted.has(l.index)) &&
      new Set(o.lines.map((l) => l.index)).size === o.lines.length,
    { message: "字幕行数/序号必须与输入 SRT 一一对应(禁增删并行)" },
  );
}

// ── 可溯校验(T-224 同源:数值/文案只认口播原文)────────────────────────────────

const NUMBER_RE = /\d+(?:\.\d+)?/g;

/**
 * 信息卡 content 是否可溯源于口播原文:
 *   a) content 里出现的**每个数字**必须在原文出现(一个编造数值即废);
 *   b) content 与原文至少共享一个可核锚点(CJK 连续片段的 4-gram,短片段整段;或
 *      长度 ≥3 的拉丁 token)。锚点集为空且无数字 → 无从核验,按剔除处理(诚实门)。
 */
export function isCardContentTraceable(
  content: string,
  script: string,
): boolean {
  const numbers = content.match(NUMBER_RE) ?? [];
  for (const n of numbers) if (!script.includes(n)) return false;

  const anchors: string[] = [];
  const cjkRuns = content.match(/[一-鿿㐀-䶿]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length <= 4) anchors.push(run);
    else for (let i = 0; i + 4 <= run.length; i++) anchors.push(run.slice(i, i + 4));
  }
  for (const t of tokenizeForOverlap(content))
    if (/^[a-z]/.test(t) && t.length >= 3) anchors.push(t);

  if (anchors.length === 0) return numbers.length > 0;
  const scriptLower = script.toLowerCase();
  return anchors.some((a) => scriptLower.includes(a));
}

/**
 * [T-802] Scene Graph 的上屏部件必须是原文中的完整连续片段。
 * 仅做 Unicode/空白规范化，不删标点、不做同义替换，避免“有几个关键词相同”就把
 * 模型改写后的新主张带进成片。
 */
export function isCardPartStrictlyTraceable(
  part: string,
  script: string,
): boolean {
  const normalize = (value: string) =>
    value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const wanted = normalize(part);
  return wanted.length > 0 && normalize(script).includes(wanted);
}

/**
 * [T-794] visualPlan 只做协议形状检查，不判断创作关系是否选得好。
 * SEMANTIC_BOUNDARY_ALLOW: 必需 role、部件数与上屏长度都是渲染协议/版式边界；
 * “这段口播是不是因果”仍完全由 video.cards Skill 决定。
 */
export function isVideoCardVisualPlanStructurallyValid(
  plan: VideoCardVisualPlan,
): boolean {
  if (
    plan.parts.length < 1 ||
    plan.parts.length > 6 ||
    plan.parts.some(
      (part) => !part.text.trim() || Array.from(part.text.trim()).length > 32,
    )
  ) {
    return false;
  }
  const has = (role: VideoCardVisualPlan["parts"][number]["role"]) =>
    plan.parts.some((part) => part.role === role);
  let relationValid = false;
  switch (plan.relation) {
    case "magnitude":
      relationValid = has("measure");
      break;
    case "contrast":
    case "replacement":
      relationValid = has("old") && has("new");
      break;
    case "sequence":
      relationValid = plan.parts.filter((part) => part.role === "step").length >= 2;
      break;
    case "cause_effect":
      relationValid = has("cause") && has("result");
      break;
    case "statement":
      relationValid = has("claim") || has("conclusion");
      break;
  }
  if (!relationValid || !plan.scene) return relationValid;

  const scene = plan.scene;
  const entityIds = new Set(scene.entities.map((entity) => entity.id));
  if (entityIds.size !== scene.entities.length) return false;
  const roleCount = new Map<string, number>();
  for (const part of plan.parts) {
    roleCount.set(part.role, (roleCount.get(part.role) ?? 0) + 1);
  }
  if (
    scene.entities.some(
      (entity) => entity.textRole && roleCount.get(entity.textRole) !== 1,
    )
  ) {
    return false;
  }

  const changed = (
    beat: (typeof scene.beats)[number],
    key: keyof (typeof beat)["from"],
  ) => beat.from[key] !== beat.to[key];
  const onlyKeys = (
    beat: (typeof scene.beats)[number],
    allowed: readonly string[],
  ) => {
    const used = new Set([...Object.keys(beat.from), ...Object.keys(beat.to)]);
    return [...used].every((key) => allowed.includes(key));
  };
  const increasing = (
    beat: (typeof scene.beats)[number],
    key: "opacity" | "scale" | "progress" | "count",
  ) =>
    typeof beat.from[key] === "number" &&
    typeof beat.to[key] === "number" &&
    beat.to[key]! > beat.from[key]!;
  const decreasing = (
    beat: (typeof scene.beats)[number],
    key: "opacity" | "scale",
  ) =>
    typeof beat.from[key] === "number" &&
    typeof beat.to[key] === "number" &&
    beat.to[key]! < beat.from[key]!;
  for (const beat of scene.beats) {
    if (beat.start + beat.duration > 1.000001) return false;
    if (!entityIds.has(beat.target)) return false;
    if (beat.with && !entityIds.has(beat.with)) return false;
    if (beat.affects?.some((id) => !entityIds.has(id))) return false;
    switch (beat.action) {
      case "enter":
        if (!onlyKeys(beat, ["opacity"]) || !increasing(beat, "opacity")) return false;
        break;
      case "exit":
        if (!onlyKeys(beat, ["opacity"]) || !decreasing(beat, "opacity")) return false;
        break;
      case "move":
        if (
          !onlyKeys(beat, ["x", "y"]) ||
          (!changed(beat, "x") && !changed(beat, "y"))
        ) return false;
        break;
      case "grow":
      case "focus":
        if (!onlyKeys(beat, ["scale"]) || !increasing(beat, "scale")) return false;
        break;
      case "shrink":
      case "compress":
        if (!onlyKeys(beat, ["scale"]) || !decreasing(beat, "scale")) return false;
        break;
      case "overflow":
        if (!onlyKeys(beat, ["count"]) || !increasing(beat, "count")) return false;
        break;
      case "trace":
      case "reveal":
        if (!onlyKeys(beat, ["progress"]) || !increasing(beat, "progress")) return false;
        break;
      case "replace":
        if (
          !beat.with ||
          !onlyKeys(beat, ["opacity"]) ||
          !decreasing(beat, "opacity")
        ) return false;
        break;
    }
  }
  return true;
}

// ── facet 序列化(模板占位块)────────────────────────────────────────────────

const sec = (n: number) => (Math.round(n * 100) / 100).toString();

export function srtFacet(lines: readonly SrtLine[]): string {
  return lines
    .map((l) => `${l.index} | ${sec(l.startSec)}s-${sec(l.endSec)}s | ${l.text}`)
    .join("\n");
}

export function scenesFacet(scenes: readonly VideoScene[]): string {
  return scenes
    .map(
      (s, i) =>
        `${i} | ${sec(s.startSec)}s-${sec(s.endSec)}s | ${s.title} | ${s.summary}`,
    )
    .join("\n");
}

export function libraryFacet(inventory: readonly BrollAssetRef[]): string {
  if (inventory.length === 0) {
    return "（当前项目没有可用素材；请继续生成画面需求，素材绑定保持为空）";
  }
  const sourceLabel: Record<BrollSource, string> = {
    script: "脚本分镜点名",
    ammo: "项目弹药",
    manual: "用户手动上传",
  };
  return inventory
    .map(
      (a) =>
        `· ${a.assetId} | ${a.label}${a.kind ? ` (${a.kind})` : ""}${
          a.description ? ` | ${a.description}` : ""
        }${a.width && a.height ? ` | 尺寸:${a.width}×${a.height}` : ""}${
          a.durationMs ? ` | 时长:${sec(a.durationMs / 1000)}s` : ""
        }${a.source ? ` | 来源:${sourceLabel[a.source]}` : ""}`,
    )
    .join("\n");
}

export function manualAssignmentsFacet(
  assignments: readonly ManualMaterialAssignment[],
  inventory: readonly BrollAssetRef[],
): string {
  if (assignments.length === 0) return "";
  const byId = new Map(inventory.map((asset) => [asset.assetId, asset]));
  return [
    "【用户人工选材·硬约束】以下素材必须进入新分镜；原场景只提供叙事语义，不代表沿用旧起止时间。",
    ...assignments.flatMap((assignment) => {
      const asset = byId.get(assignment.assetId);
      if (!asset) return [];
      return [
        `· ${asset.assetId} | 原始文件名:${asset.label} | 类型:${asset.kind || "未知"}${
          asset.width && asset.height ? ` | 尺寸:${asset.width}×${asset.height}` : ""
        }${asset.durationMs ? ` | 素材时长:${sec(asset.durationMs / 1000)}s` : ""} | 原场景:${assignment.sceneIdx} ${assignment.sceneTitle} | 叙事:${assignment.sceneSummary}`,
      ];
    }),
    "必须据此重新计算场景边界、素材插点和有效展示时长，不得遗漏、替换或机械截成固定时长。",
  ].join("\n");
}

export function visualSlotsFacet(slots: VideoBrollOutput["slots"]): string {
  return slots
    .map(
      (slot) =>
        `${slot.sceneIdx} | ${sec(slot.at)}s | ${slot.purpose} | 口播:${slot.spokenAnchor}${
          slot.visualClaim ? ` | 认知:${slot.visualClaim}` : ""
        }${slot.reason ? ` | 理由:${slot.reason}` : ""} | 画面:${slot.visualBrief}${
          slot.searchQuery ? ` | 搜索:${slot.searchQuery}` : ""
        }`,
    )
    .join("\n");
}

// ── [T-387c] 凝固分镜 facet(四决策的「对齐器」输入)─────────────────────────────

/** 凝固分镜的一段投影(读自 output_script 当前版本 contentData.sections[].visual)。 */
export interface StoryboardSectionRef {
  /** 段口播摘要(section body 的口播行/正文截断,给模型对位用)。 */
  narration: string;
  /** authored 画面描述(visual.description)。 */
  visualDescription: string;
  /** 点名的真实素材 assetId(凝固 pass 已校验存在)。 */
  assetRefs: string[];
}

/**
 * [T-387c] 从 output_script 当前版本的 contentData 解析凝固分镜投影(composition root 的
 * readStoryboard 端口用)。宽容防御(jsonb 自由形状):无 sections / 段无 visual → 不产行;
 * 全稿无任何 visual → 空数组(→ facet 空串,零回归)。narration 取段 body 的「口播：」行,
 * 无则 body 首 60 字。纯函数,导出供单测。
 */
export function storyboardFromContentData(
  contentData: Record<string, unknown> | null | undefined,
): StoryboardSectionRef[] {
  const rawSections = Array.isArray(contentData?.sections)
    ? (contentData!.sections as unknown[])
    : [];
  const out: StoryboardSectionRef[] = [];
  let any = false;
  for (const raw of rawSections) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const body = typeof s.body === "string" ? s.body : "";
    const narrationLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("口播：") || l.startsWith("口播:"));
    const narration = (narrationLine
      ? narrationLine.replace(/^口播[：:]/, "")
      : body
    )
      .trim()
      .slice(0, 60);
    const v = (s.visual ?? null) as Record<string, unknown> | null;
    const visualDescription =
      v && typeof v.description === "string" ? v.description.trim() : "";
    const assetRefs =
      v && Array.isArray(v.assetRefs)
        ? (v.assetRefs as unknown[]).filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          )
        : [];
    if (visualDescription || assetRefs.length > 0) any = true;
    out.push({ narration, visualDescription, assetRefs });
  }
  return any ? out : [];
}

/**
 * 组装 storyboard facet:凝固分镜表 + **对齐硬约束**(SPEC §2b 四决策=对齐器)。
 * 无凝固分镜(空数组)→ 返回空串(模板占位替换为空,行为=现状,零回归——测锚)。
 * 纯函数,导出供单测。
 */
export function storyboardFacet(
  sections: readonly StoryboardSectionRef[],
): string {
  const withIntent = sections.filter(
    (s) => s.visualDescription || s.assetRefs.length > 0,
  );
  if (withIntent.length === 0) return "";
  const lines = sections.map((s, i) => {
    const parts = [
      `${i + 1} | 口播:${s.narration || "（无摘要）"}`,
      `画面:${s.visualDescription || "（未写,该段可自主决策）"}`,
    ];
    if (s.assetRefs.length > 0) parts.push(`点名素材:${s.assetRefs.join(", ")}`);
    return `· ${parts.join(" | ")}`;
  });
  return `
【已凝固分镜表(创作者采纳定稿时确定的 authored 视觉意图 —— 你是对齐器,不是再创作者)】
(每行: 段序号 | 口播摘要 | 画面意图 | 点名素材 assetId)
${lines.join("\n")}
【对齐硬约束(违反即废)】
- 有画面意图的段:**尊重并落实它,绝不推翻重新发明**;场景(scene)切分尽量与分镜段边界对齐(时间仍必须吸附 SRT 行 start)。
- 分镜点名了素材(assetRefs)的段:B-roll **必须优先选用被点名的素材**(它们在素材清单里)。
- 信息卡不得与该段 authored 画面意图冲突(该段已计划满屏素材/实拍时,不再叠大卡抢焦点)。
- 分镜「（未写）」的段:按你的专业判断自主决策(仅空白处自主)。
`;
}

export interface ProjectBrollInventoryDeps {
  /** 必须先校验 project 属于 ctx.userId + ctx.accountId，失败即整次拒绝。 */
  assertProjectAccess(
    ctx: RequestContext,
    projectId: string,
  ): Promise<unknown>;
  readArtifactContentData(
    ctx: RequestContext,
    projectId: string,
    artifactType: "output_script",
  ): Promise<Record<string, unknown> | null>;
  listProjectMaterialLinks(
    ctx: RequestContext,
    projectId: string,
  ): Promise<
    Array<{ entityType: string; entityId: string; role: string | null }>
  >;
  getAsset(
    ctx: RequestContext,
    assetId: string,
  ): Promise<{
    id: string;
    name: string;
    assetType: string;
    description: string | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }>;
}

/**
 * [T-309] B-roll 决策唯一素材入口。先锁定当前账号下的项目，再聚合该项目的
 * authored refs + material-links；material-links 是当前项目素材的唯一白名单，脚本点名
 * 只能调整白名单内素材的优先级。单条资产仍经账号域 getAsset 校验。禁止缺少项目时
 * 回退到账号整库，避免把别的项目素材送进模型。
 */
export async function collectProjectBrollInventory(
  ctx: RequestContext,
  projectId: string | null,
  deps: ProjectBrollInventoryDeps,
): Promise<BrollAssetRef[]> {
  if (!projectId) {
    throw new Error("video-decisions: 缺少项目范围，不能读取 B-roll 素材");
  }
  await deps.assertProjectAccess(ctx, projectId);

  const links = await deps.listProjectMaterialLinks(ctx, projectId);
  const disallowedAssetIds = new Set(
    links
      .filter(
        (link) =>
          link.entityType === "asset" &&
          (link.role === "cover" || link.role === "final"),
      )
      .map((link) => link.entityId),
  );
  const eligibleLinksByAssetId = new Map<
    string,
    Array<{ role: string | null }>
  >();
  for (const link of links) {
    if (link.entityType !== "asset" || disallowedAssetIds.has(link.entityId)) {
      continue;
    }
    const current = eligibleLinksByAssetId.get(link.entityId) ?? [];
    current.push({ role: link.role });
    eligibleLinksByAssetId.set(link.entityId, current);
  }
  const rows: BrollAssetRef[] = [];
  const tryPush = async (
    assetId: string,
    source: BrollSource,
    options: { excludeVideoClip?: boolean } = {},
  ) => {
    // 封面和既有成片是结构化角色，不是 B-roll 候选；无论它同时出现在旧脚本
    // assetRefs 还是素材链接中，都必须在读取内容前统一排除。
    if (disallowedAssetIds.has(assetId)) return;
    try {
      const asset = await deps.getAsset(ctx, assetId);
      if (asset.assetType !== "video" && asset.assetType !== "image") return;
      // 兼容旧版把 AI 生图误绑成 role=clip：图片仍应进入 B-roll；真正的口播
      // 粗剪视频继续排除，避免把主视频再当插画送进决策。
      if (options.excludeVideoClip && asset.assetType === "video") return;
      rows.push({
        assetId: asset.id,
        label: asset.name,
        kind: asset.assetType,
        description: asset.description ?? "",
        source,
        ...(typeof asset.width === "number" && asset.width > 0
          ? { width: asset.width }
          : {}),
        ...(typeof asset.height === "number" && asset.height > 0
          ? { height: asset.height }
          : {}),
        ...(typeof asset.durationMs === "number" && asset.durationMs > 0
          ? { durationMs: asset.durationMs }
          : {}),
      });
    } catch {
      // 越权、已删、知识条目或非当前账号资产都不进入模型输入。
    }
  };

  try {
    const scriptData = await deps.readArtifactContentData(
      ctx,
      projectId,
      "output_script",
    );
    for (const section of storyboardFromContentData(scriptData)) {
      for (const assetId of section.assetRefs) {
        const projectLinks = eligibleLinksByAssetId.get(assetId);
        if (!projectLinks) continue;
        await tryPush(assetId, "script", {
          excludeVideoClip: projectLinks.every((link) => link.role === "clip"),
        });
      }
    }
  } catch {
    // authored 来源缺失不阻断项目 material-links 主链。
  }

  for (const link of links) {
    if (link.entityType !== "asset") continue;
    if (link.role === "cover" || link.role === "final") continue;
    await tryPush(
      link.entityId,
      link.role === "broll" ? "manual" : "ammo",
      { excludeVideoClip: link.role === "clip" },
    );
  }
  return dedupeBrollRefs(rows);
}

// ── 结构化调用抽象(默认走 runStructuredNode;测试注入 fake)────────────────────

export interface StructuredCallInput<T> {
  /** skill id(registry 模板 + resolveModelSpec capability 同名)。 */
  skillId: string;
  facets: Readonly<Record<string, string | undefined>>;
  /** 动态输出契约(buildXxxDecisionSchema;逃生口压过 registry 静态 schema)。 */
  outputSchema: z.ZodType<T>;
  /** 模型 JSON 在严格 schema 前的确定性整理；只修协议漂移，不补写创作事实。 */
  normalizeObject?: (raw: unknown) => unknown;
  /** 该结构节点的单次模型请求时限；由 shared runner 统一限幅。 */
  timeoutMs?: number;
}
export type StructuredCall = <T>(input: StructuredCallInput<T>) => Promise<T>;

const VIDEO_LONG_STRUCTURED_TIMEOUT_MS = 120_000;

export type VideoOrientation = "portrait" | "landscape";

/** T-703：把用户本次选择的画幅翻译成三个视觉决策 skill 都能执行的构图约束。 */
export function orientationFacet(orientation?: VideoOrientation): string {
  if (orientation === "portrait") {
    return [
      "【本次成片画幅】竖屏 9:16（1080×1920）。",
      "构图按手机观看设计：人物与主要信息保持在中央安全区；同一时刻只放一个强视觉；截图和录屏完整 contain，不横向硬裁；字幕避开上下平台遮挡区。",
      "竖屏不是让真人长期独占全屏：当口播正在讲界面、步骤或操作过程时，语义匹配的真实录屏应成为连续主视觉，完整展示到观众看清这一段操作，人物缩到左下角画中画；不要把一段可读录屏机械截成 3–4 秒后立刻退回真人。",
    ].join("\n");
  }
  if (orientation === "landscape") {
    return [
      "【本次成片画幅】横屏 16:9（1920×1080）。",
      "构图按宽屏观看设计：可使用人物与录屏左右分区或宽幅全屏素材；保持主体和字幕安全边距；素材完整 contain，不拉伸。",
    ].join("\n");
  }
  return "";
}

/** 总导演读取的是已经组装好的候选时间线，而不是某一个节点的局部输出。 */
export function directorPlanFacet(input: {
  scenes: readonly VideoScene[];
  cards: readonly VideoInfoCard[];
  visualSlots: VideoBrollOutput["slots"];
  broll: readonly VideoBrollPick[];
  subtitles: readonly BilingualSubtitleLine[];
  inventory: readonly BrollAssetRef[];
}): string {
  const assetById = new Map(
    input.inventory.map((asset) => [asset.assetId, asset]),
  );
  return input.scenes
    .map((scene, sceneIdx) => {
      const cards = input.cards
        .filter((card) => card.sceneIdx === sceneIdx)
        .map(
          (card, ordinal) =>
            `信息卡 ref=card:${sceneIdx}:${ordinal} @${sec(card.at)}s:${card.kind}/${card.content}`,
        );
      const slots = input.visualSlots
        .filter((slot) => slot.sceneIdx === sceneIdx)
        .map(
          (slot) =>
            `画面需求@${sec(slot.at)}s:${slot.purpose}/${slot.visualBrief}`,
        );
      const broll = input.broll
        .filter((pick) => pick.sceneIdx === sceneIdx)
        .map((pick) => {
          const asset = assetById.get(pick.assetId);
          return `真实素材 ref=broll:${pick.assetId} @${sec(pick.at)}s×${sec(pick.durationSec)}s:${
            asset?.label ?? pick.assetId
          }/${pick.presentation ?? "large_stage"}/speakerMode=${pick.speakerMode ?? "未声明"}`;
        });
      const subtitleSample = input.subtitles
        .filter(
          (line) =>
            line.startSec >= scene.startSec && line.startSec < scene.endSec,
        )
        .slice(0, 4)
        .map((line) => line.zh)
        .join(" / ");
      const visuals = ["人物基底 ref=talking_head", ...cards, ...slots, ...broll];
      return [
        `场景 ${sceneIdx} | ${sec(scene.startSec)}s-${sec(scene.endSec)}s | ${scene.title} | ${scene.summary}`,
        `  视觉:${visuals.length > 0 ? visuals.join("；") : "（无信息卡或素材）"}`,
        `  字幕摘录:${subtitleSample || "（无）"}`,
      ].join("\n");
    })
    .join("\n");
}

function issueKey(issue: VideoDirectorIssue): string {
  return `${issue.sceneIdx}:${issue.severity}:${issue.code}:${issue.message}`;
}

const DIRECTOR_MAX_VISUAL_GAP_SEC = 7;
const DIRECTOR_CARD_VISIBLE_SEC = 5;
const DIRECTOR_OPENING_WINDOW_SEC = 3;
const DIRECTOR_OPENING_GAP_TOLERANCE_SEC = 0.12;

function requiredInformationBeatCount(durationSec: number): number {
  if (durationSec > 24) return 4;
  if (durationSec >= 14) return 3;
  if (durationSec >= 8) return 2;
  return 0;
}

type VisualInterval = readonly [startSec: number, endSec: number];

function mergeVisualIntervals(
  scene: VideoScene,
  intervals: readonly VisualInterval[],
): VisualInterval[] {
  const normalized = intervals
    .map(([startSec, endSec]) => [
      Math.max(scene.startSec, startSec),
      Math.min(scene.endSec, endSec),
    ] as const)
    .filter(([startSec, endSec]) => endSec > startSec + 0.01)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [startSec, endSec] of normalized) {
    const previous = merged.at(-1);
    if (!previous || startSec > previous[1] + 0.01) {
      merged.push([startSec, endSec]);
      continue;
    }
    previous[1] = Math.max(previous[1], endSec);
  }
  return merged;
}

function sceneVisualIntervals(input: {
  scene: VideoScene;
  sceneIdx: number;
  cards: readonly VideoInfoCard[];
  broll: readonly VideoBrollPick[];
}): VisualInterval[] {
  return mergeVisualIntervals(input.scene, [
    ...input.cards
      .filter((card) => card.sceneIdx === input.sceneIdx)
      .map((card) => [
        card.at,
        Math.min(input.scene.endSec, card.at + DIRECTOR_CARD_VISIBLE_SEC),
      ] as const),
    ...input.broll
      .filter((pick) => pick.sceneIdx === input.sceneIdx)
      .map((pick) => [
        pick.at,
        Math.min(input.scene.endSec, pick.at + pick.durationSec),
      ] as const),
  ]);
}

function maximumVisualGap(
  scene: VideoScene,
  intervals: readonly VisualInterval[],
): number {
  let cursor = scene.startSec;
  let maximum = 0;
  for (const [startSec, endSec] of intervals) {
    maximum = Math.max(maximum, startSec - cursor);
    cursor = Math.max(cursor, endSec);
  }
  return Math.max(maximum, scene.endSec - cursor);
}

/**
 * 开场三秒是整条成片的连续窗口，可能跨越多个短场景，因此不能复用单场景审计。
 * SEMANTIC_BOUNDARY_ALLOW:这里只确认上游已选择的信息卡或非 overlay 主素材是否在
 * 物理时间线上连续覆盖开场；不按文件名、关键词或业务名称判断该用哪一条素材。
 * 真人、字幕、品牌角标与氛围背景均不在候选集合中，不能冒充实质视觉。
 */
function openingVisualGap(input: {
  scenes: readonly VideoScene[];
  cards: readonly VideoInfoCard[];
  broll: readonly VideoBrollPick[];
}): number {
  const firstScene = input.scenes[0];
  const lastScene = input.scenes.at(-1);
  if (!firstScene || !lastScene) return 0;
  const openingWindow: VideoScene = {
    title: "开场前三秒",
    summary: "开场实质视觉覆盖",
    startSec: firstScene.startSec,
    endSec: Math.min(
      lastScene.endSec,
      firstScene.startSec + DIRECTOR_OPENING_WINDOW_SEC,
    ),
  };
  return maximumVisualGap(
    openingWindow,
    mergeVisualIntervals(openingWindow, [
      ...input.cards.map(
        (card) =>
          [card.at, card.at + DIRECTOR_CARD_VISIBLE_SEC] as const,
      ),
      ...input.broll
        .filter((pick) => pick.presentation !== "overlay")
        .map(
          (pick) =>
            [pick.at, pick.at + pick.durationSec] as const,
        ),
    ]),
  );
}

/**
 * 不依赖模型的片场安全检查：只检查时间线、真实素材 id 与视觉覆盖这些可确定事实，
 * 不用代码猜创意语义。即使总导演模型暂时不可用，也不能让结构损坏的方案进入渲染。
 */
export function auditVideoDecisions(input: {
  scenes: readonly VideoScene[];
  cards: readonly VideoInfoCard[];
  broll: readonly VideoBrollPick[];
  subtitles: readonly BilingualSubtitleLine[];
  srtLines: readonly SrtLine[];
  inventory: readonly BrollAssetRef[];
}): VideoDirectorIssue[] {
  const issues: VideoDirectorIssue[] = [];
  const assetIds = new Set(input.inventory.map((asset) => asset.assetId));
  const totalDuration = srtTotalDurationSec(input.srtLines);

  const openingGapSec = openingVisualGap(input);
  if (openingGapSec > DIRECTOR_OPENING_GAP_TOLERANCE_SEC) {
    issues.push({
      sceneIdx: 0,
      severity: "blocking",
      code: "visual_gap",
      message:
        `开场前三秒仍有约 ${openingGapSec.toFixed(1)} 秒没有实质视觉；` +
        "应优先由与第一句语义相关的真实素材连续承接，缺少合适素材时降级为第一句原文信息卡。真人、字幕、品牌角标和纯背景不计入。",
    });
  }

  input.scenes.forEach((scene, sceneIdx) => {
    const previous = input.scenes[sceneIdx - 1];
    if (
      scene.endSec <= scene.startSec ||
      (previous && Math.abs(previous.endSec - scene.startSec) > 0.05) ||
      scene.startSec < -0.05 ||
      scene.endSec > totalDuration + 0.05
    ) {
      issues.push({
        sceneIdx,
        severity: "blocking",
        code: "timing_conflict",
        message: "场景时间线有重叠、空洞或越过口播时长，系统需在当前方案内自动收口。",
      });
    }

    const intervals = sceneVisualIntervals({
      scene,
      sceneIdx,
      cards: input.cards,
      broll: input.broll,
    });
    const uncoveredSec = maximumVisualGap(scene, intervals);
    const sceneCards = input.cards.filter((card) => card.sceneIdx === sceneIdx);
    const sceneBroll = input.broll.filter((pick) => pick.sceneIdx === sceneIdx);
    const requiredBeats = requiredInformationBeatCount(
      scene.endSec - scene.startSec,
    );
    const lacksInformationBeats =
      sceneBroll.length === 0 && sceneCards.length < requiredBeats;
    if (
      scene.endSec - scene.startSec > 8 &&
      (uncoveredSec > DIRECTOR_MAX_VISUAL_GAP_SEC || lacksInformationBeats)
    ) {
      issues.push({
        sceneIdx,
        severity: "blocking",
        code: "visual_gap",
        message:
          `本场仍有约 ${uncoveredSec.toFixed(1)} 秒连续视觉空档，且需要至少 ${requiredBeats} 个信息节拍；一张小标签不等于完整承接，系统需用真实素材或连续信息节拍补齐。`,
      });
    }
  });

  for (const card of input.cards) {
    const scene = input.scenes[card.sceneIdx];
    if (!scene || card.at < scene.startSec - 0.05 || card.at >= scene.endSec) {
      issues.push({
        sceneIdx: Math.max(0, card.sceneIdx),
        severity: "blocking",
        code: "timing_conflict",
        message: "信息卡插点不在所属场景内，系统需自动吸附到当前场景。",
      });
    }
  }

  for (const pick of input.broll) {
    const scene = input.scenes[pick.sceneIdx];
    const end = pick.at + pick.durationSec;
    if (!assetIds.has(pick.assetId)) {
      issues.push({
        sceneIdx: Math.max(0, pick.sceneIdx),
        severity: "blocking",
        code: "material_conflict",
        message: "时间线引用了当前项目中不存在或无权限的素材。",
      });
    }
    if (
      !scene ||
      pick.durationSec <= 0 ||
      pick.at < scene.startSec - 0.05 ||
      end > scene.endSec + 0.05
    ) {
      issues.push({
        sceneIdx: Math.max(0, pick.sceneIdx),
        severity: "blocking",
        code: "timing_conflict",
        message: "素材插点或展示时长越过所属场景，系统需保留绑定并自动重算时间线。",
      });
    }
  }

  const seenBrollAssets = new Set<string>();
  for (const pick of input.broll) {
    if (seenBrollAssets.has(pick.assetId)) {
      issues.push({
        sceneIdx: Math.max(0, pick.sceneIdx),
        severity: "blocking",
        code: "material_conflict",
        message: "同一素材被自动重复用于多个时间段，系统需保留首次使用并移除重复绑定。",
      });
    }
    seenBrollAssets.add(pick.assetId);
  }
  for (const [sceneIdx] of input.scenes.entries()) {
    const mainVisuals = input.broll
      .filter(
        (pick) =>
          pick.sceneIdx === sceneIdx && pick.presentation !== "overlay",
      )
      .sort((a, b) => a.at - b.at);
    for (let index = 1; index < mainVisuals.length; index += 1) {
      const previous = mainVisuals[index - 1]!;
      const current = mainVisuals[index]!;
      if (previous.at + previous.durationSec > current.at + 0.05) {
        issues.push({
          sceneIdx,
          severity: "blocking",
          code: "timing_conflict",
          message: "同一时间出现了多个互斥主视觉，系统需只保留一个或顺序衔接。",
        });
      }
    }
  }

  if (
    input.subtitles.length !== input.srtLines.length ||
    input.subtitles.some((line, index) => {
      const source = input.srtLines[index];
      return (
        !source ||
        line.index !== source.index ||
        Math.abs(line.startSec - source.startSec) > 0.01 ||
        Math.abs(line.endSec - source.endSec) > 0.01
      );
    })
  ) {
    issues.push({
      sceneIdx: 0,
      severity: "blocking",
      code: "subtitle_conflict",
      message: "字幕与原始口播时间轴不一致，系统需自动恢复原始口播时间线。",
    });
  }

  return Array.from(new Map(issues.map((issue) => [issueKey(issue), issue])).values());
}

function compactDirectorCardText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const chars = Array.from(normalized);
  return chars.length <= 28
    ? normalized
    : `${chars.slice(0, 27).join("")}…`;
}

function groundedCard(input: {
  scene: VideoScene;
  at: number;
  srtLines: readonly SrtLine[];
}): Pick<VideoInfoCard, "kind" | "content" | "motion"> {
  const sceneLines = input.srtLines.filter(
    (item) =>
      item.startSec >= input.scene.startSec - 0.05 &&
      item.startSec < input.scene.endSec + 0.05,
  );
  const line = sceneLines.find(
    (item) =>
      item.startSec >= input.at - 0.05 &&
      item.startSec < input.scene.endSec + 0.05,
  ) ?? sceneLines.at(-1);
  const lineIndex = line ? sceneLines.indexOf(line) : -1;
  const exact = compactDirectorCardText(
    line?.text || input.scene.summary || input.scene.title,
  );
  // 这是模型不可用时的确定性安全兜底，只做“原句如何排版”的结构判断，
  // 不按业务词表猜语义：数字原样做大数卡；相邻两句原样做渐进清单；其余做金句卡。
  if (/\d/.test(exact)) {
    return { kind: "stat", content: exact, motion: "counter" };
  }
  const next = lineIndex >= 0 ? sceneLines[lineIndex + 1] : undefined;
  if (next && next.startSec - (line?.startSec ?? input.at) <= DIRECTOR_CARD_VISIBLE_SEC) {
    return {
      kind: "list",
      content: `${exact}、${compactDirectorCardText(next.text)}`,
      motion: "reveal",
    };
  }
  return { kind: "quote", content: exact, motion: "plain" };
}

/**
 * 总导演的确定性修片层。
 *
 * 首轮分镜和素材匹配一旦产出，就视为当前方案的已绑定事实：这里不会重新跑分场、
 * 不会按字符串猜素材、也不会删除仍然存在的用户素材。时间越界会在原场景内收口；
 * 视觉承接不足则直接用口播原文生成信息卡补位。这样总导演负责把片修到可渲染，
 * 而不是把“缺素材/重新分镜”的作业退回给用户。
 */
export function autoRepairVideoDecisions(input: {
  scenes: readonly VideoScene[];
  cards: readonly VideoInfoCard[];
  broll: readonly VideoBrollPick[];
  subtitles: readonly BilingualSubtitleLine[];
  srtLines: readonly SrtLine[];
  inventory: readonly BrollAssetRef[];
  orientation?: VideoOrientation;
  issues?: readonly VideoDirectorIssue[];
}): {
  cards: VideoInfoCard[];
  broll: VideoBrollPick[];
  subtitles: BilingualSubtitleLine[];
  repairs: string[];
} {
  const repairs: string[] = [];
  const starts = srtStartSet(input.srtLines);
  const inventoryById = new Map(
    input.inventory.map((asset) => [asset.assetId, asset] as const),
  );

  const cards = input.cards.flatMap((card) => {
    const scene = input.scenes[card.sceneIdx];
    if (!scene) return [];
    const at = Math.min(
      Math.max(nearestSrtStart(card.at, starts), scene.startSec),
      Math.max(scene.startSec, scene.endSec - 0.01),
    );
    if (Math.abs(at - card.at) > 0.01) repairs.push("信息卡插点已收口到所属场景");
    return [{ ...card, at }];
  });

  let broll = input.broll.flatMap((pick) => {
    const scene = input.scenes[pick.sceneIdx];
    const asset = inventoryById.get(pick.assetId);
    if (!scene || !asset) {
      repairs.push("失效素材引用已由信息卡接替");
      return [];
    }
    const at = Math.min(
      Math.max(pick.at, scene.startSec),
      Math.max(scene.startSec, scene.endSec - 0.01),
    );
    const assetDurationSec = Math.max(0, (asset.durationMs ?? 0) / 1000);
    const sceneAvailable = Math.max(0.1, scene.endSec - at);
    const durationSec = Math.max(
      0.1,
      Math.min(
        pick.durationSec > 0 ? pick.durationSec : sceneAvailable,
        sceneAvailable,
        assetDurationSec > 0 ? assetDurationSec : sceneAvailable,
      ),
    );
    if (
      Math.abs(at - pick.at) > 0.01 ||
      Math.abs(durationSec - pick.durationSec) > 0.01
    ) {
      repairs.push("已绑定素材的插点与时长已在原场景内重算");
    }
    return [{ ...pick, at, durationSec }];
  });

  // 竖屏里，AI 已明确选为 full_frame 的录屏就是本段操作讲解的主视觉。把它延长到
  // 当前场景/素材真实可用边界，后续 normalizeBrollTimeline 仍会在下一个主视觉开始处
  // 截断，因此不会制造重叠。真人由渲染模板自动退到画中画，不再让录屏只闪 3–4 秒。
  // SEMANTIC_BOUNDARY_ALLOW: 这里只落实 AI 已给出的 visualRole/presentation，按真实
  // 场景和素材时长执行物理排版；不根据文件名、关键词或业务语义自行选择素材。
  if (input.orientation === "portrait") {
    for (const pick of broll) {
      if (
        pick.visualRole !== "screen_recording" ||
        pick.presentation !== "full_frame"
      ) {
        continue;
      }
      const scene = input.scenes[pick.sceneIdx];
      const asset = inventoryById.get(pick.assetId);
      if (!scene || !asset) continue;
      const sceneAvailable = Math.max(0.1, scene.endSec - pick.at);
      const assetDurationSec = Math.max(0, (asset.durationMs ?? 0) / 1000);
      const readableDurationSec = Math.max(
        0.1,
        Math.min(
          sceneAvailable,
          assetDurationSec > 0 ? assetDurationSec : sceneAvailable,
        ),
      );
      if (readableDurationSec > pick.durationSec + 0.01) {
        pick.durationSec = readableDurationSec;
        repairs.push("竖屏录屏已延长为本段连续主视觉，真人改由画中画承接");
      }
    }
  }

  const normalizedTimeline = normalizeBrollTimeline({
    scenes: input.scenes,
    broll,
  });
  broll = normalizedTimeline.broll;
  repairs.push(...normalizedTimeline.repairs);

  // AI 若认为某场素材语义承接不足，仍保留已绑定素材；只有非录屏镜头才
  // 收成短镜头并用信息卡接力。screen_recording + full_frame 是上游 AI 已作出的
  // 创作选择，代码只守呈现边界：连续操作必须保留可读时长，不能被兜底统一截成 4 秒。
  // SEMANTIC_BOUNDARY_ALLOW: 此处分支只依据 AI 已返回的视觉角色/版式执行物理时长策略，
  // 不通过文件名、关键词或业务名称重新判断素材语义。
  const conflictScenes = new Set(
    (input.issues ?? [])
      .filter(
        (issue) =>
          issue.severity === "blocking" &&
          (issue.code === "material_conflict" ||
            issue.code === "narrative_gap"),
      )
      .map((issue) => issue.sceneIdx),
  );
  for (const pick of broll) {
    if (!conflictScenes.has(pick.sceneIdx)) continue;
    if (
      pick.visualRole === "screen_recording" &&
      pick.presentation === "full_frame"
    ) {
      repairs.push("录屏主视觉已保留可读时长，语义空档由信息卡接力");
      continue;
    }
    pick.durationSec = Math.min(pick.durationSec, 4);
    repairs.push("语义承接不足的已绑定素材已改为短镜头并由信息卡接力");
  }

  const ensureCardAt = (
    sceneIdx: number,
    requestedAt: number,
    options?: { nearToleranceSec?: number; repairMessage?: string },
  ) => {
    const scene = input.scenes[sceneIdx];
    if (!scene) return;
    const at = Math.min(
      Math.max(nearestSrtStart(requestedAt, starts), scene.startSec),
      Math.max(scene.startSec, scene.endSec - 0.01),
    );
    if (
      cards.some(
        (card) =>
          card.sceneIdx === sceneIdx &&
          Math.abs(card.at - at) < (options?.nearToleranceSec ?? 1.5),
      )
    ) return;
    const fallback = groundedCard({ scene, at, srtLines: input.srtLines });
    cards.push({
      sceneIdx,
      ...fallback,
      at,
    });
    repairs.push(
      options?.repairMessage ?? "视觉空档已用口播原文信息节拍补齐",
    );
  };

  // 开场真实素材的选择与插点必须由 video.broll + material.match 完成；若两次 AI
  // 编导仍没把合法主素材放到首屏，确定性层只引用第一句原文做诚实降级，不擅自移动
  // 晚到素材（那会改变素材与口播的语义对应）。
  if (
    openingVisualGap({ scenes: input.scenes, cards, broll }) >
    DIRECTOR_OPENING_GAP_TOLERANCE_SEC
  ) {
    ensureCardAt(0, input.scenes[0]?.startSec ?? 0, {
      nearToleranceSec: DIRECTOR_OPENING_GAP_TOLERANCE_SEC,
      repairMessage: "开场前三秒已用第一句原文信息卡连续承接",
    });
  }

  for (const [sceneIdx, scene] of input.scenes.entries()) {
    const sceneBroll = broll.filter((pick) => pick.sceneIdx === sceneIdx);
    const requiredBeats = requiredInformationBeatCount(
      scene.endSec - scene.startSec,
    );
    // 没有真实素材承接时，先按时长建立最低信息节拍。这里只决定“什么时候需要
    // 一个视觉 beat”，卡片语义仍由 groundedCard 从当前口播逐句提取，绝不写死业务词。
    if (sceneBroll.length === 0 && requiredBeats > 0) {
      for (let index = 0; index < requiredBeats; index += 1) {
        ensureCardAt(
          sceneIdx,
          scene.startSec +
            ((scene.endSec - scene.startSec) * index) / requiredBeats,
        );
      }
    }
    const intervals = sceneVisualIntervals({ scene, sceneIdx, cards, broll });
    let cursor = scene.startSec;
    for (const [start, end] of intervals) {
      while (start - cursor > DIRECTOR_MAX_VISUAL_GAP_SEC) {
        ensureCardAt(sceneIdx, cursor);
        cursor += DIRECTOR_CARD_VISIBLE_SEC;
      }
      cursor = Math.max(cursor, end);
    }
    while (scene.endSec - cursor > DIRECTOR_MAX_VISUAL_GAP_SEC) {
      ensureCardAt(sceneIdx, cursor);
      cursor += DIRECTOR_CARD_VISIBLE_SEC;
    }
  }

  // 每个 AI 阻断项都必须在本轮自动修片中得到一个视觉承接，不留给用户处理。
  for (const issue of input.issues ?? []) {
    if (issue.severity !== "blocking") continue;
    const scene = input.scenes[issue.sceneIdx];
    if (scene) ensureCardAt(issue.sceneIdx, scene.startSec);
  }

  const translatedByIndex = new Map(
    input.subtitles.map((line) => [line.index, line] as const),
  );
  const subtitles = input.srtLines.map((source) => ({
    index: source.index,
    startSec: source.startSec,
    endSec: source.endSec,
    zh: translatedByIndex.get(source.index)?.zh || source.text,
    en: translatedByIndex.get(source.index)?.en || "",
  }));
  if (subtitles.length !== input.subtitles.length) {
    repairs.push("字幕已恢复为口播原始时间轴");
  }

  return {
    cards: cards.sort((a, b) => a.at - b.at),
    broll: broll.sort((a, b) => a.at - b.at),
    subtitles,
    repairs: [...new Set(repairs)],
  };
}

// ── 四决策函数(纯编排:调模型 → 后处理吸附/剔除;各自可独测)──────────────────

const INTERNAL_SCENE_TITLE_RE =
  /^(?:新闻|开场|黄金|悬念|冲突|痛点|反差|价值|论点|正文|展开|案例|转折|总结|结尾|行动|cta|hook)(?:钩子|段落|段|部分|场景)?$/i;

function compactSceneTitle(text: string): string {
  const chars = Array.from(text.trim().replace(/\s+/g, " "));
  return chars.length <= 15
    ? chars.join("")
    : `${chars.slice(0, 14).join("")}…`;
}

function normalizeSceneTitle(
  title: string,
  startSec: number,
  endSec: number,
  srtLines: readonly SrtLine[],
): string {
  const clean = title.trim();
  if (clean && !INTERNAL_SCENE_TITLE_RE.test(clean)) {
    return compactSceneTitle(clean);
  }
  const spoken = srtLines.find(
    (line) => line.startSec >= startSec && line.startSec < endSec,
  )?.text;
  return compactSceneTitle(spoken || clean || "本段重点");
}

/** ① 语义分场:边界吸附 SRT 行 start,排序去重,首场对齐首行,endSec = 下场 start / 总时长。
 *  [T-387c] storyboard(凝固分镜 facet,可选):有 authored 意图段 → scene 切分对齐段边界
 *  (仍吸附 SRT);空串/缺省 → 占位替换为空 = 现状(零回归)。 */
export async function decideScenes(
  input: {
    srtLines: readonly SrtLine[];
    script: string;
    storyboard?: string;
    orientation?: VideoOrientation;
    manualAssignments?: string;
  },
  call: StructuredCall,
): Promise<VideoScene[]> {
  const starts = srtStartSet(input.srtLines);
  const out = await call<VideoScenesOutput>({
    skillId: "video.scenes",
    facets: {
      srt: srtFacet(input.srtLines),
      script: input.script,
      storyboard: input.storyboard ?? "",
      orientation: orientationFacet(input.orientation),
      manualAssignments: input.manualAssignments ?? "",
    },
    outputSchema: buildScenesDecisionSchema(starts),
    timeoutMs: VIDEO_LONG_STRUCTURED_TIMEOUT_MS,
  });
  const total = srtTotalDurationSec(input.srtLines);
  // 吸附 → 按 start 排序 → 同一 start 去重(保留先出现的)。
  const snapped = out.scenes
    .map((s) => ({ ...s, startSec: nearestSrtStart(s.startSec, starts) }))
    .sort((a, b) => a.startSec - b.startSec)
    .filter((s, i, arr) => i === 0 || s.startSec !== arr[i - 1]!.startSec);
  if (snapped.length === 0) throw new Error("分场结果为空");
  // 首场强制从第一行起(不留片头空洞);endSec 一律推导(下一场 start / 总时长),不信模型。
  snapped[0] = { ...snapped[0]!, startSec: starts[0] ?? 0 };
  return snapped.map((s, i) => {
    const endSec = i + 1 < snapped.length ? snapped[i + 1]!.startSec : total;
    return {
      title: normalizeSceneTitle(
        s.title,
        s.startSec,
        endSec,
        input.srtLines,
      ),
      startSec: s.startSec,
      endSec,
      summary: s.summary.trim(),
    };
  });
}

/** ② 信息卡:at 吸附 + 钳进所属场景;content 可溯校验不过 → 剔除(诚实门)。 */
export async function decideCards(
  input: {
    scenes: readonly VideoScene[];
    srtLines: readonly SrtLine[];
    script: string;
    /** [T-387c] 凝固分镜 facet(可选):cards 不与 authored 画面冲突;空 = 现状。 */
    storyboard?: string;
    orientation?: VideoOrientation;
    manualAssignments?: string;
  },
  call: StructuredCall,
): Promise<VideoInfoCard[]> {
  const starts = srtStartSet(input.srtLines);
  // SEMANTIC_BOUNDARY_ALLOW: 冻结稿与真实口播可能因现场省略、口误或即兴表达而不同；
  // `video.cards` 同时消费两者，所以上屏可溯真值也必须同时包含冻结稿和权威 SRT。
  // 这里只扩大“逐字可从已说内容找到”的安全语料，不做同义匹配、创作补写或关键词猜测。
  const traceabilityCorpus = [
    input.script,
    ...input.srtLines.map((line) => line.text),
  ].join("\n");
  const out = await call<VideoCardsOutput>({
    skillId: "video.cards",
    facets: {
      scenes: scenesFacet(input.scenes),
      srt: srtFacet(input.srtLines),
      script: input.script,
      storyboard: input.storyboard ?? "",
      orientation: orientationFacet(input.orientation),
      manualAssignments: input.manualAssignments ?? "",
    },
    outputSchema: buildCardsDecisionSchema(input.scenes.length, starts),
    normalizeObject: normalizeVideoCardsOutput,
    timeoutMs: VIDEO_LONG_STRUCTURED_TIMEOUT_MS,
  });
  const kept: VideoInfoCard[] = [];
  for (const c of out.cards) {
    const scene = input.scenes[c.sceneIdx];
    if (!scene) continue; // fake/兜底路径可能没过 refine,双保险
    const content = c.content.trim();
    if (!content) continue;
    // 可溯校验(T-224 同源):数值/关键词不在口播原文 → 剔除,绝不带编造进预览卡。
    if (!isCardContentTraceable(content, traceabilityCorpus)) continue;
    // 新计划由 AI 选择所服务的 SRT 行，代码只把行号落实为权威起秒；旧计划没有
    // srtLineIndex 时才沿用 at 吸附。这样录音比稿件计划慢/快时，卡片仍跟当前字幕切换。
    const anchoredLine =
      typeof c.srtLineIndex === "number"
        ? input.srtLines.find(
            (line) =>
              line.index === c.srtLineIndex &&
              line.startSec >= scene.startSec &&
              line.startSec < scene.endSec,
          )
        : undefined;
    const requestedAt = anchoredLine?.startSec ?? c.at;
    // at:先钳进场景范围,再吸附行 start(吸附结果仍钳一次,防吸到邻场行)。
    const clamped = Math.min(
      Math.max(requestedAt, scene.startSec),
      Math.max(scene.startSec, scene.endSec - 0.001),
    );
    const sceneStarts = starts.filter(
      (s) => s >= scene.startSec && s < scene.endSec,
    );
    const at = nearestSrtStart(
      clamped,
      sceneStarts.length > 0 ? sceneStarts : starts,
    );
    // [T-295] motion 原样透传(模型不产就不带;缺省由 template 按 kind 派生)。
    const visualPlan = c.visualPlan;
    // SEMANTIC_BOUNDARY_ALLOW: 不判断关系是否“适合”，只检查每个模型所选部件都来自原文；
    // 任一部件不可溯就丢计划，保留合法旧卡，兼容弱模型与历史候选。
    const traceableVisualPlan =
      visualPlan &&
      isVideoCardVisualPlanStructurallyValid(visualPlan) &&
      visualPlan.parts.every((part) =>
        isCardPartStrictlyTraceable(part.text, traceabilityCorpus),
      )
        ? visualPlan
        : undefined;
    kept.push({
      sceneIdx: c.sceneIdx,
      kind: c.kind,
      content,
      at,
      ...(anchoredLine ? { srtLineIndex: anchoredLine.index } : {}),
      ...(c.motion ? { motion: c.motion } : {}),
      ...(traceableVisualPlan ? { visualPlan: traceableVisualPlan } : {}),
    });
  }
  return kept;
}

/** ③ B-roll:只产出视觉需求；真实素材绑定统一交给 material.match。 */
export async function decideBroll(
  input: {
    scenes: readonly VideoScene[];
    srtLines: readonly SrtLine[];
    script: string;
    inventory: readonly BrollAssetRef[];
    /** [T-387c] 凝固分镜 facet(可选):点名素材的段 broll 必选点名素材;空 = 现状。 */
    storyboard?: string;
    orientation?: VideoOrientation;
    manualAssignments?: string;
  },
  call: StructuredCall,
): Promise<VideoBrollOutput> {
  const ids = input.inventory.map((a) => a.assetId);
  const out = await call<VideoBrollOutput>({
    skillId: "video.broll",
    facets: {
      scenes: scenesFacet(input.scenes),
      script: input.script,
      library: libraryFacet(input.inventory),
      storyboard: input.storyboard ?? "",
      orientation: orientationFacet(input.orientation),
      manualAssignments: input.manualAssignments ?? "",
    },
    outputSchema: buildBrollDecisionSchema(ids, input.scenes.length),
    normalizeObject: normalizeVideoBrollOutput,
  });
  const slots = (out.slots ?? []).filter(
    (slot) => slot.sceneIdx >= 0 && slot.sceneIdx < input.scenes.length,
  );
  // 即使弱模型违约在 broll 字段里直接选了素材，也不允许越过
  // material.match。否则模型会按文件名或旧 prompt 随意塞 4 秒占位片。
  return { slots, broll: [] };
}

/**
 * 用现有 material.match Skill 把“视觉需求”与当前项目真实素材做 AI 语义匹配。
 * 这里不做关键词、文件名或向量相似度判断；代码只负责鉴权清单、场景索引与时间边界。
 */
export async function decideMaterialBroll(
  input: {
    scenes: readonly VideoScene[];
    srtLines: readonly SrtLine[];
    script: string;
    inventory: readonly BrollAssetRef[];
    visualSlots: VideoBrollOutput["slots"];
    orientation?: VideoOrientation;
    manualAssignments?: string;
  },
  call: StructuredCall,
): Promise<VideoBrollPick[]> {
  if (input.inventory.length === 0) return [];
  const assetIds = input.inventory.map((asset) => asset.assetId);
  const output = await call<MaterialMatchOutput>({
    skillId: "material.match",
    facets: {
      positioning: "以本条口播、视频场景和视觉编导需求为准",
      topic: input.script,
      script: input.script,
      scenes: scenesFacet(input.scenes),
      visualSlots: visualSlotsFacet(input.visualSlots),
      library: libraryFacet(input.inventory),
      orientation: orientationFacet(input.orientation),
      manualAssignments: input.manualAssignments ?? "",
    },
    outputSchema: buildVideoMaterialMatchSchema(
      assetIds,
      input.scenes.length,
    ),
  });

  const idSet = new Set(assetIds);
  const used = new Set<string>();
  const starts = srtStartSet(input.srtLines);
  const picks: VideoBrollPick[] = [];
  for (const match of output.matches) {
    if (
      !idSet.has(match.assetId) ||
      match.role === "cover" ||
      typeof match.sceneIdx !== "number" ||
      used.has(match.assetId)
    ) {
      continue;
    }
    const scene = input.scenes[match.sceneIdx];
    if (!scene) continue;
    const sceneStarts = starts.filter(
      (start) => start >= scene.startSec && start < scene.endSec,
    );
    const requestedAt =
      typeof match.at === "number" && Number.isFinite(match.at)
        ? match.at
        : scene.startSec;
    const at = nearestSrtStart(
      Math.min(
        Math.max(requestedAt, scene.startSec),
        Math.max(scene.startSec, scene.endSec - 0.001),
      ),
      sceneStarts.length > 0 ? sceneStarts : starts,
    );
    const assetDuration =
      (input.inventory.find((asset) => asset.assetId === match.assetId)
        ?.durationMs ?? 0) / 1000;
    const requestedDuration =
      typeof match.durationSec === "number" &&
      Number.isFinite(match.durationSec)
        ? match.durationSec
        : assetDuration > 0
          ? assetDuration
          : Math.max(1, scene.endSec - at);
    picks.push({
      sceneIdx: match.sceneIdx,
      assetId: match.assetId,
      at,
      durationSec: Math.max(
        1,
        Math.min(requestedDuration, Math.max(1, scene.endSec - at)),
      ),
      // 老模型/旧 Skill 没返回 presentation 时采用可读性安全下限；不猜语义，
      // 只确保用户选中的真实素材不会再次被渲染成小到看不清的卡片。
      presentation: match.presentation ?? "large_stage",
      visualRole:
        match.visualRole === "screen_recording" ||
        match.visualRole === "still_image" ||
        match.visualRole === "live_footage"
          ? match.visualRole
          : undefined,
      ...(match.speakerMode ? { speakerMode: match.speakerMode } : {}),
      motion: match.motion ?? "static",
    });
    used.add(match.assetId);
  }
  return picks.sort((a, b) => a.at - b.at);
}

/**
 * 模型若漏掉人工选中的素材，代码只执行用户已明确的 assetId 与原场景序号，不做语义猜测。
 * 正常路径仍以 material.match 的 AI 插点/时长为准；这里仅是“不丢用户选择”的安全兜底。
 */
export function enforceManualMaterialAssignments(input: {
  assignments: readonly ManualMaterialAssignment[];
  scenes: readonly VideoScene[];
  srtLines: readonly SrtLine[];
  inventory: readonly BrollAssetRef[];
  modelBroll: readonly VideoBrollPick[];
}): VideoBrollPick[] {
  if (input.scenes.length === 0 || input.assignments.length === 0) {
    return normalizeBrollTimeline({
      scenes: input.scenes,
      broll: input.modelBroll,
    }).broll;
  }
  const byId = new Map(input.inventory.map((asset) => [asset.assetId, asset]));
  const assignmentIds = new Set(input.assignments.map((item) => item.assetId));
  const existingById = new Map(
    input.modelBroll
      .filter((pick) => assignmentIds.has(pick.assetId))
      .map((pick) => [pick.assetId, pick] as const),
  );
  const out = input.modelBroll.filter((pick) => !assignmentIds.has(pick.assetId));
  for (const assignment of input.assignments) {
    if (!byId.has(assignment.assetId)) continue;
    const sceneIdx = Math.min(
      Math.max(assignment.sceneIdx, 0),
      input.scenes.length - 1,
    );
    const scene = input.scenes[sceneIdx]!;
    const existing = existingById.get(assignment.assetId);
    if (existing?.sceneIdx === sceneIdx) {
      out.push(existing);
      continue;
    }
    const at =
      input.srtLines.find(
        (line) =>
          line.startSec >= scene.startSec && line.startSec < scene.endSec,
      )?.startSec ?? scene.startSec;
    const available = Math.max(1, scene.endSec - at);
    const assetDuration = (byId.get(assignment.assetId)?.durationMs ?? 0) / 1000;
    out.push({
      sceneIdx,
      assetId: assignment.assetId,
      at,
      durationSec:
        assetDuration > 0 ? Math.max(1, Math.min(assetDuration, available)) : available,
      presentation: "large_stage",
      motion: "static",
    });
  }
  return normalizeBrollTimeline({ scenes: input.scenes, broll: out }).broll;
}

/** zh 校正「改动最小」守门阈值:与原行 token 相似度低于它 → 视为重写,退回原文。 */
export const SUBTITLE_REWRITE_GUARD = 0.6;
/** [T-429] 单次结构化字幕输出上限：控制在约 30~40 行。 */
export const SUBTITLE_CHUNK_LINES = 36;

function validSubtitleEmphasis(input: {
  raw: unknown;
  zh: string;
  source: SrtLine;
}): VideoSubtitleEmphasis[] {
  if (!Array.isArray(input.raw)) return [];
  const chars = Array.from(input.zh);
  return input.raw.flatMap((candidate) => {
    const parsed = videoSubtitleEmphasis.safeParse(candidate);
    if (!parsed.success) return [];
    const item = parsed.data;
    if (
      item.endChar <= item.startChar ||
      item.endChar > chars.length ||
      chars.slice(item.startChar, item.endChar).join("") !== item.text ||
      item.startSec < input.source.startSec - 1e-6 ||
      item.endSec > input.source.endSec + 1e-6 ||
      item.endSec <= item.startSec
    ) {
      return [];
    }
    return [item];
  });
}

// 两段文本的 token 集 Dice 相似度(与 srt.ts 相似度同款 token 化)。
function lineSimilarity(a: string, b: string): number {
  const sa = new Set(tokenizeForOverlap(a));
  const sb = new Set(tokenizeForOverlap(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

function normalizeSubtitleEvidence(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 中文一旦发生改动，校正后的整行必须能在已确认口播稿中找到连续依据。 */
function correctionAnchoredInScript(
  corrected: string,
  original: string,
  script: string,
): boolean {
  const normalizedCorrected = normalizeSubtitleEvidence(corrected);
  const normalizedOriginal = normalizeSubtitleEvidence(original);
  if (normalizedCorrected === normalizedOriginal) return true;
  if (!normalizedCorrected) return false;
  return normalizeSubtitleEvidence(script).includes(normalizedCorrected);
}

/** ④ 双语字幕:行数/时间轴不变(时间从原行回填);zh 改动过大退回原文(改动最小铁律)。
 *  [T-320] 文本校正接口口播稿:script 作校正基准喂进 skill —— ASR 认错字(同音/近音/专名)按
 *  口播稿改回,对不上口播稿的一律不动(改动最小 + SUBTITLE_REWRITE_GUARD 双保险)。时间不动(§2 铁律)。 */
export async function decideSubtitles(
  input: {
    srtLines: readonly SrtLine[];
    script: string;
    onChunkProgress?: ChunkProgressListener;
    /** 新 video.decisions 候选必须至少包含一个 AI 重点词；旧调用保持兼容。 */
    requireEmphasis?: boolean;
  },
  call: StructuredCall,
): Promise<BilingualSubtitleLine[]> {
  const chunks = chunkOrderedItems(input.srtLines, SUBTITLE_CHUNK_LINES);
  const translatedChunks = await runOrderedChunks({
    chunks,
    onProgress: input.onChunkProgress,
    process: async (chunk) => {
      const batch = chunk.items;
      const out = await call<VideoSubtitlesOutput>({
        skillId: "video.subtitles",
        facets: {
          srt: srtFacet(batch),
          script: input.script,
          emphasisRequirement: "",
        },
        outputSchema: buildSubtitlesDecisionSchema(batch),
      });
      return out.lines;
    },
    // 字幕允许局部优雅降级：失败批次保留 zh 原文、en 留空，且继续后续批次。
    onChunkError: (_error, chunk) =>
      chunk.items.map((line) => ({
        index: line.index,
        zh: line.text,
        en: "",
        emphasis: [],
      })),
  });
  const byIndex = new Map(
    translatedChunks.flat().map((line) => [line.index, line]),
  );
  let result = input.srtLines.map((orig) => {
    const got = byIndex.get(orig.index);
    let zh = (got?.zh ?? "").trim() || orig.text;
    // 双守门：改动必须足够小，且校正后的文字必须在已确认口播稿中有依据。
    if (
      lineSimilarity(zh, orig.text) < SUBTITLE_REWRITE_GUARD ||
      !correctionAnchoredInScript(zh, orig.text, input.script)
    ) {
      zh = orig.text;
    }
    const emphasis = validSubtitleEmphasis({
      raw: got?.emphasis,
      zh,
      source: orig,
    });
    return {
      index: orig.index,
      startSec: orig.startSec, // 时间轴永远回填原值 —— 模型无权改时钟
      endSec: orig.endSec,
      zh,
      en: (got?.en ?? "").trim(),
      ...(emphasis.length > 0 ? { emphasis } : {}),
    };
  });

  if (
    input.requireEmphasis &&
    input.srtLines.length > 0 &&
    result.every((line) => !line.emphasis?.length)
  ) {
    const retryBatch = input.srtLines.slice(0, SUBTITLE_CHUNK_LINES);
    const retry = await call<VideoSubtitlesOutput>({
      skillId: "video.subtitles",
      facets: {
        srt: srtFacet(retryBatch),
        script: input.script,
        emphasisRequirement:
          "本轮是唯一一次重点词定向重试：至少一行必须选择 1 个逐字来自 zh、时间落在本行内的真实重点词。",
      },
      outputSchema: buildSubtitlesDecisionSchema(retryBatch),
    });
    const retryByIndex = new Map(retry.lines.map((line) => [line.index, line]));
    result = result.map((line) => {
      const source = input.srtLines.find((item) => item.index === line.index);
      const retried = retryByIndex.get(line.index);
      if (!source || !retried) return line;
      const emphasis = validSubtitleEmphasis({
        raw: retried.emphasis,
        zh: line.zh,
        source,
      });
      return emphasis.length > 0 ? { ...line, emphasis } : line;
    });
    if (result.every((line) => !line.emphasis?.length)) {
      throw new Error("重点词未产出：字幕模型定向重试后仍无合法 emphasis");
    }
  }
  return result;
}

/**
 * ⑤ 总导演统筹审核：AI 只做整体叙事/素材/构图判断，代码安全检查独立执行。
 * AI 不可用时降级为确定性结构审核与自动补位；不会把审片作业退给用户，
 * 也不会自动换 key 或无限重跑。
 */
export async function decideDirectorReview(
  input: {
    scenes: readonly VideoScene[];
    cards: readonly VideoInfoCard[];
    visualSlots: VideoBrollOutput["slots"];
    broll: readonly VideoBrollPick[];
    subtitles: readonly BilingualSubtitleLine[];
    srtLines: readonly SrtLine[];
    script: string;
    inventory: readonly BrollAssetRef[];
    orientation?: VideoOrientation;
  },
  call: StructuredCall,
): Promise<VideoDirectorReview> {
  const deterministicIssues = auditVideoDecisions(input);
  let output: VideoDirectorReviewOutput;
  try {
    output = await call<VideoDirectorReviewOutput>({
      skillId: "video.director",
      facets: {
        script: input.script,
        orientation: orientationFacet(input.orientation),
        plan: directorPlanFacet(input),
        inventory: libraryFacet(input.inventory) || "（当前项目没有额外素材）",
      },
      outputSchema: videoDirectorReviewSchema,
    });
  } catch {
    const fallbackIssues = [...deterministicIssues];
    if (input.scenes.length > 0) {
      fallbackIssues.push({
        sceneIdx: 0,
        severity: "warning",
        code: "narrative_gap",
        message:
          "整体叙事审片暂不可用，系统已完成结构校验与信息卡自动补位。",
      });
    }
    return {
      status: fallbackIssues.some((issue) => issue.severity === "blocking")
        ? "needs_attention"
        : "ready",
      summary:
        deterministicIssues.length > 0
          ? "结构审核发现的问题已交由系统在当前方案内自动修正。"
          : "时间线与素材安全检查通过，系统已按当前方案完成自动补位。",
      issues: fallbackIssues,
      source: "deterministic_fallback",
    };
  }

  const directionResult = buildVideoDirectionSchema({
    scenes: input.scenes,
    cards: input.cards,
    broll: input.broll,
  }).safeParse({
    motionThesis: output.motionThesis,
    beatGraph: output.beatGraph,
  });
  if (!directionResult.success) {
    deterministicIssues.push({
      sceneIdx: 0,
      severity: "blocking",
      code: "timing_conflict",
      message:
        "整片 beat graph 含无效引用、对象时间窗或重叠主视觉，系统需让总导演按当前真实时间线重做方向。",
    });
  }

  const aiIssues: VideoDirectorIssue[] = output.issues.flatMap((issue) => {
    if (
      issue.sceneIdx < 0 ||
      issue.sceneIdx >= input.scenes.length ||
      !issue.message.trim()
    ) {
      return [];
    }
    return [{ ...issue, message: issue.message.trim() }];
  });
  if (
    output.verdict === "revise" &&
    !aiIssues.some((issue) => issue.severity === "blocking")
  ) {
    const first = aiIssues[0];
    aiIssues.push({
      sceneIdx: first?.sceneIdx ?? 0,
      severity: "blocking",
      code: first?.code ?? "narrative_gap",
      message:
        first?.message || "系统需在当前方案内自动修片并复审。",
    });
  }
  const issues = Array.from(
    new Map(
      [...deterministicIssues, ...aiIssues].map((issue) => [
        issueKey(issue),
        issue,
      ]),
    ).values(),
  );
  const hasBlocking = issues.some((issue) => issue.severity === "blocking");
  return {
    status: hasBlocking ? "needs_attention" : "ready",
    summary:
      output.summary.trim() ||
      (hasBlocking ? "总导演已进入自动修片与复审。" : "总导演审片通过。"),
    issues,
    ...(directionResult.success ? { direction: directionResult.data } : {}),
    source: "ai",
  };
}

/**
 * 总导演闭环：首审发现问题后在当前方案内自动修片并复审。
 * 最终只向用户交付可渲染方案；首审/复审意见都是内部工作记录，不再成为用户门禁。
 */
export async function closeDirectorReview(
  input: {
    scenes: readonly VideoScene[];
    cards: readonly VideoInfoCard[];
    visualSlots: VideoBrollOutput["slots"];
    broll: readonly VideoBrollPick[];
    subtitles: readonly BilingualSubtitleLine[];
    srtLines: readonly SrtLine[];
    script: string;
    inventory: readonly BrollAssetRef[];
    orientation?: VideoOrientation;
  },
  call: StructuredCall,
): Promise<{
  cards: VideoInfoCard[];
  broll: VideoBrollPick[];
  subtitles: BilingualSubtitleLine[];
  directorReview: VideoDirectorReview;
  repairs: string[];
  reviewPasses: number;
}> {
  const firstReview = await decideDirectorReview(input, call);
  let lastReview = firstReview;
  let reviewPasses = 1;
  let current = {
    cards: [...input.cards],
    broll: [...input.broll],
    subtitles: [...input.subtitles],
  };
  const allRepairs: string[] = [];

  // 最多两轮“审片 → 自动修片”，每轮修片后都必须让总导演重新读取修后的当下
  // 时间线。禁止第二次修片后沿用上一次的意见冒充复审通过。
  for (let repairPass = 0; repairPass < 2; repairPass += 1) {
    const repaired = autoRepairVideoDecisions({
      ...input,
      ...current,
      issues: lastReview.issues,
    });
    current = {
      cards: repaired.cards,
      broll: repaired.broll,
      subtitles: repaired.subtitles,
    };
    allRepairs.push(...repaired.repairs);

    const changed = repaired.repairs.length > 0;
    if (lastReview.status === "ready" && !changed) break;
    lastReview = await decideDirectorReview(
      { ...input, ...current },
      call,
    );
    reviewPasses += 1;
    if (lastReview.status === "ready") break;
  }

  const remainingStructuralIssues = auditVideoDecisions({
    scenes: input.scenes,
    cards: current.cards,
    broll: current.broll,
    subtitles: current.subtitles,
    srtLines: input.srtLines,
    inventory: input.inventory,
  });
  if (remainingStructuralIssues.some((issue) => issue.severity === "blocking")) {
    // 这里代表代码层无法安全修复的结构损坏，不允许把半套候选或“请用户补素材”
    // 落到界面。让任务明确失败，下一次运行重新产完整候选。
    throw new Error("总导演自动修片后时间线仍未闭合，已停止生成半套候选");
  }
  const repeatedSubjectiveIssues =
    lastReview.status === "needs_attention"
      ? lastReview.issues.filter((issue) => issue.severity === "blocking")
      : [];
  if (repeatedSubjectiveIssues.length > 0) {
    // SEMANTIC_BOUNDARY_ALLOW:导演模型负责创作判断，代码只在已通过确定性时间线/权限/
    // 类型/覆盖审计后，终止“同一建议反复 revise”的非收敛循环。这里不猜新的创作方案，
    // 也不改用户已绑定的素材；上一轮修片已把意见落实为当前分镜内的信息卡或安全时间线。
    // 这些原始意见必须留在运行日志里方便复盘，但不能再作为用户必须手工重排的门禁。
    console.warn(
      "[video.director] 模型连续复审仍返回 revise；确定性时间线已闭合，采用当前自动修片结果",
      repeatedSubjectiveIssues.map((issue) => ({
        sceneIdx: issue.sceneIdx,
        code: issue.code,
        message: issue.message,
      })),
    );
    allRepairs.push("终止重复审片建议循环，保留当前分镜与用户已绑定素材");
  }

  const repairs = [...new Set(allRepairs)];
  const fallbackCardsOnly = input.cards.length === 0 && current.cards.length > 0;
  const hasDirection = Boolean(lastReview.direction);
  return {
    cards: current.cards,
    broll: current.broll,
    subtitles: current.subtitles,
    repairs,
    reviewPasses,
    directorReview: {
      status: "ready",
      summary:
        fallbackCardsOnly
          ? "信息卡模型未留下可溯候选；本次仅使用基础信息卡补位，未生成 Scene Graph 内容动效，建议重新生成分镜。"
          : !hasDirection
          ? "时间线安全可预览，但整片运动方向未生成；本次没有把确定性排版冒充 AI 编导结论。"
          : repairs.length > 0
          ? `总导演已在当前分镜内自动完成 ${repairs.length} 类修正并复审，可进入渲染。`
          : lastReview.summary || "总导演审片通过。",
      // 通过态不再夹带“建议删除/请手动选择”等未执行意见；审片工作记录只留日志。
      issues: [],
      ...(lastReview.direction ? { direction: lastReview.direction } : {}),
      source:
        fallbackCardsOnly || !hasDirection
          ? "deterministic_fallback"
          : repairs.length > 0 ||
        firstReview.status === "needs_attention" ||
        repeatedSubjectiveIssues.length > 0
          ? "auto_repaired"
          : lastReview.source,
    },
  };
}

// ── 编排入口 runVideoDecisions(live dispatch 范式:persistence-client void 调用)──

export interface VideoDecisionsTask {
  id: string;
  projectId: string | null;
  retryOfTaskId?: string | null;
  /** { srtText: string; script: string } —— T-254c 创建任务时装入。 */
  inputData: Record<string, unknown>;
}

export interface VideoDecisionsDeps {
  ai: {
    markRunning(ctx: RequestContext, taskId: string): Promise<unknown>;
    recordStep(
      ctx: RequestContext,
      taskId: string,
      step: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ): Promise<unknown>;
    recordCandidate(
      ctx: RequestContext,
      taskId: string,
      result: { resultType: string; resultData: Record<string, unknown> },
    ): Promise<unknown>;
    cancelTask(
      ctx: RequestContext,
      taskId: string,
      errorMessage?: string,
    ): Promise<unknown>;
    getTaskRuntimeData(
      ctx: RequestContext,
      taskId: string,
    ): Promise<Record<string, unknown>>;
    putVideoDecisionsCheckpoint(
      ctx: RequestContext,
      taskId: string,
      checkpoint: Record<string, unknown>,
    ): Promise<void>;
  };
  /** 按 capability 解析用户配的 model(video.scenes 等;未配回退 default)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** 素材清单投影(项目 material-links⋈assets 的 label+描述;composition root 绑)。 */
  listBrollInventory: (
    ctx: RequestContext,
    projectId: string | null,
  ) => Promise<BrollAssetRef[]>;
  /**
   * [T-387c] 凝固分镜 reader(output_script 当前版本 contentData.sections[].visual 投影;
   * composition root 绑)。Optional:未绑 / 无 projectId / 读失败 / 旧稿无 visual → 空数组 →
   * storyboard facet 空串 = 现状(零回归)。
   */
  readStoryboard?: (
    ctx: RequestContext,
    projectId: string | null,
  ) => Promise<StoryboardSectionRef[]>;
  /** 测试逃生口:替换真模型调用(默认 modelFor + runStructuredNode + registry 模板)。 */
  callStructured?: StructuredCall;
}

// 默认结构化调用:capability=skillId 解析用户配的 model,registry 取(可被 skill_config_overrides
// 覆盖的)模板,动态 schema 走 outputSchema 逃生口(压过 registry 静态 schema —— 约束绑定本次输入)。
function makeDefaultCall(
  ctx: RequestContext,
  deps: Pick<VideoDecisionsDeps, "resolveModelSpec">,
): StructuredCall {
  return async <T>(input: StructuredCallInput<T>): Promise<T> => {
    const spec = await deps.resolveModelSpec(ctx, input.skillId);
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<T>({
      model: modelFor(spec),
      template: getTemplate(input.skillId),
      facets: input.facets,
      outputSchema: input.outputSchema,
      normalizeObject: input.normalizeObject,
      timeoutMs: input.timeoutMs,
    });
    return object;
  };
}

/** 五步中文名(步骤流/失败报错共用 —— 任一步失败诚实报是哪一步)。 */
export const VIDEO_DECISION_STEPS = [
  "①语义分场",
  "②信息卡",
  "③B-roll 匹配",
  "④双语字幕",
  "⑤总导演统筹审核",
] as const;

interface VideoDecisionsCheckpoint {
  schemaVersion: 1;
  inputFingerprint: string;
  scenes: VideoScene[];
  cards?: VideoInfoCard[];
}

function videoDecisionsInputFingerprint(input: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function readVideoDecisionsCheckpoint(
  runtimeData: Record<string, unknown>,
  inputFingerprint: string,
  srtLines: readonly SrtLine[],
): VideoDecisionsCheckpoint | null {
  const raw = runtimeData.videoDecisionsCheckpoint;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1 || value.inputFingerprint !== inputFingerprint) {
    return null;
  }
  const starts = srtStartSet(srtLines);
  const parsedScenes = buildScenesDecisionSchema(starts).safeParse({
    scenes: value.scenes,
  });
  if (!parsedScenes.success) return null;
  const checkpoint: VideoDecisionsCheckpoint = {
    schemaVersion: 1,
    inputFingerprint,
    scenes: parsedScenes.data.scenes,
  };
  if (Array.isArray(value.cards)) {
    const parsedCards = buildCardsDecisionSchema(
      checkpoint.scenes.length,
      starts,
    ).safeParse({ cards: value.cards });
    if (parsedCards.success) checkpoint.cards = parsedCards.data.cards;
  }
  return checkpoint;
}

/**
 * 编排入口:顺序跑四决策 + 总导演审核 → recordCandidate(video_decisions,awaiting_confirmation)。
 * 任一步失败:recordStep(kind:"failed",text 指明是哪一步)+ cancelTask(诚实终态,绝不卡
 * running、绝不落半套决策)。产物含素材清单快照(预览卡 B-roll 换选下拉直接用,免再取)。
 */
export async function runVideoDecisions(
  ctx: RequestContext,
  task: VideoDecisionsTask,
  deps: VideoDecisionsDeps,
): Promise<void> {
  let stepIdx = -1; // 失败时指认的当前步(-1 = 备料/解析)
  try {
    await deps.ai.markRunning(ctx, task.id);
    const srtText =
      typeof task.inputData.srtText === "string" ? task.inputData.srtText : "";
    const script =
      typeof task.inputData.script === "string" ? task.inputData.script : "";
    const orientation: VideoOrientation | undefined =
      task.inputData.orientation === "portrait" ||
      task.inputData.orientation === "landscape"
        ? task.inputData.orientation
        : undefined;
    const srtLines = parseSrt(srtText);
    if (srtLines.length === 0) {
      throw new Error("SRT 解析不出任何字幕行(备料:请检查上传的 SRT 文件)");
    }
    if (!script.trim()) {
      throw new Error("缺少口播稿(备料:script 为空,信息卡可溯校验无从谈起)");
    }
    if (!task.projectId) {
      throw new Error("缺少项目范围(备料:B-roll 只允许读取当前项目素材)");
    }
    const call = deps.callStructured ?? makeDefaultCall(ctx, deps);

    const step = async (i: number, text: string, toolCalls: unknown[] = []) => {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: i + 1,
        kind: "decision",
        text,
        toolCalls,
      });
    };

    // [T-387c] 凝固分镜(采纳定稿时刻产的分镜真源)→ storyboard facet,喂 scenes/cards/broll
    // 当**对齐硬约束**(四决策=对齐器)。best-effort:未绑 reader / 读失败 / 旧稿无 visual →
    // 空串 → 模板占位替换为空,行为=现状(零回归,测锚)。
    let storyboard = "";
    let storyboardSections: StoryboardSectionRef[] = [];
    if (deps.readStoryboard) {
      try {
        storyboardSections = await deps.readStoryboard(ctx, task.projectId);
        storyboard = storyboardFacet(storyboardSections);
      } catch {
        storyboard = "";
      }
    }

    // 素材清单与人工选材先做项目范围鉴权；局部补充选材会冻结既有分场/卡片/字幕，
    // 只由 material.match 在当前方案内重算素材与时间线，绝不偷偷退回完整五节点。
    const excluded = new Set(
      Array.isArray(task.inputData.excludedAssetIds)
        ? (task.inputData.excludedAssetIds as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [],
    );
    const inventory = (
      await deps.listBrollInventory(ctx, task.projectId)
    ).filter((a) => !excluded.has(a.assetId));
    const inventoryIds = new Set(inventory.map((asset) => asset.assetId));
    const manualMaterialAssignments = Array.from(
      new Map(
        (Array.isArray(task.inputData.manualMaterialAssignments)
          ? task.inputData.manualMaterialAssignments
          : []
        ).flatMap((raw): Array<[string, ManualMaterialAssignment]> => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
          const item = raw as Record<string, unknown>;
          if (
            typeof item.assetId !== "string" ||
            !inventoryIds.has(item.assetId) ||
            typeof item.sceneIdx !== "number" ||
            !Number.isInteger(item.sceneIdx) ||
            item.sceneIdx < 0
          ) {
            return [];
          }
          const assignment: ManualMaterialAssignment = {
            assetId: item.assetId,
            sceneIdx: item.sceneIdx,
            sceneTitle:
              typeof item.sceneTitle === "string" ? item.sceneTitle : "",
            sceneSummary:
              typeof item.sceneSummary === "string" ? item.sceneSummary : "",
          };
          return [[assignment.assetId, assignment]];
        }),
      ).values(),
    );
    const manualAssignmentBrief = manualAssignmentsFacet(
      manualMaterialAssignments,
      inventory,
    );

    // SEMANTIC_BOUNDARY_ALLOW: 指纹只确认重试输入是否与来源任务完全一致；它不判断
    // 场景/信息卡好坏，也不做任何创作选择。只有显式 retryOfTaskId 才读取旧断点。
    const inputFingerprint = videoDecisionsInputFingerprint({
      srtText,
      script,
      orientation: orientation ?? null,
      excludedAssetIds: [...excluded].sort(),
      manualMaterialAssignments,
      inventory,
      storyboardSections,
    });
    const checkpoint = task.retryOfTaskId
      ? readVideoDecisionsCheckpoint(
          await deps.ai.getTaskRuntimeData(ctx, task.retryOfTaskId),
          inputFingerprint,
          srtLines,
        )
      : null;

    if (task.inputData.adjustmentMode === "materials") {
      stepIdx = 2;
      const base = parseMaterialAdjustmentBase(
        task.inputData.baseDecisions,
        srtLines,
      );
      let matchedBroll = base.broll;
      let materialMatchWarning = "";
      try {
        matchedBroll = await decideMaterialBroll(
          {
            scenes: base.scenes,
            srtLines,
            script,
            inventory,
            visualSlots: base.visualSlots ?? [],
            orientation,
            manualAssignments: manualAssignmentBrief,
          },
          call,
        );
      } catch (error) {
        // 一次局部语义匹配失败时保留现有素材时间线，并落实用户明确选中的 assetId；
        // 不再调用分场/卡片/字幕/导演，也不再发第二次模型请求。
        materialMatchWarning =
          error instanceof Error ? error.message : String(error);
      }
      const broll = enforceManualMaterialAssignments({
        assignments: manualMaterialAssignments,
        scenes: base.scenes,
        srtLines,
        inventory,
        modelBroll: matchedBroll,
      });
      const structuralIssues = auditVideoDecisions({
        scenes: base.scenes,
        cards: base.cards,
        broll,
        subtitles: base.subtitles,
        srtLines,
        inventory,
      }).filter(
        (issue) =>
          issue.severity === "blocking" &&
          (issue.code === "material_conflict" ||
            issue.code === "timing_conflict" ||
            issue.code === "subtitle_conflict"),
      );
      if (structuralIssues.length > 0) {
        throw new Error("补充选材后的素材时间线未能安全收口");
      }
      await step(
        2,
        `补充选材：保留 ${base.scenes.length} 个场景，只调整 ${broll.length} 条素材时间线` +
          (materialMatchWarning ? "；语义匹配暂不可用，已保留当前绑定" : ""),
        [{
          toolName: "material.match",
          scope: { accountId: ctx.accountId ?? null, projectId: task.projectId },
          input: { inventory, manualMaterialAssignments },
          output: {
            broll,
            ...(materialMatchWarning ? { warning: materialMatchWarning } : {}),
          },
        }],
      );
      const decisions: VideoDecisions = {
        ...base,
        broll,
      };
      await deps.ai.recordCandidate(ctx, task.id, {
        resultType: VIDEO_DECISIONS_RESULT_TYPE,
        resultData: {
          decisions: decisions as unknown as Record<string, unknown>,
          inventory,
        },
      });
      return;
    }

    stepIdx = 0;
    const scenes =
      checkpoint?.scenes ??
      (await decideScenes(
        {
          srtLines,
          script,
          storyboard,
          orientation,
          manualAssignments: manualAssignmentBrief,
        },
        call,
      ));
    if (!checkpoint?.scenes) {
      await deps.ai.putVideoDecisionsCheckpoint(ctx, task.id, {
        schemaVersion: 1,
        inputFingerprint,
        scenes,
      });
    }
    await step(
      0,
      `${VIDEO_DECISION_STEPS[0]}:${scenes.length} 场${checkpoint?.scenes ? "（复用上次已完成结果）" : ""}`,
    );

    stepIdx = 1;
    const cards =
      checkpoint?.cards ??
      (await decideCards(
        {
          scenes,
          srtLines,
          script,
          storyboard,
          orientation,
          manualAssignments: manualAssignmentBrief,
        },
        call,
      ));
    if (!checkpoint?.cards) {
      await deps.ai.putVideoDecisionsCheckpoint(ctx, task.id, {
        schemaVersion: 1,
        inputFingerprint,
        scenes,
        cards,
      });
    }
    await step(
      1,
      `${VIDEO_DECISION_STEPS[1]}:${cards.length} 张(可溯校验后)${checkpoint?.cards ? "（复用上次已完成结果）" : ""}`,
    );

    stepIdx = 2;
    // [T-387c] 备料③「人可剔」:制作页聚合清单里被用户剔除的自动项经 inputData.excludedAssetIds
    // 传入,这里从决策可选集里滤掉(手动上传/未剔除项照常)。缺省 = 不滤(旧任务零回归)。
    const brollResult = await decideBroll(
      {
        scenes,
        srtLines,
        script,
        inventory,
        storyboard,
        orientation,
        manualAssignments: manualAssignmentBrief,
      },
      call,
    );
    let materialMatchedBroll: VideoBrollPick[] = [];
    let materialMatchWarning = "";
    try {
      materialMatchedBroll = await decideMaterialBroll(
        {
          scenes,
          srtLines,
          script,
          inventory,
          visualSlots: brollResult.slots,
          orientation,
          manualAssignments: manualAssignmentBrief,
        },
        call,
      );
    } catch (error) {
      // 素材匹配是质量增强，不是渲染硬门。失败时由确定性修片层用真人主画面/
      // 信息卡补位，禁止拖垮成片或把作业退给用户。
      materialMatchWarning =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[video.decisions] material.match degraded task=${task.id} project=${task.projectId}: ${materialMatchWarning}`,
      );
    }
    const enforcedBroll = enforceStoryboardBroll({
      storyboard: storyboardSections,
      scenes,
      srtLines,
      inventory,
      excludedAssetIds: excluded,
      modelBroll: materialMatchedBroll,
    });
    const broll = enforceManualMaterialAssignments({
      assignments: manualMaterialAssignments,
      scenes,
      srtLines,
      inventory,
      modelBroll: enforcedBroll.broll,
    });
    const visualSlots = brollResult.slots;
    await step(
      2,
      `${VIDEO_DECISION_STEPS[2]}:${visualSlots.length} 个画面需求 / ${broll.length} 条已匹配(清单 ${inventory.length} 项)` +
        (materialMatchWarning
          ? `；素材匹配暂不可用，系统已在当前方案内自动补位`
          : ""),
      [
        {
          toolName: "video.broll",
          scope: { accountId: ctx.accountId ?? null, projectId: task.projectId },
          input: { inventory },
          output: { slots: visualSlots },
        },
        {
          toolName: "material.match",
          scope: { accountId: ctx.accountId ?? null, projectId: task.projectId },
          input: {
            inventory,
            visualSlots,
            manualMaterialAssignments,
          },
          output: {
            broll,
            ...(materialMatchWarning ? { warning: materialMatchWarning } : {}),
          },
        },
      ],
    );

    stepIdx = 3;
    // [T-320] 字幕文本校正接口口播稿:script 作校正基准(与 decideScenes/decideCards 同源),
    //   让 ASR 认错字按口播稿改回(改动最小,时间不动)。
    let subtitleFallbackBatches = 0;
    let subtitleBatchCount = 0;
    const subtitles = await decideSubtitles(
      {
        srtLines,
        script,
        requireEmphasis: true,
        onChunkProgress: (progress) => {
          subtitleBatchCount = progress.total;
          if (progress.status === "fallback") subtitleFallbackBatches += 1;
        },
      },
      call,
    );
    await step(
      3,
      `${VIDEO_DECISION_STEPS[3]}:${subtitles.length} 行/${subtitleBatchCount} 批` +
        (subtitleFallbackBatches > 0
          ? `；${subtitleFallbackBatches} 批翻译失败已保留原文`
          : ""),
    );

    stepIdx = 4;
    const directorClosure = await closeDirectorReview(
      {
        scenes,
        cards,
        visualSlots,
        broll,
        subtitles,
        srtLines,
        script,
        inventory,
        orientation,
      },
      call,
    );
    const directorReview = directorClosure.directorReview;
    const contentMotionCards = cards.filter((card) => card.visualPlan?.scene).length;
    const basicFallbackCards = Math.max(0, directorClosure.cards.length - cards.length);
    await step(
      4,
      `${VIDEO_DECISION_STEPS[4]}:${directorReview.direction ? "通过" : "安全降级（运动方向未生成）"}` +
        `（内容动效 ${contentMotionCards} 张 / 基础补位 ${basicFallbackCards} 张）` +
        (directorClosure.repairs.length > 0
          ? `；自动修片 ${directorClosure.repairs.length} 类 / 复审 ${directorClosure.reviewPasses} 次`
          : ""),
      [
        {
          toolName: "video.director",
          scope: { accountId: ctx.accountId ?? null, projectId: task.projectId },
          input: {
            scenes: scenes.length,
            cards: cards.length,
            broll: broll.length,
            subtitles: subtitles.length,
            inventory: inventory.length,
          },
          output: {
            review: directorReview,
            repairs: directorClosure.repairs,
            reviewPasses: directorClosure.reviewPasses,
          },
        },
      ],
    );

    const decisions: VideoDecisions = {
      ...(directorReview.direction
        ? { direction: directorReview.direction }
        : {}),
      scenes,
      cards: directorClosure.cards,
      visualSlots,
      broll: directorClosure.broll,
      subtitles: directorClosure.subtitles,
      srtLines,
      unusedStoryboardAssets: enforcedBroll.unusedStoryboardAssets,
      directorReview,
    };
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: VIDEO_DECISIONS_RESULT_TYPE,
      resultData: {
        decisions: decisions as unknown as Record<string, unknown>,
        // 素材清单快照:预览卡 B-roll 换选下拉的选项集(与决策同一次投影,防漂移)。
        inventory,
      },
    });
  } catch (err) {
    const where =
      stepIdx >= 0
        ? (VIDEO_DECISION_STEPS[stepIdx] ?? "AI 分场")
        : "备料(SRT/口播稿校验)";
    try {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: stepIdx + 2,
        kind: "failed",
        text: describeVideoDecisionFailure(err, where),
        toolCalls: [],
      });
    } catch {
      /* 留痕失败不阻断终态 */
    }
    try {
      await deps.ai.cancelTask(
        ctx,
        task.id,
        redactedRawErrorMessage(err),
      );
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[video-decisions-runner] ${where} failed for task ${task.id}:`,
      err,
    );
  }
}
