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

/** 决策卡(kind+content 单字符串)→ 契约六 kind 卡的确定性映射(schema 由 parse 兜底)。 */
function toContractCard(card: VideoInfoCard): Record<string, unknown> {
  const content = card.content.trim();
  // [T-295] motion 透传:有则随卡走(compare/image 降级 quote 时 base 已含 motion,一并带走)。
  const base = { at: card.at, ...(card.motion ? { motion: card.motion } : {}) };
  switch (card.kind) {
    case "stat": {
      const value = content.match(FIRST_NUMBER_RE)?.[0]?.trim() ?? content;
      return { kind: "stat", ...base, value, label: content };
    }
    case "list": {
      const items = content
        .split(/\r?\n|;|;|、/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((text) => ({ text }));
      return {
        kind: "list",
        ...base,
        items: items.length > 0 ? items : [{ text: content }],
      };
    }
    case "compare": {
      const halves = content
        .split(/\s+vs\.?\s+|\s+VS\s+|↔|对比/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (halves.length === 2) {
        return {
          kind: "compare",
          ...base,
          left: { title: halves[0], items: [halves[0]] },
          right: { title: halves[1], items: [halves[1]] },
        };
      }
      // 切不出两半 → 降级 quote(原文可见,不编造结构)。
      return { kind: "quote", ...base, text: content };
    }
    case "code":
      return { kind: "code", ...base, code: content };
    case "image":
      // 决策层没有图片文件可引(契约 image.file=mountAs 路径)→ 降级 quote。
      return { kind: "quote", ...base, text: content };
    case "quote":
    default:
      return { kind: "quote", ...base, text: content };
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

  const broll = decisions.broll
    .filter((b: VideoBrollPick) => inScene(b.sceneIdx))
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((b) => ({
      at: b.at,
      // mountAs=assetId 约定(与 talkingHead.file 同域,T-254c dispatch 对齐)。
      file: b.assetId,
      durationSec: b.durationSec,
      label: labelOf(b.assetId),
    }));

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
      title: s.title,
      ...(s.summary ? { sub: s.summary } : {}),
      startSec: s.startSec,
      endSec: s.endSec,
      cards: (cardsByScene.get(i) ?? [])
        .slice()
        .sort((a, b) => a.at - b.at)
        .map(toContractCard),
    })),
    broll,
    // [T-290] delivery 尺寸随项目画幅(portrait 1080x1920 / landscape 1920x1080)。
    delivery: deliveryForOrientation(opts.orientation),
  });
}
