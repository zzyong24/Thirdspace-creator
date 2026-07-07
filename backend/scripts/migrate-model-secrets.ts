// migrate-model-secrets.ts — T-147 P2 存量明文 model key 就地加密迁移(可重跑、幂等)。
//
// 做什么:连当前配置的库(DATABASE_URL 真 Postgres / PGLITE_DATA_DIR / CREATOROS_DB_DIR
// 落盘 PGlite,复用 createConfiguredDb 的三态选择),用 env CREATOROS_MASTER_KEY 解析的
// master key 把 model_configurations 里**存量明文**(无 enc:v1: 前缀)的 secret_value
// 加密写回。已加密 / NULL / 空 跳过。幂等:跑第二遍 encrypted=0。
//
// ⚠️ master key 必须与桌面壳/运行时用的是**同一把**(否则加密后运行时解不开)。桌面端 key
//    在 OS keychain,跑本迁移前先取出注入 env:
//      export $(node frontend/scripts/desktop/master-key.mjs keychain-get)   # macOS
//    web/服务器:用运维配的那把 CREATOROS_MASTER_KEY。**未配 env → 用降级 dev key 加密**,
//    脚本会打印醒目警告(那样只有开发环境一致才解得开)。
//
// 用法:
//   pnpm db:migrate-secrets            # dry-run:只统计,不改数据
//   pnpm db:migrate-secrets --yes      # 真加密写回
import { createConfiguredDb } from "../src/db";
import { resolveMasterKey } from "../src/secret-crypto";
import { migratePlaintextSecrets } from "../src/modules/settings/secret-migration";

const argv = process.argv.slice(2);
const CONFIRM = argv.includes("--yes") || argv.includes("-y");

const { key, source, degraded } = resolveMasterKey(process.env);
if (degraded) {
  console.warn(
    "⚠️  未取到 keychain/env master key(CREATOROS_MASTER_KEY 缺失/非法)→ 用降级 dev key 加密。\n" +
      "    只有开发环境(同一降级 key)才解得开。生产/桌面请先注入真 key:\n" +
      "      export $(node frontend/scripts/desktop/master-key.mjs keychain-get)",
  );
} else {
  console.log(`✓ master key 来源: ${source}(强)。`);
}

const { db, driver, dispose } = await createConfiguredDb();
console.log(`✓ DB driver: ${driver.kind}${driver.target ? ` (${driver.target})` : ""}`);

try {
  if (!CONFIRM) {
    // dry-run:只统计明文行数,不写回。用一把丢弃 key 走同一分类逻辑不够——直接数。
    const { modelConfigurations } = await import(
      "../src/modules/settings/settings.db-schema"
    );
    const { isEncrypted } = await import("../src/secret-crypto");
    const rows = await db
      .select({ secretValue: modelConfigurations.secretValue })
      .from(modelConfigurations);
    let plaintext = 0;
    let encrypted = 0;
    let emptyOrNull = 0;
    for (const r of rows) {
      const v = r.secretValue;
      if (v == null || v.length === 0) emptyOrNull += 1;
      else if (isEncrypted(v)) encrypted += 1;
      else plaintext += 1;
    }
    console.log(
      `\nDRY-RUN(不加 --yes 不改数据):\n` +
        `  总行数        ${rows.length}\n` +
        `  待加密(明文)  ${plaintext}\n` +
        `  已加密        ${encrypted}\n` +
        `  NULL/空       ${emptyOrNull}\n\n` +
        `确认无误后加 --yes 真加密:pnpm db:migrate-secrets --yes`,
    );
  } else {
    const res = await migratePlaintextSecrets(db, key);
    console.log(
      `\n✓ 迁移完成:\n` +
        `  总行数        ${res.total}\n` +
        `  本次加密      ${res.encrypted}\n` +
        `  已加密(跳过)  ${res.alreadyEncrypted}\n` +
        `  NULL/空(跳过) ${res.emptyOrNull}`,
    );
  }
} finally {
  await dispose();
}
