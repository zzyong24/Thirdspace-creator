-- =====================================================================================
-- [T-201b] 账号身份解耦:治锚点漂移 Bug-2。
--
-- 根因:platform_accounts 身份唯一键挂**可变** account_handle
--   (UNIQUE(user_id, platform, account_handle))。绑定用占位「我的抖音」建号,之后
--   updateAccountHandle 把 handle 改成真实昵称;下次绑定再 ensureAccount(占位)找不到
--   → 冒第二个号 / 身份跟着昵称漂移。
-- 修:身份键换成稳定的 external_account_id(抖音 sec_uid);account_handle 降级为**可编辑
--   显示名**(display_name 语义:可改、非唯一)。
--
-- 权威设计:docs/superpowers/specs/2026-07-10-immutable-account-anchor-design.md §2.2 / §3 T-201b。
--
-- 「改列名 vs 保留列名换语义」取舍:**保留物理列名 account_handle,只换语义**。
--   理由:物理改列名为 display_name 会波及 repo 查询 / DTO mapper / 契约字段 accountHandle
--   (前端 account-manager 消费)/ 全套单测 + 迁移里数据搬列,零功能收益。SPEC §2.2 明确允许
--   保留物理列名。故本迁移只:①加 external_account_id ②回填 ③换唯一约束(旧 handle 唯一退役)。
--   account_handle 保持 NOT NULL(占位/昵称恒有值,契约字段 z.string() 不动);「非唯一/可改」
--   由「删旧 handle 唯一索引」达成,「可空」非必需故不动。
--
-- additive / 幂等 / 只动本 user:
--   - ADD COLUMN IF NOT EXISTS(nullable,稳定终态);回填仅 WHERE external_account_id IS NULL。
--   - DROP INDEX IF EXISTS 旧唯一 → CREATE UNIQUE INDEX IF NOT EXISTS 新唯一,可重跑。
--   - 回填不到 sec_uid 的存量号 external_account_id=NULL:PG 里多个 NULL 不冲突,可共存
--     (绑定不被新唯一挡;身份解析退化到「复用任一 active 号」——单号现实安全)。
-- =====================================================================================

-- ① 加列:external_account_id(抖音 sec_uid;nullable)。幂等。
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS external_account_id TEXT;
--> statement-breakpoint

-- ② 回填:从该号对应 external_source 的 source_identifier(存的是抖音号/sec_uid,稳定锚)回填。
--   external_sources 自 0025 起带 account_id;取每个号 created_at 最早、source_identifier 非空的一条。
--   仅回填 external_account_id IS NULL 的行(幂等、可重跑;可回滚 = 设回 NULL)。
UPDATE platform_accounts pa
SET external_account_id = es.source_identifier
FROM (
  SELECT DISTINCT ON (account_id) account_id, source_identifier
  FROM external_sources
  WHERE account_id IS NOT NULL
    AND source_identifier IS NOT NULL
    AND source_identifier <> ''
  ORDER BY account_id, created_at ASC
) es
WHERE pa.id = es.account_id
  AND pa.external_account_id IS NULL;
--> statement-breakpoint

-- ③ 换唯一约束:旧 handle 唯一(挂可变昵称=漂移根因)退役 → 新唯一挂稳定 sec_uid。
--   必须 DROP 旧唯一:否则 handle 改真实名 / 占位复用会被旧约束挡,且语义已错(handle 现为非唯一显示名)。
--   新唯一 (user_id, platform, external_account_id):PG 多个 NULL 不冲突 → 回填不到的号可共存。
DROP INDEX IF EXISTS platform_accounts_handle_ux;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_external_ux ON platform_accounts(user_id, platform, external_account_id);
