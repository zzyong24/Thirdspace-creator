import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  OwnershipError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import {
  ENDPOINTS,
  createClient,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createSettingsRepository } from "./settings.repository";
import { createSettingsService } from "./settings.service";
import { createSettingsTransport } from "./settings.transport";
import {
  userResource,
  userPreferenceResource,
  modelConfigurationResource,
  accountSkillOverlayResource,
  accountSkillOverlayVersionResource,
} from "./settings.schema";

// Settings contract conformance (plan Step 4). Drive each of the 4 ops through an
// in-process client (createClient over the transport) so the endpoint's own
// `response` schema parses the envelope: a call returning without throw == DTO
// conformance. Also parse the raw envelope with successEnvelope(DTO) for an
// explicit assertion. The account read is served by a fake accountReader (Identity
// is injected); the preference/model/agent ops hit the real pglite repo.

const NOW = "2026-06-21T00:00:00.000Z";

const ctx: RequestContext = {
  userId: "user-c",
  accountId: "account-c",
  requestId: "req-c",
  source: "user",
};

const deps = {
  now: () => NOW,
  nextId: (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-c-${++n}`;
  })(),
};

const accountReader = async (c: RequestContext) => ({
  id: c.userId,
  email: "c@creatoros.local",
  displayName: "Contract User",
  timezone: "Asia/Shanghai",
  locale: "zh-CN",
  createdAt: NOW,
  updatedAt: NOW,
});

// Fake accountWriter (Identity's updateProfile stand-in) — echoes the patch over
// the reader's base DTO so the transport's `identity.profile.patch` case can be
// asserted against the userResource envelope.
const accountWriter = async (
  c: RequestContext,
  patch: { displayName?: string; locale?: string },
) => ({
  id: c.userId,
  email: "c@creatoros.local",
  displayName: patch.displayName ?? "Contract User",
  timezone: "Asia/Shanghai",
  locale: patch.locale ?? "zh-CN",
  createdAt: NOW,
  updatedAt: NOW,
});

const ep = (id: string) => ({ id, isList: false }) as unknown as Endpoint;

describe("settings.transport (contract conformance)", () => {
  let db: Db;
  let transport: Transport;

  beforeEach(async () => {
    ({ db } = await createDb());
    const service = createSettingsService(
      () => createSettingsRepository(db, deps),
      accountReader,
      accountWriter,
    );
    transport = createSettingsTransport(() => service);
  });

  it("settings.get → userResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const account = await client.getSettings({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(() => userResource.parse(account)).not.toThrow();

    const raw = await transport.request(ep("settings.get"), {} as never, ctx);
    const parsed = successEnvelope(userResource).parse(raw);
    expect(parsed.data.id).toBe("user-c");
  });

  it("identity.profile.patch (PATCH /me) → userResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const account = await client.patchProfile({
      params: undefined,
      query: undefined,
      body: { displayName: "Renamed", locale: "en-US" },
    });
    expect(() => userResource.parse(account)).not.toThrow();
    expect(account.displayName).toBe("Renamed");
    expect(account.locale).toBe("en-US");

    const raw = await transport.request(
      ep("identity.profile.patch"),
      { body: { locale: "ja-JP" } } as never,
      ctx,
    );
    const parsed = successEnvelope(userResource).parse(raw);
    expect(parsed.data.locale).toBe("ja-JP");
    // Un-patched displayName falls through to the reader's base value.
    expect(parsed.data.displayName).toBe("Contract User");
  });

  it("settings.preferences.patch → userPreferenceResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const pref = await client.patchPreferences({
      params: undefined,
      query: undefined,
      body: { defaultHome: "projects", autosaveEnabled: false },
    });
    expect(() => userPreferenceResource.parse(pref)).not.toThrow();

    const raw = await transport.request(
      ep("settings.preferences.patch"),
      { body: { analyticsEnabled: false } } as never,
      ctx,
    );
    const parsed = successEnvelope(userPreferenceResource).parse(raw);
    expect(parsed.data.id).toBe("pref-user-c");
    expect(parsed.data.analyticsEnabled).toBe(false);
  });

  it("settings.models.put → modelConfigurationResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const model = await client.putModel({
      params: { capability: "script" },
      query: undefined,
      body: { provider: "anthropic", modelName: "claude-opus-4-8" },
    });
    expect(() => modelConfigurationResource.parse(model)).not.toThrow();

    const raw = await transport.request(
      ep("settings.models.put"),
      {
        params: { capability: "research" },
        body: { provider: "openai", modelName: "gpt-4o", settings: { temperature: 0.3 } },
      } as never,
      ctx,
    );
    const parsed = successEnvelope(modelConfigurationResource).parse(raw);
    expect(parsed.data.capability).toBe("research");
    expect(parsed.data.settings).toEqual({ temperature: 0.3 });
  });

  it("settings.models.list → array of masked modelConfigurationResource", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    await client.putModel({
      params: { capability: "default" },
      query: undefined,
      body: { provider: "minimax", modelName: "MiniMax-M3", secret: "sk-real-key" },
    });
    const list = await client.listModels({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(Array.isArray(list)).toBe(true);
    const def = list.find((m) => m.capability === "default");
    expect(def?.hasSecret).toBe(true);
    // Masked: the raw secret value is never serialized over the wire.
    expect((def as Record<string, unknown>).secretValue).toBeUndefined();
  });

  // [T-248 批C] settings.agents.create 契约用例已删(孤 op 移除);service/repository 层的
  // createAgentConfiguration 覆盖仍在 settings.service.test.ts / repository.integration.test.ts。

  it("settings.prompts.put → accountSkillOverlayResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const put = await client.putPrompt({
      params: { id: "review.insights" },
      query: undefined,
      body: {
        expectedRevision: null,
        patch: { system: "覆盖 system" },
      },
    });
    expect(() => accountSkillOverlayResource.parse(put)).not.toThrow();
    expect(put.skillId).toBe("review.insights");
    expect(put.effective.system).toBe("覆盖 system");

    const raw = await transport.request(
      ep("settings.prompts.put"),
      {
        params: { id: "chatbox.review" },
        body: { expectedRevision: null, patch: { template: "改 template" } },
      } as never,
      ctx,
    );
    const parsed = successEnvelope(accountSkillOverlayResource).parse(raw);
    expect(parsed.data.skillId).toBe("chatbox.review");
    expect(parsed.data.rowRevision).toBe(1);
  });

  it("settings.prompts.list → 全 official catalog + 当前账号 delta", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    await client.putPrompt({
      params: { id: "topic.generate" },
      query: undefined,
      body: { expectedRevision: null, patch: { system: "s" } },
    });
    const list = await client.listPrompts({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((p) => p.skillId === "topic.generate")?.effective.system).toBe("s");
    expect(list.find((p) => p.skillId === "script.draft")?.overlay).toBeNull();
  });

  it("settings.prompts.list → 未选号也返回全 official catalog", async () => {
    const noAccountCtx: RequestContext = {
      userId: ctx.userId,
      requestId: "req-c-no-account",
      source: "user",
    };
    const client = createClient(ENDPOINTS, transport, noAccountCtx);

    const list = await client.listPrompts({
      params: undefined,
      query: undefined,
      body: undefined,
    });

    expect(list.length).toBeGreaterThan(1);
    expect(list.find((p) => p.skillId === "script.draft")?.overlay).toBeNull();
  });

  it("[T-165] settings.prompts.versions.list + rollback → 契约合形 + 回滚生效", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    // 两次 put 产两版本。
    await client.putPrompt({
      params: { id: "review.insights" },
      query: undefined,
      body: { expectedRevision: null, patch: { system: "第一版" } },
    });
    await client.putPrompt({
      params: { id: "review.insights" },
      query: undefined,
      body: { expectedRevision: 1, patch: { system: "第二版" } },
    });
    // 版本历史列表(最新在前),逐条合契约。
    const versions = await client.listPromptVersions({
      params: { id: "review.insights" },
      query: undefined,
      body: undefined,
    });
    expect(versions.length).toBe(2);
    for (const v of versions)
      expect(() => accountSkillOverlayVersionResource.parse(v)).not.toThrow();
    expect(versions[0]!.overlay.system).toBe("第二版");
    const firstVersion = versions.find((v) => v.overlay.system === "第一版")!;
    const rolled = await client.rollbackPrompt({
      params: { id: "review.insights" },
      query: undefined,
      body: { versionId: firstVersion.id, expectedRevision: 2 },
    });
    expect(() => accountSkillOverlayResource.parse(rolled)).not.toThrow();
    expect(rolled.effective.system).toBe("第一版");
    // 回滚也进历史(第 3 版)。
    const after = await client.listPromptVersions({
      params: { id: "review.insights" },
      query: undefined,
      body: undefined,
    });
    expect(after.length).toBe(3);
  });

  it("[T-726] settings.prompts.get → 退役 planning.thesis 不再作为可配置能力暴露", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    await expect(
      client.getPrompt({
        params: { id: "planning.thesis" },
        query: undefined,
        body: undefined,
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      client.getPrompt({
        params: { id: "planning.thesis" },
        query: undefined,
        body: undefined,
      }),
    ).rejects.toMatchObject({ name: "OwnershipError" });
    await expect(
      client.getPrompt({
        params: { id: "planning.thesis" },
        query: undefined,
        body: undefined,
      }),
    ).rejects.not.toBeInstanceOf(UnsupportedOperationError);
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      transport.request(ep("settings.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
