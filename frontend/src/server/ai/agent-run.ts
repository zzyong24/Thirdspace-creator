import "server-only";

// Shared agent-invocation helper (机制④). Every node's runner calls this to run a real
// Claude agent on the user's Claude Code SUBSCRIPTION (CLAUDE_CODE_OAUTH_TOKEN in the
// server env — no API key, no per-token bill) and get its final text back. The SDK is
// imported through a variable specifier so the bundler treats it as a runtime-only dep
// (externalized in next.config). Do NOT pass `model` — the subscription resolves its own
// default; naming a per-task model can pick one the subscription can't access.

export interface RunClaudeOptions {
  allowedTools?: string[];
  // Hard ceiling on one agent run. A multi-angle WebSearch agent normally finishes in
  // ~1 min; if the SDK ever stalls (network/subprocess), we must NOT leave the caller
  // (and its AI task) hanging forever — on timeout we throw so the runner's catch flips
  // the task to a terminal state (cancelTask) and the UI shows a clean failure + 重试,
  // instead of an endless spinner. Default 4 min < the FE poll's 5-min give-up window.
  timeoutMs?: number;
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
  const query = sdk.query; // capture after the guard (narrowing is lost inside the IIFE)
  const timeoutMs = options.timeoutMs ?? 240_000;
  const drain = (async () => {
    let finalText = "";
    for await (const message of query({
      prompt,
      options: {
        allowedTools: options.allowedTools ?? [],
        permissionMode: "bypassPermissions",
      },
    })) {
      const m = message as { type?: string; result?: string };
      if (m.type === "result" && typeof m.result === "string")
        finalText = m.result;
    }
    return finalText;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`agent-run: timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([drain, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
