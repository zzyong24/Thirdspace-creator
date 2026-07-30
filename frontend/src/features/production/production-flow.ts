// [T-254c] 制作视频 tab 的确定性流程助手(纯函数,workbench 客户端岛与单测共用):
//   - production 状态机步进(契约铁律:forward-only 且相邻 +1,见 backend
//     production.service updateProduction —— 跨步/回退都是 ConflictError);
//   - 渲染执行任务 inputs 组装(**mountAs=assetId 约定**:props 里所有 file 字段
//     写的都是 assetId,executor 在沙箱 input/<mountAs> 读文件 —— 只有用 assetId
//     命名 mountAs,props 与物化文件才闭环,见 assemble-video-render-props 注释);
//   - executor 环境错误人话化(ffmpeg/Chromium 未就绪的诚实引导)。

import type { VideoRenderProps } from "@creatoros/contract";

export const PRODUCTION_STATUS_ORDER = [
  "drafting",
  "recording",
  "editing",
  "rendering",
  "ready",
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUS_ORDER)[number];

/** 中文状态标签(状态条渲染用)。 */
export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  drafting: "备稿",
  recording: "录制",
  editing: "剪辑备料",
  rendering: "渲染",
  ready: "成片就绪",
};

/**
 * 从 current 走到 target 需要依次 PUT 的状态序列(相邻步进,含 target)。
 * current 未知 / target 不在其后 → [](幂等:已到位或无法前进都不发写)。
 */
export function statusStepsTo(
  current: string,
  target: ProductionStatus,
): ProductionStatus[] {
  const from = PRODUCTION_STATUS_ORDER.indexOf(current as ProductionStatus);
  const to = PRODUCTION_STATUS_ORDER.indexOf(target);
  if (from < 0 || to < 0 || to <= from) return [];
  return PRODUCTION_STATUS_ORDER.slice(from + 1, to + 1) as ProductionStatus[];
}

/**
 * 渲染 props → execution.tasks.create 的 inputs 物化声明。
 * 扫齐 props 里所有文件引用(talkingHead.file / broll[].file / image 卡 file),
 * 去重后逐个 `{ assetId, mountAs: assetId }` —— mountAs 必须等于 assetId(闭环约定)。
 */
export function buildRenderInputs(
  props: VideoRenderProps,
): { assetId: string; mountAs: string }[] {
  const ids = new Set<string>();
  if (props.talkingHead.file) ids.add(props.talkingHead.file);
  for (const b of props.broll) ids.add(b.file);
  for (const scene of props.scenes) {
    for (const card of scene.cards) {
      if (
        card.kind === "image" &&
        typeof (card as { file?: unknown }).file === "string"
      ) {
        ids.add((card as { file: string }).file);
      }
    }
  }
  return [...ids].map((assetId) => ({ assetId, mountAs: assetId }));
}

/**
 * executor 环境错误 → 人话引导(SPEC §3.2 ffmpeg 依赖策略/Chromium 复用)。
 * 命不中已知环境问题 → null(维持原始错误,不编造解释)。
 */
export function humanizeRenderError(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes("ffprobe 未识别出视频流")) {
    return "有一项素材不是可识别的视频。请检查人物粗剪视频是否完整、格式是否正确；图片素材应作为 B-roll 图片使用，然后点「重试」。";
  }
  if (
    lower.includes("moov atom not found") ||
    lower.includes("invalid data found when processing input")
  ) {
    return "视频素材上传不完整、文件已损坏或格式无法识别。请确认原视频能在本机正常播放，然后重新上传后再生成。";
  }
  if (
    (lower.includes("ffmpeg") || lower.includes("ffprobe")) &&
    (lower.includes("未检测到") ||
      lower.includes("未找到") ||
      lower.includes("缺失") ||
      lower.includes("not found") ||
      lower.includes("enoent"))
  ) {
    return "CreatorOS 的随包渲染组件 ffmpeg/ffprobe 缺失或不可用。请重新安装最新版 CreatorOS 后重试；开发环境可自行安装 ffmpeg，或配置 CREATOROS_FFMPEG_PATH / CREATOROS_FFPROBE_PATH。";
  }
  if (lower.includes("chromium") || lower.includes("playwright")) {
    return "CreatorOS 随包的 Chromium 浏览器缺失或不可用。请重新安装最新版 CreatorOS 后重试；开发环境可执行 `npx playwright install chromium`。";
  }
  return null;
}

// ── [T-387c] B-roll 自动聚合(备料③;纯函数,workbench 客户端岛与单测共用)────────
//
// 数据源扩为自动列入:脚本凝固分镜点名素材(visual.assetRefs)+ 论点树 materialRefs +
// 项目弹药 image/video 资产;统一按 assetId 去重(先到先得,调用方按 script → thesis →
// ammo 优先级传入),已手动上传为 B-roll(role=broll)的素材不重复列(手动列表单独渲)。
// 「人可剔」= 剔除集只进本次决策任务的 inputData.excludedAssetIds,不动用料链。

/** 一条自动聚合的 B-roll 候选(来源徽标渲染用)。 */
export interface AutoBrollItem {
  assetId: string;
  name: string;
  kind: string;
  source: "script" | "thesis" | "ammo";
}

export const BROLL_SOURCE_LABEL: Record<AutoBrollItem["source"], string> = {
  script: "脚本画面",
  thesis: "论点",
  ammo: "弹药",
};

/**
 * 聚合去重:按 assetId 保留**先出现**的条目(调用方按来源优先级排序传入),
 * 并剔除已在手动 B-roll 列表(manualAssetIds)里的(不重复列)。
 */
export function aggregateAutoBroll(
  items: ReadonlyArray<AutoBrollItem>,
  manualAssetIds: ReadonlyArray<string>,
): AutoBrollItem[] {
  const seen = new Set(manualAssetIds);
  const out: AutoBrollItem[] = [];
  for (const it of items) {
    if (!it.assetId || seen.has(it.assetId)) continue;
    seen.add(it.assetId);
    out.push(it);
  }
  return out;
}

/** 从脚本 artifact 当前版本 contentData 宽容抽出各段 visual.assetRefs(旧稿无 → [])。 */
export function assetRefsFromScriptContentData(
  contentData: unknown,
): string[] {
  const data = (contentData ?? {}) as { sections?: unknown };
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const out: string[] = [];
  for (const raw of sections) {
    const v = (raw as { visual?: { assetRefs?: unknown } } | null)?.visual;
    if (!v || !Array.isArray(v.assetRefs)) continue;
    for (const id of v.assetRefs) {
      if (typeof id === "string" && id.trim()) out.push(id.trim());
    }
  }
  return out;
}

/** 从论点树 artifact 当前版本 contentData 宽容抽出各节点 materialRefs 的 id(无 → [])。 */
export function refIdsFromThesisContentData(contentData: unknown): string[] {
  const data = (contentData ?? {}) as { nodes?: unknown };
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const out: string[] = [];
  for (const raw of nodes) {
    const refs = (raw as { materialRefs?: unknown } | null)?.materialRefs;
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      const id = (r as { id?: unknown } | null)?.id;
      if (typeof id === "string" && id.trim()) out.push(id.trim());
    }
  }
  return out;
}
