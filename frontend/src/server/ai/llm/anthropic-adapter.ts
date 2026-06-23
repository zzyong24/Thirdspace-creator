import type { LlmProvider, ResolvedLlmConfig } from "./provider";

export function createAnthropicProvider(_config: ResolvedLlmConfig): LlmProvider {
  return {
    complete: async () => {
      throw new Error("anthropic-adapter placeholder — implemented in Task 3");
    },
  };
}
