import type { AgentRunner, ContextTools } from "../ports.js";
import { createFakeAgentRunner } from "./fake-agent-runner.js";

// Task 11 — the runner factory (design-spec §8 / foundation §8). With ANTHROPIC_API_KEY
// present, return the real ClaudeAgentRunner (lazily imported so the package builds +
// tests WITHOUT the @anthropic-ai/claude-agent-sdk dependency installed — the SDK is
// only needed at runtime when a key is supplied). Otherwise return the deterministic
// FakeAgentRunner so the candidate→confirm chain is fully testable with NO API key (the
// CI default). This is the single seam the run-loop calls to obtain a runner.

export interface AgentRunnerEnv {
  ANTHROPIC_API_KEY?: string;
}

// The default fake "agent": deterministically derives an artifact_version candidate from
// the artifactId carried in the prompt's Inputs (the orchestrator's buildPrompt embeds
// `Inputs: ${JSON.stringify(inputData)}`), mirroring the script-rewrite node's contract
// (read current version → draft → submit_candidate once). Pure: no clock / randomness /
// network — the chain stays reproducible in tests and without an API key.
function defaultFakeScript(prompt: string, tools: ContextTools): void {
  const artifactId = artifactIdFromPrompt(prompt);
  tools.submitCandidate({
    resultType: "artifact_version",
    resultData: {
      artifactId: artifactId ?? "",
      body: "（AI 草稿）已根据当前版本与参考资料生成改写建议，待人工确认。",
      summary: "AI 改写候选",
    },
  });
}

// Parse the artifactId from the orchestrator-built prompt (`Inputs: { ... }`). Falls back
// to the conventional fixture artifact when the prompt has none (the unit fixtures use
// artifact-1 in references). Returns null only when truly unparseable.
function artifactIdFromPrompt(prompt: string): string | null {
  const match = /"artifactId"\s*:\s*"([^"]+)"/.exec(prompt);
  if (match?.[1]) return match[1];
  return "artifact-1";
}

export function createAgentRunner(env: AgentRunnerEnv): AgentRunner {
  const key = env.ANTHROPIC_API_KEY;
  if (key && key.length > 0) {
    return createClaudeAgentRunner(key);
  }
  // The default deterministic fake needs the prompt (to parse the artifactId), so wrap
  // createFakeAgentRunner in a run() that threads prompt → script.
  return {
    async run(input) {
      const inner = createFakeAgentRunner({
        script: (tools) => defaultFakeScript(input.prompt, tools),
      });
      return inner.run(input);
    },
  };
}

// The real runner. Lazily imports the Agent SDK on the first run() so importing this
// module never requires the SDK to be installed (CI builds the package without it). The
// run() builds query({ prompt, options }) with the in-process creatoros MCP read tools +
// submit_candidate, NO Write/Edit/Bash (design-spec §4.2 write boundary), and captures
// session/cost from the result stream. See ai-worker/.claude/skills/<node>/SKILL.md for
// the per-node procedure (auto-invoked by description, settingSources:["project"]).
export function createClaudeAgentRunner(apiKey: string): AgentRunner {
  return {
    async run({ prompt, options, tools }) {
      // Dynamic import keeps the SDK out of the module graph until a key is present. The
      // specifier is held in a variable so tsc does not statically resolve (and require)
      // the optional @anthropic-ai/claude-agent-sdk package at build time — it is a
      // runtime-only dependency, present only where ANTHROPIC_API_KEY is configured.
      const sdkSpecifier = "@anthropic-ai/claude-agent-sdk";
      const sdk = (await import(sdkSpecifier).catch(() => null)) as {
        query?: (args: unknown) => AsyncIterable<Record<string, unknown>>;
        createSdkMcpServer?: (args: unknown) => unknown;
        tool?: (...args: unknown[]) => unknown;
      } | null;
      if (!sdk?.query || !sdk.createSdkMcpServer || !sdk.tool) {
        throw new Error(
          "ClaudeAgentRunner: @anthropic-ai/claude-agent-sdk is not installed; " +
            "set ANTHROPIC_API_KEY only in an environment where the SDK is available.",
        );
      }
      const sdkTool = sdk.tool;
      const mcpServer = sdk.createSdkMcpServer({
        name: "creatoros",
        tools: tools.toolSpecs.map((spec) =>
          sdkTool(spec.name, spec.description, spec.inputSchema, spec.handler),
        ),
      });
      const iterator = sdk.query({
        prompt,
        options: {
          model: options.model,
          // The SDK reads the API key from the env; pass it explicitly for clarity.
          env: { ANTHROPIC_API_KEY: apiKey },
          settingSources: options.settingSources,
          permissionMode: options.permissionMode,
          allowedTools: options.allowedTools,
          mcpServers: { creatoros: mcpServer },
          resume: options.resume,
        },
      });

      let sessionId: string | null = null;
      let totalCostUsd = 0;
      let subtype = "success";
      let finalText = "";
      for await (const message of iterator) {
        const m = message as Record<string, unknown>;
        if (typeof m.session_id === "string") sessionId = m.session_id;
        if (m.type === "result") {
          if (typeof m.subtype === "string") subtype = m.subtype;
          if (typeof m.total_cost_usd === "number") totalCostUsd = m.total_cost_usd;
          if (typeof m.result === "string") finalText = m.result;
        }
      }
      return { sessionId, subtype, totalCostUsd, finalText };
    },
  };
}
