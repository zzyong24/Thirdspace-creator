import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, encryptSecret, type RequestContext } from "@creatoros/backend";

import { channelModelCredentials } from "./settings.db-schema";
import { createSettingsRepository } from "./settings.repository";
import {
  CHANNEL_CREDENTIAL_SERVICE,
  channelCredentialRef,
  createUnavailableCredentialVault,
  type CredentialVault,
} from "./credential-vault";

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };
const LEGACY_KEY = Buffer.alloc(32, 9);

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  mismatch = false;
  denied = false;
  async get(service: string, account: string): Promise<string | null> {
    if (this.denied) throw new Error("keychain denied");
    const value = this.values.get(`${service}:${account}`) ?? null;
    return this.mismatch && value ? `${value}-mismatch` : value;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    if (this.denied) throw new Error("keychain denied");
    this.values.set(`${service}:${account}`, secret);
  }
  async delete(service: string, account: string): Promise<void> {
    this.values.delete(`${service}:${account}`);
  }
}

function deps(vault?: CredentialVault) {
  return {
    now: () => "2026-08-02T00:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-1`,
    credentialVault: vault,
    legacyMasterKey: LEGACY_KEY,
  };
}

describe("T-731 渠道 service Key 系统凭据库隔离", () => {
  it("写 Keyring→读回核对→数据库只存不可逆引用和元数据", async () => {
    const { db } = await createDb();
    const vault = new FakeVault();
    const repo = createSettingsRepository(db, deps(vault));

    await repo.putChannelModelCredential(
      ctxA,
      "scope-a",
      "service-text",
      "sk-secret",
      "activation_managed",
    );
    const raw = await db
      .select()
      .from(channelModelCredentials)
      .where(
        and(
          eq(channelModelCredentials.userId, ctxA.userId),
          eq(channelModelCredentials.scopeId, "scope-a"),
          eq(channelModelCredentials.serviceId, "service-text"),
        ),
      );
    expect(raw).toHaveLength(1);
    expect(raw[0]!.encryptedSecret).toBeNull();
    expect(raw[0]!.keyringRef).toBe(channelCredentialRef("scope-a", "service-text"));
    expect(raw[0]!.credentialStatus).toBe("ready");
    expect(raw[0]!.migrationState).toBe("keyring_v1");
    expect(raw[0]!.serviceType).toBe("activation_managed");
    expect(JSON.stringify(raw[0])).not.toContain("sk-secret");
    expect(
      vault.values.get(`${CHANNEL_CREDENTIAL_SERVICE}:${raw[0]!.keyringRef}`),
    ).toBe("sk-secret");
    await expect(
      repo.getChannelModelCredential(ctxA, "scope-a", "service-text"),
    ).resolves.toBe("sk-secret");
  });

  it("同 service 在不同用户或不同 scope 不可见，切回原 scope 可读", async () => {
    const { db } = await createDb();
    const repo = createSettingsRepository(db, deps(new FakeVault()));
    await repo.putChannelModelCredential(
      ctxA,
      "scope-a",
      "service-asr",
      "sk-asr",
      "user_input",
    );

    await expect(
      repo.getChannelModelCredential(ctxA, "scope-b", "service-asr"),
    ).resolves.toBeNull();
    await expect(
      repo.getChannelModelCredential(ctxB, "scope-a", "service-asr"),
    ).resolves.toBeNull();
    await expect(
      repo.getChannelModelCredential(ctxA, "scope-a", "service-asr"),
    ).resolves.toBe("sk-asr");
  });

  it("Keychain 不可用或读回不一致时拒绝保存，不写数据库", async () => {
    // 完整迁移库只建一次；三个 vault 分支都必须在写 DB 前失败，可安全共享该空库。
    // 避免全仓并发门里重复跑三次 0069 迁移导致 5s 测试超时。
    const { db } = await createDb();
    const vaults = [
      createUnavailableCredentialVault("test keychain unavailable"),
      Object.assign(new FakeVault(), { denied: true }),
      Object.assign(new FakeVault(), { mismatch: true }),
    ];
    for (const [index, vault] of vaults.entries()) {
      const repo = createSettingsRepository(db, deps(vault));
      await expect(
        repo.putChannelModelCredential(
          ctxA,
          "scope-a",
          `service-text-${index}`,
          "sk-plain",
          "activation_managed",
        ),
      ).rejects.toThrow(/凭据|keychain|Keychain|钥匙串/i);
      await expect(db.select().from(channelModelCredentials)).resolves.toHaveLength(0);
    }
  });

  it("旧迁移 blocked 行保留唯一密文但生产读路径拒绝回退", async () => {
    const { db } = await createDb();
    await db.insert(channelModelCredentials).values({
      userId: ctxA.userId,
      scopeId: "scope-a",
      serviceId: "service-text",
      encryptedSecret: encryptSecret("legacy-only-copy", LEGACY_KEY),
      credentialStatus: "blocked",
      migrationState: "keyring_unavailable",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const repo = createSettingsRepository(db, deps(new FakeVault()));
    await expect(
      repo.getChannelModelCredential(ctxA, "scope-a", "service-text"),
    ).rejects.toThrow(/迁移|钥匙串|不可用/);
    const row = (await db.select().from(channelModelCredentials))[0]!;
    expect(row.encryptedSecret).toMatch(/^enc:v1:/);
  });
});
