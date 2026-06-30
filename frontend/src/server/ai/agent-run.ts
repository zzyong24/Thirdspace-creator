import "server-only";

// 共享解析辅助。原本这里还有一个 runClaudeAgent(机制④,跑 Claude Agent SDK 订阅)——
// 已随「全程 Vercel AI SDK」迁移退役(产品定位 §9 铁律1):所有生成节点都走 @creatoros/ai-worker
// 的 Vercel AI SDK 运行时(modelFor + runAgentNode),素材搜集的联网搜索改用 @ai-sdk/anthropic
// 的 provider 内置 web search。本文件只剩一个厂商无关的 JSON 解析工具,供若干 runner 复用。

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
