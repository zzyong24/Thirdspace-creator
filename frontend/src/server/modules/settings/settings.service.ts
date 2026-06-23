import type { RequestContext } from "@creatoros/backend";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
} from "./settings.repository";
import type {
  UserResource,
  UserPreferenceResource,
  ModelConfigurationResource,
  AgentConfigurationResource,
} from "./settings.schema";

// SettingsService (foundation §5.3) — RequestContext-taking methods. Settings has
// NO §12 business state machine (plan §11: preferences/model/agent are mutable
// singletons/upserts, not lifecycle entities); the service is validation
// (delegated to the contract Zod on the transport edge) + repo orchestration +
// the AI-consumed read (resolveModelForCapability).
//
// The account read (`getAccount` → settings.get) is NOT owned by Settings —
// Settings does not own the `users` table. It is injected as an `accountReader`
// function (the Identity service's `getCurrentUser`, threaded at composition
// time) so there is NO cross-module repository import (foundation §1; modules
// import each other only via index.ts). The repo is supplied via a per-ctx
// factory (mirrors notifications/search), keeping the service db-agnostic.

// The AI-consumed model resolution (foundation §3; the worker's ClaudeAgentRunner
// reads it). Deterministic hard default per foundation §3.
export interface ResolvedModel {
  provider: string;
  modelName: string;
}

const HARD_DEFAULT_MODEL: ResolvedModel = {
  provider: "anthropic",
  modelName: "claude-opus-4-8",
};

/** Reads the authenticated user's account row (Identity's getCurrentUser). */
export type AccountReader = (ctx: RequestContext) => Promise<UserResource>;

export interface SettingsService {
  getAccount(ctx: RequestContext): Promise<UserResource>;
  updatePreferences(
    ctx: RequestContext,
    patch: PreferencePatch,
  ): Promise<UserPreferenceResource>;
  setModelConfiguration(
    ctx: RequestContext,
    capability: string,
    body: ModelPutBody,
  ): Promise<ModelConfigurationResource>;
  resolveModelForCapability(
    ctx: RequestContext,
    capability: string,
  ): Promise<ResolvedModel>;
  getModelConfig(
    ctx: RequestContext,
    capability: string,
  ): Promise<ModelConfigurationResource | null>;
  createAgentConfiguration(
    ctx: RequestContext,
    input: AgentCreateInput,
  ): Promise<AgentConfigurationResource>;
}

// USER_PREFERENCE is keyed by user_id (no own id column), but the DTO requires an
// `id`. Synthesize a stable, deterministic id from the user id (plan §31).
function toPreferenceResource(
  ctx: RequestContext,
  row: UserPreferenceRow,
): UserPreferenceResource {
  return {
    id: `pref-${ctx.userId}`,
    userId: row.userId,
    defaultHome: row.defaultHome,
    defaultCreationMode:
      row.defaultCreationMode as UserPreferenceResource["defaultCreationMode"],
    defaultVisibility:
      row.defaultVisibility as UserPreferenceResource["defaultVisibility"],
    autosaveEnabled: row.autosaveEnabled,
    fileNamingRule: row.fileNamingRule,
    analyticsEnabled: row.analyticsEnabled,
  };
}

function toModelResource(
  row: ModelConfigurationRow,
): ModelConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    capability: row.capability,
    provider: row.provider,
    modelName: row.modelName,
    secretReference: row.secretReference,
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
    settings: (row.settings as Record<string, unknown>) ?? {},
    isDefault: row.isDefault,
  };
}

function toAgentResource(
  row: AgentConfigurationRow,
): AgentConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    agentType: row.agentType,
    status: row.status,
    capabilities: (row.capabilities as Record<string, unknown>) ?? {},
    settings: (row.settings as Record<string, unknown>) ?? {},
    secretReference: row.secretReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSettingsService(
  repoForCtx: (ctx: RequestContext) => SettingsRepository,
  accountReader: AccountReader,
): SettingsService {
  return {
    async getAccount(ctx) {
      // Delegated to Identity (injected). Settings does not own `users`.
      return accountReader(ctx);
    },

    async updatePreferences(ctx, patch) {
      const row = await repoForCtx(ctx).patchPreferences(ctx, patch);
      return toPreferenceResource(ctx, row);
    },

    async setModelConfiguration(ctx, capability, body) {
      const row = await repoForCtx(ctx).putModel(ctx, capability, body);
      return toModelResource(row);
    },

    async resolveModelForCapability(ctx, capability) {
      const repo = repoForCtx(ctx);
      // 1) exact capability match.
      const exact = await repo.getModel(ctx, capability);
      if (exact) return { provider: exact.provider, modelName: exact.modelName };
      // 2) the user's `isDefault` row (any capability).
      const all = await repo.listModels(ctx);
      const fallback = all.find((m) => m.isDefault);
      if (fallback) {
        return { provider: fallback.provider, modelName: fallback.modelName };
      }
      // 3) deterministic hard default (foundation §3).
      return { ...HARD_DEFAULT_MODEL };
    },

    async getModelConfig(ctx, capability) {
      const row = await repoForCtx(ctx).getModel(ctx, capability);
      return row ? toModelResource(row) : null;
    },

    async createAgentConfiguration(ctx, input) {
      const row = await repoForCtx(ctx).createAgent(ctx, input);
      return toAgentResource(row);
    },
  };
}
