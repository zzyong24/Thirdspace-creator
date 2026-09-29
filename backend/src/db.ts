import * as executionStreamSchema from "./schema/execution-stream";
import * as pendingDocumentCommitsSchema from "./schema/pending-document-commits";
import * as pendingGeneratedAssetCommitsSchema from "./schema/pending-generated-asset-commits";
import * as creativeCanvasSchema from "./schema/creative-canvas";
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
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
import * as favoritesSchema from "./schema/favorites";
// [T-235d] 正向归因回流(选题验证库)。
import * as topicAttributionSchema from "./schema/topic-attribution";
// T-147 P5 桌面激活授权(activation_state 一机一码激活态)。
import * as activationSchema from "./schema/activation";
// [T-370a] 浏览器登录态系统化(web 域 storageState 加密单一真值;抖音红线不进)。
import * as browserSessionsSchema from "./schema/browser-sessions";
// T-482 内容情报唯一真值 + 通用持久任务租约。
import * as intelligenceSchema from "./schema/intelligence";
import * as executionBrowserProfileLeasesSchema from "./schema/execution-browser-profile-leases";
import * as proposalAdoptionsSchema from "./schema/proposal-adoptions";
import * as cliInvocationsSchema from "./schema/cli-invocations";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { dirname, resolve, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { rename } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

// Versioned migrations live in backend/drizzle (baseline 0000_init derived from the
// per-module *_DDL). The pglite (tests) and node-postgres (runtime) migrators apply this
// ONE folder, so test and runtime schemas share a single source.
const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

// 部分旧装机的迁移 journal 已越过 0101，但实际未建画布表。只在缺表时重放
// 0101 的幂等 DDL；沿用迁移文件本身，避免运行时和版本化迁移出现两份定义。
async function ensureCreativeCanvasSchema(db: Db): Promise<void> {
  const result = await db.execute(sql.raw(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('creative_canvases', 'canvas_generation_links', 'canvas_agent_proposals')",
  ));
  if (result.rows.length === 3) return;
  const migration = readFileSync(join(MIGRATIONS_FOLDER, "0101_creative_canvas.sql"), "utf8");
  const statements = migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);
  await db.transaction(async (tx) => {
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
}

// Shared DDL/schema union applied at every createDb(). Each module's tables join
// here as they land (foundation §1: one pglite store, shared db factory).
const schema = {
  ...pendingDocumentCommitsSchema,
  ...pendingGeneratedAssetCommitsSchema,
  ...creativeCanvasSchema,
  ...executionStreamSchema,
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
  ...favoritesSchema,
  ...topicAttributionSchema,
  ...activationSchema,
  ...browserSessionsSchema,
  ...intelligenceSchema,
  ...cliInvocationsSchema,
  ...proposalAdoptionsSchema,
  ...executionBrowserProfileLeasesSchema,
};

export type Db = PgliteDatabase<typeof schema>;

export interface CreateDbOptions {
  // Omit for an in-memory db (tests); pass a directory path for durable storage
  // that survives process restarts (dev/prod).
  dataDir?: string;
}

// [DATA-H09] file-PGlite 启动失败的**两阶段**判据 —— 只有「真库损坏」才隔离+重建,迁移/
// 权限/磁盘错误一律如实上抛(见 createDb 注释)。
//
// 文件系统/OS 级错误码 —— 权限不足 / 磁盘满 / 只读 / 资源耗尽等。这些**不是**「库损坏」:
// 改名+空库既治不了(下次同样失败),又会把用户以为丢了的数据藏进 .corrupt-*。见到就如实
// 上抛,绝不隔离原目录。Node 系统错误在 `.code` 上带 errno 名;PGlite 的 NodeFS 后端把底层
// fs 错误透传时通常保留该 code,而 WASM 引擎自身崩溃(真损坏)抛的是无 code 的 RuntimeError。
const FS_ACCESS_ERROR_CODES = new Set([
  "EACCES", // 权限拒绝
  "EPERM", // 操作不允许
  "EROFS", // 只读文件系统
  "ENOSPC", // 磁盘/inode 满
  "EDQUOT", // 超配额
  "EMFILE", // 进程 fd 耗尽
  "ENFILE", // 系统 fd 耗尽
  "EBUSY", // 目录/文件被占用
  "ETXTBSY", // 文本文件忙
  "EISDIR", // 期望文件却是目录
  "ENOTDIR", // 期望目录却是文件
]);

// 判「打开阶段的失败是否为 OS 级(权限/磁盘/资源)错误」。是 → 不是库损坏,不隔离。
export function isFilesystemAccessError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && FS_ACCESS_ERROR_CODES.has(code);
}

// 打开阶段的探针:一条最廉价的 query,强制 WASM 引导 / crash-recovery 真的跑完(见 openPglite)。
const DB_OPEN_PROBE_SQL = "SELECT 1";

// 「打开阶段」:实例化 PGlite 并**强制触发** WASM 引导 / crash-recovery。真正的库损坏
// (pg_control 缺失、文件头损坏、跨版本读不了)在这一步以 `RuntimeError: Aborted()` 一类抛出。
// waitReady + 一条探针 query 双保险,确保引导真的跑完 —— 否则损坏会拖到迁移阶段才暴露,被
// createDb 误判成「迁移错误」而放过(反之亦然,阶段必须泾渭分明,DATA-H09 的关键)。
async function openPglite(dataDir?: string): Promise<PGlite> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  try {
    await client.waitReady;
    await client.query(DB_OPEN_PROBE_SQL);
    return client;
  } catch (err) {
    // 半开的 client 可能已占着目录 —— 关掉释放句柄(自身也可能因 WASM 已 abort 再抛,吞掉)。
    await client.close().catch(() => {});
    throw err;
  }
}

