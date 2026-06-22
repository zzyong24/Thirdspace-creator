import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, UnsupportedOperationError } from "@creatoros/backend";
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
  agentConfigurationResource,
} from "./settings.schema";

// Settings contract conformance (plan Step 4). Drive each of the 4 ops through an
// in-process client (createClient over the transport) so the endpoint's own
// `response` schema parses the envelope: a call returning without throw == DTO
// conformance. Also parse the raw envelope with successEnvelope(DTO) for an
// explicit assertion. The account read is served by a fake accountReader (Identity
// is injected); the preference/model/agent ops hit the real pglite repo.

const NOW = "2026-06-21T00:00:00.000Z";

const ctx: RequestContext = { userId: "user-c", requestId: "req-c", source: "user" };

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

const ep = (id: string) => ({ id, isList: false }) as unknown as Endpoint;

describe("settings.transport (contract conformance)", () => {
  let db: Db;
  let transport: Transport;

  beforeEach(async () => {
    ({ db } = await createDb());
    const service = createSettingsService(
      () => createSettingsRepository(db, deps),
      accountReader,
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

  it("settings.agents.create → agentConfigurationResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const agent = await client.createAgent({
      params: undefined,
      query: undefined,
      body: { name: "研究助理", agentType: "research" },
    });
    expect(() => agentConfigurationResource.parse(agent)).not.toThrow();

    const raw = await transport.request(
      ep("settings.agents.create"),
      { body: { name: "脚本助理", agentType: "script" } } as never,
      ctx,
    );
    const parsed = successEnvelope(agentConfigurationResource).parse(raw);
    expect(parsed.data.status).toBe("active");
    expect(parsed.data.createdAt).toBe(parsed.data.updatedAt);
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      transport.request(ep("settings.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
