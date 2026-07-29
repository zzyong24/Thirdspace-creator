import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClientConfigPullError,
  readChannelModelAuthority,
  refreshClientConfig,
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
) {
  const bytes = Buffer.from(JSON.stringify(body));
  const date = "Tue, 28 Jul 2026 12:10:00 GMT";
  const digest = `SHA-256=${createHash("sha256").update(bytes).digest("base64")}`;
  const signing = `post /api/license/client-config-tickets\nactivity.example\n${date}\n${digest}`;
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
    "config-access-ticket-v1.vector.json",
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

  function successfulFetch(bundle = signedBundle(growthKeys.privateKey)) {
    return vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === `${AM_ORIGIN}/api/license/client-config-tickets`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          contractVersion: "config-access-ticket-v1",
          projectKey: "creatoros",
          clientId: "creatoros.desktop",
          code: verdict.code,
          machineId: verdict.machineId,
          nonce: "nonce-client-config-0001",
        });
        return signedAmResponse(amKeys.privateKey, {
          contractVersion: "config-access-ticket-v1",
          configAccessTicket: "header.payload.signature",
          expiresAt: "2026-07-28T12:15:00.000Z",
          nonce: "nonce-client-config-0001",
        });
      }
      expect(url).toBe(
        `${GROWTH_ORIGIN}/api/v2/client-config/bundles/current?clientVersion=0.2.1-beta.3&accept=creatoros.model-config%40creatoros-model-config-v1`,
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

  it("逐字通过 Growth canonical bundle fixture 的 Ed25519 与 JCS digest", async () => {
    expect(createHash("sha256").update(ticketFixtureBytes).digest("hex")).toBe(
      "a71d21773cb2f0b0033a0231c657ec09df24f2a1b07ae99f1c395e35a6fc8620",
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
  });

  it("Activity/Growth exact response headers 漂移时 fail-closed", async () => {
    const missingAmNoStore = successfulFetch();
    missingAmNoStore.mockImplementationOnce(async () => {
      const response = signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v1",
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
        contractVersion: "config-access-ticket-v1",
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
        contractVersion: "config-access-ticket-v1",
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
        contractVersion: "config-access-ticket-v1",
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

  it("Growth signer 暂时不可用时使用本地，不启用远端 LKG", async () => {
    store.record = configuredRecord(signedBundle(growthKeys.privateKey));
    const fetchImpl = successfulFetch();
    fetchImpl.mockImplementationOnce(async (input) => {
      expect(String(input)).toBe(
        `${AM_ORIGIN}/api/license/client-config-tickets`,
      );
      return signedAmResponse(amKeys.privateKey, {
        contractVersion: "config-access-ticket-v1",
        configAccessTicket: "header.payload.signature",
        expiresAt: "2026-07-28T12:15:00.000Z",
        nonce: "nonce-client-config-0001",
      });
    });
    fetchImpl.mockImplementationOnce(async () =>
      Response.json(
        {
          error: {
            code: "CLIENT_CONFIG_SIGNER_UNAVAILABLE",
            message: "CLIENT_CONFIG_SIGNER_UNAVAILABLE",
          },
        },
        { status: 503 },
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
    ).resolves.toMatchObject({
      authority: "local",
      outcome: "unreachable",
    });
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
});
