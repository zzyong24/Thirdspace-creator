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
  AccountSkillOverlayRow,
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

const ctx: RequestContext = {
  userId: "user-z",
  accountId: "account-z",
  requestId: "req-z",
  source: "user",
};
const NOW = "2026-06-21T00:00:00.000Z";

// [T-196] no-op 存储迁移 stub —— updateStorage 单测传它,避免真的对 ~/CreatorOS 做
//   copy/delete(原来直接 import 的 migrateStorageRoot 会动真机 home,搬走用户真实封面 + flaky)。
const noopMigrate = async () => ({ migrated: 0, skipped: true });

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
    _accountPrompts: [] as AccountSkillOverlayRow[],
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
    // [T-363] 导出原始读(fake 无加密,与 listModels 同源)+ 导入解包(明文透传)。
    async listModelsRaw() {
      return state._models;
    },
    unwrapExportedSecret(stored: string) {
      return stored;
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
    // [T-165] 版本历史 mock(service test 不覆盖这条路径,给满足 interface 的最小 stub)。
    async listSkillConfigOverrideVersions() {
      return [];
    },
    async rollbackSkillConfigOverride(_ctx, id, versionId) {
      throw new Error(
        `mock settings repo: rollbackSkillConfigOverride 未实现(${id}/${versionId})`,
      );
    },
    async listAccountSkillOverlays(_ctx, skillIds) {
      const wanted = skillIds ? new Set(skillIds) : null;
      return state._accountPrompts.filter(
        (row) => !wanted || wanted.has(row.skillId),
      );
    },
    async getAccountSkillOverlay(_ctx, skillId) {
      return state._accountPrompts.find((row) => row.skillId === skillId) ?? null;
    },
    async putAccountSkillOverlay(_ctx, body) {
      const previous = state._accountPrompts.find(
        (row) => row.skillId === body.skillId,
      );
      const revision =
        body.expectedRevision === null ? 1 : body.expectedRevision + 1;
      const row: AccountSkillOverlayRow = {
        id: previous?.id ?? `overlay-${body.skillId}`,
        userId: ctx.userId,
        accountId: ctx.accountId!,
        skillId: body.skillId,
        rowRevision: revision,
        observedBaseVersion: body.observedBaseVersion,
        overlayVersion: body.overlayVersion ?? null,
        overlay: body.overlay,
        updatedBy: body.updatedBy ?? ctx.userId,
        createdAt: previous?.createdAt ?? NOW,
        updatedAt: NOW,
      };
      const index = state._accountPrompts.findIndex(
        (item) => item.skillId === body.skillId,
      );
      if (index >= 0) state._accountPrompts[index] = row;
      else state._accountPrompts.push(row);
      return row;
    },
    async listAccountSkillOverlayVersions() {
      return [];
    },
    async rollbackAccountSkillOverlay() {
      throw new Error("fake rollbackAccountSkillOverlay 未实现");
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
    const svc = createSettingsService(
      () => repo,
      accountReader,
      accountWriter,
      undefined,
      noopMigrate,
    );
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
    const svc = createSettingsService(
      () => repo,
      accountReader,
      accountWriter,
      undefined,
      noopMigrate,
    );
    // Persist a custom path under the OS tmp dir (writable, legal).
    const tmpRoot = path.join(os.tmpdir(), "creatoros-svc-test-root");
    await svc.updateStorage(ctx, { backend: "local", rootPath: tmpRoot });
    expect(await svc.resolveStorageRoot(ctx)).toBe(path.resolve(tmpRoot));
    expect(await svc.resolveStorageBackend(ctx)).toBe("local");
  });

  it("账号 Skill 增量按 revision 合并，official/effective 同时可见", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const first = await svc.putSkillConfigOverride(ctx, {
      skillId: "review.insights",
      expectedRevision: null,
      patch: { system: "账号方法" },
    });
    expect(first.skillId).toBe("review.insights");
    expect(first.rowRevision).toBe(1);
    expect(first.official.system).toBe("");
    expect(first.effective.system).toBe("账号方法");

    const second = await svc.putSkillConfigOverride(ctx, {
      skillId: "review.insights",
      expectedRevision: 1,
      patch: { template: "账号模板" },
    });
    expect(second.rowRevision).toBe(2);
    expect(second.effective.system).toBe("账号方法");
    expect(second.effective.template).toBe("账号模板");
  });

  it("list 返回完整 official catalog，未定制项 overlay=null", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    const list = await svc.listSkillConfigOverrides(ctx);
    expect(list.length).toBeGreaterThan(1);
    expect(list.find((item) => item.skillId === "script.draft")?.overlay).toBeNull();
  });

  it("未知 Skill 按 404，不写入旧 global override", async () => {
    const repo = makeFakeRepo();
    const svc = createSettingsService(() => repo, accountReader, accountWriter);
    await expect(
      svc.putSkillConfigOverride(ctx, {
        skillId: "not.a.real.skill",
        expectedRevision: null,
        patch: { system: "x" },
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await repo.listAccountSkillOverlays(ctx)).toHaveLength(0);
  });
});
