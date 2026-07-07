import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, type RequestContext } from "@creatoros/backend";
import { eq } from "drizzle-orm";
import { createSettingsRepository } from "./settings.repository";
import { modelConfigurations } from "./settings.db-schema";
import { ENC_PREFIX, isEncrypted } from "@creatoros/backend";

// T-147 P2 — 透明加解密插在 repository 层的验证。注入 masterKey 后:
//   - putModel 写库前把 secret 加密(DB 底层列 = enc:v1: 密文,不再明文)。
//   - getModel / listModels 读出后解密(调用方拿到明文,无感)。
//   - 存量明文行(无前缀)透传(向后兼容,过渡期未迁移的旧行)。
// 不注入 masterKey → 保持明文路径(现有集成测试的行为不变)。

const KEY = Buffer.alloc(32, 7);

const DEPS_ENC = {
  now: () => "2026-07-06T00:00:00.000Z",
  nextId: (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-c-${++n}`;
  })(),
  masterKey: KEY,
};

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };

describe("settings.repository transparent encryption (masterKey injected)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("stores the secret ENCRYPTED at rest but getModel returns plaintext", async () => {
    const repo = createSettingsRepository(db, DEPS_ENC);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-real-live-key",
    });

    // Raw DB column = ciphertext (enc:v1:), NOT the plaintext key.
    const raw = await db
      .select()
      .from(modelConfigurations)
      .where(eq(modelConfigurations.capability, "default"));
    expect(raw[0]!.secretValue).toBeTruthy();
    expect(raw[0]!.secretValue!.startsWith(ENC_PREFIX)).toBe(true);
    expect(raw[0]!.secretValue).not.toContain("sk-real-live-key");

    // But the repo read decrypts transparently → callers see plaintext.
    const row = await repo.getModel(ctxA, "default");
    expect(row?.secretValue).toBe("sk-real-live-key");
  });

  it("listModels decrypts each row's secret", async () => {
    const repo = createSettingsRepository(db, DEPS_ENC);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-aaa",
    });
    await repo.putModel(ctxA, "image.default", {
      provider: "minimax",
      modelName: "img",
      secret: "sk-bbb",
    });
    const list = await repo.listModels(ctxA);
    const secrets = list.map((r) => r.secretValue).sort();
    expect(secrets).toEqual(["sk-aaa", "sk-bbb"]);
  });

  it("a partial update (no secret) preserves the encrypted key and still reads plaintext", async () => {
    const repo = createSettingsRepository(db, DEPS_ENC);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-keep",
    });
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3-v2",
    });
    const row = await repo.getModel(ctxA, "default");
    expect(row?.modelName).toBe("MiniMax-M3-v2");
    expect(row?.secretValue).toBe("sk-keep");
  });

  it("legacy PLAINTEXT rows (no prefix) are passed through on read (backward compat)", async () => {
    const repo = createSettingsRepository(db, DEPS_ENC);
    // Simulate a pre-encryption row: write raw plaintext directly to the column.
    await db.insert(modelConfigurations).values({
      id: "legacy-1",
      userId: ctxA.userId,
      capability: "default",
      provider: "minimax",
      modelName: "old",
      secretReference: "",
      secretValue: "sk-legacy-plaintext", // no enc:v1: prefix
      settings: {},
      apiFormat: "anthropic",
      isDefault: false,
    });
    expect(isEncrypted("sk-legacy-plaintext")).toBe(false);
    const row = await repo.getModel(ctxA, "default");
    expect(row?.secretValue).toBe("sk-legacy-plaintext");
  });

  it("NULL secret (no key configured) round-trips as null", async () => {
    const repo = createSettingsRepository(db, DEPS_ENC);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "no-key",
    });
    const row = await repo.getModel(ctxA, "default");
    expect(row?.secretValue).toBeNull();
  });
});

describe("settings.repository WITHOUT masterKey (legacy path unchanged)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("stores plaintext when no masterKey is injected (backward compat)", async () => {
    const repo = createSettingsRepository(db, {
      now: () => "2026-07-06T00:00:00.000Z",
      nextId: (p: string) => `${p}-x`,
    });
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "m",
      secret: "sk-plain",
    });
    const raw = await db
      .select()
      .from(modelConfigurations)
      .where(eq(modelConfigurations.capability, "default"));
    expect(raw[0]!.secretValue).toBe("sk-plain"); // stored as-is, no encryption
  });
});
