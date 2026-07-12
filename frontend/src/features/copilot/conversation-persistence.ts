/**
 * Copilot 会话持久化 + 读回映射的纯逻辑(与 React 解耦,便于单测)。
 *
 * 后端已具备:/api/chat 会 lazy 建会话、落 ai_conversations/ai_messages、响应头返
 * `x-conversation-id`,且接受请求体里的 conversationId 续接;契约读 op
 * (ai.conversations.list / ai.conversations.messages.list)也已存在。这里只做前端消费:
 *   1. [T-096] 按 **scope**(会话作用域,chat-scope.ts 的 resolveChatScope 产出)把「当前
 *      conversationId」记到 localStorage —— global / project:<id> / surface:<name> 各桶独立。
 *      这只是恢复的**快路**;指针缺失/毁档时由服务端兜底(listConversations?scope= 最近一条),
 *      见 ai-copilot-content 的双路恢复。旧 persistKey 键(copilot:conv:topics 等)不迁移、
 *      自然废弃(服务端兜底让旧指针丢失无感)。
 *   2. 把 ai_messages 的 {role, content} 映射成 useChat 的 UIMessage(parts:[{type:"text"}])。
 *
 * localStorage 读写全部 try/catch —— 隐私模式 / 禁用 storage 时降级为「不持久」,绝不抛。
 */

import type { UIMessage } from "ai";

// [T-096] 按 scope 分桶的 localStorage 键前缀。global / project:<id> / surface:<name>
// 各自持有独立的当前会话,互不覆盖(左下角闲聊不再与选题岛互抢指针)。
const CONV_KEY_PREFIX = "copilot:conv:";

/** 该 scope 的「当前 conversationId」localStorage 键。 */
export function convKey(scope: string): string {
  return `${CONV_KEY_PREFIX}${scope}`;
}

/**
 * 读该 scope 存的 conversationId(客户端专用,SSR 环境返回 null)。任何异常(禁用
 * storage / JSON 无关)静默降级为 null —— 视作「无快路指针」,走服务端兜底/空会话。
 */
export function readStoredConversationId(scope: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(convKey(scope));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 把该 scope 的当前 conversationId 写入 localStorage(客户端专用)。传空串/undefined
 * 视为清除。写失败(隐私模式)静默降级 —— 不持久但不崩(服务端兜底仍能恢复)。
 */
export function writeStoredConversationId(
  scope: string,
  conversationId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!conversationId) {
      window.localStorage.removeItem(convKey(scope));
    } else {
      window.localStorage.setItem(convKey(scope), conversationId);
    }
  } catch {
    /* storage 不可用 → 降级为不持久,吞掉异常 */
  }
}

// ai_messages 的一行(契约 aiMessageResource 的子集 —— 读回需要 id/role/content + [T-128] parts)。
// 结构化 cast,不引 contract-package 类型依赖(与本 island 其它 list 调用一致)。
export interface WireAIMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  // [T-128] 落库的 useChat UIMessage parts(text + tool-result 部件)。存量行/旧后端读到 undefined
  // 或 [] → 回落 content 文本气泡(向后兼容)。assistant 回复带完整 parts → 卡刷新可重渲。
  readonly parts?: readonly unknown[];
  // [T-239e] assistant 行的 token 用量(ai_messages 新列投影)。老行/user 行/旧后端 → null 或
  // undefined,累计时跳过(不崩、不计 0)。
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
}

/** 会话累计 token 用量(角标用)。 */
export interface UsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * [T-239e] 汇总一段落库消息的 token 用量(会话成本角标的历史底数)。只累加真数字;
 * null/undefined(老消息/user 行/无 usage 轮)诚实跳过 —— 兼容性硬要求:老会话不崩不假计。
 */
export function sumUsageTokens(rows: readonly WireAIMessage[]): UsageTotals {
  let input = 0;
  let output = 0;
  for (const row of rows) {
    if (typeof row.inputTokens === "number") input += row.inputTokens;
    if (typeof row.outputTokens === "number") output += row.outputTokens;
  }
  return { inputTokens: input, outputTokens: output };
}

/**
 * [T-239e] 汇总 useChat 内存消息里**流式带回**的用量(route messageMetadata 在 finish part
 * 注入 metadata.usage)。读回历史(toUIMessages)不设 metadata → 天然与 sumUsageTokens 的
 * 历史底数不重复计;两者相加 = 会话累计。形状不合(老流/无 metadata)诚实跳过。
 */
export function sumStreamedUsage(
  messages: ReadonlyArray<{ metadata?: unknown }>,
): UsageTotals {
  let input = 0;
  let output = 0;
  for (const m of messages) {
    const usage = (m.metadata as { usage?: unknown } | undefined)?.usage as
      | { inputTokens?: unknown; outputTokens?: unknown }
      | undefined;
    if (!usage) continue;
    if (typeof usage.inputTokens === "number") input += usage.inputTokens;
    if (typeof usage.outputTokens === "number") output += usage.outputTokens;
  }
  return { inputTokens: input, outputTokens: output };
}

// [T-128] 一个 part 是否「有可渲染内容」——非空 text part,或任意 tool-result 部件(type 形如
// `tool-<name>`,AI SDK v5 ToolUIPart)。用于判定 parts 数组是否值得回放(过滤纯 step-start 等空壳)。
function hasRenderablePart(parts: readonly unknown[]): boolean {
  return parts.some((p) => {
    const t = (p as { type?: unknown }).type;
    if (typeof t !== "string") return false;
    if (t.startsWith("tool-") || t === "dynamic-tool") return true;
    if (t === "text") {
      const text = (p as { text?: unknown }).text;
      return typeof text === "string" && text.trim().length > 0;
    }
    return false;
  });
}

/**
 * 把落库的 ai_messages 映射成 useChat 的 UIMessage[](喂 setMessages 做二次进入读回)。
 *   - role "system" 折叠成 "assistant"(useChat UI 只认 user/assistant/system,但对话气泡
 *     只区分「我」和「助手」;把 system 当助手侧展示,不丢内容)。
 *   - [T-128] 有落库 parts(含 tool-result 卡数据)→ **原样回放**:恢复时 ai-copilot-content 复用现有
 *     候选卡/素材卡/审核报告卡渲染分支(part.output.kind 分发),之前采纳过的卡不再丢。
 *   - 无 parts(存量行/用户消息)→ 回落 content(纯文本)→ parts:[{type:"text",text}]。
 *   - 空内容的消息跳过(不渲染空气泡)。
 */
export function toUIMessages(rows: readonly WireAIMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const row of rows) {
    const role: UIMessage["role"] = row.role === "user" ? "user" : "assistant";
    // [T-128] 优先回放落库的 parts(含 tool-result 卡)——它是 SDK 组装好的这轮 UIMessage.parts,
    // 与实时 stream 同形,原样喂 setMessages 即复用现有卡渲染分支,刷新不丢卡。
    const storedParts = Array.isArray(row.parts) ? row.parts : null;
    if (storedParts && hasRenderablePart(storedParts)) {
      out.push({
        id: row.id,
        role,
        parts: storedParts as UIMessage["parts"],
      } as UIMessage);
      continue;
    }
    // 回落:纯文本 content → 文本气泡(存量行/用户消息/纯文本回复)。
    const text = typeof row.content === "string" ? row.content : "";
    if (!text.trim()) continue;
    out.push({
      id: row.id,
      role,
      parts: [{ type: "text", text }],
    } as UIMessage);
  }
  return out;
}
