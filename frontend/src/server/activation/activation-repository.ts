import {
  activationState,
  encryptSecret,
  decryptSecret,
  eq,
  type Db,
} from "@creatoros/backend";
import type {
  ActivationRepository,
  ActivationSecurityMirror,
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
      let code: string;
      try {
        code = dec(row.code);
      } catch (e) {
        // [T-171] master key 换了/丢了(如 keychain 重置、未签名 app 换签名)→ 存储的激活码解不开
        //   (AES-256-GCM auth tag 校验失败)。**绝不硬崩**——否则激活 check 抛错 → 整个 app
        //   首页 500「This page couldn't load」卡死。按「无有效激活」诚实降级 → 返回 null,门跳
        //   /activate 让用户重激活(重激活用当前 master key 重新加密,恢复)。解不开的记录=等于没激活。
        console.warn(
          "[activation] 存储的激活码解密失败(master key 不符?)→ 视为未激活,请重新激活。",
          e instanceof Error ? e.message : e,
        );
        return null;
      }
      return {
        machineId: row.machineId,
        code,
        licenseMode: row.licenseMode,
        projectKey: row.projectKey,
        expiresAt: row.expiresAt,
        activatedAt: row.activatedAt,
        lastOnlineCheckAt: row.lastOnlineCheckAt,
        // [T-372 L2] 安全门展示副本三列(可为 null;真值在 Rust 侧)。
        lastSeenAt: row.lastSeenAt ?? null,
        graceSeconds: row.graceSeconds ?? null,
        revoked: row.revoked === 1,
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
        // 未带安全态时不抹掉既有副本(undefined → 沿用列默认/既有值语义:insert 用 null/0)。
        lastSeenAt: state.lastSeenAt ?? null,
        graceSeconds: state.graceSeconds ?? null,
        revoked: state.revoked ? 1 : 0,
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

    // [T-372 L2] Rust 壳同步入口专用:整行 upsert(含 last_seen_at/grace_seconds/revoked)。
    // 与 write() 分开:write() 是 P5 状态机路径(不动安全三列,避免旧路径抹掉 Rust 同步值);
    // writeMirror() 是展示副本全量覆写(来源单一 = Rust 决策链产物)。
    async writeMirror(mirror: ActivationSecurityMirror): Promise<void> {
      const row = {
        id: SINGLETON_ID,
        machineId: mirror.machineId,
        code: enc(mirror.code),
        licenseMode: mirror.licenseMode,
        projectKey: mirror.projectKey,
        expiresAt: mirror.expiresAt,
        activatedAt: mirror.activatedAt,
        lastOnlineCheckAt: mirror.lastOnlineCheckAt,
        lastSeenAt: mirror.lastSeenAt,
        graceSeconds: mirror.graceSeconds,
        revoked: mirror.revoked ? 1 : 0,
      };
      await db
        .insert(activationState)
        .values(row)
        .onConflictDoUpdate({
          target: activationState.id,
          set: { ...row },
        });
    },

    async clear(): Promise<void> {
      await db
        .delete(activationState)
        .where(eq(activationState.id, SINGLETON_ID));
    },
  };
}
