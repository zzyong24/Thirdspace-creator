import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/backend";
import { createSettingsService } from "./settings.service";
import {
  StorageValidationError,
  PromptValidationError,
  OwnershipError,
} from "./settings.errors";
import * as os from "node:os";
import * as path from "node:path";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  StorageConfigRow,
  SkillConfigOverrideRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
  StorageConfigPatch,
  SkillConfigOverridePutBody,
  AssetTypeUsage,
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
function makeFakeRepo(
  opts: { usage?: AssetTypeUsage[] } = {},
): SettingsRepository & {
  _pref?: UserPreferenceRow;
  _models: ModelConfigurationRow[];
  _agents: AgentConfigurationRow[];
  _storage?: StorageConfigRow;
} {
  const state = {
    _pref: undefined as UserPreferenceRow | undefined,
    _models: [] as ModelConfigurationRow[],
    _agents: [] as AgentConfigurationRow[],
    _storage: undefined as StorageConfigRow | undefined,
    _prompts: [] as SkillConfigOverrideRow[],
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
        analyticsEnabled: false, // 镜像 schema 默认关(PROTECTION.md §4)
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
    async getStorageConfig() {
      return state._storage ?? null;
    },
    async putStorageConfig(_c: RequestContext, patch: StorageConfigPatch) {
      const base: StorageConfigRow = state._storage ?? {
        userId: ctx.userId,
        backend: "local",
        rootPath: "",
        createdAt: NOW,
        updatedAt: NOW,
      };
      const provided = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      );
      state._storage = { ...base, ...provided, updatedAt: NOW } as StorageConfigRow;
      return state._storage;
    },
    async sumUsageByAssetType() {
      return opts.usage ?? [];
    },
    async listSkillConfigOverrides() {
      return state._prompts;
    },
    async getSkillConfigOverride(id: string) {
      return state._prompts.find((p) => p.id === id) ?? null;
    },
    async putSkillConfigOverride(
      _c: RequestContext,
      body: SkillConfigOverridePutBody,
    ) {
      const prev = state._prompts.find((p) => p.id === body.id);
      const prevNum = prev?.version ? Number.parseInt(prev.version, 10) : 0;
      const version =
        body.version && body.version.trim()
          ? body.version
          : String((Number.isFinite(prevNum) && prevNum > 0 ? prevNum : 0) + 1);
      const row: SkillConfigOverrideRow = {
        id: body.id,
        version,
        system: body.system ?? prev?.system ?? null,
        template: body.template ?? prev?.template ?? null,
        tools: body.tools ? [...body.tools] : (prev?.tools ?? null),
        requiredFacets: body.requiredFacets
          ? [...body.requiredFacets]
          : (prev?.requiredFacets ?? null),
        outputSchema: body.outputSchema ?? prev?.outputSchema ?? null,
        updatedBy: body.updatedBy ?? ctx.userId,
        updatedAt: NOW,
      };
      const i = state._prompts.findIndex((p) => p.id === body.id);
      if (i >= 0) state._prompts[i] = row;
      else state._prompts.push(row);
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
    // Untouched keys keep their defaults (analytics 默认关 · PROTECTION.md §4).
    expect(dto.analyticsEnabled).toBe(false);
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

  // item B — storage config.
  it("getStorage defaults rootPath to ~/CreatorOS/media + sums usage by type", async () => {
    const repo = makeFakeRepo({
      usage: [
        { assetType: "image", bytes: 1000 },
        { assetType: "video", bytes: 2500 },
      ],
    });
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const s = await svc.getStorage(ctx);
    // No stored config → default backend 'local' + default media root.
    expect(s.backend).toBe("local");
    expect(s.rootPath).toBe(path.join(os.homedir(), "CreatorOS", "media"));
    // usedBytes is the SUM across types; breakdown carries every known type
    // (missing ones filled with 0).
    expect(s.usedBytes).toBe(3500);
    const image = s.breakdown.find((b) => b.assetType === "image");
    const audio = s.breakdown.find((b) => b.assetType === "audio");
    expect(image?.bytes).toBe(1000);
    expect(audio?.bytes).toBe(0);
  });

  it("updateStorage expands a `~`-prefixed rootPath via os.homedir()", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const s = await svc.updateStorage(ctx, { rootPath: "~/CreatorOS/custom" });
    expect(s.rootPath).toBe(
      path.join(os.homedir(), "CreatorOS", "custom"),
    );
  });

  it("updateStorage rejects an illegal (system-directory) rootPath", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    await expect(
      svc.updateStorage(ctx, { rootPath: "/etc/creatoros" }),
    ).rejects.toBeInstanceOf(StorageValidationError);
    await expect(
      svc.updateStorage(ctx, { rootPath: "/" }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });

  it("resolveStorageRoot / resolveStorageBackend reflect the stored config", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    // Persist a custom path under the OS tmp dir (writable, legal).
    const tmpRoot = path.join(os.tmpdir(), "creatoros-svc-test-root");
    await svc.updateStorage(ctx, { backend: "local", rootPath: tmpRoot });
    expect(await svc.resolveStorageRoot(ctx)).toBe(path.resolve(tmpRoot));
    expect(await svc.resolveStorageBackend(ctx)).toBe("local");
  });

  // T-040c — 提示词/skill 服务端可配 (prompts.list/get/put).
  it("putSkillConfigOverride upserts a registered id; version starts at '1'", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const dto = await svc.putSkillConfigOverride(ctx, {
      id: "review.insights",
      system: "覆盖后的 system",
      tools: ["read", "write"],
    });
    expect(dto.id).toBe("review.insights");
    expect(dto.version).toBe("1");
    expect(dto.system).toBe("覆盖后的 system");
    expect(dto.tools).toEqual(["read", "write"]);
    // updatedBy defaults to ctx.userId.
    expect(dto.updatedBy).toBe("user-z");
  });

  it("putSkillConfigOverride is an upsert: a second put on the same id bumps version", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const v1 = await svc.putSkillConfigOverride(ctx, {
      id: "chatbox.review",
      system: "v1",
    });
    expect(v1.version).toBe("1");
    const v2 = await svc.putSkillConfigOverride(ctx, {
      id: "chatbox.review",
      template: "改 template",
    });
    expect(v2.version).toBe("2");
    // A partial put keeps the untouched column (system from v1).
    expect(v2.system).toBe("v1");
    expect(v2.template).toBe("改 template");
    // list reflects the single upserted row (not two).
    const list = await svc.listSkillConfigOverrides(ctx);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("chatbox.review");
  });

  it("putSkillConfigOverride rejects an unregistered skill id (→ PromptValidationError)", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    await expect(
      svc.putSkillConfigOverride(ctx, { id: "not.a.real.skill", system: "x" }),
    ).rejects.toBeInstanceOf(PromptValidationError);
    // Nothing was written.
    expect(await svc.listSkillConfigOverrides(ctx)).toHaveLength(0);
  });

  it("putSkillConfigOverride honors an injected validator (ai-worker registry seam)", async () => {
    const repo = makeFakeRepo();
    // Injected validator accepts ONLY a custom id, rejects an otherwise-registered one.
    const svc = createSettingsService(
      () => repo,
      accountReader,
      accountWriter,
      (id) => id === "custom.only",
    );
    await expect(
      svc.putSkillConfigOverride(ctx, { id: "review.insights", system: "x" }),
    ).rejects.toBeInstanceOf(PromptValidationError);
    const ok = await svc.putSkillConfigOverride(ctx, {
      id: "custom.only",
      system: "ok",
    });
    expect(ok.id).toBe("custom.only");
  });

  it("getSkillConfigOverride returns the row; a missing id → OwnershipError (404)", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    await svc.putSkillConfigOverride(ctx, {
      id: "topic.generate",
      system: "s",
    });
    const got = await svc.getSkillConfigOverride(ctx, "topic.generate");
    expect(got.system).toBe("s");
    await expect(
      svc.getSkillConfigOverride(ctx, "planning.thesis"),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
