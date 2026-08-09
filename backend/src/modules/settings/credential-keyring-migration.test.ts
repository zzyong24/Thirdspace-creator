import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, encryptSecret } from "@creatoros/backend";

import { channelModelCredentials, modelConfigurations } from "./settings.db-schema";
import {
  CHANNEL_CREDENTIAL_SERVICE,
  channelCredentialRef,
  type CredentialVault,
} from "./credential-vault";
import { migrateLongTermCredentialsToKeyring } from "./credential-keyring-migration";

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  failAccounts = new Set<string>();
  setCalls = 0;
  async get(service: string, account: string): Promise<string | null> {
    this.calls.push(`get:${service}:${account}`);
    return this.values.get(`${service}:${account}`) ?? null;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    this.calls.push(`set:${service}:${account}`);
    if (this.failAccounts.has(account)) throw new Error("keychain denied");
    this.setCalls += 1;
    this.values.set(`${service}:${account}`, secret);
  }
  async delete(service: string, account: string): Promise<void> {
    this.calls.push(`delete:${service}:${account}`);
    this.values.delete(`${service}:${account}`);
  }
}

const KEY = Buffer.alloc(32, 17);

describe("T-731/T-739 长期受管凭据升级迁移", () => {
  it("只迁移渠道受管 Key；用户模型旧密文保持本地加密且不访问其 Keychain service", async () => {
    const { db } = await createDb();
    await db.insert(channelModelCredentials).values({
      userId: "user-a",
      scopeId: "scope-a",
      serviceId: "omnihi-main",
      encryptedSecret: encryptSecret("managed-key", KEY),
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await db.insert(modelConfigurations).values({
      id: "model-a",
      userId: "user-a",
      capability: "default",
      provider: "openai",
      modelName: "gpt",
      secretReference: "",
      secretValue: encryptSecret("user-key", KEY),
      settings: {},
      apiFormat: "openai_responses",
      isDefault: true,
    });
    const vault = new FakeVault();

    const result = await migrateLongTermCredentialsToKeyring(db, {
      vault,
      legacyMasterKey: KEY,
      now: () => "2026-08-08T00:00:00.000Z",
    });
    expect(result).toMatchObject({ total: 1, migrated: 1, blocked: 0 });

    const channel = (await db.select().from(channelModelCredentials))[0]!;
    expect(channel.encryptedSecret).toBeNull();
    expect(channel.keyringRef).toBe(channelCredentialRef("scope-a", "omnihi-main"));
    expect(channel.credentialStatus).toBe("ready");
    expect(channel.migrationState).toBe("keyring_v1");
    expect(vault.values.get(`${CHANNEL_CREDENTIAL_SERVICE}:${channel.keyringRef}`)).toBe(
      "managed-key",
    );

    const model = (await db.select().from(modelConfigurations))[0]!;
    expect(model.secretValue).toMatch(/^enc:v1:/);
    expect(model.keyringRef).toBeNull();
    expect(model.credentialMigrationState).toBe("not_required");
    expect(vault.calls.every((call) => call.includes(CHANNEL_CREDENTIAL_SERVICE))).toBe(
      true,
    );

    const second = await migrateLongTermCredentialsToKeyring(db, {
      vault,
      legacyMasterKey: KEY,
      now: () => "2026-08-08T00:00:01.000Z",
    });
    expect(second.migrated).toBe(0);
    expect(vault.setCalls).toBe(1);
  });

  it("Keychain 拒绝时保留旧密文唯一副本并标 blocked，生产态不得读旧密文", async () => {
    const { db } = await createDb();
    const ref = channelCredentialRef("scope-a", "omnihi-main");
    await db.insert(channelModelCredentials).values({
      userId: "user-a",
      scopeId: "scope-a",
      serviceId: "omnihi-main",
      encryptedSecret: encryptSecret("only-copy", KEY),
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const vault = new FakeVault();
    vault.failAccounts.add(ref);

    const result = await migrateLongTermCredentialsToKeyring(db, {
      vault,
      legacyMasterKey: KEY,
      now: () => "2026-08-08T00:00:00.000Z",
    });
    expect(result).toMatchObject({ migrated: 0, blocked: 1 });
    const row = (
      await db
        .select()
        .from(channelModelCredentials)
        .where(
          and(
            eq(channelModelCredentials.scopeId, "scope-a"),
            eq(channelModelCredentials.serviceId, "omnihi-main"),
          ),
        )
    )[0]!;
    expect(row.encryptedSecret).toMatch(/^enc:v1:/);
    expect(row.keyringRef).toBeNull();
    expect(row.credentialStatus).toBe("blocked");
    expect(row.migrationState).toBe("keyring_unavailable");
  });

  it("渠道受管 Key 没有旧 master key 时不猜、不删，保留旧副本并阻断迁移", async () => {
    const { db } = await createDb();
    await db.insert(channelModelCredentials).values({
      userId: "user-a",
      scopeId: "scope-a",
      serviceId: "omnihi-main",
      encryptedSecret: encryptSecret("only-copy", KEY),
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const result = await migrateLongTermCredentialsToKeyring(db, {
      vault: new FakeVault(),
      legacyMasterKey: null,
      now: () => "2026-08-08T00:00:00.000Z",
    });
    expect(result.blocked).toBe(1);
    const row = (await db.select().from(channelModelCredentials))[0]!;
    expect(row.encryptedSecret).toMatch(/^enc:v1:/);
    expect(row.keyringRef).toBeNull();
    expect(row.migrationState).toBe("legacy_key_unavailable");
  });
});
