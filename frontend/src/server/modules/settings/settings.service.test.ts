import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/backend";
import { createSettingsService } from "./settings.service";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
} from "./settings.repository";

// SettingsService unit tests (plan Step 3), against an in-memory fake repo + a
// fake account reader (Identity is injected as a function so there is no
// cross-module repository import — foundation §1). Asserts the DTO mappings, the
// synthesized preference id, the upsert defaults, the resolveModelForCapability
// fallback chain, and the agent stamping (status/empty json/createdAt==updatedAt).

const ctx: RequestContext = { userId: "user-z", requestId: "req-z", source: "user" };
const NOW = "2026-06-21T00:00:00.000Z";

// A tiny in-memory fake of the user-scoped repository. It ignores ctx scoping
// (the integration test covers scoping); it just records state for the mapping
// assertions.
function makeFakeRepo(): SettingsRepository & {
  _pref?: UserPreferenceRow;
  _models: ModelConfigurationRow[];
  _agents: AgentConfigurationRow[];
} {
  const state = {
    _pref: undefined as UserPreferenceRow | undefined,
    _models: [] as ModelConfigurationRow[],
    _agents: [] as AgentConfigurationRow[],
  };
  return {
    ...state,
    get _pref() {
      return state._pref;
    },
    get _models() {
      return state._models;
    },
    get _agents() {
      return state._agents;
    },
    async getPreferences() {
      return state._pref ?? null;
    },
    async patchPreferences(_c: RequestContext, patch: PreferencePatch) {
      const base: UserPreferenceRow = state._pref ?? {
        userId: ctx.userId,
        defaultHome: "dashboard",
        defaultCreationMode: "guided",
        defaultVisibility: "private",
        autosaveEnabled: true,
        fileNamingRule: "",
        analyticsEnabled: true,
      };
      const provided = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      );
      state._pref = { ...base, ...provided } as UserPreferenceRow;
      return state._pref;
    },
    async getModel(_c: RequestContext, capability: string) {
      return state._models.find((m) => m.capability === capability) ?? null;
    },
    async putModel(_c: RequestContext, capability: string, body: ModelPutBody) {
      const prev = state._models.find((m) => m.capability === capability);
      const secretProvided =
        typeof body.secret === "string" && body.secret.length > 0;
      const row: ModelConfigurationRow = {
        id: "model-fake",
        userId: ctx.userId,
        capability,
        provider: body.provider,
        modelName: body.modelName,
        secretReference: body.secretReference ?? "",
        secretValue: secretProvided ? body.secret! : (prev?.secretValue ?? null),
        baseUrl: body.baseUrl ?? null,
        apiFormat: body.apiFormat ?? "anthropic",
        settings: body.settings ?? {},
        isDefault: body.isDefault ?? false,
      };
      const i = state._models.findIndex((m) => m.capability === capability);
      if (i >= 0) state._models[i] = row;
      else state._models.push(row);
      return row;
    },
    async listModels() {
      return state._models;
    },
    async createAgent(_c: RequestContext, input: AgentCreateInput) {
      const row: AgentConfigurationRow = {
        id: "agent-fake",
        userId: ctx.userId,
        name: input.name,
        agentType: input.agentType,
        status: "active",
        capabilities: {},
        settings: {},
        secretReference: "",
        createdAt: NOW,
        updatedAt: NOW,
      };
      state._agents.push(row);
      return row;
    },
    async seedPreferences() {},
    async seedModels() {},
    async seedAgents() {},
  };
}

const accountReader = async (c: RequestContext) => ({
  id: c.userId,
  email: "z@creatoros.local",
  displayName: "Zyong",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  createdAt: NOW,
  updatedAt: NOW,
});

// Fake accountWriter (Identity's updateProfile stand-in). Echoes the patch over
// the reader's base DTO so the service's delegation is observable.
const accountWriter = async (
  c: RequestContext,
  patch: { displayName?: string; locale?: string },
) => ({
  id: c.userId,
  email: "z@creatoros.local",
  displayName: patch.displayName ?? "Zyong",
  timezone: "Asia/Shanghai",
  locale: patch.locale ?? "zh-CN",
  createdAt: NOW,
  updatedAt: NOW,
});

