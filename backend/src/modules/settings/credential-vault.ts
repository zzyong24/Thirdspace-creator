import { createHash, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

export const CHANNEL_CREDENTIAL_SERVICE =
  "com.creatoros.managed-credentials.v1";
export const MODEL_CREDENTIAL_SERVICE =
  "com.creatoros.user-model-credentials.v1";

export interface CredentialVault {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, secret: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}

export class CredentialVaultUnavailableError extends Error {
  constructor(message = "系统钥匙串不可用，未保存凭据") {
    super(message);
    this.name = "CredentialVaultUnavailableError";
  }
}

export function createUnavailableCredentialVault(
  message = "系统钥匙串不可用，未保存凭据",
): CredentialVault {
  const fail = (): never => {
    throw new CredentialVaultUnavailableError(message);
  };
  return {
    async get() {
      return fail();
    },
    async set() {
      fail();
    },
    async delete() {
      fail();
    },
  };
}

/** 仅供 NODE_ENV=test 的组合根显式注入；不得在桌面/开发生产路径作为降级。 */
let testMemoryCredentialVault: CredentialVault | undefined;

export function createMemoryCredentialVaultForTest(): CredentialVault {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new CredentialVaultUnavailableError("内存凭据库只允许自动化测试使用");
  }
  if (testMemoryCredentialVault) return testMemoryCredentialVault;
  const values = new Map<string, string>();
  const key = (service: string, account: string): string => `${service}\0${account}`;
  testMemoryCredentialVault = {
    async get(service, account) {
      return values.get(key(service, account)) ?? null;
    },
    async set(service, account, secret) {
      values.set(key(service, account), secret);
    },
    async delete(service, account) {
      values.delete(key(service, account));
    },
  };
  return testMemoryCredentialVault;
}

function sha256Ref(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** FR-731-05：account 不保存 scope/service 原文，只保存两者拼接后的 SHA-256。 */
export function channelCredentialRef(scopeId: string, serviceId: string): string {
  return sha256Ref(`${scopeId}${serviceId}`);
}

/** 用户自填模型 Key 使用同一安全级别，但与渠道受管命名空间物理隔离。 */
export function modelCredentialRef(userId: string, capability: string): string {
  return sha256Ref(`${userId}${capability}`);
}

function equalSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  try {
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  } finally {
    leftBytes.fill(0);
    rightBytes.fill(0);
  }
}

/**
 * 先写系统凭据库，再立即读回并恒时核对。失败时尽力恢复旧值；恢复也失败仍抛出，
 * 由上层保持数据库旧引用/旧密文不变，绝不把该行标成 ready。
 */
export async function storeCredentialVerified(
  vault: CredentialVault,
  service: string,
  account: string,
  secret: string,
): Promise<void> {
  const previous = await vault.get(service, account);
  try {
    await vault.set(service, account, secret);
    const readBack = await vault.get(service, account);
    if (readBack === null || !equalSecret(secret, readBack)) {
      throw new CredentialVaultUnavailableError("系统钥匙串写入后读回核对失败，未保存凭据");
    }
  } catch (error) {
    try {
      if (previous === null) await vault.delete(service, account);
      else await vault.set(service, account, previous);
    } catch {
      // 原错误仍是本次写失败的直接证据；数据库不会推进到 ready。
    }
    throw error;
  }
}

interface NativeKeyringEntry {
  getPassword(): string | null;
  setPassword(secret: string): void;
  deleteCredential(): boolean;
}

interface NativeKeyringModule {
  Entry: new (service: string, account: string) => NativeKeyringEntry;
}

/**
 * 原生适配器只在 macOS/Windows 桌面组合根显式创建。模块缺失、平台不支持、系统拒绝均抛错，
 * 不尝试 CLI、文件、数据库密文或内存常驻回退。
 */
export function createNativeCredentialVault(
  platform: NodeJS.Platform = process.platform,
  load: () => NativeKeyringModule = () => {
    const require = createRequire(import.meta.url);
    return require("@napi-rs/keyring") as NativeKeyringModule;
  },
): CredentialVault {
  if (platform !== "darwin" && platform !== "win32") {
    throw new CredentialVaultUnavailableError(
      `当前平台 ${platform} 不支持 CreatorOS 系统凭据库`,
    );
  }
  let module: NativeKeyringModule;
  try {
    module = load();
  } catch {
    throw new CredentialVaultUnavailableError("系统凭据库原生组件不可用，未保存凭据");
  }
  const entry = (service: string, account: string): NativeKeyringEntry => {
    try {
      return new module.Entry(service, account);
    } catch {
      throw new CredentialVaultUnavailableError("系统凭据库初始化失败，未保存凭据");
    }
  };
  return {
    async get(service, account) {
      try {
        return entry(service, account).getPassword();
      } catch {
        throw new CredentialVaultUnavailableError("系统钥匙串读取失败，受管能力已停止");
      }
    },
    async set(service, account, secret) {
      try {
        entry(service, account).setPassword(secret);
      } catch {
        throw new CredentialVaultUnavailableError("系统钥匙串写入被拒绝，未保存凭据");
      }
    },
    async delete(service, account) {
      try {
        entry(service, account).deleteCredential();
      } catch {
        // 删除不存在的条目是幂等成功；其他原生错误无法可靠区分，仍 fail closed。
        const current = entry(service, account).getPassword();
        if (current !== null) {
          throw new CredentialVaultUnavailableError("系统钥匙串清理失败");
        }
      }
    },
  };
}
