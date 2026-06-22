import type { AgentRunOptions } from "./ports.js";

export interface AgentConfigRow {
  agentType: string;
  capabilities: Record<string, unknown>;
  settings: Record<string, unknown>;
}
export interface ModelConfigRow {
  capability: string;
  modelName: string;
  settings: Record<string, unknown>;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

function effortFrom(settings: Record<string, unknown>): Effort {
  const raw = settings.effort;
  return EFFORTS.includes(raw as Effort) ? (raw as Effort) : "high";
}

function skillsFrom(capabilities: Record<string, unknown>): string[] {
  const raw = capabilities.skills;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function resolveRunOptions(input: {
  agentConfig: AgentConfigRow;
  modelConfig: ModelConfigRow;
  allowedTools: string[];
  resume?: string;
}): AgentRunOptions {
  return {
    model: input.modelConfig.modelName,
    effort: effortFrom(input.modelConfig.settings),
    skills: skillsFrom(input.agentConfig.capabilities),
    allowedTools: input.allowedTools,
    permissionMode: "default",
    settingSources: ["project"],
    resume: input.resume,
  };
}
