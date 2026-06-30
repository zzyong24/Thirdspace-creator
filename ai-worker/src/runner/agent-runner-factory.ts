import type { AgentRunner, ContextTools } from "../ports";
import { createFakeAgentRunner } from "./fake-agent-runner";

// 运行器工厂(design-spec §8 / foundation §8)—— orchestrator/run-loop 取 runner 的唯一接缝。
//
// 历史:这里曾有一个 createClaudeAgentRunner(跑 @anthropic-ai/claude-agent-sdk,在有
// ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN 时返回真订阅 runner)。随「全程 Vercel AI SDK、
// 去掉 Claude Agent SDK」(产品定位 §9 铁律1)退役 —— 所有真实生成节点都改走 @creatoros/ai-worker
// 的 Vercel AI SDK 运行时(runAgentNode + provider-factory),不再经由本工厂的 SDK 路径(全仓
// 已无活跃调用者)。本工厂现在只产确定性的 FakeAgentRunner(orchestrator 单测/无密钥环境用);
// AgentRunner 抽象接口本身保留(run-loop / orchestrator 仍以它为类型契约)。

export interface AgentRunnerEnv {
  ANTHROPIC_API_KEY?: string;
  // The local Claude Code subscription credential (`claude setup-token`). Retained for
  // call-site compatibility; no longer selects a real SDK runner (that path 已退役).
  CLAUDE_CODE_OAUTH_TOKEN?: string;
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

// The single seam the run-loop / orchestrator call to obtain a runner. `env` is accepted
// for call-site compatibility but no longer selects a real SDK runner — it always returns
// the deterministic FakeAgentRunner. The real generation path is the Vercel AI SDK runtime
// in the templated/script/research nodes, driven directly by the frontend runners.
export function createAgentRunner(_env: AgentRunnerEnv): AgentRunner {
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
