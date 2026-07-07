/**
 * reset-db.ts — 一键把本地库清回「干净新用户态」,供反复真机测试。
 *
 * 做什么:TRUNCATE public schema 里**全部内容表**(作品/项目/定位/账号/素材/知识库/
 * candidates/reviews/ai_tasks/采集/job_run…),RESTART IDENTITY 重置自增序列。
 * **保留**纯身份 + 配置表(登录/AI 模型 key/存储/技能覆盖),所以清完你**仍是登录态、
 * AI 仍配好**,不用每次重登 + 重配 key。drizzle 迁移元表在 `drizzle` schema,天然不受影响。
 *
 * 清完:重启 dev server → `buildPersistence` 会把基线 seed(金句知识库 + 默认审核规则)
 * 重新灌回空表 =「已登录 + AI 已配 + 其余全空」的干净新用户态。
 *
 * 用法:
 *   pnpm db:reset --yes           # 清库(保留登录/AI),留抖音扫码登录态
 *   pnpm db:reset --yes --auth    # 连抖音扫码登录态(frontend/.auth/douyin)一起清 → 强制重扫
 *
 * 安全:不加 --yes 只打印计划、不动任何数据(防手滑);用 session_replication_role=replica
 * 精确只清内容表,绝不误伤保留表;清完复核 users/model_configurations 仍在。
 */
import { Pool } from "pg";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const CONFIRM = argv.includes("--yes") || argv.includes("-y");
const CLEAR_AUTH = argv.includes("--auth");

const url =
  process.env.DATABASE_URL ??
  "postgresql://creatoros:creatoros@localhost:5432/creatoros";
const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");

// 保留:纯身份 + 配置(清库后仍能直接用,不用重登/重配 AI key)。其余全清。
const PRESERVE = new Set([
  "users", // 登录身份
  "sessions", // 保持登录态(免重登)
  "user_preferences", // 用户偏好/设置
  "model_configurations", // AI 模型 + key(免每次重配)
  "agent_configurations", // AI agent 路由配置
  "storage_configs", // 对象存储配置(blob 路由可用)
  "skill_config_overrides", // 技能/prompt 覆盖配置
  "activation_state", // T-147 P5 一机一码激活态(清库不清激活,免每次重激活)
]);

const pool = new Pool({ connectionString: url });
let exitCode = 0;

try {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const all = rows.map((r) => r.tablename);
  if (all.length === 0) {
    console.error(
      "✗ public schema 里没有表 —— 库没迁移过?先 pnpm db:up && pnpm db:migrate。",
    );
    exitCode = 1;
  } else {
    const wipe = all.filter((t) => !PRESERVE.has(t));
    const preserved = all.filter((t) => PRESERVE.has(t));

    console.log(`\n目标库: ${masked}`);
    console.log(
      `保留 ${preserved.length} 张(身份+配置): ${preserved.join(", ")}`,
    );
    console.log(`将清空 ${wipe.length} 张内容表。`);
    if (CLEAR_AUTH) {
      console.log("并清抖音扫码登录态: frontend/.auth/douyin(强制重扫)。");
    }

    if (!CONFIRM) {
      console.log(
        "\n⚠️  破坏性操作(清空所有内容数据)。未加 --yes → 已中止,未改动任何数据。",
      );
      console.log("确认清空,请运行:  pnpm db:reset --yes\n");
      // 中止是「预览计划」而非错误:exit 0,避免 pnpm 把它包装成 ERR_PNPM 吓人。
      exitCode = 0;
    } else {
      // 单连接内跑:关 FK 触发(replica)→ 精确只清内容表(RESTART IDENTITY 重置自增),
      // 不 CASCADE、不误伤保留表 → 再恢复 origin。creatoros docker 用户是 superuser,可设。
      const client = await pool.connect();
      try {
        const list = wipe.map((t) => `"${t}"`).join(", ");
        await client.query("SET session_replication_role = replica");
        await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY`);
        // [用户裁决 2026-07-06] 用户属性不 seed:保留的登录用户 profile 也清回空白
        // (id/passwordHash/sessions 保留 → 仍登录;display_name/email 空 → 新用户从零填,
        // 与 seedCanonicalUser 的 blank 一致)。只清规范用户,避免多行 email='' 撞唯一索引。
        await client.query(
          "UPDATE users SET display_name = '', email = '' WHERE id = 'user-zyongzhu'",
        );
        await client.query("SET session_replication_role = origin");
      } finally {
        client.release();
      }

      // 安全网:复核保留表没丢(users / model_configurations 应仍在)。
      const { rows: chk } = await pool.query<{ users: string; models: string }>(
        "select (select count(*) from users)::text as users, (select count(*) from model_configurations)::text as models",
      );
      const usersLeft = Number(chk[0]?.users ?? "0");
      const modelsLeft = Number(chk[0]?.models ?? "0");

      console.log(`\n✅ 已清空 ${wipe.length} 张内容表(身份+配置保留)。`);
      console.log(
        `   复核:users=${usersLeft} 行、model_configurations=${modelsLeft} 行(应 >0)。`,
      );
      if (usersLeft === 0) {
        console.warn(
          "⚠️  users 被清空了 —— 重启后会 re-seed「创作者」,但你需重新登录/填名。",
        );
      }

      if (CLEAR_AUTH) {
        const here = dirname(fileURLToPath(import.meta.url));
        const authDir = resolve(here, "../../frontend/.auth/douyin");
        await rm(authDir, { recursive: true, force: true });
        console.log(`✅ 已清抖音扫码登录态(${authDir})。`);
      }

      console.log("\n下一步:");
      console.log(
        "  1) 重启 dev server → buildPersistence 自动把基线 seed(金句 + 默认审核规则)灌回。",
      );
      console.log(
        "  2) 账号页扫码绑你的抖音号 → 自动化跑「拉取作品」导入。",
      );
      console.log(
        "提示:上传过的 blob 字节仍在 MinIO(无 DB 引用=无害孤儿);要连它一起删可 `pnpm db:down && docker volume rm creatoros_creatoros-miniodata`(或 down -v 连库一起,需重迁移)。\n",
      );
    }
  }
} finally {
  await pool.end();
}

process.exit(exitCode);
