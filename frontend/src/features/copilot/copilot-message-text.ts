export interface CopilotTextPartLike {
  type: string;
  text?: unknown;
}

function normalizedBlock(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 合并同一消息的流式文本块，并只折叠相邻、完全相同且有信息量的助手文本。
 * SEMANTIC_BOUNDARY_ALLOW:这是流协议重复块去重，不做内容理解、改写或创作取舍。
 */
export function joinCopilotMessageText(
  parts: readonly CopilotTextPartLike[],
  options: { dedupeConsecutive: boolean },
): string {
  const kept: string[] = [];
  let previous = "";
  for (const part of parts) {
    if (part.type !== "text" || typeof part.text !== "string") continue;
    const current = normalizedBlock(part.text);
    const duplicate =
      options.dedupeConsecutive &&
      current.length >= 8 &&
      current === previous;
    if (!duplicate) kept.push(part.text);
    previous = current;
  }
  return kept.join("");
}