// 「迁移阶段」:对**已成功打开**的库跑版本化迁移 + 历史装机的列兜底。这里的任何失败都是
// **迁移 SQL / 权限 / 磁盘**错误 —— 库其实完好、数据都在。故本阶段错误由 createDb 如实上抛,
// **永不**改名 + 空库(那才是 DATA-H09 报告里「数据全没了」的错误路径)。
async function migrateOpenedDb(client: PGlite): Promise<Db> {
  const db = drizzle(client, { schema });
  // Apply the same versioned migrations the runtime uses. pglite is Postgres-WASM, so the
  // baseline drizzle/0000_init.sql is identical across drivers. Replaces the old
  // per-module client.exec(*_DDL) sequence — the schema is now built by the migration.
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await ensureCreativeCanvasSchema(db);
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
    // [T-235d-distill fixup] 同款兜底:老 pglite 无 favorites_items 蒸馏链三列(0039 前装机),
    // migrator 若因 journal 不同步没跑 0039 → 收藏夹蒸馏链读写报「column 不存在」。缺就补(幂等)。
    const favDistillColCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'favorites_items' AND column_name = 'distill_status') AS exists",
    );
    if (!favDistillColCheck.rows[0]?.exists) {
      await client.exec(
        "ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS transcript TEXT",
      );
      await client.exec(
        "ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS distill_status TEXT",
      );
      await client.exec(
        "ALTER TABLE favorites_items ADD COLUMN IF NOT EXISTS distill_result JSONB NOT NULL DEFAULT '{}'::jsonb",
      );
      await client.exec(
        "CREATE INDEX IF NOT EXISTS ix_favorites_items_distill ON favorites_items (user_id, distill_status)",
      );
    }
    // [T-326 DATA-H02 fixup] 同款兜底:老装机若因 journal 不同步没跑 0041(账号维度唯一键),
    // 代码侧 onConflict target 已改为含 account_id → PG 报「no unique or exclusion constraint
    // matching the ON CONFLICT specification」。缺 _v2 索引就补(先建新后删旧,与 0041 同序、幂等)。
    const acctUxCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_topic_preferences_identity_v2') AS exists",
    );
    if (!acctUxCheck.rows[0]?.exists) {
      await client.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity_v2 ON favorites_folders (user_id, account_id, name) NULLS NOT DISTINCT",
      );
      await client.exec("DROP INDEX IF EXISTS ux_favorites_folders_identity");
      await client.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity_v2 ON favorites_items (user_id, account_id, aweme_id) NULLS NOT DISTINCT",
      );
      await client.exec("DROP INDEX IF EXISTS ux_favorites_items_identity");
      await client.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity_v2 ON topic_preferences (user_id, account_id, keyword, direction) NULLS NOT DISTINCT",
      );
      await client.exec("DROP INDEX IF EXISTS ux_topic_preferences_identity");
    }
  return db;
}

