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
    capability: "planning.contract",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["planning-contract"],
  },
  {
    capability: "planning.outline",
    modelName: "claude-opus-4-8",
    effort: "high",
    skills: ["planning-outline"],
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

// [T-135] 新用户开箱即干净空账号(用户裁决 2026-07-05):AI capability **骨架保留**
// (设置页据此列出每个可配能力 + agent 挂哪个 Skill),但**去掉预设 provider/model/凭据**——
// provider/modelName/secretReference 全部留空占位,由 onboarding 引导用户在设置里配自己的
// provider(如 MiniMax)。resolveLlmConfig(frontend/src/server/ai/llm/resolve.ts)对空 token 的
// DB 行短路返回 null → 诚实降级到 env 兜底 → 都没配则抛 LlmCredentialError 引导去配,不假成功。
// effort/skills(capability 本征属性)保留;isDefault 仍标(copilot.assist),让设置页知道哪个是
// 全局默认槽。secretReference "" 触发 schema default(见 settings.ts 列 default("")）。

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
    // [T-135] 空占位:不预设 provider/model/凭据,用户 onboarding 自行配置。
    provider: "",
    modelName: "",
    secretReference: "",
    secretValue: null,
    keyringRef: null,
    credentialMigrationState: "not_required",
    rotatedAt: null,
    baseUrl: null,
    apiFormat: "anthropic",
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
    // [T-135] agent 骨架保留(挂哪个 Skill + effort 是能力本征),但不预填凭据。
    capabilities: { skills: c.skills },
    settings: { effort: c.effort },
    secretReference: "",
    createdAt: now,
    updatedAt: now,
  }));
}
