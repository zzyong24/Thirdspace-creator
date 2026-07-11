import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as projectsSchema from "./schema/projects";
import * as identitySchema from "./schema/identity";
import * as taxonomySchema from "./schema/taxonomy";
import * as notificationsSchema from "./schema/notifications";
import * as searchSchema from "./schema/search";
import * as settingsSchema from "./schema/settings";
import * as knowledgeSchema from "./schema/knowledge";
import * as assetsSchema from "./schema/assets";
import * as artifactsSchema from "./schema/artifacts";
import * as productionSchema from "./schema/production";
import * as publishingSchema from "./schema/publishing";
import * as analyticsSchema from "./schema/analytics";
import * as ingestionSchema from "./schema/ingestion";
import * as reviewsSchema from "./schema/reviews";
// T-086 审核门(review_rules + script_review_reports)。
import * as reviewGateSchema from "./schema/review-gate";
import * as learningsSchema from "./schema/learnings";
import * as aiSchema from "./schema/ai";
import * as positioningSchema from "./schema/positioning";
// [T-052 裁决③] monetizationSchema 已随变现中心物理删除(宪法 §8);
// 迁移基线里的 products 等表留存无害,schema 联合不再覆盖它们。
import * as candidateSchema from "./schema/candidate";
import * as calibrationSchema from "./schema/calibration";
import * as platformAccountSchema from "./schema/platform-account";
import * as contentCalendarSchema from "./schema/content-calendar";
import * as materialLinksSchema from "./schema/material-links";
import * as schedulingSchema from "./schema/scheduling";
// [T-212a] 对标源 + 对标作品(选题/对标强化)。
import * as benchmarkSchema from "./schema/benchmark";
// [T-235b] 通用网页信源(热点多源证据)。
import * as trendSourcesSchema from "./schema/trend-sources";
// T-147 P5 桌面激活授权(activation_state 一机一码激活态)。
import * as activationSchema from "./schema/activation";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { rename } from "node:fs/promises";

// Versioned migrations live in backend/drizzle (baseline 0000_init derived from the
// per-module *_DDL). The pglite (tests) and node-postgres (runtime) migrators apply this
// ONE folder, so test and runtime schemas share a single source.
const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

// Shared DDL/schema union applied at every createDb(). Each module's tables join
// here as they land (foundation §1: one pglite store, shared db factory).
const schema = {
  ...projectsSchema,
  ...identitySchema,
  ...taxonomySchema,
  ...notificationsSchema,
  ...searchSchema,
  ...settingsSchema,
  ...knowledgeSchema,
  ...assetsSchema,
  ...artifactsSchema,
  ...productionSchema,
  ...publishingSchema,
  ...analyticsSchema,
  ...ingestionSchema,
  ...reviewsSchema,
  ...reviewGateSchema,
  ...learningsSchema,
  ...aiSchema,
  ...positioningSchema,
  ...candidateSchema,
  ...calibrationSchema,
  ...platformAccountSchema,
  ...contentCalendarSchema,
  ...materialLinksSchema,
  ...schedulingSchema,
  ...benchmarkSchema,
  ...trendSourcesSchema,
  ...activationSchema,
};

export type Db = PgliteDatabase<typeof schema>;

export interface CreateDbOptions {
  // Omit for an in-memory db (tests); pass a directory path for durable storage
  // that survives process restarts (dev/prod).
  dataDir?: string;
}

