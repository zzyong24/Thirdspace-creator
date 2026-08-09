import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, encryptSecret, type Db, type RequestContext } from "@creatoros/backend";

import { modelConfigurations } from "./settings.db-schema";
import { createSettingsRepository } from "./settings.repository";
import {
  MODEL_CREDENTIAL_SERVICE,
  createUnavailableCredentialVault,
  modelCredentialRef,
  type CredentialVault,
} from "./credential-vault";

const LEGACY_KEY = Buffer.alloc(32, 7);
const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  denied = false;
  async get(service: string, account: string): Promise<string | null> {
    if (this.denied) throw new Error("keychain denied");
    return this.values.get(`${service}:${account}`) ?? null;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    if (this.denied) throw new Error("keychain denied");
    this.values.set(`${service}:${account}`, secret);
  }
  async delete(service: string, account: string): Promise<void> {
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

describe("T-731 用户模型 Key 系统凭据库", () => {
  let db: Db;
  let vault: FakeVault;
  beforeEach(async () => {
    ({ db } = await createDb());
    vault = new FakeVault();
  });

  it("数据库不保存可恢复 Key，读取只在调用时从 Keychain 取得", async () => {
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
    expect(raw[0]!.secretValue).toBeNull();
    expect(raw[0]!.keyringRef).toBe(modelCredentialRef(ctxA.userId, "default"));
    expect(raw[0]!.credentialMigrationState).toBe("keyring_v1");
    expect(JSON.stringify(raw[0])).not.toContain("sk-real-live-key");
    expect(
      vault.values.get(`${MODEL_CREDENTIAL_SERVICE}:${raw[0]!.keyringRef}`),
    ).toBe("sk-real-live-key");
    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "sk-real-live-key",
    });
  });

  it("部分更新不覆盖 Keyring 引用；多模型按各自不可逆引用读取", async () => {
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
  });

  it("未配置 Key 可保存普通模型元数据；提供 Key 但 Keychain 缺失/拒绝则不落库", async () => {
    const noVault = buildRepo(
      db,
      createUnavailableCredentialVault(),
    );
    await expect(
      noVault.putModel(ctxA, "default", { provider: "minimax", modelName: "no-key" }),
    ).resolves.toMatchObject({ secretValue: null });

    await expect(
      noVault.putModel(ctxA, "image.default", {
        provider: "minimax",
        modelName: "image",
        secret: "sk-no-vault",
      }),
    ).rejects.toThrow(/钥匙串/);

    vault.denied = true;
    await expect(
      buildRepo(db, vault).putModel(ctxA, "video.default", {
        provider: "minimax",
        modelName: "video",
        secret: "sk-denied",
      }),
    ).rejects.toThrow(/keychain denied/);
    const rows = await db.select().from(modelConfigurations);
    expect(rows.map((row) => row.capability)).toEqual(["default"]);
  });

  it("旧密文保留作迁移唯一副本，但普通读取绝不回退解密", async () => {
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
    await expect(repo.getModel(ctxA, "default")).rejects.toThrow(/尚未迁入系统钥匙串/);
    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(raw.secretValue).toMatch(/^enc:v1:/);
  });

  it("Keychain 条目被系统删除后读取失败关闭，数据库不会被改写成空配置", async () => {
    const repo = buildRepo(db, vault);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "m1",
      secret: "sk-keychain-only",
    });
    const ref = modelCredentialRef(ctxA.userId, "default");
    vault.values.delete(`${MODEL_CREDENTIAL_SERVICE}:${ref}`);

    await expect(repo.getModel(ctxA, "default")).rejects.toThrow(/不存在/);
    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(raw.secretValue).toBeNull();
    expect(raw.keyringRef).toBe(ref);
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

    expect(modelCredentialRef(ctxA.userId, "default")).not.toBe(
      modelCredentialRef(ctxB.userId, "default"),
    );
    await expect(repo.getModel(ctxA, "default")).resolves.toMatchObject({
      secretValue: "sk-user-a",
    });
    await expect(repo.getModel(ctxB, "default")).resolves.toMatchObject({
      secretValue: "sk-user-b",
    });
  });

  it("数据库重置重绑只接受当前 userId + capability 复算出的引用", async () => {
    const repo = buildRepo(db, vault);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "metadata-only",
    });

    await expect(
      repo.bindExistingModelCredential(ctxA, "default", "0".repeat(64)),
    ).rejects.toThrow(/不匹配/);
    const raw = (await db.select().from(modelConfigurations))[0]!;
    expect(raw.keyringRef).toBeNull();
    expect(raw.credentialMigrationState).toBe("not_required");
  });
});
