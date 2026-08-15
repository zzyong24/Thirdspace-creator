// [T-254b · T-254a 对接完成] 决策 JSON → 渲染 props JSON 组装器。
//
// props 单一真值 = contract `videoRenderProps`(contract/src/resources/video-render.ts,
// SPEC 2026-07-11 §3.2)。本组装器把四决策产物(VideoDecisions)映射成契约形状,
// 返回前用 zod schema **`.parse()` 硬校验**:不合即抛(zod error 带字段路径),绝不静默。
// 决策确认卡「确认」时调用 —— 不确认不组装、不渲染(铁律②)。
//
// 字段映射(temp 草案 → contract 真值,出入以 contract 为准):
//   - meta.durationSec → talkingHead.durationSec(总时长归口播主时钟,meta 只留 title);
//   - talkingHead.videoAssetId → talkingHead.file(mountAs 相对路径;约定 mountAs=assetId,
//     T-254c dispatch 时 inputs 按 [{assetId, mountAs: assetId}] 对齐同一域);
//   - captions.lines[{index,startSec,endSec,zh,en}] → captions[{start,end,cn,en?}]
//     (拍平、去 index、zh→cn;en 空串省略);
//   - scenes[].broll → 顶层 broll[](契约 B-roll 是全片插点轴;file=assetId 同约定,
//     label 取素材清单快照的展示名 —— 契约铁律 label 禁内部词);
//   - scenes[].cards[{kind,content,at}] → 六 kind discriminatedUnion(见 toContractCard)。
//
// 决策层 content 是单字符串,kind 特定字段的确定性派生规则:
//   - stat:content 里第一个数值 token 作 value,整句作 label;无数值 → value=label=content;
//   - quote/code:content 原文直填 text/code;
//   - list:按换行/;/;/、切 items(≤8,契约上限);
//   - compare:按 vs/VS/↔/对比 切两半;切不出两个非空半 → **降级 quote**(原文可见,不编造);
//   - image:决策层不持有图片文件(素材归 B-roll 轴),无 file 可填 → **降级 quote**。

import type {
  VideoDecisions,
  VideoInfoCard,
  VideoBrollPick,
  BrollAssetRef,
} from "@creatoros/backend/modules/ai-runtime";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";

export interface AssembleOptions {
  /** 成片标题(meta.title,契约 min 1;缺省用占位名)。 */
  title?: string;
  /** 粗剪人物视频 assetId(T-254c 上传链持有)→ talkingHead.file(mountAs=assetId 约定)。 */
  talkingHeadAssetId?: string | null;
  /** 粗剪人物视频真实时长(秒,T-254c ffprobe 探针带入);缺省 = max(场景末尾, 字幕末尾)。 */
  talkingHeadDurationSec?: number;
  /** 素材清单快照 —— B-roll label 来源(契约 label 禁内部词);查不到回退 assetId。 */
  inventory?: readonly BrollAssetRef[];
  /** [T-290] 项目画幅 → delivery 尺寸。portrait=1080x1920(抖音 9:16),landscape=1920x1080。
   *  缺省 landscape(兜底,不破坏存量;立项已改必填,新项目必带此值)。 */
  orientation?: "portrait" | "landscape";
}

/** [T-290] 画幅 → delivery 交付尺寸(fps 30 固定;编码细节归渲染 executor)。 */
function deliveryForOrientation(
  orientation: "portrait" | "landscape" | undefined,
): { width: number; height: number; fps: number } {
  return orientation === "portrait"
    ? { width: 1080, height: 1920, fps: 30 }
    : { width: 1920, height: 1080, fps: 30 };
}

/** content 里第一个数值 token(供 stat 卡 value;与 runner 可溯校验同域的数字形态)。 */
const FIRST_NUMBER_RE = /\d+(?:[.,]\d+)?\s*[%万亿kKmMxX×倍]?/;

const INTERNAL_SCENE_TITLE_RE =
  /^(?:新闻|开场|黄金|悬念|冲突|痛点|反差|价值|论点|正文|展开|案例|转折|总结|结尾|行动|cta|hook)(?:钩子|段落|段|部分|场景)?$/i;

