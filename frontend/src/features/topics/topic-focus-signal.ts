/**
 * [T-279] 「今日新选题」条带 → 候选池详情的**跨 island 选中信号**。
 *
 * 病根:TodayTopicsStrip 在选题页顶(server 组件树,TopicsWorkspace client island **外面**),
 * 拿不到 island 内的 SelectionCtx,故卡片点击无从驱动右侧「选题卡详情」→ 用户实测「今日新选题
 * 点不进去」。正解复用本仓已有的窗口 CustomEvent 模式(script-write-signal 同款):条带卡点击发
 * 一条带 candidateId 的事件,TopicsWorkspace 监听 → 设为选中(pickedId)+ 把候选池里那张卡滚进
 * 视野。不走 URL / router.refresh(那会整页重 SSR),纯客户端、SSR 安全。
 */

export const TOPIC_FOCUS_EVENT = "creatoros:topic-focus";

export interface TopicFocusSignalDetail {
  /** 要在候选池里选中并滚到的候选 id。 */
  candidateId: string;
}

/** 发一条「聚焦某候选」信号(浏览器端)。SSR/无 window → no-op。 */
export function emitTopicFocus(candidateId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TopicFocusSignalDetail>(TOPIC_FOCUS_EVENT, {
      detail: { candidateId },
    }),
  );
}

/** 订阅「聚焦某候选」信号(浏览器端),返回退订函数。SSR/无 window → 返回 no-op。 */
export function subscribeTopicFocus(
  handler: (candidateId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event): void => {
    const detail = (e as CustomEvent<TopicFocusSignalDetail>).detail;
    if (detail && typeof detail.candidateId === "string") {
      handler(detail.candidateId);
    }
  };
  window.addEventListener(TOPIC_FOCUS_EVENT, listener);
  return () => window.removeEventListener(TOPIC_FOCUS_EVENT, listener);
}
