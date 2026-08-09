import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, encryptSecret } from "@creatoros/backend";

import { channelModelCredentials, modelConfigurations } from "./settings.db-schema";
import {
  CHANNEL_CREDENTIAL_SERVICE,
  MODEL_CREDENTIAL_SERVICE,
  channelCredentialRef,
  modelCredentialRef,
  type CredentialVault,
} from "./credential-vault";
import { migrateLongTermCredentialsToKeyring } from "./credential-keyring-migration";

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  failAccounts = new Set<string>();
  setCalls = 0;
  async get(service: string, account: string): Promise<string | null> {
    return this.values.get(`${service}:${account}`) ?? null;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    if (this.failAccounts.has(account)) throw new Error("keychain denied");
    this.setCalls += 1;
    this.values.set(`${service}:${account}`, secret);
  }
  async delete(service: string, account: string): Promise<void> {
    this.values.delete(`${service}:${account}`);
  }
}

const KEY = Buffer.alloc(32, 17);

describe("T-731 长期凭据升级迁移", () => {
  it("逐条写入并读回 Keyring 后才清空渠道旧密文与用户模型旧密文", async () => {
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
    expect(result).toMatchObject({ migrated: 2, blocked: 0 });

    const channel = (await db.select().from(channelModelCredentials))[0]!;
    expect(channel.encryptedSecret).toBeNull();
    expect(channel.keyringRef).toBe(channelCredentialRef("scope-a", "omnihi-main"));
    expect(channel.credentialStatus).toBe("ready");
    expect(channel.migrationState).toBe("keyring_v1");
    expect(vault.values.get(`${CHANNEL_CREDENTIAL_SERVICE}:${channel.keyringRef}`)).toBe(
      "managed-key",
    );

    const model = (await db.select().from(modelConfigurations))[0]!;
    expect(model.secretValue).toBeNull();
    expect(model.keyringRef).toBe(modelCredentialRef("user-a", "default"));
    expect(model.credentialMigrationState).toBe("keyring_v1");
    expect(vault.values.get(`${MODEL_CREDENTIAL_SERVICE}:${model.keyringRef}`)).toBe(
      "user-key",
    );

    const second = await migrateLongTermCredentialsToKeyring(db, {
      vault,
      legacyMasterKey: KEY,
      now: () => "2026-08-08T00:00:01.000Z",
    });
    expect(second.migrated).toBe(0);
    expect(vault.setCalls).toBe(2);
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

  it("没有旧 master key 时不猜、不删，保留旧副本并阻断迁移", async () => {
    const { db } = await createDb();
    await db.insert(modelConfigurations).values({
      id: "model-a",
      userId: "user-a",
      capability: "default",
      provider: "openai",
      modelName: "gpt",
      secretReference: "",
      secretValue: encryptSecret("only-copy", KEY),
      settings: {},
      apiFormat: "openai_responses",
      isDefault: true,
    });
    const result = await migrateLongTermCredentialsToKeyring(db, {
      vault: new FakeVault(),
      legacyMasterKey: null,
      now: () => "2026-08-08T00:00:00.000Z",
    });
    expect(result.blocked).toBe(1);
    const row = (await db.select().from(modelConfigurations))[0]!;
    expect(row.secretValue).toMatch(/^enc:v1:/);
    expect(row.keyringRef).toBeNull();
    expect(row.credentialMigrationState).toBe("legacy_key_unavailable");
  });
});
