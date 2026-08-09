import { and, eq } from "drizzle-orm";
import type { Db } from "@creatoros/backend";
import { decryptSecret, isEncrypted } from "@creatoros/backend";

import { channelModelCredentials } from "./settings.db-schema";
import {
  CHANNEL_CREDENTIAL_SERVICE,
  channelCredentialRef,
  storeCredentialVerified,
  type CredentialVault,
} from "./credential-vault";

export interface CredentialKeyringMigrationResult {
  total: number;
  migrated: number;
  blocked: number;
  alreadyMigrated: number;
  empty: number;
}

export interface CredentialKeyringMigrationDeps {
  vault: CredentialVault;
  /** 只用于读取升级前的唯一旧副本；新写路径永不再使用 master key。 */
  legacyMasterKey: Buffer | null;
  now: () => string;
}

function recoverLegacySecret(stored: string, key: Buffer | null): string {
  if (!isEncrypted(stored)) return stored;
  if (!key) throw new Error("legacy master key unavailable");
  return decryptSecret(stored, key);
}

async function rollbackVault(
  vault: CredentialVault,
  service: string,
  account: string,
  previous: string | null,
): Promise<void> {
  if (previous === null) await vault.delete(service, account);
  else await vault.set(service, account, previous);
}

/**
 * 升级迁移按行推进：恢复旧副本 → 写系统 Keyring → 读回核对 → DB 事务清旧密文并标记版本。
 * 任一步失败只把行标 blocked；仍未迁移成功的旧密文原样保留，生产读取路径不得消费它。
 */
export async function migrateLongTermCredentialsToKeyring(
  db: Db,
  deps: CredentialKeyringMigrationDeps,
): Promise<CredentialKeyringMigrationResult> {
  const channels = await db.select().from(channelModelCredentials);
  const result: CredentialKeyringMigrationResult = {
    total: channels.length,
    migrated: 0,
    blocked: 0,
    alreadyMigrated: 0,
    empty: 0,
  };

  for (const row of channels) {
    if (
      row.migrationState === "keyring_v1" &&
      row.credentialStatus === "ready" &&
      row.keyringRef &&
      row.encryptedSecret === null
    ) {
      result.alreadyMigrated += 1;
      continue;
    }
    if (!row.encryptedSecret) {
      result.empty += 1;
      continue;
    }
    const ref = channelCredentialRef(row.scopeId, row.serviceId);
    let previous: string | null = null;
    try {
      const plain = recoverLegacySecret(row.encryptedSecret, deps.legacyMasterKey);
      previous = await deps.vault.get(CHANNEL_CREDENTIAL_SERVICE, ref);
      await storeCredentialVerified(
        deps.vault,
        CHANNEL_CREDENTIAL_SERVICE,
        ref,
        plain,
      );
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(channelModelCredentials)
            .set({
              encryptedSecret: null,
              keyringRef: ref,
              credentialStatus: "ready",
              migrationState: "keyring_v1",
              rotatedAt: deps.now(),
            })
            .where(
              and(
                eq(channelModelCredentials.userId, row.userId),
                eq(channelModelCredentials.scopeId, row.scopeId),
                eq(channelModelCredentials.serviceId, row.serviceId),
              ),
            );
        });
      } catch (error) {
        await rollbackVault(
          deps.vault,
          CHANNEL_CREDENTIAL_SERVICE,
          ref,
          previous,
        ).catch(() => {});
        throw error;
      }
      result.migrated += 1;
    } catch (error) {
      await db
        .update(channelModelCredentials)
        .set({
          credentialStatus: "blocked",
          migrationState:
            error instanceof Error && error.message.includes("legacy master key")
              ? "legacy_key_unavailable"
              : "keyring_unavailable",
        })
        .where(
          and(
            eq(channelModelCredentials.userId, row.userId),
            eq(channelModelCredentials.scopeId, row.scopeId),
            eq(channelModelCredentials.serviceId, row.serviceId),
          ),
        );
      result.blocked += 1;
    }
  }

  return result;
}
