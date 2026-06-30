// 一键岛预调深链(SPEC §3.4)—— 工作台「出题/诊断/分析」等按钮点击 = 打开全局 ChatBox 并预填
// 页面层 surface + 按钮层 functionKey。Copilot 面板(ai-copilot-content)读 URL 的 ?surface & ?fn
// 装配 ChatContext + 预调该工具。集中在此构链,各 island 引它,避免散落硬编码。
//
// 复用现有 overlay 开合机制:`?copilot=open` 由 OverlayController 监听打开面板(见
// components/overlays/overlay-controller.tsx),这里在其上追加 surface/fn 两个 query。

import {
  OVERLAY_QUERY_KEY,
  OVERLAY_OPEN_VALUE,
} from "@/components/overlays/overlay-controller";

/**
 * 构造打开 ChatBox 且预调指定工具的深链(相对当前站点根)。
 * @param surface 页面层(topics/calibration/positioning/review/project)。
 * @param functionKey 按钮层专用工具 id(topic.generate / calibration.diagnose / …);省略=只切 surface。
 * @param basePath 落地路径(默认站点根 `/`;一键岛通常停在当前页就近打开)。
 */
export function copilotDeepLink(
  surface: string,
  functionKey?: string,
  basePath = "/",
): string {
  const params = new URLSearchParams();
  params.set(OVERLAY_QUERY_KEY, OVERLAY_OPEN_VALUE);
  params.set("surface", surface);
  if (functionKey) params.set("fn", functionKey);
  return `${basePath}?${params.toString()}`;
}
