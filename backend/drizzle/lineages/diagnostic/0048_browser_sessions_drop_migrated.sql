-- =====================================================================================
-- [T-378] browser_sessions 脏行清理 —— T-370a 惰性迁移增殖回归的存量修复。
--
-- 根因:惰性迁移把旧 `.auth/web/<domain>` 目录改名归档为 `<domain>.migrated-<ts>`,而
-- listSessions 曾把该归档目录名当「域名」列出 → 设置页 sessionStatus 探针又对它触发
-- 「迁移→归档」→ 产出 `x.migrated-a.migrated-b` 嵌套目录,且以 `x.migrated-<ts>` 为
-- scope_key 写进本表(脏行)。代码侧已在 isSafeWebDomain 统一拒 `.migrated-`(增量不再
-- 产生);本迁移一次性删净存量脏行。合法域名永不含 `.migrated-`,删除零误伤;幂等。
-- =====================================================================================

DELETE FROM browser_sessions WHERE scope_key LIKE '%.migrated-%';
