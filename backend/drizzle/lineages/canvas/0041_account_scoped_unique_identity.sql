-- =====================================================================================
-- [T-326 DATA-H02] 收藏与 topic preference 唯一键升级为「账号维度」。
--
-- 问题:favorites_folders (user_id, name) / favorites_items (user_id, aweme_id) /
-- topic_preferences (user_id, keyword, direction) 三个唯一键都是**用户级**——第二个抖音号
-- 登记同名收藏夹 / 收藏同一视频 / 蒸馏同关键词偏好时,会命中第一账号的行(upsert 改写)或
-- 被 onConflictDoNothing 静默吞掉,即"第二账号创建失败/复用/改写第一账号数据"。
--
-- 修法:唯一键加入 account_id 列,并用 **NULLS NOT DISTINCT**(PG 15+;装机 PGlite 0.2.x =
-- PG 16,docker-compose 用 postgres:16)让 account_id IS NULL 的行彼此也视为冲突——否则
-- PG 默认「多个 NULL 互不冲突」会让"未选号"路径(ctx.accountId 缺省 → stamp null)的 upsert
-- 落空、每次都新插平行行(0033 当年因此故意不含 account_id,本迁移用 NULLS NOT DISTINCT 根治)。
--
-- 存量安全论证:新键 (user_id, account_id, X) 是旧键 (user_id, X) 的**弱化**(列是超集)——
-- 任何满足旧唯一键的存量数据必然满足新键,建新索引不可能因存量数据失败。顺序上**先建新、
-- 后删旧**:若建新索引失败,旧约束仍在(不会出现无约束窗口)。全部 IF NOT EXISTS / IF EXISTS,
-- 幂等可重跑。
--
-- 语义取舍:存量 account_id IS NULL 的行按 NULLS NOT DISTINCT 归并为"未标记"这一个账号桶
-- (老数据不消失、不炸启动);账号选定后的新写入 stamp 真号,与 NULL 桶互不冲突 → 第二账号
-- 可以独立创建同名/同 aweme/同关键词的行。conflict target 同步改造见
-- candidate.repository.ts(upsertTopicPreference)与 favorites.repository.ts(createFolder /
-- recordItems)。
-- =====================================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity_v2
  ON favorites_folders (user_id, account_id, name) NULLS NOT DISTINCT;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_favorites_folders_identity;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity_v2
  ON favorites_items (user_id, account_id, aweme_id) NULLS NOT DISTINCT;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_favorites_items_identity;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity_v2
  ON topic_preferences (user_id, account_id, keyword, direction) NULLS NOT DISTINCT;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_topic_preferences_identity;
