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
  if (lower.includes("ffmpeg") || lower.includes("ffprobe")) {
    return "渲染依赖系统 ffmpeg,本机还没有安装。在终端执行 `brew install ffmpeg` 安装后,点「重试」即可继续渲染。";
  }
  if (lower.includes("chromium") || lower.includes("playwright")) {
    return "渲染用的 Chromium 浏览器还没就绪。先到「抖音号」页触发一次扫码采集(会自动下载浏览器),或在终端执行 `npx playwright install chromium`,再点「重试」。";
  }
  return null;
}