// 打开 PGlite(内存或落盘)并把版本化迁移跑齐。抛错(含 WASM `Aborted()`)时先关掉半开
// 的 client 释放句柄,再上抛 —— 让 createDb 的降级层决定是否隔离数据目录后重来。
async function openAndMigrate(dataDir?: string): Promise<{
  db: Db;
  client: PGlite;
}> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  try {
    const db = drizzle(client, { schema });
    // Apply the same versioned migrations the runtime uses. pglite is Postgres-WASM, so the
    // baseline drizzle/0000_init.sql is identical across drivers. Replaces the old
    // per-module client.exec(*_DDL) sequence — the schema is now built by the migration.
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    // [T-033 fixup] 老 pglite(< 2026-07-08 build 前的 .dmg 装的)schema 不带 publications.platform_status 列,
    // 旧 journal 也没记 0029 → migrator 不会跑 → 启动 SSR list 报「column 不存在」500。
    // 这里用 information_schema 查列存不存在,缺就 ALTER TABLE 加(IF NOT EXISTS 兜幂等)。
    // 不动 journal(保留 migrator 单一真源),这是 T-033 加列后的启动兼容层。
    const colCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'publications' AND column_name = 'platform_status') AS exists",
    );
    if (!colCheck.rows[0]?.exists) {
      await client.exec(
        "ALTER TABLE publications ADD COLUMN IF NOT EXISTS platform_status TEXT",
      );
    }
    // [T-200 fixup] 同款兜底:老 pglite 无 scheduled_job.account_id 列(0030 前的装机),
    // migrator 若因 journal 不同步没跑 0030 → 建/读 job 报「column 不存在」。缺就补(幂等)。
    const acctColCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_job' AND column_name = 'account_id') AS exists",
    );
    if (!acctColCheck.rows[0]?.exists) {
      await client.exec(
        "ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS account_id TEXT",
      );
    }
    // [T-201b fixup] 同款兜底:老 pglite 无 platform_accounts.external_account_id 列(0031 前装机),
    // migrator 若因 journal 不同步没跑 0031 → 身份解析读该列报「column 不存在」。缺就补(幂等);
    // 并把旧 handle 唯一索引换成 sec_uid 身份唯一(与 0031 一致,幂等 DROP/CREATE IF)。
    const extColCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_accounts' AND column_name = 'external_account_id') AS exists",
    );
    if (!extColCheck.rows[0]?.exists) {
      await client.exec(
        "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS external_account_id TEXT",
      );
      await client.exec("DROP INDEX IF EXISTS platform_accounts_handle_ux");
      await client.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_external_ux ON platform_accounts(user_id, platform, external_account_id)",
      );
    }
    return { db, client };
  } catch (err) {
    // client 可能已半开占着目录 —— 关掉(自身也可能因 WASM 已 abort 再抛,吞掉)。
    await client.close().catch(() => {});
    throw err;
  }
}

// Creates a pglite-backed Drizzle db with the Projects-slice schema applied.
// pglite is pure-WASM Postgres — runs in Node, vitest, and the Next server with
// no Docker. Returns the db plus the underlying client for raw exec/teardown.
//
// [T-175] 打不开落盘目录的降级:旧版/异常退出留下的 PGlite 数据目录,被新构建打开时可能
// WASM `Aborted()`(crash-recovery/跨版本读不了)。实测该 abort 是可 catch 的 rejection、
// 且同进程内可重建新实例。故:落盘库打开失败 → 把坏目录移到 `<dir>.corrupt-<ts>`(保留、
// 不删,可人工恢复)后全新初始化,让 app 能启动而不是每页 500(升级路径 bug 的根治)。
// 内存库(无 dataDir)不可能"损坏" → 直接上抛。
export async function createDb(options: CreateDbOptions = {}): Promise<{
  db: Db;
  client: PGlite;
}> {
  const dataDir = options.dataDir;
  try {
    return await openAndMigrate(dataDir);
  } catch (err) {
    if (!dataDir) throw err;
    const quarantine = `${dataDir}.corrupt-${Date.now()}`;
    const e = err as Error;
    console.error(
      `[db] PGlite 落盘目录打不开(${e?.name}: ${e?.message});移至 ${quarantine} 并全新初始化。原数据保留可人工恢复。`,
    );
    try {
      await rename(dataDir, quarantine);
    } catch (mvErr) {
      // 连移开都失败(权限/占用)→ 无法安全降级,把原始错误上抛(别吞根因)。
      console.error(`[db] 隔离坏目录失败,放弃降级:`, mvErr);
      throw err;
    }
    return await openAndMigrate(dataDir);
  }
}

export interface RuntimeDb {
  db: Db;
  pool: Pool;
}

// Runtime (dev/prod) db over a REAL Postgres via node-postgres. Reads DATABASE_URL,
// applies the versioned migrations, returns a Drizzle db typed as the shared `Db`. The
// node-postgres and pglite query APIs are identical at the PgDatabase level, so the single
// localized cast here lets every repo stay typed against one `Db`. Caller owns pool.end().
export async function createRuntimeDb(
  options: { connectionString?: string } = {},
): Promise<RuntimeDb> {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "createRuntimeDb: DATABASE_URL is not set (see .env.local / docker-compose.yml).",
    );
  }
  const pool = new Pool({ connectionString });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, pool };
}

// ── L0 本地优先存储:运行时 driver 选择(SPEC §4.1/§7-L0)──────────────────────
//
// 三态优先级(从高到低):
//   1. DATABASE_URL        → docker/远程 真 Postgres(node-postgres)。多用户/云部署。
//   2. PGLITE_DATA_DIR      → file-backed PGlite 落盘(Postgres-WASM 持久化到本地目录)。
//   3. 内存 PGlite          → 仅 测试/无配置兜底(重启即丢)。
//
// 本地优先默认:runtime(非测试)既无 DATABASE_URL 也无 PGLITE_DATA_DIR 时,
// **不退内存**(内存重启丢数据),而是落盘到默认目录(CREATOROS_DB_DIR 或
// <cwd>/.data/pglite),让"零 docker 起 app"开箱即持久。
// 测试路径(NODE_ENV=test / VITEST)保持内存 PGlite —— 不落盘、不拖慢、可复现。
export type DbDriverKind = "postgres" | "file-pglite" | "memory-pglite";