/** 视觉摘要不改底稿，只限制上屏长度；完整口播仍由字幕与原音承载。 */
function compactVisualText(text: string, maxChars: number): string {
  const chars = Array.from(text.trim().replace(/\s+/g, " "));
  return chars.length <= maxChars
    ? chars.join("")
    : `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

function visibleSceneTitle(
  title: string,
  scene: { startSec: number; endSec: number },
  decisions: VideoDecisions,
): string {
  const normalized = title.trim();
  if (normalized && !INTERNAL_SCENE_TITLE_RE.test(normalized)) {
    return compactVisualText(normalized, 15);
  }
  const spoken =
    decisions.srtLines.find(
      (line) => line.startSec >= scene.startSec && line.startSec < scene.endSec,
    )?.text ??
    decisions.subtitles.find(
      (line) => line.startSec >= scene.startSec && line.startSec < scene.endSec,
    )?.zh ??
    normalized;
  return compactVisualText(spoken || "本段重点", 15);
}

function uniqueVisibleCards(cards: readonly VideoInfoCard[]): VideoInfoCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.content.replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 决策卡(kind+content 单字符串)→ 契约六 kind 卡的确定性映射(schema 由 parse 兜底)。 */
function toContractCard(card: VideoInfoCard): Record<string, unknown> {
  const rawContent = card.content.trim();
  // [T-295] motion 透传:有则随卡走(compare/image 降级 quote 时 base 已含 motion,一并带走)。
  const base = {
    at: card.at,
    ...(card.motion ? { motion: card.motion } : {}),
    ...(card.visualPlan ? { visualPlan: card.visualPlan } : {}),
  };
  switch (card.kind) {
    case "stat": {
      const value = rawContent.match(FIRST_NUMBER_RE)?.[0]?.trim() ?? rawContent;
      return {
        kind: "stat",
        ...base,
        value: compactVisualText(value, 12),
        label: compactVisualText(rawContent, 28),
      };
    }
    case "list": {
      const items = rawContent
        .split(/\r?\n|;|;|、/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((text) => ({ text: compactVisualText(text, 22) }));
      return {
        kind: "list",
        ...base,
        items:
          items.length > 0
            ? items
            : [{ text: compactVisualText(rawContent, 22) }],
      };
    }
    case "compare": {
      const halves = rawContent
        .split(/\s+vs\.?\s+|\s+VS\s+|↔|对比/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (halves.length === 2) {
        return {
          kind: "compare",
          ...base,
          left: {
            title: compactVisualText(halves[0]!, 18),
            items: [compactVisualText(halves[0]!, 18)],
          },
          right: {
            title: compactVisualText(halves[1]!, 18),
            items: [compactVisualText(halves[1]!, 18)],
          },
        };
      }
      // 切不出两半 → 降级 quote(原文可见,不编造结构)。
      return {
        kind: "quote",
        ...base,
        text: compactVisualText(rawContent, 45),
      };
    }
    case "code":
      return { kind: "code", ...base, code: compactVisualText(rawContent, 120) };
    case "image":
      // 决策层没有图片文件可引(契约 image.file=mountAs 路径)→ 降级 quote。
      return {
        kind: "quote",
        ...base,
        text: compactVisualText(rawContent, 45),
      };
    case "quote":
    default:
      return {
        kind: "quote",
        ...base,
        text: compactVisualText(rawContent, 45),
      };
  }
}

/**
 * 四决策产物 → 渲染 props(确认门之后的唯一出口)。cards/broll 按 sceneIdx 归属
 * (越界项丢弃 —— 预览卡编辑后的防御);返回值 = `videoRenderProps.parse()` 结果,
 * 不合契约(区间重叠/越片长/字段缺失)直接抛 ZodError。
 */
export function assembleVideoRenderProps(
  decisions: VideoDecisions,
  opts: AssembleOptions = {},
): VideoRenderProps {
  const inScene = (idx: number) => idx >= 0 && idx < decisions.scenes.length;

  const cardsByScene = new Map<number, VideoInfoCard[]>();
  for (const c of decisions.cards) {
    if (!inScene(c.sceneIdx)) continue;
    const list = cardsByScene.get(c.sceneIdx) ?? [];
    list.push(c);
    cardsByScene.set(c.sceneIdx, list);
  }

  const sceneEnd = decisions.scenes.length
    ? Math.max(...decisions.scenes.map((s) => s.endSec))
    : 0;
  const subtitleEnd = decisions.subtitles.length
    ? Math.max(...decisions.subtitles.map((l) => l.endSec))
    : 0;
  const durationSec =
    opts.talkingHeadDurationSec ?? Math.max(sceneEnd, subtitleEnd);

  const labelOf = (assetId: string) =>
    opts.inventory?.find((a) => a.assetId === assetId)?.label ?? assetId;
  const inventoryItem = (assetId: string) =>
    opts.inventory?.find((a) => a.assetId === assetId);
  const openingStartSec = decisions.scenes[0]?.startSec ?? 0;
  const openingEndSec = Math.min(durationSec, openingStartSec + 3);

  const broll = decisions.broll
    .filter((b: VideoBrollPick) => inScene(b.sceneIdx))
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((b) => {
      const asset = inventoryItem(b.assetId);
      // SEMANTIC_BOUNDARY_ALLOW:这里只落实 material.match 已产出的 visualRole，
      // 不用文件名、媒体扩展名或业务词猜素材语义。旧计划缺 visualRole 时采用
      // large_stage 安全下限，绝不再把“任意 video”误升为全屏录屏。
      const requestedPresentation = b.presentation ?? "large_stage";
      const presentation =
        b.visualRole === "screen_recording" &&
        requestedPresentation !== "overlay"
          ? "full_frame"
          : requestedPresentation === "full_frame"
            ? "large_stage"
            : requestedPresentation;
      // 用户确认的开场版式：AI 已选择的录屏若从第一句起连续覆盖前三秒，素材就是
      // 唯一主视觉，人物暂时隐藏；之后的全屏录屏仍保留左下小窗。这里只执行时间、
      // visualRole 与 presentation，不按文件名或口播关键词判断视频类型。
      // SEMANTIC_BOUNDARY_ALLOW:创作语义仍来自 material.match，代码仅落实首屏版式。
      const isOpeningScreenRecording =
        presentation === "full_frame" &&
        b.visualRole === "screen_recording" &&
        b.at <= openingStartSec + 0.12 &&
        b.at + b.durationSec >= openingEndSec - 0.12;
      // SRT 第一行通常从 0.03～0.10 秒开始，但成片第 0 帧不能先露出旧底画面。
      // 开场素材只前移时间、不改变原结束点，三秒后的分镜与画中画完全不受影响。
      const renderAt = isOpeningScreenRecording ? 0 : b.at;
      const renderDurationSec = b.durationSec + (b.at - renderAt);
      return {
        at: renderAt,
        // mountAs=assetId 约定(与 talkingHead.file 同域,T-254c dispatch 对齐)。
        file: b.assetId,
        durationSec: renderDurationSec,
        label: labelOf(b.assetId),
        presentation,
        ...(b.visualRole ? { visualRole: b.visualRole } : {}),
        ...(presentation === "full_frame" &&
        b.visualRole === "screen_recording"
          ? {
              speakerMode: isOpeningScreenRecording
                ? ("hidden" as const)
                : ("pip_bottom_left" as const),
            }
          : {}),
        motion: b.motion ?? "static",
        ...(asset?.width ? { sourceWidth: asset.width } : {}),
        ...(asset?.height ? { sourceHeight: asset.height } : {}),
      };
    });

  return videoRenderProps.parse({
    meta: { title: opts.title?.trim() || "未命名成片" },
    talkingHead: {
      file: opts.talkingHeadAssetId ?? "",
      durationSec,
    },
    captions: decisions.subtitles.map((l) => ({
      start: l.startSec,
      end: l.endSec,
      cn: l.zh,
      ...(l.en ? { en: l.en } : {}),
    })),
    scenes: decisions.scenes.map((s, i) => ({
      id: `scene-${i + 1}`,
      // 场景眉标决策层不产出,确定性占位(全大写短语,契约形态)。
      label: `SCENE ${i + 1}`,
      title: visibleSceneTitle(s.title, s, decisions),
      ...(s.summary ? { sub: compactVisualText(s.summary, 37) } : {}),
      startSec: s.startSec,
      endSec: s.endSec,
      cards: uniqueVisibleCards(cardsByScene.get(i) ?? [])
        .slice()
        .sort((a, b) => a.at - b.at)
        .map(toContractCard),
    })),
    broll,
    // [T-290] delivery 尺寸随项目画幅(portrait 1080x1920 / landscape 1920x1080)。
    delivery: deliveryForOrientation(opts.orientation),
  });
}
