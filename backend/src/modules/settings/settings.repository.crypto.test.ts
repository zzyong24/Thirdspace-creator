import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  decryptSecret,
  encryptSecret,
  type Db,
  type RequestContext,
} from "@creatoros/backend";

import { modelConfigurations } from "./settings.db-schema";
import { createSettingsRepository } from "./settings.repository";
import {
  type CredentialVault,
} from "./credential-vault";

const LEGACY_KEY = Buffer.alloc(32, 7);
const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  denied = false;
  async get(service: string, account: string): Promise<string | null> {
    this.calls.push(`get:${service}:${account}`);
    if (this.denied) throw new Error("keychain denied");
    return this.values.get(`${service}:${account}`) ?? null;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    this.calls.push(`set:${service}:${account}`);
    if (this.denied) throw new Error("keychain denied");
    this.values.set(`${service}:${account}`, secret);
  }
  async delete(service: string, account: string): Promise<void> {
    this.calls.push(`delete:${service}:${account}`);
    this.values.delete(`${service}:${account}`);
  }
}

function buildRepo(db: Db, vault?: CredentialVault) {
  let n = 0;
  return createSettingsRepository(db, {
    now: () => "2026-08-08T00:00:00.000Z",
    nextId: (prefix) => `${prefix}-c-${++n}`,
    credentialVault: vault,
    legacyMasterKey: LEGACY_KEY,
  });
}

describe("T-739 用户模型 Key 本地加密保存", () => {
  let db: Db;
  let vault: FakeVault;
  beforeEach(async () => {
    ({ db } = await createDb());
    vault = new FakeVault();
  });

  it("数据库只保存 enc:v1 密文，保存与读取都不访问系统凭据库", async () => {
    const repo = buildRepo(db, vault);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      secret: "sk-real-live-key",
    });

    const raw = await db
      .select()
      .from(modelConfigurations)
      .where(eq(modelConfigurations.capability, "default"));
    expect(raw[0]!.secretValue).toMatch(/^enc:v1:/);
    expect(decryptSecret(raw[0]!.secretValue!, LEGACY_KEY)).toBe("sk-real-live-key");
    expect(raw[0]!.keyringRef).toBeNull();
    expect(raw[0]!.credentialMigrationState).toBe("encrypted_v1");
    expect(JSON.stringify(raw[0])).not.toContain("sk-real-live-key");
    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "sk-real-live-key",
    });
    expect(vault.calls).toEqual([]);
  });

  it("部分更新不覆盖本地密文；多模型分别透明解密", async () => {
    const repo = buildRepo(db, vault);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "m1",
      secret: "sk-aaa",
    });
    await repo.putModel(ctxA, "image.default", {
      provider: "minimax",
      modelName: "m2",
      secret: "sk-bbb",
    });
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "m1-new",
    });
    const list = await repo.listModels(ctxA);
    expect(list.map((row) => row.secretValue).sort()).toEqual(["sk-aaa", "sk-bbb"]);
    expect(list.find((row) => row.capability === "default")?.modelName).toBe("m1-new");
    expect(vault.calls).toEqual([]);
  });

  it("未配置 Key 可保存普通模型元数据；缺少本机 master key 时拒绝保存明文", async () => {
    let n = 0;
    const noKeyRepo = createSettingsRepository(db, {
      now: () => "2026-08-08T00:00:00.000Z",
      nextId: (prefix) => `${prefix}-no-key-${++n}`,
      credentialVault: vault,
      legacyMasterKey: null,
    });
    await expect(
      noKeyRepo.putModel(ctxA, "default", { provider: "minimax", modelName: "no-key" }),
    ).resolves.toMatchObject({ secretValue: null });

    await expect(
      noKeyRepo.putModel(ctxA, "image.default", {
        provider: "minimax",
        modelName: "image",
        secret: "sk-no-master-key",
      }),
    ).rejects.toThrow(/本机加密密钥/);
    const rows = await db.select().from(modelConfigurations);
    expect(rows.map((row) => row.capability)).toEqual(["default"]);
    expect(vault.calls).toEqual([]);
  });

  it("旧 enc:v1 密文继续透明解密，不再强制迁入系统钥匙串", async () => {
    await db.insert(modelConfigurations).values({
      id: "legacy-1",
      userId: ctxA.userId,
      capability: "default",
      provider: "minimax",
      modelName: "old",
      secretReference: "",
      secretValue: encryptSecret("sk-legacy", LEGACY_KEY),
      credentialMigrationState: "keyring_unavailable",
      settings: {},
      apiFormat: "anthropic",
      isDefault: false,
    });
    const repo = buildRepo(db, vault);
    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "sk-legacy",
    });
    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(raw.secretValue).toMatch(/^enc:v1:/);
    expect(vault.calls).toEqual([]);
  });

  it("存量 Keyring-only 行不读取系统条目，明确进入需重新填写状态", async () => {
    await db.insert(modelConfigurations).values({
      id: "keyring-only-1",
      userId: ctxA.userId,
      capability: "default",
      provider: "minimax",
      modelName: "m1",
      secretReference: "",
      secretValue: null,
      keyringRef: "a".repeat(64),
      credentialMigrationState: "keyring_v1",
      settings: {},
      apiFormat: "anthropic",
      isDefault: false,
    });
    const repo = buildRepo(db, vault);

    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "dec-fail:v1",
    });
    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(raw.secretValue).toBeNull();
    expect(raw.keyringRef).toBe("a".repeat(64));
    expect(vault.calls).toEqual([]);
  });

  it("同一 capability 在不同用户下使用不同不可逆引用，不能串读 Key", async () => {
    const repo = buildRepo(db, vault);
    const ctxB: RequestContext = {
      userId: "user-b",
      requestId: "req-b",
      source: "user",
    };
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "m-a",
      secret: "sk-user-a",
    });
    await repo.putModel(ctxB, "default", {
      provider: "minimax",
      modelName: "m-b",
      secret: "sk-user-b",
    });

    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "sk-user-a",
    });
    await expect(repo.getModel(ctxB, "default")).resolves.toMatchObject({
      secretValue: "sk-user-b",
    });
    expect(vault.calls).toEqual([]);
  });

  it("用户重新保存后以本地密文覆盖存量 Keyring 引用，但不删除系统条目", async () => {
    await db.insert(modelConfigurations).values({
      id: "keyring-only-1",
      userId: ctxA.userId,
      capability: "default",
      provider: "minimax",
      modelName: "old",
      secretReference: "",
      secretValue: null,
      keyringRef: "b".repeat(64),
      credentialMigrationState: "keyring_v1",
      settings: {},
      apiFormat: "anthropic",
      isDefault: false,
    });
    const repo = buildRepo(db, vault);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "new",
      secret: "sk-re-entered",
    });

    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(decryptSecret(raw.secretValue!, LEGACY_KEY)).toBe("sk-re-entered");
    expect(raw.keyringRef).toBeNull();
    expect(raw.credentialMigrationState).toBe("encrypted_v1");
    expect(vault.calls).toEqual([]);
  });
});
