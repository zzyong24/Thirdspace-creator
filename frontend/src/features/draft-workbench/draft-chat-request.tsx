"use client";

/**
 * `draft-chat-request.tsx` — 稿面「外部对话请求」协调器(T-108,方案 A · lift state)。
 *
 * 稿面右栏是**常驻嵌入式 Copilot**(DraftChatRail → AICopilotContent embed 模式),
 * 稿面没有独立全局弹层 Copilot 主体。T-103a/b 让盲预测/审核按钮走 `copilotDeepLink`
 * (`?copilot=open&fn=…&prefill=…`)+ router.push —— 但 `?copilot=open` 是给**全局弹层**
 * OverlayController 开的;在稿面开不出/和常驻 rail 打架,prefill 也进不了 rail(bug T-108)。
 *
 * 修法(方案 A):把「对话请求」state 提到稿面顶层(本 Provider),按钮点击 = setRequest
 * (functionKey + prefill + selection + 自增 nonce),**不再** router.push。DraftChatRail 消费
 * request → 透传进 AICopilotContent 的 embed.request → embed 监听 nonce 变化预填输入框
 * (不自动发,延续 T-055b)+ 置 functionKey + 应用 selection。全客户端内聚,不碰全局弹层。
 *
 * nonce SSR/水合安全(铁律):用 React state 计数器自增,**绝不** Date.now()/Math.random()
 * (它们在 server 与 client 首帧不一致会触发水合警告)。首帧 request=null(nonce 概念上为 0),
 * 用户点击后才自增到 1、2、3…,每次都是新值 → embed effect 据 nonce 变化重新预填。
 */

import * as React from "react";

/** 稿面 AI 按钮发起的一次对话请求(注入 rail)。 */
export interface DraftChatRequest {
  /** 置顶的专用工具 id(review.script / calibration.diagnose)。 */
  readonly functionKey: string;
  /** 话术文本 —— autoSend=true 时作为自动发出的消息;否则预填进输入框(T-055b)。 */
  readonly prefill: string;
  /**
   * [T-108 v2] 是否自动发送。稿面右栏是**常驻打开**的,用户点「审核」/「先盲预测」是
   * **显式动作** → 直接把话术自动 sendMessage 进 rail(不是预填等回车)。这不违反 T-055b
   * 的「预填不自动发」——那条防的是「?fn 重进/重渲时重复入历史」,这里是用户主动点按钮明确
   * 要发,由 nonce 去重(每次点击一个新 nonce,只发一次)。稿面审核/盲预测按钮传 true。
   */
  readonly autoSend?: boolean;
  /** 注入对话的选中内容(content_output id + 项目标题)——免编导索要 id/标题。 */
  readonly selection?: {
    readonly kind: string;
    readonly id: string;
    readonly title?: string;
  };
  /**
   * 单调自增计数器 —— embed effect 据它变化预填/自动发(URL/props 变了也响应,且天然去重)。
   * 由 Provider 内部 state 生成,SSR 安全(非 Date.now/Random)。
   */
  readonly nonce: number;
}

/** 编辑器 flush:把在途未保存内容落库,resolve 后 DB = 最新。saved 态则 no-op 立即返回。 */
export type FlushSaveFn = () => Promise<void>;

interface DraftChatRequestContextValue {
  /** 最近一次对话请求;null = 还没发起(首帧)。 */
  readonly request: DraftChatRequest | null;
  /** 发起一次对话请求(按钮点击调用):补上自增 nonce 后落 state。 */
  readonly openChat: (req: Omit<DraftChatRequest, "nonce">) => void;
  /**
   * [T-108 v2] 注册编辑器的 flush 函数(编辑器挂载时调,卸载时传 null 注销)。审核/盲预测
   * 按钮据此在自动发前 flush 保存最新内容(确保 review.script/diagnose 审的是最新版,非 DB 旧版)。
   */
  readonly registerFlush: (fn: FlushSaveFn | null) => void;
  /**
   * [T-108 v2] flush 已注册的编辑器保存(await 完成)。无编辑器注册(结构测试/无脚本)→
   * resolve 空(no-op)。审核/盲预测按钮点击 = `await flushSave()` 后再 autoSend。
   */
  readonly flushSave: FlushSaveFn;
}

const DraftChatRequestContext =
  React.createContext<DraftChatRequestContextValue | null>(null);

/**
 * 稿面对话请求 Provider —— 包住整个稿面主体(左稿面 + 右 rail),让左稿面的 AI 按钮
 * 与右栏常驻 rail 通过 context 直连(二者在树上是 sibling,靠 context 而非 prop-drilling)。
 */
export function DraftChatRequestProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [request, setRequest] = React.useState<DraftChatRequest | null>(null);
  // nonce 计数器放 ref:openChat 稳定(不随每次请求重建),自增值仍单调。
  const nonceRef = React.useRef(0);
  const openChat = React.useCallback(
    (req: Omit<DraftChatRequest, "nonce">) => {
      nonceRef.current += 1;
      setRequest({ ...req, nonce: nonceRef.current });
    },
    [],
  );
  // 编辑器 flush 注册表(ref:注册/注销不该触发 Provider 重渲 → 不重建 value)。
  const flushFnRef = React.useRef<FlushSaveFn | null>(null);
  const registerFlush = React.useCallback((fn: FlushSaveFn | null) => {
    flushFnRef.current = fn;
  }, []);
  const flushSave = React.useCallback<FlushSaveFn>(async () => {
    const fn = flushFnRef.current;
    if (!fn) return; // 无编辑器注册 → no-op(结构测试/纯文本无编辑器)。
    await fn();
  }, []);
  const value = React.useMemo<DraftChatRequestContextValue>(
    () => ({ request, openChat, registerFlush, flushSave }),
    [request, openChat, registerFlush, flushSave],
  );
  return (
    <DraftChatRequestContext.Provider value={value}>
      {children}
    </DraftChatRequestContext.Provider>
  );
}

/**
 * 消费对话请求 context。Provider 外调用返回 no-op(稿面外复用这些按钮/rail/编辑器不炸;
 * 稿面内一律有 Provider)。
 */
export function useDraftChatRequest(): DraftChatRequestContextValue {
  const ctx = React.useContext(DraftChatRequestContext);
  return ctx ?? NOOP_VALUE;
}

const NOOP_VALUE: DraftChatRequestContextValue = {
  request: null,
  openChat: () => {},
  registerFlush: () => {},
  flushSave: async () => {},
};
