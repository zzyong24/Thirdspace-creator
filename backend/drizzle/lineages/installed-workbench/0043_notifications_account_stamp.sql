-- =====================================================================================
-- [T-332 S2] 通知账号域 stamp(SPEC 2026-07-15 account-full-isolation §3.2 争议点 C-02)。
--
-- notifications.account_id **保持 nullable——全仓唯一例外,且是设计语义,非存量兼容**:
--   - NULL      = 系统级通知(激活到期/版本更新等,与号无关),全局所有号可见;
--   - 非 NULL   = 账号域事件通知(采集失败/任务完成等),stamp 发起 ctx 的当前号。
-- 读语义(repository 落地):有号 ctx → `account_id = 当前号 OR account_id IS NULL`
-- (当前号 + 系统级;全仓唯一允许的 OR-NULL);无号 ctx → 只见 `account_id IS NULL`。
-- 通知是 user 级表(§3.3),写路径不上 AccountRequiredError(0 号也要能收系统通知)。
--
-- 幂等可重跑:ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
-- =====================================================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS account_id TEXT;
--> statement-breakpoint

-- 有号视角的列表/未读计数走 (user_id, account_id, created_at) 收窄。
CREATE INDEX IF NOT EXISTS notifications_user_account_created_ix ON notifications(user_id, account_id, created_at);
