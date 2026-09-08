// 厂商无关的历史 JSON 数组解析工具；不包含模型或 Agent 执行。

// Robustly pull a JSON array out of an agent's final text (tolerate ``` fences / leading
// prose / trailing notes). Returns [] when nothing parseable. Shared by every node that
// asks the agent for a JSON list.
export function parseJsonArray(text: string): unknown[] {
  if (!text) return [];
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
