// [T-363] 「重置工作区」归档后的 user 级资产**迁回**(PRESERVE 表 → 新库)。
//
// 背景:产品「重置工作区」(T-332 S5)走 Rust 整目录归档(workspace_reset.rs:
// `db → db.archived-<ts>`,启动期 rename),把 reset-db.ts 的表级 PRESERVE 机制完全绕过
// → 模型配置 / 用户 skill 定制 / 激活态随旧库一起进归档,新库全空(真机事故:重装后
// 要重配模型、重输激活码,违背「skill 是用户的」铁律)。
//
// 方案(用户硬约束:重置功能与确认门原样保留,只动**清除范围**):归档流程零改动;
// sidecar(JS,能开 PGlite)在**归档发生后的首次启动**检测到最新的 `db.archived-<ts>`
// 且未带迁回标记 → 用同进程第二个 PGlite 实例**只读打开**归档库(不同数据目录,不违反
// PGlite 单写者约束;可行性由单测验证)→ 把 PRESERVE 清单表(reset-preserve.ts 单一真值)
// 逐表读出写入新库 → 在归档目录落 `.preserve-restored.json` 标记(一次性)。
//
// 不变式:
//   - **幂等**:新库某表非空 → 跳过(绝不覆盖用户重置后新写的数据);标记存在 → 整体跳过;
//     部分失败 → 不落标记,下次启动重试(已迁回的表因非空自动跳过)。
//   - **失败诚实**:任何一步失败只记日志、不阻断启动 —— 资产完整留在归档目录,可手工找回
//     (归档 = rename 不动字节,T-326 DATA-H09)。
//   - **列交集拷贝**:归档库可能是旧 schema(重置后升级 app 再重启)——只拷两侧同名列,
//     归档缺的列走新库默认值;NOT NULL 无默认 → 该表如实报失败,不装成功。
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, eq, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { access, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { Db } from "./db";
import { PRESERVE_TABLES } from "./reset-preserve";
import { users, sessions } from "./schema/identity";
import {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
  skillConfigOverrideVersions,
} from "./schema/settings";
import { activationState } from "./schema/activation";

/** 迁回完成标记文件名(落在**归档目录**内;存在 = 该归档已处理过,一次性语义)。 */
export const PRESERVE_RESTORE_MARKER = ".preserve-restored.json";

// PRESERVE 表名 → drizzle 表对象(列交集/插入都经 schema 对象走,类型映射由 drizzle 承担,
// 不手拼 SQL)。单测锚死「registry 覆盖 PRESERVE_TABLES 全量」,清单加表忘了映射会先炸测试。
const TABLE_BY_NAME: Record<string, PgTable> = {
  users,
  sessions,
  user_preferences: userPreferences,
  model_configurations: modelConfigurations,
  agent_configurations: agentConfigurations,
  storage_configs: storageConfigs,
  skill_config_overrides: skillConfigOverrides,
  skill_config_override_versions: skillConfigOverrideVersions,
  activation_state: activationState,
};

/** 供单测断言「映射与清单同源」。 */
export function preserveTableRegistryNames(): string[] {
  return Object.keys(TABLE_BY_NAME);
}

export type RestoreTableStatus =
  | "restored" // 已从归档迁回 rows 行
  | "skipped-nonempty" // 新库该表已有数据(重试轮/用户已重配)→ 不覆盖
  | "skipped-missing" // 归档库里没有这张表(更老版本的归档)
  | "failed"; // 读/写失败(细节在 message;不阻断其余表)

export interface RestoreTableReport {
  table: string;
  status: RestoreTableStatus;
  rows: number;
  message?: string;
}

export interface WorkspaceRestoreReport {
  /** 本次迁回读取的归档目录(绝对路径)。 */
  archiveDir: string;
  tables: RestoreTableReport[];
  /** 全部表都非 failed(才落标记;false = 保留待重试)。 */
  ok: boolean;
}

/**
 * 找「待迁回」的归档库目录:扫 dataDir 同级的 `<basename>.archived-*`,取**最新**一个
 * (归档名带 UTC 时间戳 + 冲突后缀,字典序即时间序);已带迁回标记 → 无候选。
 * 目录不存在/不可读 → null(安静快路径,绝大多数启动只有一次 readdir)。
 */
export async function findPreserveRestoreCandidate(
  dataDir: string,
): Promise<string | null> {
  const parent = dirname(dataDir);
  const base = basename(dataDir);
  let names: string[];
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    names = entries
      .filter((e) => e.isDirectory() && e.name.startsWith(`${base}.archived-`))
      .map((e) => e.name)
      .sort();
  } catch {
    return null;
  }
  const newest = names.at(-1);
  if (!newest) return null;
  const archiveDir = join(parent, newest);
  try {
    await access(join(archiveDir, PRESERVE_RESTORE_MARKER));
    return null; // 已处理过(一次性)。
  } catch {
    return archiveDir;
  }
}

// 归档库里某表现存的列名集合(information_schema;归档可能是旧 schema)。
async function archiveColumns(
  client: PGlite,
  table: string,
): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
    [table],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

export interface RestoreOptions {
  /** 新库(已迁移完成)的落盘目录 —— 归档候选按它的同级目录扫。 */
  dataDir: string;
  /** 新库连接(buildPersistence 刚建好的那份;迁回须发生在 seed 之前)。 */
  db: Db;
  /** 日志注入(默认 console;测试可静音)。 */
  log?: (message: string) => void;
}

/**
 * 检测并执行 PRESERVE 表迁回。无候选 → null(快路径);有候选 → 逐表迁回并返回报告。
 * **绝不 throw**(失败诚实:日志 + 报告,不阻断启动)。
 */
