import type { AgentConfigRow, ModelConfigRow } from "./ai.repository";

// AI seed catalog (Step 3 seed; foundation §3 + design-spec §3). One ModelConfiguration
// per capability (capability → model/effort) and one AgentConfiguration per node
// (agentType=capability, capabilities.skills selects the enabled Skill). secretReference
// is "env:ANTHROPIC_API_KEY" — resolved at runtime, NEVER hardcoded (foundation
// decision 1). The default ModelConfiguration (isDefault:true) is copilot.assist /
// claude-opus-4-8. These rows are read user-scoped by the worker for model/skill routing;
// there is NO contract op exposing them (seed-only per the plan §"Contract ops").
//
// The rows are written through the SHARED settings tables (model_configurations /
// agent_configurations) via the AI repository's seedModelConfigs/seedAgentConfigs
// (onConflictDoNothing parity). Ids are deterministic so a re-built singleton never
// double-seeds.

interface CapabilitySpec {
  capability: string;
  modelName: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  skills: string[];
  isDefault?: boolean;
}

const CATALOG: CapabilitySpec[] = [
  {
    capability: "research.analyze",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["research-analysis"],
  },
  {
    capability: "planning.thesis",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["planning-thesis"],
  },
  {
    capability: "script.rewrite",
    modelName: "claude-fable-5",
    effort: "high",
    skills: ["script-rewrite"],
  },
  {
    capability: "copy.generate",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["copy-generation"],
  },
  {
    capability: "review.insights",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["review-insights"],
  },
  {
    capability: "copilot.assist",
    modelName: "claude-opus-4-8",
    effort: "medium",
    skills: ["copilot-assist"],
    isDefault: true,
  },
];

const SECRET_REF = "env:ANTHROPIC_API_KEY";

// A stable, capability-keyed id so the seed is idempotent across rebuilds. The settings
// module may also seed (user_id, capability) rows; the AI seed targets distinct ids
// (ai-prefixed) and onConflictDoNothing means it never clobbers an existing config.
export function buildAiModelConfigs(
  userId: string,
  now: string,
): ModelConfigRow[] {
  void now;
  return CATALOG.map((c) => ({
    id: `ai-model-${userId}-${c.capability}`,
    userId,
    capability: c.capability,
    provider: "anthropic",
    modelName: c.modelName,
    secretReference: SECRET_REF,
    settings: { effort: c.effort },
    isDefault: c.isDefault ?? false,
  }));
}

export function buildAiAgentConfigs(
  userId: string,
  now: string,
): AgentConfigRow[] {
  return CATALOG.map((c) => ({
    id: `ai-agent-${userId}-${c.capability}`,
    userId,
    name: c.capability,
    agentType: c.capability,
    status: "active",
    capabilities: { skills: c.skills },
    settings: { effort: c.effort },
    secretReference: SECRET_REF,
    createdAt: now,
    updatedAt: now,
  }));
}