describe("settings.service", () => {
  it("getAccount delegates to the injected account reader (userResource shape)", async () => {
    const svc = createSettingsService(() => makeFakeRepo(), accountReader, accountWriter);
    const account = await svc.getAccount(ctx);
    expect(account.id).toBe("user-z");
    expect(account.email).toBe("z@creatoros.local");
    expect(account.displayName).toBe("Zyong");
  });

  it("updateAccount delegates to the injected account writer (PATCH /me)", async () => {
    const svc = createSettingsService(() => makeFakeRepo(), accountReader, accountWriter);
    const account = await svc.updateAccount(ctx, {
      displayName: "Renamed",
      locale: "en-US",
    });
    expect(account.id).toBe("user-z");
    expect(account.displayName).toBe("Renamed");
    expect(account.locale).toBe("en-US");
    // Un-patched identity fields fall through to the reader's base values.
    expect(account.email).toBe("z@creatoros.local");
  });

  it("updatePreferences synthesizes id='pref-'+userId and changes only patched fields", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const dto = await svc.updatePreferences(ctx, { defaultHome: "projects" });
    expect(dto.id).toBe("pref-user-z");
    expect(dto.userId).toBe("user-z");
    expect(dto.defaultHome).toBe("projects");
    // Untouched keys keep their defaults.
    expect(dto.analyticsEnabled).toBe(true);
  });

  it("setModelConfiguration upserts; secretReference/settings default when omitted", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const dto = await svc.setModelConfiguration(ctx, "script", {
      provider: "anthropic",
      modelName: "claude-opus-4-8",
    });
    expect(dto.capability).toBe("script");
    expect(dto.secretReference).toBe("");
    expect(dto.settings).toEqual({});
    expect(dto.isDefault).toBe(false);
  });

  it("masks the secret on the DTO: hasSecret reflects config, raw value never serialized", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const dto = await svc.setModelConfiguration(ctx, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-real-key",
    });
    expect(dto.hasSecret).toBe(true);
    // The raw secret is NEVER on the public DTO.
    expect((dto as Record<string, unknown>).secret).toBeUndefined();
    expect((dto as Record<string, unknown>).secretValue).toBeUndefined();
    // An env-ref alone also counts as configured.
    const dto2 = await svc.setModelConfiguration(ctx, "research", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secretReference: "env:MINIMAX_AUTH_TOKEN",
    });
    expect(dto2.hasSecret).toBe(true);
    // Neither stored nor referenced → not configured.
    const dto3 = await svc.setModelConfiguration(ctx, "copy", {
      provider: "anthropic",
      modelName: "claude-opus-4-8",
    });
    expect(dto3.hasSecret).toBe(false);
  });

  it("listModelConfigs returns masked DTOs for the user's rows", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    await svc.setModelConfiguration(ctx, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-real-key",
    });
    const list = await svc.listModelConfigs(ctx);
    expect(list).toHaveLength(1);
    expect(list[0]!.capability).toBe("default");
    expect(list[0]!.hasSecret).toBe(true);
    expect((list[0] as Record<string, unknown>).secretValue).toBeUndefined();
  });

  it("resolveModelForCapability fallback chain: exact → isDefault → hard default", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);

    // Hard default when nothing configured.
    const hard = await svc.resolveModelForCapability(ctx, "script");
    expect(hard).toEqual({ provider: "anthropic", modelName: "claude-opus-4-8" });

    // isDefault fallback: a default row for a DIFFERENT capability.
    await repo.putModel(ctx, "research", {
      provider: "anthropic",
      modelName: "claude-opus",
      isDefault: true,
    });
    const byDefault = await svc.resolveModelForCapability(ctx, "script");
    expect(byDefault).toEqual({ provider: "anthropic", modelName: "claude-opus" });

    // Exact capability wins over the default row.
    await repo.putModel(ctx, "script", {
      provider: "openai",
      modelName: "gpt-4o",
    });
    const exact = await svc.resolveModelForCapability(ctx, "script");
    expect(exact).toEqual({ provider: "openai", modelName: "gpt-4o" });
  });

  it("createAgentConfiguration stamps status:active, empty json, createdAt==updatedAt", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const dto = await svc.createAgentConfiguration(ctx, {
      name: "研究助理",
      agentType: "research",
    });
    expect(dto.status).toBe("active");
    expect(dto.capabilities).toEqual({});
    expect(dto.settings).toEqual({});
    expect(dto.secretReference).toBe("");
    expect(dto.createdAt).toBe(dto.updatedAt);
  });
});
