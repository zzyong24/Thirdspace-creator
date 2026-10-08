import type { aiMessages } from "@creatoros/backend";
import { ConflictError } from "../execution/execution.errors";

type Message = typeof aiMessages.$inferSelect;

/** 顺序来自后端原任务的冻结ID；当前真实行仍由调用方做完整摘要和归属校验。 */
export function selectFrozenChatHistory(
  conversation: { id: string },
  rows: ReadonlyArray<Message>,
  sourceMessageId: string,
  frozenIds: unknown,
): { messages: Message[]; sourceMessage: Message } {
  if (!Array.isArray(frozenIds) || frozenIds.length === 0 ||
      frozenIds.some(id => typeof id !== "string" || id.length === 0) ||
      new Set(frozenIds).size !== frozenIds.length || frozenIds.at(-1) !== sourceMessageId) {
    throw new ConflictError("聊天冻结历史映射无效");
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  const messages = frozenIds.map(id => {
    const row = byId.get(id);
    if (!row || row.conversationId !== conversation.id) throw new ConflictError("聊天冻结历史消息已不可用");
    return row;
  });
  const sourceMessage = messages.at(-1)!;
  if (sourceMessage.role !== "user") throw new ConflictError("源消息不是当前会话的用户消息");
  return { messages, sourceMessage };
}
