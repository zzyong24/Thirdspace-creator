import "server-only";

// Shared agent-invocation helper (机制④). Every node's runner calls this to run a real
// Claude agent on the user's Claude Code SUBSCRIPTION (CLAUDE_CODE_OAUTH_TOKEN in the
// server env — no API key, no per-token bill) and get its final text back. The SDK is
// imported through a variable specifier so the bundler treats it as a runtime-only dep
// (externalized in next.config). Do NOT pass `model` — the subscription resolves its own
// default; naming a per-task model can pick one the subscription can't access.

export interface RunClaudeOptions {
  allowedTools?: string[];
}

export async function runClaudeAgent(
  prompt: string,
  options: RunClaudeOptions = {},
): Promise<string> {
  const sdkSpecifier = "@anthropic-ai/claude-agent-sdk";
  const sdk = (await import(sdkSpecifier).catch(() => null)) as {
    query?: (args: unknown) => AsyncIterable<Record<string, unknown>>;
  } | null;
  if (!sdk?.query) {
    throw new Error(
      "agent-run: @anthropic-ai/claude-agent-sdk not available in the server runtime",
    );
  }
  let finalText = "";
  for await (const message of sdk.query({
    prompt,
    options: {
      allowedTools: options.allowedTools ?? [],
      permissionMode: "bypassPermissions",
    },
  })) {
    const m = message as { type?: string; result?: string };
    if (m.type === "result" && typeof m.result === "string") finalText = m.result;
  }
  return finalText;
}

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
