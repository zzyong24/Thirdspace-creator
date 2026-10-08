import {
  createCipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LICENSE_BASE_URL } from "./activation-config";
import {
  ClientConfigPullError,
  ClientConfigCacheSecurityError,
  EncryptedClientConfigStore,
  readChannelModelAuthority,
  refreshClientConfig,
  requestFreshClientConfigAccess,
  type ClientConfigCacheRecord,
  type ClientConfigStore,
  type SignedClientConfigBundle,
} from "./client-config.server";

const NOW = new Date("2026-07-28T12:10:00.000Z");
const AM_ORIGIN = "https://activity.example";
const GROWTH_ORIGIN = "https://growth.example";

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  throw new TypeError("unsupported JSON");
}

function rawPublicKey(key: KeyObject): string {
  return key
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
}

function signedBundle(
  privateKey: KeyObject,
  overrides: Record<string, unknown> = {},
): SignedClientConfigBundle {
  const semantic = {
    contractVersion: "growth-client-config-bundle-v1",
    bundleVersion: 42,
    projectKey: "creatoros",
    channelRef: "agent-42",
    clientId: "creatoros.desktop",
    environment: "production",
    issuedAt: "2026-07-28T12:00:00.000Z",
    softExpiresAt: "2026-07-29T12:00:00.000Z",
    hardExpiresAt: "2026-08-04T12:00:00.000Z",
    channelConfig: {
      revision: 17,
      payload: {
        brandName: "星河工作室",
        purchaseUrl: "https://growth.example/buy",
        renewalUrl: "https://growth.example/renew",
        channelSupportUrl: "https://growth.example/support",
        bugFeedbackUrl: "https://growth.example/feedback",
        downloadUrl: "https://growth.example/download",
      },
    },
    extensions: [
      {
        extensionKey: "creatoros.model-config",
        protocolVersion: "creatoros-model-config-v1",
        revision: 3,
        payload: {
          provider: "openai-compatible",
          baseURL: "https://models.example/v1",
          apiKey: ["test", "only", "channel"].join("-"),
          model: "test-model",
          unknownField: { kept: true },
        },
      },
    ],
    ...overrides,
  };
  const bundleDigest = `sha256:${createHash("sha256")
    .update(canonical(semantic))
    .digest("hex")}`;
  const keyId = "growth-config-test-01";
  const signature = sign(
    null,
    Buffer.from(canonical({ ...semantic, bundleDigest, keyId }), "utf8"),
    privateKey,
  ).toString("base64url");
  return {
    ...semantic,
    bundleDigest,
    keyId,
    signature,
  } as unknown as SignedClientConfigBundle;
}

function signedAmResponse(
  privateKey: KeyObject,
  body: unknown,
  status = 200,
  requestHost = "activity.example",
) {
  const bytes = Buffer.from(JSON.stringify(body));
  const date = "Tue, 28 Jul 2026 12:10:00 GMT";
  const digest = `SHA-256=${createHash("sha256").update(bytes).digest("base64")}`;
  const signing = `post /api/license/client-config-tickets\n${requestHost}\n${date}\n${digest}`;
  const signature = sign(null, Buffer.from(signing), privateKey).toString(
    "base64",
  );
  return new Response(bytes, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-license-date": date,
      "x-license-digest": digest,
      "x-license-signature": signature,
    },
  });
}

class MemoryStore implements ClientConfigStore {
  record: ClientConfigCacheRecord | null = null;

  async load() {
    return this.record;
  }

  async save(record: ClientConfigCacheRecord) {
    this.record = structuredClone(record);
  }
}

function configuredRecord(
  bundle: SignedClientConfigBundle,
  checkedAt = "2026-07-28T12:09:00.000Z",
): ClientConfigCacheRecord {
  const extension = bundle.extensions[0]!;
  return {
    state: "channel",
    outcome: "configured",
    checkedAt,
    bundle,
    channel: {
      projectKey: bundle.projectKey,
      channelRef: bundle.channelRef,
      bundleVersion: bundle.bundleVersion,
      bundleDigest: bundle.bundleDigest,
      extensionRevision: extension.revision,
      payload: extension.payload as Record<string, never>,
    },
  };
}

function encryptedEnvelope(key: Buffer, envelope: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(envelope))),
    cipher.final(),
  ]);
  return `enc:v1:${Buffer.concat([
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString("base64")}\n`;
}

