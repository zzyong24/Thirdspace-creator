-- =====================================================================================
-- [T-370a] browser_sessions —— 浏览器登录态系统化(SPEC 2026-07-17 browser-session-pool §3.1)。
--
-- web 域登录态(ChatGPT/GitHub 等 web-session 保管库)的**单一真值**:playwright
-- `context.storageState()` 全量 JSON(cookies + origins/localStorage)经 master-key
-- (AES-256-GCM,同 settings 模型 key 的 secret-crypto)加密后落 state_encrypted。
-- profile 池(T-370b)checkout 时解密注入、return 时回写 —— 登录态不再依赖 profile
-- 目录活着(T-369「打不开」根治)。
--
-- 红线(SPEC §2.1):抖音登录态**不进本表**(scope_kind 预留扩展位,本期只 'web-domain';
-- `.auth/douyin/<accountId>` per-account persistent profile 抗风控现状零改动)。
-- gate F-3:master-key 不可用 → 应用层拒存,**绝不明文落库**;读侧解密失败视为未登录。
--
-- Ownership:user_id NOT NULL(ctx.userId stamp);无 account_id(web 保管库为用户级域名维,
-- 不随抖音号切换,语义不变)。唯一键 (user_id, scope_kind, scope_key) = save 即 upsert。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL DEFAULT 'web-domain',
  scope_key TEXT NOT NULL,
  state_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_browser_sessions_identity ON browser_sessions (user_id, scope_kind, scope_key);
