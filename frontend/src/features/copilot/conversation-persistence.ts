/**
 * Copilot 会话持久化 + 读回映射的纯逻辑(与 React 解耦,便于单测)。
 *
 * 后端已具备:/api/chat 会 lazy 建会话、落 ai_conversations/ai_messages、响应头返
 * `x-conversation-id`,且接受请求体里的 conversationId 续接;契约读 op
 * (ai.conversations.list / ai.conversations.messages.list)也已存在。这里只做前端消费:
 *   1. 按 surface 键把「当前 conversationId」记到 localStorage(校准/复盘/topics 各自独立)。
 *   2. 把 ai_messages 的 {role, content} 映射成 useChat 的 UIMessage(parts:[{type:"text"}])。
 *
 * localStorage 读写全部 try/catch —— 隐私模式 / 禁用 storage 时降级为「不持久」,绝不抛。
 */

import type { UIMessage } from "ai";

// 按 surface 分桶的 localStorage 键前缀。校准(calibration)/复盘(review)/选题(topics)等
// 页面各自持有独立的当前会话,互不覆盖。
const CONV_KEY_PREFIX = "copilot:conv:";

/** 该 surface 的「当前 conversationId」localStorage 键。 */
export function convKey(surface: string): string {
  return `${CONV_KEY_PREFIX}${surface}`;
}

/**
 * 读该 surface 存的 conversationId(客户端专用,SSR 环境返回 null)。任何异常(禁用
 * storage / JSON 无关)静默降级为 null —— 视作「无历史」,走空会话。
 */
export function readStoredConversationId(surface: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(convKey(surface));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 把该 surface 的当前 conversationId 写入 localStorage(客户端专用)。传空串/undefined
 * 视为清除。写失败(隐私模式)静默降级 —— 不持久但不崩。
 */
export function writeStoredConversationId(
  surface: string,
  conversationId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!conversationId) {
      window.localStorage.removeItem(convKey(surface));
    } else {
      window.localStorage.setItem(convKey(surface), conversationId);
    }
  } catch {
    /* storage 不可用 → 降级为不持久,吞掉异常 */
  }
}

// ai_messages 的一行(契约 aiMessageResource 的子集 —— 读回只需要 id/role/content)。
// 结构化 cast,不引 contract-package 类型依赖(与本 island 其它 list 调用一致)。
export interface WireAIMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

/**
 * 把落库的 ai_messages 映射成 useChat 的 UIMessage[](喂 setMessages 做二次进入读回)。
 *   - role "system" 折叠成 "assistant"(useChat UI 只认 user/assistant/system,但对话气泡
 *     只区分「我」和「助手」;把 system 当助手侧展示,不丢内容)。
 *   - content(纯文本)→ parts:[{type:"text",text}](useChat v7 消息是 parts 数组)。
 *   - 空 content 的消息跳过(不渲染空气泡)。
 * 注意:工具调用/结果不落 ai_messages.content(它们随流回前端渲卡),故读回的历史只有文本
 * 气泡 —— 之前采纳过的候选卡不会重现(诚实局限,见返回说明)。
 */
export function toUIMessages(rows: readonly WireAIMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const row of rows) {
    const text = typeof row.content === "string" ? row.content : "";
    if (!text.trim()) continue;
    const role: UIMessage["role"] = row.role === "user" ? "user" : "assistant";
    out.push({
      id: row.id,
      role,
      parts: [{ type: "text", text }],
    } as UIMessage);
  }
  return out;
}
