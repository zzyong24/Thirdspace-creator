// 一键岛预调深链(SPEC §3.4)—— 工作台「出题/诊断/分析」等按钮点击 = 打开全局 ChatBox 并预填
// 页面层 surface + 按钮层 functionKey。Copilot 面板(ai-copilot-content)读 URL 的 ?surface & ?fn
// 装配 ChatContext + 预调该工具。集中在此构链,各 island 引它,避免散落硬编码。
//
// 复用现有 overlay 开合机制:`?copilot=open` 由 OverlayController 监听打开面板(见
// components/overlays/overlay-controller.tsx),这里在其上追加 surface/fn 两个 query。
//
// bug #3 修复:深链**只返回 query(以 `?` 开头),不带 pathname** —— Next.js `<Link>` 把 query-only
// 的 href 解析为「保持当前路径、只改 query」。原来默认 `basePath="/"` 会让 `<Link>` 在预测/复盘等
// 页点击时**导航回首页**(Copilot 虽开但页面跳走了)。OverlayController 不看路径、只读 `?copilot=open`,
// 故就地开浮层即可;关闭时它也只删 `copilot` query、保留当前 pathname。

import {
  OVERLAY_QUERY_KEY,
  OVERLAY_OPEN_VALUE,
} from "@/components/overlays/overlay-controller";

/**
 * 构造「打开 ChatBox 并预调指定工具」的深链。
 *
 * 返回值是 **query-only 相对 href**(形如 `?copilot=open&surface=…&fn=…`),作为 Next.js
 * `<Link href>` 使用时**保持当前页路径不变**,仅就地打开 Copilot 浮层(不跳首页,bug #3)。
 *
 * @param surface 页面层(topics/calibration/positioning/review/project)。
 * @param functionKey 按钮层专用工具 id(topic.generate / calibration.diagnose / …);省略=只切 surface。
 */
export function copilotDeepLink(surface: string, functionKey?: string): string {
  const params = new URLSearchParams();
  params.set(OVERLAY_QUERY_KEY, OVERLAY_OPEN_VALUE);
  params.set("surface", surface);
  if (functionKey) params.set("fn", functionKey);
  return `?${params.toString()}`;
}
