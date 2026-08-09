import { describe, expect, it } from "vitest";

import {
  CHANNEL_CREDENTIAL_SERVICE,
  channelCredentialRef,
  storeCredentialVerified,
  type CredentialVault,
} from "./credential-vault";

class FakeVault implements CredentialVault {
  readonly values = new Map<string, string>();
  mismatch = false;
  failSet = false;

  async get(service: string, account: string): Promise<string | null> {
    const value = this.values.get(`${service}:${account}`) ?? null;
    return this.mismatch && value ? `${value}-changed` : value;
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    if (this.failSet) throw new Error("keychain denied");
    this.values.set(`${service}:${account}`, secret);
  }

  async delete(service: string, account: string): Promise<void> {
    this.values.delete(`${service}:${account}`);
  }
}

describe("T-731 系统凭据引用", () => {
  it("受管 Key account 只保存 scopeId + serviceId 的不可逆 SHA-256", () => {
    expect(channelCredentialRef("scope-a", "omnihi-main")).toMatch(/^[a-f0-9]{64}$/);
    expect(channelCredentialRef("scope-a", "omnihi-main")).toBe(
      "68f7d864ffaac23c71c8b56d85ca6d10ea3bba3cda681d10a06b5845b9e656b8",
    );
    expect(CHANNEL_CREDENTIAL_SERVICE).toBe("com.creatoros.managed-credentials.v1");
  });

  it("写入后必须读回恒时核对；不一致或 Keychain 拒绝都失败关闭", async () => {
    const vault = new FakeVault();
    await expect(storeCredentialVerified(vault, "svc", "ref", "sk-ok")).resolves.toBeUndefined();

    vault.mismatch = true;
    await expect(storeCredentialVerified(vault, "svc", "ref", "sk-next")).rejects.toThrow(
      /读回核对失败/,
    );

    vault.mismatch = false;
    vault.failSet = true;
    await expect(storeCredentialVerified(vault, "svc", "ref", "sk-denied")).rejects.toThrow(
      /keychain denied/,
    );
  });
});