const verdict = {
  v: 1,
  allowed: true,
  status: "active",
  code: "LOCAL-ONLY-ACTIVATION-CODE",
  machineId: "device-opaque-id",
  projectKey: "creatoros",
  channelRef: "agent-42",
};

const ticketFixtureBytes = readFileSync(
  join(
    process.cwd(),
    "..",
    "docs",
    "contracts",
    "fixtures",
    "config-access-ticket-v2.vector.json",
  ),
);
const growthFixtureBytes = readFileSync(
  join(
    process.cwd(),
    "..",
    "docs",
    "contracts",
    "fixtures",
    "growth-client-config-bundle-v1.vector.json",
  ),
);
const growthCanonicalFixture = JSON.parse(
  growthFixtureBytes.toString("utf8"),
).responseBody as SignedClientConfigBundle;
const clientVersion = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
).version as string;

describe("T-575 config.pull Creator consumer", () => {
  const amKeys = generateKeyPairSync("ed25519");
  const growthKeys = generateKeyPairSync("ed25519");
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  function env() {
    return {
      CREATOROS_CLIENT_CONFIG_PULL_ENABLED: "1",
      CREATOROS_LICENSE_BASE_URL: AM_ORIGIN,
      CREATOROS_LICENSE_PUBLIC_KEY_B64: rawPublicKey(amKeys.publicKey),
      CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN: GROWTH_ORIGIN,
      CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64: rawPublicKey(
        growthKeys.publicKey,
      ),
      CREATOROS_GROWTH_CONFIG_KEY_ID: "growth-config-test-01",
    };
  }

  function successfulFetch(
    bundle = signedBundle(growthKeys.privateKey),
    active = verdict,
    amOrigin = AM_ORIGIN,
  ) {
    return vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === `${amOrigin}/api/license/client-config-tickets`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          contractVersion: "config-access-ticket-v3",
          projectKey: active.projectKey,
          code: active.code,
          machineId: active.machineId,
          nonce: "nonce-client-config-0001",
        });
        return signedAmResponse(
          amKeys.privateKey,
          {
            contractVersion: "config-access-ticket-v3",
            configAccessTicket: "header.payload.signature",
            expiresAt: "2026-07-28T12:15:00.000Z",
            nonce: "nonce-client-config-0001",
          },
          200,
          new URL(amOrigin).host,
        );
      }
      expect(url).toBe(
        `${GROWTH_ORIGIN}/api/client-config/bundles/current?clientVersion=${encodeURIComponent(clientVersion)}&accept=creatoros.model-config%40creatoros-model-config-v1`,
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer header.payload.signature",
      });
      const requestBody = JSON.stringify(init?.body ?? "");
      expect(requestBody).not.toMatch(/channelRef|feedbackPriority|projectKey/);
      return Response.json(bundle, {
        status: 200,
        headers: {
          etag: `"${bundle.bundleDigest}"`,
          "cache-control": "private, no-store",
          "x-config-bundle-version": String(bundle.bundleVersion),
          "x-config-key-id": String(bundle.keyId),
          "x-correlation-id": "cor_0123456789abcdef0123456789abcdef",
        },
      });
    });
  }

  it("拿既有 ticket、验签 closed bundle，并只返回脱敏 authority 投影", async () => {
    const fetchImpl = successfulFetch();
    const result = await refreshClientConfig({
      env: env(),
      now: () => NOW,
      nonce: () => "nonce-client-config-0001",
      fetchImpl,
      readVerdict: async () => ({ state: "ready", verdict }),
      store,
    });

    expect(result).toEqual({
      authority: "channel",
      outcome: "configured",
      action: "渠道模型正在使用",
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.record?.state).toBe("channel");
    expect(store.record?.channel?.payload).toMatchObject({
      provider: "openai-compatible",
      unknownField: { kept: true },
    });
  });

  it("T-706 正式包未显式注入授权 origin 时复用官方授权服务默认值", async () => {
    const packagedEnv: Record<string, string | undefined> = { ...env() };
    delete packagedEnv.CREATOROS_LICENSE_BASE_URL;
    const fetchImpl = successfulFetch(
      signedBundle(growthKeys.privateKey),
      verdict,
      DEFAULT_LICENSE_BASE_URL,
    );

    await expect(
      refreshClientConfig({
        env: packagedEnv,
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "channel",
      outcome: "configured",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `${DEFAULT_LICENSE_BASE_URL}/api/license/client-config-tickets`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("T-715 为额度入口申请全新 ticket，且只在 server 内存返回", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        `${AM_ORIGIN}/api/license/client-config-tickets`,
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        contractVersion: "config-access-ticket-v3",
        projectKey: verdict.projectKey,
        code: verdict.code,
        machineId: verdict.machineId,
        nonce: "nonce-ai-credit-0001",
      });
      return signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v3",
        configAccessTicket: "fresh.ticket.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-ai-credit-0001",
      });
    });

    await expect(
      requestFreshClientConfigAccess({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-ai-credit-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
      }),
    ).resolves.toEqual({
      configAccessTicket: "fresh.ticket.signature",
      expiresAt: "2026-07-28T12:15:00.000Z",
      growthOrigin: "https://growth.example/",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("T-706 显式注入非 HTTPS 授权 origin 时继续失败关闭且不出网", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      refreshClientConfig({
        env: {
          ...env(),
          CREATOROS_LICENSE_BASE_URL: "http://activity.invalid",
        },
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).rejects.toEqual(
      new ClientConfigPullError(
        "CLIENT_CONFIG_PENDING",
        "授权服务配置无效",
        false,
      ),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("T-701 已授权但缺签名 channelRef 时稳定失败关闭且零出网、零缓存改写", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        fetchImpl,
        readVerdict: async () => ({
          state: "ready",
          verdict: { ...verdict, channelRef: null },
        }),
        store,
      }),
    ).rejects.toEqual(
      new ClientConfigPullError(
        "CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING",
        "授权缺少渠道信息，无法同步受管模型",
        false,
      ),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.record).toBeNull();
  });

  it("T-701 authority 读面把缺签名 channelRef 投影为 activation_scope_missing", async () => {
    await expect(
      readChannelModelAuthority({
        env: env(),
        readVerdict: async () => ({
          state: "ready",
          verdict: { ...verdict, channelRef: null },
        }),
        store,
      }),
    ).resolves.toEqual({
      authority: "local",
      outcome: "activation_scope_missing",
      payload: null,
    });
  });

  it("T-701/T-679 已签名 status 带 channelRef 后拉 bundle 与 activation_managed 子 Key", async () => {
    const managedPayload = {
      services: [
        {
          id: "omnihi-main",
          name: "OmniHi 模型服务",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            allowMultiple: false,
          },
        },
      ],
      connections: [],
      models: {},
    };
    const bundle = signedBundle(growthKeys.privateKey, {
      extensions: [
        {
          extensionKey: "creatoros.model-config",
          protocolVersion: "creatoros-model-config-v1",
          revision: 4,
          payload: managedPayload,
        },
      ],
    });
    const putManagedCredential = vi.fn(async () => undefined);
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === `${AM_ORIGIN}/api/license/client-config-tickets`) {
        return signedAmResponse(amKeys.privateKey, {
          contractVersion: "config-access-ticket-v3",
          configAccessTicket: "header.payload.signature",
          expiresAt: "2026-07-28T12:15:00.000Z",
          nonce: "nonce-client-config-0001",
        });
      }
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer header.payload.signature",
      });
      if (url.includes("/managed-credentials/current?serviceId=omnihi-main")) {
        return Response.json(
          {
            contractVersion: "growth-managed-model-credential-v1",
            serviceId: "omnihi-main",
            credential: { type: "api_key", token: "omnihi-child-secret", tokenPrefix: "om***" },
            includedCredit: { amount: "30.00000000", currency: "CNY" },
          },
          { headers: { "cache-control": "private, no-store", pragma: "no-cache" } },
        );
      }
      return Response.json(bundle, {
        headers: {
          etag: `"${bundle.bundleDigest}"`,
          "cache-control": "private, no-store",
          "x-config-bundle-version": String(bundle.bundleVersion),
          "x-config-key-id": bundle.keyId,
          "x-correlation-id": "cor_0123456789abcdef0123456789abcdef",
        },
      });
    });

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
        putManagedCredential,
      }),
    ).resolves.toMatchObject({ authority: "channel", outcome: "configured" });
    expect(putManagedCredential).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "omnihi-main",
      "omnihi-child-secret",
    );
    expect(JSON.stringify(store.record)).not.toContain("omnihi-child-secret");
  });

  it("T-679 不会为未登记的 activation_managed service 请求或保存子 Key", async () => {
    const managedPayload = {
      services: [
        {
          id: "unexpected-managed-service",
          name: "未登记受管服务",
          provider: "omnihi",
          credential: {
            type: "api_key",
            source: "activation_managed",
            allowMultiple: false,
          },
        },
      ],
      connections: [],
      models: {},
    };
    const bundle = signedBundle(growthKeys.privateKey, {
      extensions: [
        {
          extensionKey: "creatoros.model-config",
          protocolVersion: "creatoros-model-config-v1",
          revision: 5,
          payload: managedPayload,
        },
      ],
    });
    const putManagedCredential = vi.fn(async () => undefined);
    const fetchImpl = successfulFetch(bundle);

    await refreshClientConfig({
      env: env(),
      now: () => NOW,
      nonce: () => "nonce-client-config-0001",
      fetchImpl,
      readVerdict: async () => ({ state: "ready", verdict }),
      store,
      putManagedCredential,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(putManagedCredential).not.toHaveBeenCalled();
  });

  it("逐字通过 Growth canonical bundle fixture 的 Ed25519 与 JCS digest", async () => {
    expect(createHash("sha256").update(ticketFixtureBytes).digest("hex")).toBe(
      "58218645dc8e90df44aaef2d63688ef4173e5300e50450c5a8d222debff8b538",
    );
    expect(createHash("sha256").update(growthFixtureBytes).digest("hex")).toBe(
      "5a2db6c963a16c06b47956579c7974dba02f73df7fef389d90a515b1ee8f3251",
    );
    const fixtureEnv = {
      ...env(),
      CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64:
        "2inpWwLgD/oVZFd1+x0roiKhlDOV7qBrlOLAV7e+adA=",
    };
    const result = await refreshClientConfig({
      env: fixtureEnv,
      now: () => NOW,
      nonce: () => "nonce-client-config-0001",
      fetchImpl: successfulFetch(growthCanonicalFixture),
      readVerdict: async () => ({ state: "ready", verdict }),
      store,
    });
    expect(result.authority).toBe("channel");
    expect(result.outcome).toBe("configured");
  });

  it("坏签名、额外 envelope 字段和未知产品协议均 fail-closed", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const tampered = structuredClone(
      signedBundle(growthKeys.privateKey),
    ) as unknown as {
      extensions: Array<{ payload: Record<string, unknown> }>;
    };
    tampered.extensions[0]!.payload.profileKey = "evil";

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(
          tampered as unknown as SignedClientConfigBundle,
        ),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });

    const extra = signedBundle(growthKeys.privateKey, { unexpected: true });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(extra),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });

    const unknownProtocol = signedBundle(growthKeys.privateKey, {
      extensions: [
        {
          extensionKey: "creatoros.model-config",
          protocolVersion: "creatoros-model-config-v2",
          revision: 4,
          payload: {},
        },
      ],
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(unknownProtocol),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
    expect(store.record?.state).toBe("quarantined");
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[client-config\] \{"phase":"refresh","status":"failed","errorCode":"CLIENT_CONFIG_[A-Z_]+","retryable":false\}$/,
      ),
    );
    log.mockRestore();
  });

  it("Activity/Growth exact response headers 漂移时 fail-closed", async () => {
    const missingAmNoStore = successfulFetch();
    missingAmNoStore.mockImplementationOnce(async () => {
      const response = signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v3",
        configAccessTicket: "header.payload.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-client-config-0001",
      });
      response.headers.delete("cache-control");
      return response;
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: missingAmNoStore,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
    expect(missingAmNoStore).toHaveBeenCalledTimes(1);

    const missingGrowthCorrelation = successfulFetch();
    missingGrowthCorrelation.mockImplementationOnce(async () =>
      signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v3",
        configAccessTicket: "header.payload.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-client-config-0001",
      }),
    );
    missingGrowthCorrelation.mockImplementationOnce(async () =>
      Response.json(signedBundle(growthKeys.privateKey), {
        status: 200,
        headers: {
          etag:
            '"sha256:cddab7e8a859a4925ce6a353ebee47c46824cb06a3c066e87e47fd2482fcb4ba"',
          "cache-control": "private, no-store",
          "x-config-bundle-version": "42",
          "x-config-key-id": "growth-config-test-01",
        },
      }),
    );
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: missingGrowthCorrelation,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
  });

  it("低版本与同版本不同 digest 隔离，历史密文保留但不激活", async () => {
    const current = signedBundle(growthKeys.privateKey, { bundleVersion: 43 });
    store.record = configuredRecord(current);
    const previous = structuredClone(store.record);

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(
          signedBundle(growthKeys.privateKey, { bundleVersion: 42 }),
        ),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
    expect(store.record).toMatchObject({
      state: "quarantined",
      channel: previous.channel,
    });
    store.record = previous;

    const collision = signedBundle(growthKeys.privateKey, {
      bundleVersion: 43,
      extensions: [
        {
          extensionKey: "creatoros.model-config",
          protocolVersion: "creatoros-model-config-v1",
          revision: 4,
          payload: {
            serviceMode: "byok_required",
            profileKey: "quality",
            capabilityRoutes: {},
          },
        },
      ],
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(collision),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
    expect(store.record).toMatchObject({
      state: "quarantined",
      channel: previous.channel,
    });
  });

  it("304 仍核对签名 LKG 的版本、digest、keyId 与在线 correlation", async () => {
    const current = signedBundle(growthKeys.privateKey);
    store.record = configuredRecord(current);
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () =>
      signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v3",
        configAccessTicket: "header.payload.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-client-config-0001",
      }),
    );
    fetchImpl.mockImplementationOnce(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        "If-None-Match": `"${current.bundleDigest}"`,
      });
      return new Response(null, {
        status: 304,
        headers: {
          etag: `"${current.bundleDigest}"`,
          "cache-control": "private, no-store",
          "x-config-bundle-version": String(current.bundleVersion),
          "x-config-key-id": current.keyId,
          "x-correlation-id": "cor_abcdef0123456789abcdef0123456789",
        },
      });
    });

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "channel",
      outcome: "configured",
    });
    expect(store.record).toMatchObject({
      state: "channel",
      checkedAt: NOW.toISOString(),
    });
  });

  it("304 遇到缓存 payload 与签名 bundle 不一致时隔离并使用本地", async () => {
    const current = signedBundle(growthKeys.privateKey);
    const configured = configuredRecord(current);
    store.record = {
      ...configured,
      channel: {
        ...configured.channel!,
        payload: { provider: "tampered-cache-payload" },
      },
    };
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () =>
      signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v3",
        configAccessTicket: "header.payload.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-client-config-0001",
      }),
    );
    fetchImpl.mockImplementationOnce(async () =>
      new Response(null, {
        status: 304,
        headers: {
          etag: `"${current.bundleDigest}"`,
          "cache-control": "private, no-store",
          "x-config-bundle-version": String(current.bundleVersion),
          "x-config-key-id": current.keyId,
          "x-correlation-id": "cor_abcdef0123456789abcdef0123456789",
        },
      }),
    );

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "security_error",
    });
    expect(store.record).toMatchObject({
      state: "quarantined",
      outcome: "security_error",
    });
  });

  it("明确无 extension 时保留历史渠道密文但切到本地", async () => {
    const current = signedBundle(growthKeys.privateKey);
    store.record = configuredRecord(current);
    const withoutExtension = signedBundle(growthKeys.privateKey, {
      bundleVersion: current.bundleVersion + 1,
      extensions: [],
    });
    const result = await refreshClientConfig({
      env: env(),
      now: () => NOW,
      nonce: () => "nonce-client-config-0001",
      fetchImpl: successfulFetch(withoutExtension),
      readVerdict: async () => ({ state: "ready", verdict }),
      store,
    });
    expect(result).toMatchObject({
      authority: "local",
      outcome: "not_configured",
    });
    expect(store.record).toMatchObject({
      state: "local",
      outcome: "not_configured",
      channel: configuredRecord(current).channel,
    });
    await expect(
      readChannelModelAuthority({
        env: env(),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toEqual({
      authority: "local",
      outcome: "not_configured",
      payload: null,
    });
  });

  it("网络/authority 不可用立即停用历史渠道密文并使用本地", async () => {
    store.record = configuredRecord(
      signedBundle(growthKeys.privateKey),
      "2026-07-27T12:10:00.001Z",
    );
    const offline = await refreshClientConfig({
      env: env(),
      now: () => NOW,
      nonce: () => "nonce-client-config-0001",
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new TypeError("offline");
      }),
      readVerdict: async () => ({ state: "ready", verdict }),
      store,
    });
    expect(offline).toMatchObject({
      authority: "local",
      outcome: "unreachable",
    });
    expect(store.record).toMatchObject({
      state: "local",
      outcome: "unreachable",
    });
    expect(store.record?.channel).not.toBeNull();
  });

  it("T-733 v3 票据不适用于当前激活时按未配置处理而不是安全阻断", async () => {
    const current = signedBundle(growthKeys.privateKey);
    store.record = {
      ...configuredRecord(current),
      state: "blocked",
      outcome: "security_error",
      reason: "authorization_changed",
    };
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      signedAmResponse(
        amKeys.privateKey,
        {
          success: false,
          error: {
            code: "CONFIG_TICKET_REQUEST_INVALID",
            message: "activation unit is not eligible for v3 tickets",
          },
        },
        422,
      ),
    );

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toEqual({
      authority: "local",
      outcome: "not_configured",
      action: "本地模型正在使用 · 渠道未配置",
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.record).toMatchObject({
      state: "local",
      outcome: "not_configured",
      bundle: current,
      channel: configuredRecord(current).channel,
    });
    expect(store.record).not.toHaveProperty("reason");
  });

  it("Activity/Growth 明确撤权、过期或重放拒绝时禁止 LKG，且保存阻断态", async () => {
    store.record = configuredRecord(signedBundle(growthKeys.privateKey));
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async () =>
      signedAmResponse(
        amKeys.privateKey,
        {
          success: false,
          error: { code: "LICENSE_REVOKED", message: "revoked" },
        },
        403,
      ),
    );

    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).rejects.toMatchObject({
      code: "CLIENT_CONFIG_ACCESS_REVOKED",
      message: "当前授权已失效，请重新激活后重试",
    });
    expect(store.record).toMatchObject({
      state: "blocked",
      reason: "authorization_changed",
    });
  });

  it("能力开关、origin 或公钥缺失时保持 pending 且零出网", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      refreshClientConfig({
        env: {},
        now: () => NOW,
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).rejects.toEqual(
      new ClientConfigPullError(
        "CLIENT_CONFIG_PENDING",
        "渠道配置同步尚未启用",
        false,
      ),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("原生主密钥降级时拒绝创建普通文件缓存，且零出网", async () => {
    const directory = await mkdtemp(join(tmpdir(), "creatoros-client-config-"));
    const fetchImpl = vi.fn<typeof fetch>();
    try {
      await expect(
        refreshClientConfig({
          env: {
            ...env(),
            CREATOROS_LICENSE_FILE: join(directory, ".license"),
          },
          now: () => NOW,
          fetchImpl,
          readVerdict: async () => ({ state: "ready", verdict }),
        }),
      ).rejects.toMatchObject({
        code: "CLIENT_CONFIG_STORAGE_UNAVAILABLE",
        message: "本机配置存储尚未就绪",
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("真实文件 store 使用 AES-256-GCM 原子 LKG，密文不含产品配置明文", async () => {
    const directory = await mkdtemp(join(tmpdir(), "creatoros-client-config-"));
    const licenseFile = join(directory, ".license");
    const fileEnv = {
      ...env(),
      CREATOROS_LICENSE_FILE: licenseFile,
      CREATOROS_MASTER_KEY: Buffer.alloc(32, 17).toString("base64"),
    };
    try {
      await refreshClientConfig({
        env: fileEnv,
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(),
        readVerdict: async () => ({ state: "ready", verdict }),
      });
      const encrypted = await readFile(
        join(directory, ".channel-model-config"),
        "utf8",
      );
      expect(encrypted).toMatch(/^enc:v1:/);
      expect(encrypted).not.toMatch(
        /test-model|models\.example|agent-42|growth-client-config-bundle-v1/,
      );

      await expect(
        refreshClientConfig({
          env: fileEnv,
          now: () => new Date("2026-07-28T12:11:00.000Z"),
          nonce: () => "nonce-client-config-0002",
          fetchImpl: vi.fn<typeof fetch>(async () => {
            throw new TypeError("offline");
          }),
          readVerdict: async () => ({ state: "ready", verdict }),
        }),
      ).resolves.toMatchObject({
        authority: "local",
        outcome: "unreachable",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("独立审查反例矩阵：locator、5xx、密文损坏与 clientId 权威边界", async () => {
    const bundleA = signedBundle(growthKeys.privateKey, {
      bundleVersion: 42,
    });
    const verdictB = {
      ...verdict,
      projectKey: "creatoros-b",
      channelRef: "agent-b",
    };
    const bundleB1 = signedBundle(growthKeys.privateKey, {
      bundleVersion: 1,
      projectKey: verdictB.projectKey,
      channelRef: verdictB.channelRef,
    });

    store.record = configuredRecord(bundleA);
    const fetchB1 = successfulFetch(bundleB1, verdictB);
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: fetchB1,
        readVerdict: async () => ({ state: "ready", verdict: verdictB }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "channel", outcome: "configured" });
    expect(fetchB1.mock.calls[1]?.[1]?.headers).not.toMatchObject({
      "If-None-Match": expect.anything(),
    });
    expect(store.record).toMatchObject({
      activeLocator: {
        projectKey: "creatoros-b",
        channelRef: "agent-b",
        clientId: "creatoros.desktop",
      },
      bundle: { bundleVersion: 1 },
      inactiveLocators: [
        {
          locator: {
            projectKey: "creatoros",
            channelRef: "agent-42",
            clientId: "creatoros.desktop",
          },
        },
      ],
    });

    // A42 与 B42 是不同序列；同版本不同 digest 也必须接受，不能碰撞。
    store.record = configuredRecord(bundleA);
    const bundleB42 = signedBundle(growthKeys.privateKey, {
      bundleVersion: 42,
      projectKey: verdictB.projectKey,
      channelRef: verdictB.channelRef,
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(bundleB42, verdictB),
        readVerdict: async () => ({ state: "ready", verdict: verdictB }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "channel", outcome: "configured" });

    // B 不可达时 A 密文只留在 inactive，不得被重新激活。
    store.record = configuredRecord(bundleA);
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: vi.fn<typeof fetch>(async () => {
          throw new TypeError("dns failed");
        }),
        readVerdict: async () => ({ state: "ready", verdict: verdictB }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "local", outcome: "unreachable" });
    expect(store.record).toMatchObject({
      state: "local",
      activeLocator: {
        projectKey: "creatoros-b",
        channelRef: "agent-b",
      },
      bundle: null,
      inactiveLocators: [{ bundle: { bundleVersion: 42 } }],
    });

    // 切回 A 后才可发送 A 的 ETag；Growth 304 验证通过后重新激活 A。
    const switchBack = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith(AM_ORIGIN)) {
        return signedAmResponse(amKeys.privateKey, {
          contractVersion: "config-access-ticket-v3",
          configAccessTicket: "header.payload.signature",
          expiresAt: "2026-07-28T12:15:00.000Z",
          nonce: "nonce-client-config-0001",
        });
      }
      expect(init?.headers).toMatchObject({
        "If-None-Match": `"${bundleA.bundleDigest}"`,
      });
      return new Response(null, {
        status: 304,
        headers: {
          etag: `"${bundleA.bundleDigest}"`,
          "cache-control": "private, no-store",
          "x-config-bundle-version": "42",
          "x-config-key-id": bundleA.keyId,
          "x-correlation-id": "cor_abcdef0123456789abcdef0123456789",
        },
      });
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: switchBack,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "channel", outcome: "configured" });

    // Activity 所有 5xx（含未知正文）都是 authority unavailable，不是安全攻击。
    for (const status of [500, 502, 503, 599]) {
      store.record = configuredRecord(signedBundle(growthKeys.privateKey));
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        Response.json({ unknown: "body-must-not-matter" }, { status }),
      );
      await expect(
        refreshClientConfig({
          env: env(),
          now: () => NOW,
          nonce: () => "nonce-client-config-0001",
          fetchImpl,
          readVerdict: async () => ({ state: "ready", verdict }),
          store,
        }),
      ).resolves.toMatchObject({ authority: "local", outcome: "unreachable" });
      expect(store.record).toMatchObject({
        state: "local",
        outcome: "unreachable",
        channel: expect.any(Object),
      });
    }

    // Growth 所有 5xx（含未知 code）同样只停用渠道，不隔离历史密文。
    for (const status of [500, 502, 503, 599]) {
      store.record = configuredRecord(signedBundle(growthKeys.privateKey));
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          signedAmResponse(amKeys.privateKey, {
            contractVersion: "config-access-ticket-v3",
            configAccessTicket: "header.payload.signature",
            expiresAt: "2026-07-28T12:15:00.000Z",
            nonce: "nonce-client-config-0001",
          }),
        )
        .mockResolvedValueOnce(
          Response.json(
            { error: { code: "UNKNOWN_5XX", message: "opaque" } },
            { status },
          ),
        );
      await expect(
        refreshClientConfig({
          env: env(),
          now: () => NOW,
          nonce: () => "nonce-client-config-0001",
          fetchImpl,
          readVerdict: async () => ({ state: "ready", verdict }),
          store,
        }),
      ).resolves.toMatchObject({ authority: "local", outcome: "unreachable" });
      expect(store.record).toMatchObject({
        state: "local",
        outcome: "unreachable",
        channel: expect.any(Object),
      });
    }

    for (const kind of [
      "prefix",
      "gcm-tag",
      "wrong-key",
      "schema",
      "structure",
    ]) {
      const directory = await mkdtemp(
        join(tmpdir(), "creatoros-client-config-corrupt-"),
      );
      const path = join(directory, ".channel-model-config");
      const key = Buffer.alloc(32, 7);
      const bundle = signedBundle(growthKeys.privateKey);
      const configured = configuredRecord(bundle);
      const validRecord: ClientConfigCacheRecord = {
        state: configured.state,
        outcome: configured.outcome,
        checkedAt: configured.checkedAt,
        activeLocator: {
          projectKey: bundle.projectKey,
          channelRef: bundle.channelRef,
          clientId: "creatoros.desktop",
        },
        bundle: configured.bundle,
        channel: configured.channel,
        inactiveLocators: [],
      };
      try {
        if (kind === "prefix") {
          await writeFile(path, "plaintext-cache\n", "utf8");
        } else if (kind === "gcm-tag") {
          const valid = encryptedEnvelope(key, {
            schemaVersion: "creatoros-channel-model-config-cache-v1",
            record: validRecord,
          });
          const packed = Buffer.from(valid.trim().slice("enc:v1:".length), "base64");
          packed[12] = packed[12]! ^ 0xff;
          await writeFile(path, `enc:v1:${packed.toString("base64")}\n`, "utf8");
        } else if (kind === "wrong-key") {
          await new EncryptedClientConfigStore(path, Buffer.alloc(32, 8)).save(
            validRecord,
          );
        } else if (kind === "schema") {
          await writeFile(
            path,
            encryptedEnvelope(key, {
              schemaVersion: "unknown-schema",
              record: validRecord,
            }),
            "utf8",
          );
        } else {
          await writeFile(
            path,
            encryptedEnvelope(key, {
              schemaVersion: "creatoros-channel-model-config-cache-v1",
              record: { state: "channel", injected: "opaque" },
            }),
            "utf8",
          );
        }
        await expect(
          new EncryptedClientConfigStore(path, key).load(),
        ).rejects.toBeInstanceOf(ClientConfigCacheSecurityError);
        expect(await readdir(directory)).toEqual([
          expect.stringMatching(/^\.channel-model-config\.corrupt\./),
        ]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    {
    // v3 response 是 closed schema：Activity 多发 clientId 也必须 fail-closed，且不得请求 Growth。
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).startsWith(AM_ORIGIN)) {
        expect(JSON.parse(String(init?.body))).not.toHaveProperty("clientId");
        return signedAmResponse(amKeys.privateKey, {
          contractVersion: "config-access-ticket-v3",
          configAccessTicket: "header.payload.signature",
          expiresAt: "2026-07-28T12:15:00.000Z",
          nonce: "nonce-client-config-0001",
          clientId: "untrusted-legacy-value",
        });
      }
      throw new Error("额外 locator 被接受后才会错误触达 Growth");
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "local", outcome: "security_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    }

    {
    // 旧 v1 response 即使字段看似完整也必须 fail-closed，不能静默兼容。
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith(AM_ORIGIN)) {
        return signedAmResponse(amKeys.privateKey, {
          contractVersion: "config-access-ticket-v1",
          configAccessTicket: "header.payload.signature",
          expiresAt: "2026-07-28T12:15:00.000Z",
          nonce: "nonce-client-config-0001",
        });
      }
      throw new Error("旧 v1 被接受后才会错误触达 Growth");
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl,
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "local", outcome: "security_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    }

    {
    // Growth registry 签入错误 clientId 时安全失败。
    const wrongClient = signedBundle(growthKeys.privateKey, {
      clientId: "other.desktop",
    });
    await expect(
      refreshClientConfig({
        env: env(),
        now: () => NOW,
        nonce: () => "nonce-client-config-0001",
        fetchImpl: successfulFetch(wrongClient),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toMatchObject({ authority: "local", outcome: "security_error" });
    expect(store.record?.state).toBe("quarantined");
    }

    {
    // runtime authority 还必须匹配 active locator，不能仅凭 bundle/channel 字段激活。
    const bundle = signedBundle(growthKeys.privateKey);
    store.record = {
      ...configuredRecord(bundle),
      activeLocator: {
        projectKey: "other-project",
        channelRef: "other-channel",
        clientId: "creatoros.desktop",
      },
      inactiveLocators: [],
    };
    await expect(
      readChannelModelAuthority({
        env: env(),
        readVerdict: async () => ({ state: "ready", verdict }),
        store,
      }),
    ).resolves.toEqual({
      authority: "local",
      outcome: "unreachable",
      payload: null,
    });
    }
  });
});