// Creates a pglite-backed Drizzle db with the Projects-slice schema applied.
// pglite is pure-WASM Postgres — runs in Node, vitest, and the Next server with
// no Docker. Returns the db plus the underlying client for raw exec/teardown.
//
// [T-175 / DATA-H09] 打不开落盘目录的降级,**精确收窄触发条件**:
//
//   旧版/异常退出留下的 PGlite 数据目录,被新构建打开时可能 WASM `Aborted()`
//   (crash-recovery / 跨版本读不了)—— 这才是「真库损坏」,可 catch、同进程可重建新实例。
//   故对**真损坏**:把坏目录移到 `<dir>.corrupt-<ts>`(保留、不删,可人工恢复)后全新初始化,
//   让 app 能启动而不是每页 500(升级路径 bug 的根治)。
//
//   但**迁移 SQL 错 / 权限不足 / 磁盘满**等**不是**库损坏 —— 库其实完好、数据都在。老实现
//   把这些也一并当损坏 → 改名 + 空库 → 用户表现为「数据全没了」且无恢复入口(DATA-H09)。
//   现在按**阶段**精确区分:
//     · 打开阶段(openPglite:WASM 引导 / crash-recovery)失败 → 可能是真损坏,**但**若错误
//       是 OS 级(权限/磁盘/资源,`.code` ∈ FS_ACCESS_ERROR_CODES)则仍不算损坏 → 如实上抛;
//       否则(WASM Aborted / 文件头损坏一类)才隔离 + 重建。
//     · 迁移阶段(migrateOpenedDb:库已成功打开后跑迁移/列兜底)失败 → **一律**如实上抛,
//       绝不改名 + 空库(库已打开,数据完好,是可修复的迁移/环境错误)。
//   内存库(无 dataDir)不可能"损坏"、也无目录可隔离 → 任何失败直接上抛。
export async function createDb(options: CreateDbOptions = {}): Promise<{
  db: Db;
  client: PGlite;
}> {
  const dataDir = options.dataDir;

  // ── 打开阶段 ────────────────────────────────────────────────────────────────
  let client: PGlite;
  try {
    client = await openPglite(dataDir);
  } catch (openErr) {
    // 内存库无目录可隔离、不可能损坏 —— 直接上抛。
    if (!dataDir) throw openErr;
    // 权限/磁盘/资源类 OS 错误:不是库损坏。改名 + 空库既治不了下次启动,又把数据藏进
    // .corrupt-* 误导用户 —— 如实上抛以便定位修复(改权限 / 清磁盘)。原数据分毫未动。
    if (isFilesystemAccessError(openErr)) {
      const e = openErr as Error & { code?: string };
      console.error(
        `[db] PGlite 落盘目录打开失败,但判定为**非库损坏**(OS 错误 code=${e?.code};权限/磁盘/资源一类)。` +
          `不隔离、不重建,如实上抛以便修复。原数据完好保留。`,
      );
      throw openErr;
    }
    // 真库损坏(WASM Aborted / 文件头损坏 / crash-recovery 失败)→ 隔离坏目录 + 全新初始化。
    return quarantineAndRebuild(dataDir, openErr);
  }

  // ── 迁移阶段 ────────────────────────────────────────────────────────────────
  try {
    const db = await migrateOpenedDb(client);
    return { db, client };
  } catch (migErr) {
    // 半开的 client 关掉释放句柄。库已成功打开 → 这**不是**损坏:如实上抛,绝不隔离 + 空库。
    await client.close().catch(() => {});
    const e = migErr as Error & { code?: string };
    console.error(
      `[db] PGlite 迁移阶段失败(${e?.name}: ${e?.message}${e?.code ? `, code=${e.code}` : ""})。` +
        `库已成功打开 → 这**不是**库损坏,常见为迁移 SQL / 权限 / 磁盘错误,数据完好。` +
        `不隔离、不重建,如实上抛以便修复。`,
    );
    throw migErr;
  }
}

// 真损坏降级:把坏目录改名保留(可人工恢复)后,在原路径全新初始化一个空库(打开 + 迁移)。
// 连改名都失败(权限/占用)→ 无法安全降级,把原始损坏错误上抛(别吞根因)。
async function quarantineAndRebuild(
  dataDir: string,
  cause: unknown,
): Promise<{ db: Db; client: PGlite }> {
  const quarantine = `${dataDir}.corrupt-${Date.now()}`;
  const e = cause as Error;
  console.error(
    `[db] PGlite 落盘目录**损坏**打不开(${e?.name}: ${e?.message});移至 ${quarantine} 并全新初始化。原数据保留可人工恢复。`,
  );
  try {
    await rename(dataDir, quarantine);
  } catch (mvErr) {
    console.error(`[db] 隔离坏目录失败,放弃降级:`, mvErr);
    throw cause;
  }
  const client = await openPglite(dataDir);
  const db = await migrateOpenedDb(client);
  return { db, client };
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
  await ensureCreativeCanvasSchema(db as unknown as Db);
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
