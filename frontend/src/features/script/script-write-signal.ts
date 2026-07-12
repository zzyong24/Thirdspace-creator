/**
 * [T-268] 稿面「整稿写入」的**局部刷新**信号(替掉 router.refresh 整页重渲)。
 *
 * 病根:对话整稿卡采纳后 `router.refresh()` 让整条 route 重新 SSR + 编辑器按 versionCount key
 * 重挂 = 卡顿。正解:采纳只往 output_script append 一版(confirmTask 已做),然后发一条**窗口内
 * 事件**把新整稿 HTML 直接推给稿面编辑器 `setContent`,不重挂 route、不重渲整页。
 *
 * 契约极简:一个 window CustomEvent,detail 带新整稿的富文本 HTML(+ 可选 artifactId 供定位)。
 * 稿面只有一个 ScriptRichEditor,故不强制 artifactId 匹配(有则校验,无则直接应用)。稿面外
 * (全局 copilot / 选题页)没有编辑器监听 → 事件天然 no-op。SSR 安全(仅在浏览器 dispatch/subscribe)。
 */

export const SCRIPT_WRITE_EVENT = "creatoros:script-written";

export interface ScriptWriteSignalDetail {
  /** 采纳落库的 output_script artifact id(编辑器 artifactId 匹配用;可空 → 直接应用)。 */
  artifactId: string | null;
  /** 新整稿的富文本 HTML(编辑器 setContent 直接吃,免整页 refresh)。 */
  html: string;
}

/** 发一条整稿写入信号(浏览器端)。SSR/无 window → no-op。 */
export function emitScriptWrite(detail: ScriptWriteSignalDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ScriptWriteSignalDetail>(SCRIPT_WRITE_EVENT, { detail }),
  );
}

/** 订阅整稿写入信号(浏览器端),返回退订函数。SSR/无 window → 返回 no-op。 */
export function subscribeScriptWrite(
  handler: (detail: ScriptWriteSignalDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<ScriptWriteSignalDetail>).detail;
    if (detail && typeof detail.html === "string") handler(detail);
  };
  window.addEventListener(SCRIPT_WRITE_EVENT, listener);
  return () => window.removeEventListener(SCRIPT_WRITE_EVENT, listener);
}