export interface ResolvedDbDriver {
  kind: DbDriverKind;
  // postgres: 连接串;file-pglite: 落盘目录(已解析为绝对路径);memory: undefined。
  target?: string;
}

export interface ResolveDbDriverOptions {
  // 注入式 env / cwd(默认读真 process.* —— 测试可传桩,避免依赖全局环境)。
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

// file-PGlite 缺省落盘目录(env 未配时):`~/.creatoros/db`(SPEC §4.1)。本机私有数据,
// 与 .auth/ 同位面、不埋在 frontend 子目录、随仓库移动不丢。`PGLITE_DATA_DIR` 可覆盖。
// ⚠️ PGlite 单连接独占该目录:同一落盘目录仅单进程开。若未来起独立 worker 进程(如 T-007
// 调度)直连 file-pglite,须共享同进程,否则回退 docker-PG(env `DATABASE_URL` 一键切)。
// 入参 cwd 保留以兼容签名 + 作极端无 home 时的兜底。
export function defaultPgliteDataDir(cwd: string): string {
  const home = homedir();
  return home ? join(home, ".creatoros", "db") : join(cwd, ".data", "pglite");
}

// 把可能为 `~`/相对 的 PGLITE_DATA_DIR 解析为绝对路径(PGlite 按字面路径建目录)。
function resolveDataDir(raw: string, cwd: string): string {
  const v = raw.trim();
  if (v === "~") return homedir();
  if (v.startsWith("~/") || v.startsWith("~\\")) {
    return join(homedir(), v.slice(2));
  }
  return isAbsolute(v) ? v : resolve(cwd, v);
}

// 纯函数:据 env/cwd 决定该用哪条 driver(无副作用,便于单测优先级矩阵)。
export function resolveDbDriver(
  options: ResolveDbDriverOptions = {},
): ResolvedDbDriver {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  // 1) 真 Postgres 最高优先 —— 用户当前 dev(docker-PG + 71 作品)走这条,保持不变。
  const url = env.DATABASE_URL?.trim();
  if (url) return { kind: "postgres", target: url };

  const isTest = env.NODE_ENV === "test" || Boolean(env.VITEST);

  // 2) 显式配置 file-backed PGlite 落盘目录。
  const dir = env.PGLITE_DATA_DIR?.trim();
  if (dir) {
    return { kind: "file-pglite", target: resolveDataDir(dir, cwd) };
  }

  // 3a) 测试/vitest:内存 PGlite(不落盘、可复现)。
  if (isTest) return { kind: "memory-pglite" };

  // 3b) 本地优先默认:runtime 无任何 DB 配置 → 落盘到 CREATOROS_DB_DIR 或默认目录,
  //     而非内存(重启即丢)。这就是"零 docker 起 app 即持久"。
  const overrideDir = env.CREATOROS_DB_DIR?.trim();
  return {
    kind: "file-pglite",
    target: overrideDir
      ? resolveDataDir(overrideDir, cwd)
      : defaultPgliteDataDir(cwd),
  };
}

// 统一的运行时 db 工厂:据 resolveDbDriver 起对应 driver,返回 db + 归一的 dispose
// + 该次实际选中的 driver 元信息(供 composition root 决定 id/clock 是否要 process-unique,
// 并打一行可观测日志)。postgres → pool.end();pglite(file/memory)→ client.close()。
export interface ConfiguredDb {
  db: Db;
  driver: ResolvedDbDriver;
  // 归一释放:让调用方无需关心底层是 pg pool 还是 pglite client。
  dispose: () => Promise<void>;
}

export async function createConfiguredDb(
  options: ResolveDbDriverOptions = {},
): Promise<ConfiguredDb> {
  const driver = resolveDbDriver(options);
  if (driver.kind === "postgres") {
    const { db, pool } = await createRuntimeDb({
      connectionString: driver.target,
    });
    return { db, driver, dispose: () => pool.end() };
  }
  // file-pglite(driver.target 为落盘目录)/ memory-pglite(无 target)。
  const { db, client } = await createDb({ dataDir: driver.target });
  return { db, driver, dispose: () => client.close() };
}

export { schema };