export async function restorePreservedUserAssets(
  options: RestoreOptions,
): Promise<WorkspaceRestoreReport | null> {
  const log = options.log ?? ((m: string) => console.warn(m));
  let archiveDir: string | null = null;
  try {
    archiveDir = await findPreserveRestoreCandidate(options.dataDir);
  } catch {
    return null;
  }
  if (!archiveDir) return null;

  log(`[T-363] 检测到重置归档 ${archiveDir},开始迁回 user 级资产(PRESERVE 表)…`);

  // 打开归档库(同进程第二个 PGlite 实例,不同数据目录 → 不违反单写者)。打不开
  // (真损坏 / 跨版本读不了)→ 整体失败诚实:报告 + 不落标记,资产仍在归档目录。
  let archiveClient: PGlite;
  try {
    archiveClient = new PGlite(archiveDir);
    await archiveClient.waitReady;
    await archiveClient.query("SELECT 1");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(
      `[T-363] 归档库打不开(${message})—— 放弃迁回,资产完整保留在 ${archiveDir},可手工找回。`,
    );
    return {
      archiveDir,
      ok: false,
      tables: PRESERVE_TABLES.map((table) => ({
        table,
        status: "failed",
        rows: 0,
        message: `归档库打不开:${message}`,
      })),
    };
  }

  const archiveDb = drizzle(archiveClient);
  const reports: RestoreTableReport[] = [];
  try {
    for (const tableName of PRESERVE_TABLES) {
      const table = TABLE_BY_NAME[tableName];
      if (!table) {
        // registry 漏映射(单测锚死,理论到不了)—— 如实报失败,别静默丢表。
        reports.push({
          table: tableName,
          status: "failed",
          rows: 0,
          message: "PRESERVE 表未在迁回映射表登记(TABLE_BY_NAME)",
        });
        continue;
      }
      try {
        // ① 归档库有这张表吗(更老版本的归档可能没有)?
        const archCols = await archiveColumns(archiveClient, tableName);
        if (archCols.size === 0) {
          reports.push({ table: tableName, status: "skipped-missing", rows: 0 });
          continue;
        }
        // ② 幂等门:新库该表非空 → 跳过(不覆盖重试轮已迁回 / 用户重置后新写的数据)。
        const countRows = await options.db.select({ n: count() }).from(table);
        if (Number(countRows[0]?.n ?? 0) > 0) {
          reports.push({ table: tableName, status: "skipped-nonempty", rows: 0 });
          continue;
        }
        // ③ 列交集:只选归档里也存在的列(归档缺的新列 → 新库默认值)。
        const allCols = getTableColumns(table);
        const picked = Object.fromEntries(
          Object.entries(allCols).filter(([, col]) => archCols.has(col.name)),
        );
        if (Object.keys(picked).length === 0) {
          reports.push({ table: tableName, status: "skipped-missing", rows: 0 });
          continue;
        }
        const rows = await archiveDb.select(picked).from(table);
        if (rows.length === 0) {
          reports.push({ table: tableName, status: "restored", rows: 0 });
          continue;
        }
        // ④ 分批插入新库(表都很小,200/批只是稳妥上限)。
        for (let i = 0; i < rows.length; i += 200) {
          await options.db
            .insert(table)
            .values(rows.slice(i, i + 200) as never);
        }
        reports.push({ table: tableName, status: "restored", rows: rows.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`[T-363] 表 ${tableName} 迁回失败(${message})—— 跳过,数据仍在归档。`);
        reports.push({ table: tableName, status: "failed", rows: 0, message });
      }
    }
  } finally {
    await archiveClient.close().catch(() => {});
  }

  // [用户裁决 2026-07-06,与 reset-db.ts 同款] 重置后 profile 清回空白:登录身份/所属关系
  // 保留(id/passwordHash/sessions → 仍登录、配置行 user_id 仍对得上),但展示名/邮箱走
  // 新用户从零填。只清规范用户,避免多行 email='' 撞唯一索引。失败不致命(只影响展示)。
  const usersRestored = reports.some(
    (r) => r.table === "users" && r.status === "restored" && r.rows > 0,
  );
  if (usersRestored) {
    try {
      await options.db
        .update(users)
        .set({ displayName: "", email: "" })
        .where(eq(users.id, "user-zyongzhu"));
    } catch (err) {
      log(
        `[T-363] 清空规范用户 profile 失败(${err instanceof Error ? err.message : String(err)}),不影响迁回结果。`,
      );
    }
  }

  const ok = reports.every((r) => r.status !== "failed");
  const summary = reports
    .map((r) => `${r.table}:${r.status}${r.rows ? `(${r.rows}行)` : ""}`)
    .join(";");
  if (ok) {
    // 全部成功才落标记(一次性)。落不下(极端)也不致命:下次启动重跑,各表因非空跳过。
    try {
      await writeFile(
        join(archiveDir, PRESERVE_RESTORE_MARKER),
        JSON.stringify(
          { restoredAt: new Date().toISOString(), tables: reports },
          null,
          2,
        ),
        "utf8",
      );
    } catch (err) {
      log(
        `[T-363] 迁回标记写入失败(${err instanceof Error ? err.message : String(err)}),下次启动会按幂等门跳过已迁回表。`,
      );
    }
    log(`[T-363] user 级资产迁回完成:${summary}`);
  } else {
    log(
      `[T-363] user 级资产迁回**部分失败**(不落标记,下次启动重试):${summary}。` +
        `资产完整保留在 ${archiveDir}。`,
    );
  }
  return { archiveDir, tables: reports, ok };
}
