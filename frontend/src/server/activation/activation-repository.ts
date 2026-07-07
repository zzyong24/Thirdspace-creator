import {
  activationState,
  encryptSecret,
  decryptSecret,
  eq,
  type Db,
} from "@creatoros/backend";
import type {
  ActivationRepository,
  StoredActivation,
} from "./activation-service";

// T-147 P5 桌面激活授权 —— activation_state 持久层(全局单行,id 恒 'singleton')。
//
// 加密(复用 P2 secret-crypto,同一 master key):`code` 列写库前 encryptSecret(enc:v1: 密文)、
//   读出后 decryptSecret 还原明文(状态机拿明文)。缺 masterKey 时透传明文(向后兼容/降级,
//   同 settings.repository 的缺省语义)。
//
// 非 user-scoped(激活按机器不按用户)—— 不 ctx 过滤,固定 PK。

const SINGLETON_ID = "singleton";

export function createActivationRepository(
  db: Db,
  options: { masterKey?: Buffer } = {},
): ActivationRepository {
  const { masterKey } = options;

  function enc(plain: string): string {
    return masterKey ? encryptSecret(plain, masterKey) : plain;
  }
  function dec(stored: string): string {
    return masterKey ? decryptSecret(stored, masterKey) : stored;
  }

  return {
    async read(): Promise<StoredActivation | null> {
      const rows = await db
        .select()
        .from(activationState)
        .where(eq(activationState.id, SINGLETON_ID))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        machineId: row.machineId,
        code: dec(row.code),
        licenseMode: row.licenseMode,
        projectKey: row.projectKey,
        expiresAt: row.expiresAt,
        activatedAt: row.activatedAt,
        lastOnlineCheckAt: row.lastOnlineCheckAt,
      };
    },

    async write(state: StoredActivation): Promise<void> {
      const row = {
        id: SINGLETON_ID,
        machineId: state.machineId,
        code: enc(state.code),
        licenseMode: state.licenseMode,
        projectKey: state.projectKey,
        expiresAt: state.expiresAt,
        activatedAt: state.activatedAt,
        lastOnlineCheckAt: state.lastOnlineCheckAt,
      };
      await db
        .insert(activationState)
        .values(row)
        .onConflictDoUpdate({
          target: activationState.id,
          set: {
            machineId: row.machineId,
            code: row.code,
            licenseMode: row.licenseMode,
            projectKey: row.projectKey,
            expiresAt: row.expiresAt,
            activatedAt: row.activatedAt,
            lastOnlineCheckAt: row.lastOnlineCheckAt,
          },
        });
    },

    async clear(): Promise<void> {
      await db
        .delete(activationState)
        .where(eq(activationState.id, SINGLETON_ID));
    },
  };
}
