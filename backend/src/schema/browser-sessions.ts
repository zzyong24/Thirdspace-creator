import { pgTable, text } from "drizzle-orm/pg-core";

// [T-370a] browser_sessions —— 浏览器登录态系统化(SPEC 2026-07-17 browser-session-pool §3.1)。
//
// 定位:web 域登录态(ChatGPT/GitHub 等 web-session 保管库)从「埋在 `.auth/web/<domain>`
//   persistent profile 目录」改为「**加密存进本表当单一真值**」;profile 池(T-370b)checkout
//   时按需注入、return 时回写。**抖音红线(SPEC §2.1):抖音登录态不进本表**——scope_kind
//   预留枚举扩展位但本期只 'web-domain',`.auth/douyin/<accountId>` per-account 专属不动。
//
// state_encrypted:playwright `context.storageState()` 全量 JSON(cookies + origins/localStorage),
//   **master-key(AES-256-GCM,同 settings 模型 key 的 secret-crypto)加密后落库**。
//   gate F-3:master-key 不可用 → 拒存人话错,**绝不明文落库**(不同于模型 key 的向后兼容
//   明文降级——cookie 是完整会话劫持材料);读侧解密失败 → 视为未登录(返 null,logged)。
//
// Ownership:user_id NOT NULL(写时从 ctx.userId stamp)。**无 account_id**:web 登录保管库
//   现状即用户级(域名维),不随抖音号切换(SPEC §3.1,语义不变)。
// 唯一键 (user_id, scope_kind, scope_key):同 user 同域一条,save 即 upsert。
//
// canonical 定义落 shared infra(@creatoros/backend)—— 迁移 0047 建表,db.ts schema 并入,
//   模块 browser-sessions.db-schema.ts 再 re-export(ONE source of truth,同 favorites)。

export const browserSessions = pgTable("browser_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界(域名维用户级,无 account_id)
  scopeKind: text("scope_kind").notNull().default("web-domain"), // 本期只 'web-domain'(抖音红线不进)
  scopeKey: text("scope_key").notNull(), // 域名(webDomainFromUrl 归一:小写、去 www.)
  stateEncrypted: text("state_encrypted").notNull(), // enc:v1: 前缀 AES-256-GCM 密文(storageState JSON)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL(参考/文档用;实际建表经版本化迁移 0047,同 favorites)。IF NOT EXISTS 幂等。
export const BROWSER_SESSIONS_DDL = `
CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL DEFAULT 'web-domain',
  scope_key TEXT NOT NULL,
  state_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_browser_sessions_identity ON browser_sessions (user_id, scope_kind, scope_key);
`;
