import { eq } from "drizzle-orm";
import type { Db } from "@creatoros/backend";
import { encryptSecret, isEncrypted } from "@creatoros/backend";
import { modelConfigurations } from "./settings.db-schema";

// T-147 P2 —— 存量明文 secret 就地加密迁移(可重跑、幂等)。
//
// 读全表 model_configurations,把**无 enc:v1: 前缀**(存量明文)且非空的 secret_value
// 用给定 master key 加密写回;已加密的行 / NULL / 空串 跳过。**幂等**:跑第二遍全部已加密
// → 0 changed。脚本化(scripts/desktop/migrate-model-secrets.mjs)包一层 CLI + DB 连接。

export interface SecretMigrationResult {
  total: number; // 全表行数
  encrypted: number; // 本次新加密的行数
  alreadyEncrypted: number; // 已是密文 → 跳过
  emptyOrNull: number; // NULL/空 → 跳过
}

/**
 * 把 model_configurations 里存量明文的 secret_value 就地加密。传入解析好的 32B master key。
 * 返回统计。**不删列、不改 schema**,只把明文替换为 enc:v1: 密文。
 */
export async function migratePlaintextSecrets(
  db: Db,
  masterKey: Buffer,
): Promise<SecretMigrationResult> {
  const rows = await db
    .select({
      id: modelConfigurations.id,
      secretValue: modelConfigurations.secretValue,
    })
    .from(modelConfigurations);

  const result: SecretMigrationResult = {
    total: rows.length,
    encrypted: 0,
    alreadyEncrypted: 0,
    emptyOrNull: 0,
  };

  for (const row of rows) {
    const v = row.secretValue;
    if (v == null || v.length === 0) {
      result.emptyOrNull += 1;
      continue;
    }
    if (isEncrypted(v)) {
      result.alreadyEncrypted += 1;
      continue;
    }
    // 存量明文 → 加密写回。
    const cipher = encryptSecret(v, masterKey);
    await db
      .update(modelConfigurations)
      .set({ secretValue: cipher })
      .where(eq(modelConfigurations.id, row.id));
    result.encrypted += 1;
  }

  return result;
}
