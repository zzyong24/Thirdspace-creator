import type { AgentRunner, ContextTools } from "../ports.js";

export interface FakeRunnerConfig {
  script: (tools: ContextTools) => void;
  subtype?: string;
  sessionId?: string;
  totalCostUsd?: number;
  finalText?: string;
}

export function createFakeAgentRunner(config: FakeRunnerConfig): AgentRunner {
  return {
    async run({ tools }) {
      config.script(tools);
      return {
        sessionId: config.sessionId ?? "fake-session-1",
        subtype: config.subtype ?? "success",
        totalCostUsd: config.totalCostUsd ?? 0,
        finalText: config.finalText ?? "done",
      };
    },
  };
}
