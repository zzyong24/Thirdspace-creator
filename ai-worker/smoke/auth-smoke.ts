/**
 * Auth smoke — confirms the Claude Agent SDK runs against the local Claude Code
 * SUBSCRIPTION (via CLAUDE_CODE_OAUTH_TOKEN), with no ANTHROPIC_API_KEY.
 * Run: cd ai-worker && env CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.creatoros-oauth-token)" npx tsx smoke/auth-smoke.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

const t0 = Date.now();
let result = "";
let subtype = "";
let cost = 0;

for await (const m of query({
  prompt: "Reply with exactly the token AUTH_OK and nothing else.",
  options: { allowedTools: [] },
})) {
  const msg = m as { type?: string; subtype?: string; result?: string; total_cost_usd?: number };
  if (msg.type === "result") {
    subtype = msg.subtype ?? "";
    result = msg.result ?? "";
    cost = msg.total_cost_usd ?? 0;
  }
}

console.log(`subtype=${subtype} | result=${JSON.stringify(result)} | cost_usd=${cost}`);
console.log(
  `AUTH SMOKE ${result.includes("AUTH_OK") ? "PASS ✓ — 订阅 token 能驱动 Agent SDK" : "✗ FAIL"} (${Date.now() - t0}ms)`,
);
